import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { commandResponseSchema } from "../runner/command-schema.mjs";
import { renderCommandsToPng } from "../runner/render-commands.mjs";
import { normalizeCommand } from "../app/src/drawing-engine.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const MODEL = "gpt-6-astra";
const COMMAND_CEILING = 10000;
const TARGET_COMMANDS = 9000;
const MAX_COMMANDS_PER_PASS = 500;
const MAX_PASSES = Math.ceil(COMMAND_CEILING / MAX_COMMANDS_PER_PASS);
const REQUEST_TIMEOUT_MINUTES = 45;
const PROMPT_PATH = path.join(ROOT, "experiments/prompts/gpt-6-astra-free-rein-v1.md");
const REFERENCE_PATH = path.join(ROOT, "app/public/reference/maddie-target.jpg");
const API_URL = "https://api.openai.com/v1/responses";
const PASS_SCHEMA = {
  type: "object",
  properties: {
    commands: commandResponseSchema.properties.commands,
    done: { type: "boolean" }
  },
  required: ["commands", "done"],
  additionalProperties: false
};

loadEnvFile(path.join(ROOT, ".env"));

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"] || `free-rein-${new Date().toISOString().slice(0, 10)}`;
const outputDir = path.join(ROOT, "experiments/results/openai__gpt-6-astra", runId);
const passesDir = path.join(outputDir, "passes");
const currentRenderPath = path.join(outputDir, "current.png");
const commandsPath = path.join(outputDir, "commands.json");
const metadataPath = path.join(outputDir, "metadata.json");
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) throw new Error("OPENAI_API_KEY is required in the environment or local .env file.");

const prompt = await fs.promises.readFile(PROMPT_PATH, "utf8");
const reference = await fs.promises.readFile(REFERENCE_PATH);
const referenceDataUrl = `data:image/jpeg;base64,${reference.toString("base64")}`;
const previousMetadata = args.resume && fs.existsSync(metadataPath)
  ? JSON.parse(await fs.promises.readFile(metadataPath, "utf8"))
  : null;
const startedAt = previousMetadata?.started_at || new Date().toISOString();
const commands = args.resume && fs.existsSync(commandsPath)
  ? JSON.parse(await fs.promises.readFile(commandsPath, "utf8")).map(normalizeCommand)
  : [];
const passRecords = previousMetadata?.passes || [];

await fs.promises.mkdir(passesDir, { recursive: true });
await renderCommandsToPng(commands, currentRenderPath);

for (let pass = passRecords.length + 1; pass <= MAX_PASSES && commands.length < COMMAND_CEILING; pass += 1) {
  const remaining = COMMAND_CEILING - commands.length;
  const requestedBatch = Math.min(MAX_COMMANDS_PER_PASS, remaining);
  const currentRender = await fs.promises.readFile(currentRenderPath);
  const requestBody = buildRequestBody({
    pass,
    requestedBatch,
    currentCount: commands.length,
    currentRenderDataUrl: `data:image/png;base64,${currentRender.toString("base64")}`
  });
  const prefix = `pass-${String(pass).padStart(2, "0")}`;
  await fs.promises.writeFile(
    path.join(passesDir, `${prefix}-request.json`),
    JSON.stringify(redactRequest(requestBody), null, 2)
  );

  const passStart = performance.now();
  const response = await postJson(API_URL, requestBody, apiKey);
  const wallTimeSeconds = (performance.now() - passStart) / 1000;
  await fs.promises.writeFile(path.join(passesDir, `${prefix}-raw-response.json`), response.body);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`OpenAI pass ${pass} failed: ${response.statusCode} ${response.body}`);
  }

  const raw = JSON.parse(response.body);
  const outputText = raw.output
    ?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")
    ?.text;
  if (!outputText) {
    throw new Error(`OpenAI pass ${pass} did not contain output_text (status: ${raw.status || "unknown"}).`);
  }

  const parsed = JSON.parse(outputText);
  if (!Array.isArray(parsed.commands)) throw new Error(`OpenAI pass ${pass} did not contain a commands array.`);
  const emitted = parsed.commands.map(normalizeCommand);
  const applied = emitted.slice(0, remaining);
  commands.push(...applied);

  await fs.promises.writeFile(path.join(passesDir, `${prefix}-commands.json`), JSON.stringify(emitted, null, 2));
  await fs.promises.writeFile(commandsPath, JSON.stringify(commands, null, 2));
  await renderCommandsToPng(commands, currentRenderPath);
  await fs.promises.copyFile(currentRenderPath, path.join(passesDir, `${prefix}-render.png`));

  const record = {
    pass,
    response_id: raw.id || null,
    response_status: raw.status || null,
    requested_commands: requestedBatch,
    emitted_commands: emitted.length,
    applied_commands: applied.length,
    cumulative_commands: commands.length,
    model_reported_done: Boolean(parsed.done),
    wall_time_seconds: wallTimeSeconds,
    usage: raw.usage || null
  };
  passRecords.push(record);
  await writeCheckpoint(false);
  console.log(JSON.stringify(record));

  if (parsed.done) break;
  if (emitted.length === 0) throw new Error(`OpenAI pass ${pass} returned no commands without marking done.`);
}

