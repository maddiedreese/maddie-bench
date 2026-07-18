import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clearCanvas,
  drawStroke,
  makeStrokeCommand,
  renderCommands
} from "./drawing-engine.js";
import "./styles.css";

const PUBLIC_BASE = import.meta.env.BASE_URL || "/";
const SOURCE_REPO_URL = "https://github.com/maddiedreese/maddie-bench";
const app = document.querySelector("#app");

app.innerHTML = `
  <header class="site-header">
    <p class="kicker">maddie-bench / @maddiedreese</p>
    <h1>maddie-bench</h1>
    <p class="handle">Track B: Structured Drawing</p>
    <p class="intro">A benchmark for AI models that recreate Maddie's profile picture by emitting paintbrush commands for a constrained canvas. Official model and judge calls run through OpenRouter.</p>
    <div class="header-actions">
      <nav class="profile-links" aria-label="Benchmark links">
        <a class="button-primary" href="#leaderboard">Leaderboard</a>
        <a href="#methodology">Methodology</a>
        <a href="#gallery">Gallery</a>
        <a href="#paint-harness">Paint Harness</a>
        <a href="#protocol">Protocol</a>
        <a href="#downloads">Downloads</a>
        <a href="https://github.com/maddiedreese/maddie-bench">GitHub</a>
      </nav>
    </div>
    <nav class="section-nav" aria-label="Page sections">
      <a href="#leaderboard">Results</a>
      <a href="#methodology">Method</a>
      <a href="#gallery">Outputs</a>
      <a href="#paint-harness">App</a>
      <a href="#protocol">Rules</a>
      <a href="#downloads">Downloads</a>
      <a href="#reproduce">Reproduce</a>
      <a href="#limitations">Limitations</a>
      <a href="#governance">Governance</a>
    </nav>
  </header>

  <main>
    <section class="status-banner" aria-label="Benchmark release status">
      <div>
        <p class="date">Status</p>
        <h2>maddie-bench Track B v0.1</h2>
        <p>Official v0.1 results are published. Outputs were generated through OpenRouter, judged blind by the configured panel, and scored with Elo.</p>
      </div>
      <div>
        <p class="date">Released</p>
        <h3>2026-06-29</h3>
        <p>Last updated: <span id="lastUpdated">2026-07-17</span></p>
      </div>
      <div>
        <p class="date">Citation</p>
        <h3>maddie-bench v0.1</h3>
        <p>Reese, M. D. maddie-bench Track B: Structured Drawing, 2026.</p>
      </div>
    </section>

    <section class="consent-banner" aria-label="Reference image consent and license">
      <p><strong>Reference image use:</strong> Maddie's profile picture is included with consent for maddie-bench evaluation only. Do not reuse it for unrelated datasets, scraping, training, or derivative benchmark tasks.</p>
    </section>

    <section class="reference-overview" aria-label="Benchmark reference image">
      <div>
        <p class="date">Reference</p>
        <h2>Maddie's profile picture</h2>
        <p>Every Track B model receives this exact image and attempts to recreate it as compact paintbrush commands on a 1205 x 1448 canvas.</p>
      </div>
      <img src="${PUBLIC_BASE}reference/maddie-target.jpg" alt="Maddie's profile picture benchmark reference" />
    </section>

    <details class="site-section methodology-section" id="methodology" open>
      <summary class="section-heading">
        <h2>Methodology</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="method-flow" aria-label="Benchmark flow">
        <span>1 attempt per model</span>
        <span>JSON strokes</span>
        <span>official renderer</span>
        <span>final.png</span>
        <span>blind judge panel</span>
        <span>Elo</span>
      </div>
      <div class="method-grid">
        <article>
          <p class="date">Inclusion</p>
          <h3>Model Set</h3>
          <p>Models are included when they are available through OpenRouter, can accept image input, and can return structured JSON. Models that cannot see the reference image or cannot reliably return JSON are excluded from Track B.</p>
        </article>
        <article>
          <p class="date">Excluded</p>
          <h3>Preflight exclusions</h3>
          <p>Z.ai vision models, openai/gpt-5.5-pro, qwen/qwen3-vl-30b-a3b-thinking, and bytedance/ui-tars-1.5-7b are excluded from Track B v0.1 because their OpenRouter routes were incompatible or provider unavailable.</p>
        </article>
        <article>
          <p class="date">Failures</p>
          <h3>Provider Retry Policy</h3>
          <p>Provider or OpenRouter infrastructure errors are retried and audited. Model output failures, invalid JSON, and render failures are recorded without replacement attempts.</p>
        </article>
        <article>
          <p class="date">Judge Panel</p>
          <h3>openai/gpt-5.5 + anthropic/claude-opus-4.8 + google/gemini-3.5-flash</h3>
          <p>Rendered outputs are judged blind through OpenRouter by the panel configured in runner/judge-config.json. Model names are hidden from judges.</p>
        </article>
        <article>
          <p class="date">Updates</p>
          <h3>Leaderboard Update Policy</h3>
          <p>The initial release used the full official run. Later stable models are inserted with one new official attempt and blind judging against a fixed anchor set spanning top, middle, bottom, and provider-adjacent outputs. Historical outputs are not regenerated unless the benchmark protocol changes.</p>
        </article>
      </div>
    </details>

    <details class="site-section leaderboard-section" id="leaderboard" open>
      <summary class="section-heading">
        <h2>Leaderboard</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="section-body">
        <div class="leaderboard-tools">
          <div>
            <p class="date">Track B / Structured Drawing</p>
            <p class="section-copy">Every model has a reserved slot. Official rows include score, final image, cost, latency, command count, judge comparison count, and accountability hashes when a run completed; failed attempts remain visible with their official status.</p>
          </div>
          <label class="filter-control">
            <span>Family</span>
            <select id="familyFilter">
              <option value="all">All families</option>
            </select>
          </label>
        </div>
        <div class="table-wrap">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Family</th>
                <th>Output</th>
                <th>Status</th>
                <th>Elo</th>
                <th>Cost</th>
                <th>Latency</th>
                <th>Commands</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody id="leaderboardRows"></tbody>
          </table>
        </div>
      </div>
    </details>

    <details class="site-section gallery-section" id="gallery" open>
      <summary class="section-heading">
        <h2>Output Gallery</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="section-body">
        <div class="gallery-grid" id="modelGallery"></div>
      </div>
    </details>

    <details class="site-section harness-section" id="paint-harness" open>
      <summary class="section-heading">
        <h2>Paint Harness</h2>
        <span class="toggle-label"></span>
      </summary>
      <section class="workspace" aria-label="Paint workspace">
        <aside class="reference-panel" aria-label="Locked reference">
          <div class="panel-head">
            <h3>Reference</h3>
            <span>Locked</span>
          </div>
          <img src="${publicUrl("reference/maddie-target.jpg")}" alt="maddie-bench profile reference" />
        </aside>

        <section class="paint-panel" aria-label="Drawing canvas">
          <div class="toolbar" aria-label="Paint tools">
            <button class="tool active" data-tool="brush" title="Brush" aria-label="Brush">B</button>
            <button class="tool" data-tool="eraser" title="Eraser" aria-label="Eraser">E</button>
            <label title="Color" aria-label="Color">
              <input id="color" type="color" value="#201b1b" />
            </label>
            <label class="range" title="Brush size">
              <span>Size</span>
              <input id="size" type="range" min="1" max="120" value="12" />
              <output id="sizeOutput">12</output>
            </label>
            <label class="range" title="Opacity">
              <span>Opacity</span>
              <input id="opacity" type="range" min="0.05" max="1" value="0.82" step="0.01" />
              <output id="opacityOutput">82%</output>
            </label>
            <button id="undo" title="Undo" aria-label="Undo">Undo</button>
            <button id="clear" title="Clear" aria-label="Clear">Clear</button>
            <button id="exportPng" title="Export PNG" aria-label="Export PNG">PNG</button>
            <button id="exportJson" title="Export JSON" aria-label="Export JSON">JSON</button>
          </div>

          <div class="canvas-frame">
            <canvas id="canvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" aria-label="maddie-bench canvas"></canvas>
          </div>
        </section>

        <aside class="commands-panel" aria-label="Command replay">
          <div class="panel-head">
            <h3>Commands</h3>
            <span id="commandCount">0 strokes</span>
          </div>
          <textarea id="commandInput" spellcheck="false" placeholder='{"commands":[{"c":"#201b1b","w":12,"o":0.8,"p":[[300,300],[380,420]]}]}'></textarea>
          <div class="command-actions">
            <button id="loadJson">Replay</button>
            <button id="copyJson">Copy</button>
          </div>
        </aside>
      </section>
      <div class="status-line" id="status">ready</div>
    </details>

    <details class="site-section protocol-section" id="protocol">
      <summary class="section-heading">
        <h2>Rules</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="rules-intro">
        <p class="date">Prompt</p>
        <h3>Task</h3>
        <p>Recreate Maddie's profile picture using only structured paintbrush stroke commands. The final artifact is rendered by the official paint engine, not by the model directly.</p>
      </div>
      <div class="prompt-box">
        <pre><code>You will receive a specific reference picture and must recreate it by emitting compact JSON drawing commands for a simple paint engine.

The canvas is exactly 1205 pixels wide and 1448 pixels tall.

Return only a JSON object with one key: "commands". Do not return Markdown.

Each command must be a compact stroke object with c, w, o, and p.

Prefer broad shapes over fine detail.

Aim for no more than 30 stroke commands.

Use at least 2 points per stroke.

Prefer no more than 8 points per stroke.

Use enough strokes to capture the main composition, facial features, hands, hair, and background without approaching the token limit.

Stop immediately after the complete JSON object.</code></pre>
      </div>
      <div class="settings-grid" aria-label="Official run settings">
        <article>
          <p class="date">Attempt Policy</p>
          <h3 id="attemptPolicy">1 official attempt</h3>
          <p>Each model is run once for the official leaderboard.</p>
        </article>
        <article>
          <p class="date">Request</p>
          <h3 id="requestSettings">temperature 0.2 / 8000 max tokens</h3>
          <p id="requestFormat">JSON schema response format with required provider parameters.</p>
        </article>
        <article>
          <p class="date">Canvas</p>
          <h3 id="canvasSettings">1205 x 1448</h3>
          <p id="canvasBackground">Background #f7f3ef.</p>
        </article>
        <article>
          <p class="date">Renderer</p>
          <h3 id="rendererSettings">sharp SVG to PNG</h3>
          <p id="rendererOutput">The official output artifact is final.png.</p>
        </article>
        <article>
          <p class="date">Elo Judge</p>
          <h3 id="judgeSettings">openai/gpt-5.5 + anthropic/claude-opus-4.8 + google/gemini-3.5-flash</h3>
          <p id="judgeCriterion">Blind pairwise image preference through OpenRouter. Tie policy: judges may return tie; Elo treats ties as 0.5.</p>
        </article>
        <article>
          <p class="date">Artifacts</p>
          <h3 id="artifactSettings">request / response / render</h3>
          <p id="artifactList">request.json, raw-response.json, commands.json, final.png, metadata.json.</p>
        </article>
      </div>
      <div class="protocol-grid">
        <article>
          <p class="date">Input</p>
          <h3>Reference + Prompt</h3>
          <p>Each model receives Maddie's profile picture and the same Track B v0.1 prompt. The reference image, prompt, canvas size, model id, run-config hash, and runner hash are recorded for every run.</p>
        </article>
        <article>
          <p class="date">Output</p>
          <h3>JSON Commands</h3>
          <p>Models return a JSON object containing compact stroke commands. The official renderer replays those commands into final.png and stores commands.json and metadata.json.</p>
        </article>
        <article>
          <p class="date">Run Rules</p>
          <h3>One Attempt</h3>
          <p>Every model gets one official attempt with the same prompt, temperature, max token limit, reference image, and renderer.</p>
        </article>
        <article>
          <p class="date">Scoring</p>
          <h3>Elo Judge</h3>
          <p>Elo is computed from blind pairwise judgments over rendered final images. The v0.1 judge panel is openai/gpt-5.5, anthropic/claude-opus-4.8, and google/gemini-3.5-flash via OpenRouter, using model names hidden from the judges.</p>
        </article>
        <article>
          <p class="date">Accountability</p>
          <h3>Audit Trail</h3>
          <p>Each result should keep the model id, provider, prompt version, timestamp, request settings, usage, cost, raw response, commands, rendered image, and any judge decisions used for Elo.</p>
        </article>
        <article>
          <p class="date">Limits</p>
          <h3>Reference Use</h3>
          <p>Maddie's profile picture is provided for maddie-bench evaluation only. It should not be reused for unrelated datasets, scraping, training, or derivative benchmark tasks.</p>
        </article>
      </div>
    </details>

    <details class="site-section downloads-section" id="downloads" open>
      <summary class="section-heading">
        <h2>Downloads</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="download-grid">
        <a href="${publicUrl("prompts/track-b-v0.1.md")}" download>Prompt</a>
        <a href="${publicUrl("reference/maddie-target.jpg")}" download>Reference image</a>
        <a href="${publicUrl("data/models.track-b.json")}" download>Model registry</a>
        <a href="${publicUrl("data/run-config.json")}" download>Run config</a>
        <a href="${publicUrl("data/judge-config.json")}" download>Judge config</a>
        <a href="${publicUrl("data/results.json")}" download>Results JSON</a>
        <a href="https://github.com/maddiedreese/maddie-bench">Source repo</a>
      </div>
    </details>

    <details class="site-section reproduce-section" id="reproduce" open>
      <summary class="section-heading">
        <h2>Reproduce</h2>
        <span class="toggle-label"></span>
      </summary>
      <p class="section-copy">Run these commands from the repository root after cloning <a href="https://github.com/maddiedreese/maddie-bench">maddiedreese/maddie-bench</a> and adding an OpenRouter API key to .env.</p>
      <div class="prompt-box">
        <pre><code>git clone https://github.com/maddiedreese/maddie-bench.git
cd maddie-bench
npm run setup
cp .env.example .env
# add OPENROUTER_API_KEY to .env
npm run run:track-b -- --all --run-id official-v0.1 --concurrency 4
npm run validate:audit -- --run-id official-v0.1
npm run judge -- --run-id official-v0.1 --judgment-run-id official-v0.1-judge --concurrency 12
npm run elo -- --input judgments/official-v0.1-judge/pairwise.json --output leaderboard/elo.official-v0.1.json
npm run publish:results -- --run-manifest runner/official-run-manifest.v0.1.json --elo leaderboard/elo.official-v0.1.json</code></pre>
      </div>
    </details>

    <details class="site-section limitations-section" id="limitations" open>
      <summary class="section-heading">
        <h2>Limitations</h2>
        <span class="toggle-label"></span>
      </summary>
      <ul class="plain-list">
        <li>Single-image benchmark; results should not be generalized to all drawing tasks.</li>
        <li>Subjective likeness is hard to score perfectly.</li>
        <li>Model-judge bias is possible even with blind pairwise judging.</li>
        <li>The reference image may appear in model training data or internet data.</li>
        <li>The task is personal-image specific.</li>
        <li>The JSON stroke format favors models that are good at structured output and tool syntax.</li>
      </ul>
    </details>

    <details class="site-section governance-section" id="governance" open>
      <summary class="section-heading">
        <h2>Governance</h2>
        <span class="toggle-label"></span>
      </summary>
      <div class="method-grid">
        <article>
          <p class="date">Maintainer</p>
          <h3>Maddie D. Reese</h3>
          <p>Maddie maintains the reference image, benchmark prompt, model registry, and publication decisions.</p>
        </article>
        <article>
          <p class="date">Versioning</p>
          <h3>New Rules, New Version</h3>
          <p>Changing the prompt, reference image, renderer, judge panel, scoring method, or official model set requires a new benchmark version.</p>
        </article>
        <article>
          <p class="date">Challenges</p>
          <h3>Artifact Review</h3>
          <p>Results can be challenged by inspecting request, response, commands, final image, metadata, and judge decisions.</p>
        </article>
      </div>
    </details>
  </main>

  <footer>
    <p>maddie-bench v0.1</p>
    <p>Reference image for benchmark evaluation only.</p>
  </footer>
`;

