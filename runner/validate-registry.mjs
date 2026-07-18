import fs from "node:fs";

const registryPath = new URL("./models.track-b.json", import.meta.url);
const judgeConfigPath = new URL("./judge-config.json", import.meta.url);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const ids = new Set();
const errors = [];

if (registry.track !== "structured-drawing") {
  errors.push("Expected track to be structured-drawing.");
}

for (const [index, model] of registry.models.entries()) {
  for (const key of ["id", "provider", "family", "status"]) {
    if (!model[key]) errors.push(`Model ${index} is missing ${key}.`);
  }

  if (ids.has(model.id)) {
    errors.push(`Duplicate model id: ${model.id}`);
  }
  ids.add(model.id);

  if (model.status !== "planned") {
    errors.push(`Unexpected status for ${model.id}: ${model.status}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (process.argv.includes("--openrouter")) {
  await validateOpenRouterCatalog(registry);
}

console.log(`Registry OK: ${registry.models.length} planned Track B models.`);

async function validateOpenRouterCatalog(currentRegistry) {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`);
  }

  const catalog = await response.json();
  const modelsById = new Map((catalog.data || []).map((model) => [model.id, model]));
  const judgeConfig = JSON.parse(fs.readFileSync(judgeConfigPath, "utf8"));
  const catalogErrors = [];

  for (const model of currentRegistry.models) {
    validateOpenRouterModel(model.id, modelsById, catalogErrors);
  }

  for (const judge of judgeConfig.judge_panel || []) {
    validateOpenRouterModel(judge.model, modelsById, catalogErrors, { judge: true });
  }

  if (catalogErrors.length > 0) {
    console.error(catalogErrors.join("\n"));
    process.exit(1);
  }
}

function validateOpenRouterModel(id, modelsById, catalogErrors, options = {}) {
  const model = modelsById.get(id);
  const label = options.judge ? `Judge ${id}` : `Model ${id}`;
  if (!model) {
    catalogErrors.push(`${label} is not in the current OpenRouter catalog.`);
    return;
  }

  const inputModalities = model.architecture?.input_modalities || [];
  if (!inputModalities.includes("image")) {
    catalogErrors.push(`${label} does not list image input support.`);
  }

  const supported = model.supported_parameters || [];
  if (!supported.includes("structured_outputs") && !supported.includes("response_format") && !supported.includes("tools")) {
    catalogErrors.push(`${label} does not list structured output or tool-calling support.`);
  }
}