await fs.promises.copyFile(currentRenderPath, path.join(outputDir, "final.png"));
await writeCheckpoint(true);

const totalUsage = sumUsage(passRecords);
console.log(JSON.stringify({
  outputDir,
  commandCount: commands.length,
  pointCount: commands.reduce((total, command) => total + command.points.length, 0),
  passes: passRecords.length,
  totalUsage,
  estimatedCostUsd: estimateCost(totalUsage)
}, null, 2));

function buildRequestBody({ pass, requestedBatch, currentCount, currentRenderDataUrl }) {
  const passInstructions = [
    prompt,
    `This is refinement pass ${pass} of at most ${MAX_PASSES}.`,
    `The drawing currently contains ${currentCount} commands. The experiment targets roughly ${TARGET_COMMANDS} commands and has a hard safety ceiling of ${COMMAND_CEILING}.`,
    `Emit up to ${requestedBatch} NEW commands to append. Use the full batch when additional detail can improve resemblance; do not repeat existing commands.`,
    "The first image is the original reference. The second image is the current cumulative render.",
    "Study the differences and add the strokes that most improve proportions, likeness, tonal structure, contours, shading, and texture.",
    `Set done to true only when further strokes would not meaningfully improve the image. Before roughly ${TARGET_COMMANDS} cumulative commands, prefer continuing when useful refinements remain.`
  ].join("\n\n");

  return {
    model: MODEL,
    reasoning: { effort: "max" },
    max_output_tokens: 128000,
    store: false,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: passInstructions },
        { type: "input_image", image_url: referenceDataUrl, detail: "high" },
        { type: "input_image", image_url: currentRenderDataUrl, detail: "high" }
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "maddie_bench_astra_free_rein_pass",
        strict: true,
        schema: PASS_SCHEMA
      }
    }
  };
}

async function writeCheckpoint(complete) {
  const totalUsage = sumUsage(passRecords);
  await fs.promises.writeFile(metadataPath, JSON.stringify({
    experiment: "maddie-bench-free-rein",
    official: false,
    affects_leaderboard: false,
    complete,
    model: MODEL,
    provider: "openai-direct",
    run_id: runId,
    started_at: startedAt,
    updated_at: new Date().toISOString(),
    prompt: path.relative(ROOT, PROMPT_PATH),
    prompt_sha256: sha256(prompt),
    reference_image: path.relative(ROOT, REFERENCE_PATH),
    reference_sha256: sha256(reference),
    command_count: commands.length,
    point_count: commands.reduce((total, command) => total + command.points.length, 0),
    target_commands: TARGET_COMMANDS,
    command_ceiling: COMMAND_CEILING,
    max_commands_per_pass: MAX_COMMANDS_PER_PASS,
    max_passes: MAX_PASSES,
    reasoning_effort: "max",
    max_output_tokens_per_pass: 128000,
    passes: passRecords,
    total_usage: totalUsage,
    estimated_cost_usd_at_published_token_rates: estimateCost(totalUsage),
    artifacts: ["commands.json", "final.png", "metadata.json", "passes/*"]
  }, null, 2));
}

function sumUsage(records) {
  return records.reduce((totals, record) => {
    totals.input_tokens += Number(record.usage?.input_tokens || 0);
    totals.output_tokens += Number(record.usage?.output_tokens || 0);
    totals.total_tokens += Number(record.usage?.total_tokens || 0);
    return totals;
  }, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });
}

function estimateCost(usage) {
  return (usage.input_tokens * 10 + usage.output_tokens * 50) / 1_000_000;
}

function redactRequest(body) {
  return {
    ...body,
    input: body.input.map((message) => ({
      ...message,
      content: message.content.map((part) =>
        part.type === "input_image" ? { ...part, image_url: "[base64 image omitted]" } : part
      )
    }))
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function postJson(url, body, key) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: REQUEST_TIMEOUT_MINUTES * 60 * 1000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("timeout", () => request.destroy(
      new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MINUTES} minutes.`)
    ));
    request.on("error", reject);
    request.end(payload);
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