const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");
const colorInput = document.querySelector("#color");
const sizeInput = document.querySelector("#size");
const opacityInput = document.querySelector("#opacity");
const sizeOutput = document.querySelector("#sizeOutput");
const opacityOutput = document.querySelector("#opacityOutput");
const commandInput = document.querySelector("#commandInput");
const commandCount = document.querySelector("#commandCount");
const status = document.querySelector("#status");
const familyFilter = document.querySelector("#familyFilter");
const leaderboardRows = document.querySelector("#leaderboardRows");
const modelGallery = document.querySelector("#modelGallery");

let activeTool = "brush";
let commands = [];
let currentPoints = [];
let drawing = false;
let modelRegistry = [];
let modelResults = new Map();

clearCanvas(ctx);
syncOutputs();
syncCommandText();
loadModelPlaceholders();
loadBenchmarkConfigs();

document.querySelectorAll(".tool").forEach((button) => {
  button.addEventListener("click", () => {
    activeTool = button.dataset.tool;
    document.querySelectorAll(".tool").forEach((item) => item.classList.toggle("active", item === button));
  });
});

familyFilter.addEventListener("change", renderModelPlaceholders);
sizeInput.addEventListener("input", syncOutputs);
opacityInput.addEventListener("input", syncOutputs);

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  currentPoints = [eventToPoint(event)];
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  const point = eventToPoint(event);
  const previous = currentPoints[currentPoints.length - 1];
  if (distance(previous, point) < 2) return;

  currentPoints.push(point);
  drawStroke(ctx, makeLiveCommand(currentPoints.slice(-3)));
});

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);

document.querySelector("#undo").addEventListener("click", () => {
  commands.pop();
  renderCommands(ctx, commands);
  syncCommandText();
  setStatus("undone");
});

document.querySelector("#clear").addEventListener("click", () => {
  commands = [];
  clearCanvas(ctx);
  syncCommandText();
  setStatus("cleared");
});

document.querySelector("#exportPng").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "maddie-bench-canvas.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  setStatus("png exported");
});

document.querySelector("#exportJson").addEventListener("click", () => {
  downloadText("maddie-bench-commands.json", JSON.stringify(commands, null, 2));
  setStatus("json exported");
});

document.querySelector("#loadJson").addEventListener("click", () => {
  try {
    const nextCommands = JSON.parse(commandInput.value || "[]");
    commands = Array.isArray(nextCommands) ? nextCommands : nextCommands.commands;
    if (!Array.isArray(commands)) throw new Error("JSON must be an array or { commands }.");
    renderCommands(ctx, commands);
    syncCommandText();
    setStatus("replayed");
  } catch (error) {
    setStatus(error.message);
  }
});

document.querySelector("#copyJson").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(commands, null, 2));
  setStatus("copied");
});

async function loadModelPlaceholders() {
  try {
    const [registry, published] = await Promise.all([
      loadJson("data/models.track-b.json", { required: true }),
      loadJson("data/results.json", { required: false })
    ]);
    if (published?.results) {
      modelResults = new Map((published.results || []).map((result) => [result.model, result]));
    }
    modelRegistry = registry.models || [];
    populateFamilyFilter(modelRegistry);
    renderModelPlaceholders();
  } catch (error) {
    leaderboardRows.innerHTML = `<tr><td colspan="10">Could not load model registry.</td></tr>`;
    modelGallery.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function loadBenchmarkConfigs() {
  try {
    const [runConfig, judgeConfig, benchmarkMeta] = await Promise.all([
      loadJson("data/run-config.json", { required: true }),
      loadJson("data/judge-config.json", { required: true }),
      loadJson("data/benchmark-meta.json", { required: false })
    ]);
    renderBenchmarkSettings(runConfig, judgeConfig, benchmarkMeta);
  } catch (error) {
    setStatus(`config load failed: ${error.message}`);
  }
}

async function loadJson(url, options = {}) {
  const response = await fetch(`${publicUrl(url)}?v=${Date.now()}`, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (options.required) throw new Error(`${url} returned ${response.status}`);
    return null;
  }

  if (!contentType.includes("application/json")) {
    if (options.required) throw new Error(`${url} did not return JSON`);
    return null;
  }

  return response.json();
}

function renderBenchmarkSettings(runConfig, judgeConfig, benchmarkMeta) {
  if (benchmarkMeta?.last_updated) {
    document.querySelector("#lastUpdated").textContent = benchmarkMeta.last_updated;
  }
  document.querySelector("#attemptPolicy").textContent = `${runConfig.official_attempts_per_model} official attempt`;
  document.querySelector("#requestSettings").textContent =
    `temperature ${runConfig.request_settings.temperature} / ${runConfig.request_settings.max_tokens} max tokens`;
  document.querySelector("#requestFormat").textContent =
    `${runConfig.request_settings.response_format} response format; require_parameters=${runConfig.request_settings.require_parameters}.`;
  document.querySelector("#canvasSettings").textContent = `${runConfig.canvas.width} x ${runConfig.canvas.height}`;
  document.querySelector("#canvasBackground").textContent = `Background ${runConfig.canvas.background}.`;
  document.querySelector("#rendererSettings").textContent = runConfig.renderer.engine.replaceAll("_", " ");
  document.querySelector("#rendererOutput").textContent = `The official output artifact is ${runConfig.renderer.output}.`;
  document.querySelector("#judgeSettings").textContent = judgeConfig.judge_panel.map((judge) => judge.model).join(" + ");
  document.querySelector("#judgeCriterion").textContent =
    `${judgeConfig.elo_method.replaceAll("_", " ")}; K=${judgeConfig.k_factor}; names hidden=${judgeConfig.audit_policy.model_names_hidden_from_judge}.`;
  document.querySelector("#artifactSettings").textContent = `${runConfig.artifacts.length} audit artifacts`;
  document.querySelector("#artifactList").textContent = `${runConfig.artifacts.join(", ")}.`;
}

function populateFamilyFilter(models) {
  const families = [...new Set(models.map((model) => model.family))].sort();
  familyFilter.innerHTML = `<option value="all">All families</option>${families
    .map((family) => `<option value="${escapeHtml(family)}">${escapeHtml(family)}</option>`)
    .join("")}`;
}

function renderModelPlaceholders() {
  const family = familyFilter.value;
  const models = sortModelsByResult(
    family === "all" ? modelRegistry : modelRegistry.filter((model) => model.family === family)
  );

  leaderboardRows.innerHTML = models
    .map((model, index) => {
      const result = modelResults.get(model.id);
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(prettyModelName(model.id))}</strong><span>${escapeHtml(model.id)}</span></td>
          <td>${escapeHtml(model.family)}</td>
          <td>${renderLeaderboardThumbnail(model, result)}</td>
          <td><mark>${escapeHtml(result?.status || "Pending")}</mark></td>
          <td>${formatValue(result?.elo)}</td>
          <td>${formatCost(result?.cost_usd)}</td>
          <td>${formatLatency(result?.wall_time_seconds)}</td>
          <td>${formatValue(result?.command_count)}</td>
          <td>${renderAuditSummary(result)}</td>
        </tr>
      `;
    })
    .join("");

  modelGallery.innerHTML = models
    .map((model) => {
      const result = modelResults.get(model.id);
      return `
        <article class="model-card" id="${escapeHtml(galleryAnchorId(model.id))}">
          ${renderModelOutput(model, result)}
          <div class="model-card-copy">
            <p class="date">${escapeHtml(result?.status ? `${result.status} result` : "Pending result")}</p>
            <h3>${escapeHtml(prettyModelName(model.id))}</h3>
            <p>${escapeHtml(model.id)}</p>
            <dl>
              <div><dt>Elo</dt><dd>${formatValue(result?.elo)}</dd></div>
              <div><dt>Cost</dt><dd>${formatCost(result?.cost_usd)}</dd></div>
              <div><dt>Latency</dt><dd>${formatLatency(result?.wall_time_seconds)}</dd></div>
              <div><dt>Commands</dt><dd>${formatValue(result?.command_count)}</dd></div>
              <div><dt>Judgments</dt><dd>${formatComparisons(result?.comparisons)}</dd></div>
              <div><dt>Audit</dt><dd>${renderGalleryAuditLink(model, result)}</dd></div>
            </dl>
          </div>
        </article>
      `;
    })
    .join("");
}

function sortModelsByResult(models) {
  return [...models].sort((left, right) => {
    const leftResult = modelResults.get(left.id);
    const rightResult = modelResults.get(right.id);
    const leftElo = Number(leftResult?.elo);
    const rightElo = Number(rightResult?.elo);
    const leftHasElo = Number.isFinite(leftElo);
    const rightHasElo = Number.isFinite(rightElo);

    if (leftHasElo && rightHasElo && rightElo !== leftElo) return rightElo - leftElo;
    if (leftHasElo !== rightHasElo) return leftHasElo ? -1 : 1;
    if ((leftResult?.status || "") !== (rightResult?.status || "")) {
      return (leftResult?.status || "pending").localeCompare(rightResult?.status || "pending");
    }
    return left.id.localeCompare(right.id);
  });
}

function renderModelOutput(model, result) {
  if (result?.final_image) {
    return `<img class="model-output" src="${escapeHtml(publicUrl(result.final_image))}" alt="${escapeHtml(model.id)} maddie-bench output" />`;
  }

  if (result?.status) {
    return `<div class="output-placeholder output-failed"><span>${escapeHtml(result.status)} official attempt</span></div>`;
  }

  return `<div class="output-placeholder"><span>${escapeHtml(model.family)}</span></div>`;
}

function renderLeaderboardThumbnail(model, result) {
  const href = `#${galleryAnchorId(model.id)}`;
  const label = `View ${model.id} output in gallery`;

  if (result?.final_image) {
    return `
      <a class="leaderboard-thumb" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">
        <img src="${escapeHtml(publicUrl(result.final_image))}" alt="" loading="lazy" />
      </a>
    `;
  }

  return `
    <a class="leaderboard-thumb leaderboard-thumb-empty" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">
      <span>${escapeHtml(result?.status || model.family)}</span>
    </a>
  `;
}

function finishStroke(event) {
  if (!drawing) return;
  drawing = false;
  canvas.releasePointerCapture(event.pointerId);

  if (currentPoints.length < 2) {
    currentPoints = [];
    return;
  }

  commands.push(makeLiveCommand(currentPoints));
  renderCommands(ctx, commands);
  syncCommandText();
  currentPoints = [];
}

function makeLiveCommand(points) {
  return makeStrokeCommand({
    points,
    color: activeTool === "eraser" ? "#000000" : colorInput.value,
    size: Number(sizeInput.value),
    opacity: activeTool === "eraser" ? 1 : Number(opacityInput.value),
    composite: activeTool === "eraser" ? "destination-out" : "source-over"
  });
}

function eventToPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  ];
}

function syncOutputs() {
  sizeOutput.value = sizeInput.value;
  opacityOutput.value = `${Math.round(Number(opacityInput.value) * 100)}%`;
}

function syncCommandText() {
  commandInput.value = JSON.stringify(commands, null, 2);
  commandCount.textContent = `${commands.length} ${commands.length === 1 ? "stroke" : "strokes"}`;
}

function setStatus(message) {
  status.textContent = message;
  window.clearTimeout(setStatus.timeout);
  setStatus.timeout = window.setTimeout(() => {
    status.textContent = "ready";
  }, 1800);
}

function prettyModelName(id) {
  return id.split("/").pop().replaceAll("-", " ");
}

function galleryAnchorId(modelId) {
  return `gallery-${modelId.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function resultDirectoryName(modelId) {
  return modelId.replaceAll("/", "__");
}

function auditTrailUrl(model, result) {
  if (!result?.run_id) return null;
  return `${SOURCE_REPO_URL}/tree/main/results/${resultDirectoryName(model.id)}/${result.run_id}`;
}

function renderGalleryAuditLink(model, result) {
  const url = auditTrailUrl(model, result);
  if (!url) return "-";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${formatHash(result.prompt_sha256)}</a>`;
}

function publicUrl(path) {
  const cleanBase = PUBLIC_BASE.endsWith("/") ? PUBLIC_BASE : `${PUBLIC_BASE}/`;
  return `${cleanBase}${String(path).replace(/^\/+/, "")}`;
}

function formatValue(value) {
  return value === undefined || value === null ? "-" : String(value);
}

function formatCost(value) {
  if (value === undefined || value === null) return "-";
  return `$${Number(value).toFixed(4)}`;
}

function formatLatency(value) {
  if (value === undefined || value === null) return "-";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "-";
  return `${seconds.toFixed(1)}s`;
}

function formatComparisons(value) {
  if (value === undefined || value === null) return "-";
  const comparisons = Number(value);
  if (!Number.isFinite(comparisons)) return "-";
  return String(comparisons);
}

function formatHash(value) {
  if (!value) return "-";
  return String(value).slice(0, 8);
}

function renderAuditSummary(result) {
  if (!result) return "-";
  return `
    <span>pairs ${formatComparisons(result.comparisons)}</span>
    <span>prompt ${formatHash(result.prompt_sha256)}</span>
    <span>ref ${formatHash(result.reference_sha256)}</span>
    <span>config ${formatHash(result.run_config_sha256)}</span>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
