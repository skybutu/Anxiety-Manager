const DATA_URL = "data/workbook.json";

const DISCLAIMER =
  "This app is for educational and self-management support only. It is not medical advice, diagnosis, psychotherapy, crisis support, or a replacement for a licensed clinician.";

const FIELD_ALIASES = {
  category: ["Category", "Type", "Method category"],
  method: ["Method", "Method name", "Name", "Coping method"],
  summary: ["Reddit pattern summary", "Summary", "Short summary", "Description"],
  redditSupport: ["Reddit support", "Reddit consensus", "Consensus", "Support"],
  visibility: ["Upvote/visibility notes", "Visibility notes", "Upvotes", "Reddit notes"],
  evidenceGrade: ["Clinical evidence grade", "Evidence grade", "Evidence"],
  evidenceScore: ["Evidence score (1-5)", "Evidence score", "Evidence strength"],
  safetyScore: ["Safety score (1-5)", "Safety score", "Safety"],
  easeScore: ["Ease score (1-5)", "Ease score", "Ease", "Implementation ease"],
  timeHorizon: ["Time horizon", "Speed of effect", "Time to effect", "Speed"],
  useCase: ["Best used for", "Use case", "Anxiety target", "Target"],
  protocol: ["Practical protocol", "Practical steps", "Steps", "Protocol"],
  cautions: ["Avoid / cautions", "Cautions", "When not to use", "Safety cautions"],
  sourceIds: ["Source IDs", "Sources", "References", "Source references"],
  priorityScore: ["Priority score", "Overall priority score", "Total score", "Overall score"],
  tags: ["Tags", "Keywords"],
};

const PROTOCOL_ALIASES = {
  name: ["Protocol", "Protocol name", "Name"],
  goal: ["Goal", "Use case", "When to use"],
  steps: ["Steps", "Practical steps"],
  duration: ["Duration", "Time"],
  notes: ["Notes", "Safety cautions", "Cautions"],
  related: ["Related methods", "Methods"],
};

const SOURCE_ALIASES = {
  id: ["ID", "Source ID"],
  type: ["Source type", "Type"],
  title: ["Source title/name", "Source title", "Title", "Name"],
  relevance: ["Relevance", "What it supports", "Supports"],
  notes: ["Notes"],
  url: ["URL", "Url", "Link"],
};

const state = {
  tab: "dashboard",
  data: null,
  methods: [],
  protocols: [],
  safetyNotes: [],
  sources: [],
  query: "",
  filters: {
    useCase: "",
    evidence: "",
    safety: "",
    speed: "",
    difficulty: "",
    tags: "",
  },
  sort: "rank",
  sourceQuery: "",
  sourceType: "",
  filtersOpen: false,
};

const missingWarnings = new Set();
const app = document.querySelector("#app");
const dialog = document.querySelector("#methodDialog");
const dialogContent = document.querySelector("#dialogContent");

init();

async function init() {
  bindShell();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Could not load ${DATA_URL} (${response.status})`);
    }

    state.data = await response.json();
    hydrateState(state.data);
    render();
  } catch (error) {
    console.error("Workbook data failed to load.", error);
    app.innerHTML = `
      <section class="state-card">
        <h1>Workbook data is missing</h1>
        <p>The app expected <strong>${escapeHtml(DATA_URL)}</strong>. Run the converter or place the generated JSON in the data folder, then refresh from a local server.</p>
      </section>
    `;
  }
}

function bindShell() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });

  dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) closeDialog();
  });
}

function hydrateState(payload) {
  const sheets = payload.sheets || {};
  const methodsSheet = sheets["Methods Database"] || firstSheetByName(sheets, "methods");
  const protocolsSheet = sheets.Protocols || firstSheetByName(sheets, "protocol");
  const safetySheet = sheets["Safety Notes"] || firstSheetByName(sheets, "safety");
  const sourcesSheet = sheets.Sources || firstSheetByName(sheets, "source");

  state.sources = (sourcesSheet?.rows || []).map(mapSource).filter((source) => source.id || source.url);
  state.methods = (methodsSheet?.rows || []).map((row, index) => mapMethod(row, index)).filter((method) => method.name);
  state.protocols = (protocolsSheet?.rows || []).map(mapProtocol).filter((protocol) => protocol.name);
  state.safetyNotes = (safetySheet?.rows || []).map(mapSafetyNote).filter((note) => note.topic || note.guidance);

  if (!hasAnyField(methodsSheet?.headers, FIELD_ALIASES.tags)) {
    warnMissing("Optional column missing: Tags. Tag filter and tag chips are hidden.");
  }
}

function firstSheetByName(sheets, needle) {
  return Object.entries(sheets).find(([name]) => name.toLowerCase().includes(needle))?.[1];
}

function hasAnyField(headers = [], aliases = []) {
  const normalized = headers.map(normalizeKey);
  return aliases.some((alias) => normalized.includes(normalizeKey(alias)));
}

function mapMethod(row, index) {
  const sourceIds = splitList(read(row, FIELD_ALIASES.sourceIds));
  const evidenceScore = toNumber(read(row, FIELD_ALIASES.evidenceScore));
  const safetyScore = toNumber(read(row, FIELD_ALIASES.safetyScore));
  const easeScore = toNumber(read(row, FIELD_ALIASES.easeScore));
  const priorityScore = toNumber(read(row, FIELD_ALIASES.priorityScore));

  return {
    id: `method-${index}`,
    rank: index + 1,
    category: text(read(row, FIELD_ALIASES.category)),
    name: text(read(row, FIELD_ALIASES.method)),
    summary: text(read(row, FIELD_ALIASES.summary)),
    redditSupport: text(read(row, FIELD_ALIASES.redditSupport)),
    visibility: text(read(row, FIELD_ALIASES.visibility)),
    evidenceGrade: normalizeEvidence(read(row, FIELD_ALIASES.evidenceGrade)),
    evidenceScore,
    safetyScore,
    safetyLevel: safetyLevel(safetyScore),
    easeScore,
    difficulty: difficultyFromEase(easeScore),
    timeHorizon: text(read(row, FIELD_ALIASES.timeHorizon)),
    speedScore: speedScore(read(row, FIELD_ALIASES.timeHorizon)),
    useCase: text(read(row, FIELD_ALIASES.useCase)),
    protocol: text(read(row, FIELD_ALIASES.protocol)),
    cautions: text(read(row, FIELD_ALIASES.cautions)),
    sourceIds,
    priorityScore,
    tags: splitList(read(row, FIELD_ALIASES.tags)),
    raw: row,
  };
}

function mapProtocol(row) {
  return {
    name: text(read(row, PROTOCOL_ALIASES.name)),
    goal: text(read(row, PROTOCOL_ALIASES.goal)),
    steps: text(read(row, PROTOCOL_ALIASES.steps)),
    duration: text(read(row, PROTOCOL_ALIASES.duration)),
    notes: text(read(row, PROTOCOL_ALIASES.notes)),
    related: splitList(read(row, PROTOCOL_ALIASES.related)),
  };
}

function mapSafetyNote(row) {
  return {
    topic: text(read(row, ["Topic", "Area", "Safety topic"])),
    guidance: text(read(row, ["Guidance", "Notes", "Recommendation"])),
  };
}

function mapSource(row) {
  return {
    id: text(read(row, SOURCE_ALIASES.id)),
    type: text(read(row, SOURCE_ALIASES.type)),
    title: text(read(row, SOURCE_ALIASES.title)),
    relevance: text(read(row, SOURCE_ALIASES.relevance)),
    notes: text(read(row, SOURCE_ALIASES.notes)),
    url: text(read(row, SOURCE_ALIASES.url)),
  };
}

function read(row, aliases) {
  const pairs = Object.entries(row);
  for (const alias of aliases) {
    const found = pairs.find(([key]) => normalizeKey(key) === normalizeKey(alias));
    if (found) return found[1];
  }
  return "";
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function text(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function splitList(value) {
  return text(value)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEvidence(value) {
  return text(value) || "Unspecified";
}

function safetyLevel(score) {
  if (score === null) return "Unspecified";
  if (score >= 5) return "Low risk";
  if (score >= 4) return "Low-moderate";
  if (score >= 3) return "Moderate caution";
  if (score >= 2) return "Higher caution";
  return "High caution";
}

function difficultyFromEase(score) {
  if (score === null) return "Unspecified";
  if (score >= 5) return "Very easy";
  if (score >= 4) return "Easy";
  if (score >= 3) return "Moderate";
  if (score >= 2) return "Difficult";
  return "Clinician-guided";
}

function speedScore(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("immediate") && normalized.includes("week")) return 4.5;
  if (normalized.includes("immediate")) return 5;
  if (normalized.includes("day")) return 3.5;
  if (normalized.includes("week") && normalized.includes("month")) return 2;
  if (normalized.includes("week")) return 2.5;
  if (normalized.includes("variable")) return 1;
  return 0;
}

function render() {
  updateTabs();

  if (state.tab === "dashboard") renderDashboard();
  if (state.tab === "methods") renderMethods();
  if (state.tab === "protocols") renderProtocols();
  if (state.tab === "safety") renderSafety();
  if (state.tab === "sources") renderSources();
}

function updateTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });
}

function setTab(tab) {
  state.tab = tab;
  window.location.hash = tab;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const topByScore = sortedMethods("rank").slice(0, 10);
  const topMethod = topByScore[0];
  const bestEvidence = [...state.methods]
    .filter((method) => method.evidenceScore !== null)
    .sort((a, b) => compareNumber(b.evidenceScore, a.evidenceScore) || compareNumber(b.priorityScore, a.priorityScore))[0];
  const fastest = [...state.methods]
    .filter((method) => method.speedScore >= 5)
    .sort((a, b) => compareNumber(b.priorityScore, a.priorityScore))[0];
  const lowRisk = state.methods.filter((method) => method.safetyScore >= 5);
  const evidenceDistribution = distribution(state.methods, (method) => method.evidenceGrade);
  const safetyDistribution = distribution(state.methods, (method) => method.safetyLevel);
  const useCaseDistribution = distribution(state.methods, (method) => method.category || "Unspecified");

  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <h1>Evidence-aware anxiety coping methods</h1>
        <p>Explore Reddit-derived coping patterns cross-checked with evidence and safety notes from the workbook. The app keeps Reddit consensus separate from clinical evidence so each method can be read with appropriate caution.</p>
      </div>
      <div class="hero-panel">
        <div>
          <h2>Research dashboard with practical detail</h2>
          <p>${escapeHtml(DISCLAIMER)}</p>
        </div>
        <div class="mini-stack">
          ${miniRow("Source workbook", state.data.sourceWorkbook || "Workbook JSON")}
          ${miniRow("Methods available", state.methods.length)}
          ${miniRow("Sources indexed", state.sources.length)}
        </div>
      </div>
    </section>

    <section class="grid metrics-grid" aria-label="Dashboard metrics">
      ${metricCard("Total methods", state.methods.length, "Rows in the Methods Database sheet.")}
      ${metricCard("Highest-ranked", topMethod?.name || "Unavailable", scoreText(topMethod?.priorityScore))}
      ${metricCard("Best evidence-supported", bestEvidence?.name || "Unavailable", `${bestEvidence?.evidenceGrade || ""} evidence`)}
      ${metricCard("Fastest acute methods", state.methods.filter((method) => method.speedScore >= 5).length, "Immediate time horizon.")}
      ${metricCard("Lowest-risk methods", lowRisk.length, "Safety score of 5/5 in the workbook.")}
    </section>

    <section class="grid dashboard-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Top 10 by total score</h2>
            <p>Uses the workbook priority score when available. Select a row to inspect the method details.</p>
          </div>
        </div>
        <div class="rank-list">
          ${topByScore.map((method, index) => rankRow(method, index + 1)).join("")}
        </div>
      </div>

      <div class="grid">
        ${chartPanel("Evidence grade distribution", "Select a bar to filter the Methods tab.", evidenceDistribution, "evidence")}
        ${chartPanel("Safety level distribution", "Select a bar to filter the Methods tab.", safetyDistribution, "safety")}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Top 10 score chart</h2>
            <p>Interactive method rows, sorted by workbook priority score.</p>
          </div>
        </div>
        ${scoreChart(topByScore)}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Use-case distribution</h2>
            <p>Grouped by the workbook category field, used as the most consistent target grouping.</p>
          </div>
        </div>
        ${barChart(useCaseDistribution, "useCaseCategory")}
      </div>
    </section>

    <section class="about-scoring">
      <span class="section-label">About scoring</span>
      <p>The dashboard uses the workbook priority score as the total score. Evidence, safety, and ease labels come from workbook columns. Practical difficulty is derived from the workbook ease score only for filtering and display.</p>
    </section>
  `;

  bindDashboardInteractions();
}

function miniRow(label, value) {
  return `<div class="mini-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function metricCard(label, value, note) {
  return `
    <article class="metric-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note || "")}</p>
    </article>
  `;
}

function rankRow(method, rank) {
  return `
    <button class="rank-row" type="button" data-method-id="${method.id}">
      <span class="rank-num">${rank}</span>
      <span class="rank-copy">
        <strong>${escapeHtml(method.name)}</strong>
        <small>${escapeHtml(method.category || method.useCase || "Uncategorized")}</small>
      </span>
      <span class="score-chip">${scoreText(method.priorityScore)}</span>
    </button>
  `;
}

function chartPanel(title, subtitle, data, filterType) {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </div>
      ${barChart(data, filterType)}
    </div>
  `;
}

function scoreChart(methods) {
  const max = Math.max(...methods.map((method) => method.priorityScore || 0), 1);
  return `
    <div class="chart-list">
      ${methods
        .map((method) => {
          const width = `${Math.max(3, ((method.priorityScore || 0) / max) * 100)}%`;
          return `
            <button class="chart-row" type="button" data-method-id="${method.id}" aria-label="Open ${escapeHtml(method.name)}">
              <span class="chart-label">${escapeHtml(method.name)}</span>
              <span class="bar-track"><span class="bar-fill" style="--width:${width}"></span></span>
              <span class="chart-value">${scoreText(method.priorityScore)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function barChart(items, filterType) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return `
    <div class="chart-list">
      ${items
        .map((item) => {
          const width = `${Math.max(5, (item.count / max) * 100)}%`;
          return `
            <button class="chart-row" type="button" data-chart-filter="${filterType}" data-chart-value="${escapeAttr(item.label)}">
              <span class="chart-label">${escapeHtml(item.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="--width:${width}"></span></span>
              <span class="chart-value">${item.count}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function bindDashboardInteractions() {
  document.querySelectorAll("[data-method-id]").forEach((button) => {
    button.addEventListener("click", () => openMethod(button.dataset.methodId));
  });

  document.querySelectorAll("[data-chart-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.chartFilter;
      const value = button.dataset.chartValue;
      if (type === "evidence") state.filters.evidence = value;
      if (type === "safety") state.filters.safety = value;
      if (type === "useCaseCategory") state.filters.useCase = "";
      state.tab = "methods";
      render();
    });
  });
}

function renderMethods() {
  const filtered = filteredMethods();
  const tags = unique(state.methods.flatMap((method) => method.tags)).sort();
  const hasTags = tags.length > 0;

  app.innerHTML = `
    <section class="methods-toolbar">
      <div class="search-row">
        <input id="methodSearch" type="search" value="${escapeAttr(state.query)}" placeholder="Search methods" aria-label="Search methods, summaries, steps, use-cases, and cautions" />
        <button class="filter-toggle" id="filterToggle" type="button">${state.filtersOpen ? "Hide filters" : "Filters"}</button>
        <button class="reset-button" id="resetFilters" type="button">Reset</button>
      </div>
    </section>

    <section class="methods-layout">
      <aside class="panel filters ${state.filtersOpen ? "is-open" : ""}" id="filtersPanel">
        ${selectFilter("Anxiety target / use-case", "useCase", unique(state.methods.map((method) => method.useCase)).sort())}
        ${selectFilter("Evidence grade", "evidence", unique(state.methods.map((method) => method.evidenceGrade)).sort())}
        ${selectFilter("Safety level", "safety", unique(state.methods.map((method) => method.safetyLevel)).sort())}
        ${selectFilter("Speed of effect", "speed", unique(state.methods.map((method) => method.timeHorizon)).sort())}
        ${selectFilter("Practical difficulty", "difficulty", unique(state.methods.map((method) => method.difficulty)).sort())}
        ${hasTags ? selectFilter("Tags", "tags", tags) : ""}
        <div class="filter">
          <label for="sortSelect">Sort by</label>
          <select id="sortSelect">
            ${sortOption("rank", "Overall rank")}
            ${sortOption("reddit", "Reddit consensus / upvote relevance")}
            ${sortOption("evidence", "Evidence strength")}
            ${sortOption("safety", "Safety score")}
            ${sortOption("ease", "Ease of implementation")}
            ${sortOption("speed", "Speed of effect")}
          </select>
        </div>
      </aside>

      <section>
        <div class="results-meta">
          <span>${filtered.length} of ${state.methods.length} methods</span>
          <span>${escapeHtml(activeFilterSummary())}</span>
        </div>
        ${
          filtered.length
            ? `<div class="grid methods-grid">${filtered.map(methodCard).join("")}</div>`
            : emptyState("No methods match these filters", "Try a broader search, remove a filter, or reset the view.")
        }
      </section>
    </section>
  `;

  bindMethodControls();
}

function selectFilter(label, key, options) {
  return `
    <div class="filter">
      <label for="${key}Filter">${escapeHtml(label)}</label>
      <select id="${key}Filter" data-filter="${key}">
        <option value="">All</option>
        ${options
          .filter(Boolean)
          .map((option) => `<option value="${escapeAttr(option)}" ${state.filters[key] === option ? "selected" : ""}>${escapeHtml(option)}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function sortOption(value, label) {
  return `<option value="${value}" ${state.sort === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function methodCard(method) {
  const tags = method.tags.length ? chipRow(method.tags, "Tags") : "";
  const sourcePreview = method.sourceIds.length ? chipRow(method.sourceIds.slice(0, 5), "Sources") : "";
  return `
    <button class="method-card" type="button" data-method-id="${method.id}">
      <div>
        <div class="badge-row">
          ${badge(method.evidenceGrade, evidenceClass(method.evidenceGrade))}
          ${badge(method.safetyLevel, safetyClass(method.safetyScore))}
          ${badge(method.category || "Uncategorized", "")}
        </div>
        <h3>${escapeHtml(method.name)}</h3>
        <p>${escapeHtml(method.summary || "No summary provided in the workbook.")}</p>
      </div>

      <div>
        <div class="detail-field">
          <span class="field-label">Quick practical steps</span>
          <div class="field-value">${escapeHtml(shorten(method.protocol, 190) || "No practical protocol listed.")}</div>
        </div>
        ${tags || sourcePreview}
      </div>

      <div class="card-footer">
        ${smallFact("Time", method.timeHorizon)}
        ${smallFact("Difficulty", method.difficulty)}
        ${smallFact("Use-case", method.useCase)}
      </div>
    </button>
  `;
}

function smallFact(label, value) {
  return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || "Unspecified")}</strong></div>`;
}

function chipRow(items, label) {
  return `
    <div class="chip-row" aria-label="${escapeAttr(label)}">
      ${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function badge(label, className) {
  return `<span class="badge ${className}">${escapeHtml(label || "Unspecified")}</span>`;
}

function bindMethodControls() {
  const search = document.querySelector("#methodSearch");
  search?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderMethods();
    document.querySelector("#methodSearch")?.focus();
  });

  document.querySelector("#filterToggle")?.addEventListener("click", () => {
    state.filtersOpen = !state.filtersOpen;
    renderMethods();
  });

  document.querySelector("#resetFilters")?.addEventListener("click", () => {
    state.query = "";
    state.filters = { useCase: "", evidence: "", safety: "", speed: "", difficulty: "", tags: "" };
    state.sort = "rank";
    renderMethods();
  });

  document.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state.filters[select.dataset.filter] = select.value;
      renderMethods();
    });
  });

  document.querySelector("#sortSelect")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderMethods();
  });

  document.querySelectorAll("[data-method-id]").forEach((button) => {
    button.addEventListener("click", () => openMethod(button.dataset.methodId));
  });
}

function filteredMethods() {
  const query = state.query.trim().toLowerCase();
  return sortedMethods(state.sort).filter((method) => {
    const searchable = [
      method.name,
      method.summary,
      method.tags.join(" "),
      method.protocol,
      method.useCase,
      method.cautions,
      method.category,
      method.visibility,
      method.redditSupport,
    ]
      .join(" ")
      .toLowerCase();

    if (query && !searchable.includes(query)) return false;
    if (state.filters.useCase && method.useCase !== state.filters.useCase) return false;
    if (state.filters.evidence && method.evidenceGrade !== state.filters.evidence) return false;
    if (state.filters.safety && method.safetyLevel !== state.filters.safety) return false;
    if (state.filters.speed && method.timeHorizon !== state.filters.speed) return false;
    if (state.filters.difficulty && method.difficulty !== state.filters.difficulty) return false;
    if (state.filters.tags && !method.tags.includes(state.filters.tags)) return false;
    return true;
  });
}

function sortedMethods(sortKey) {
  return [...state.methods].sort((a, b) => {
    if (sortKey === "reddit") return compareNumber(redditScore(b), redditScore(a)) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "evidence") return compareNumber(b.evidenceScore, a.evidenceScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "safety") return compareNumber(b.safetyScore, a.safetyScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "ease") return compareNumber(b.easeScore, a.easeScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "speed") return compareNumber(b.speedScore, a.speedScore) || compareNumber(b.priorityScore, a.priorityScore);
    return compareNumber(b.priorityScore, a.priorityScore) || compareNumber(a.rank, b.rank);
  });
}

function redditScore(method) {
  const value = `${method.redditSupport} ${method.visibility}`.toLowerCase();
  if (value.includes("very high")) return 5;
  if (value.includes("high")) return 4;
  if (value.includes("medium")) return 3;
  if (value.includes("mixed")) return 2;
  if (value.includes("low")) return 1;
  return 0;
}

function compareNumber(a, b) {
  const left = a ?? -Infinity;
  const right = b ?? -Infinity;
  return left < right ? -1 : left > right ? 1 : 0;
}

function activeFilterSummary() {
  const active = Object.values(state.filters).filter(Boolean).length + (state.query ? 1 : 0);
  return active ? `${active} active filter${active === 1 ? "" : "s"}` : "No filters active";
}

function openMethod(methodId) {
  const method = state.methods.find((item) => item.id === methodId);
  if (!method) return;
  const sourceMap = new Map(state.sources.map((source) => [source.id, source]));
  const references = method.sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);

  dialogContent.innerHTML = `
    <h2 class="dialog-title" id="dialogTitle">${escapeHtml(method.name)}</h2>
    <div class="badge-row">
      ${badge(method.evidenceGrade, evidenceClass(method.evidenceGrade))}
      ${badge(method.safetyLevel, safetyClass(method.safetyScore))}
      ${badge(`Score ${scoreText(method.priorityScore)}`, "")}
      ${badge(method.category || "Uncategorized", "")}
    </div>

    <div class="detail-grid">
      ${detailField("Full summary", method.summary, true)}
      ${detailField("Reddit consensus pattern", method.redditSupport)}
      ${detailField("Upvote / visibility notes", method.visibility)}
      ${detailField("Evidence grade", method.evidenceGrade)}
      ${detailField("Evidence notes", evidenceNotes(method), true)}
      ${detailField("Practical steps", method.protocol, true)}
      ${detailField("When to use", method.useCase)}
      ${detailField("When not to use / cautions", method.cautions, true)}
      ${detailField("Time to effect", method.timeHorizon)}
      ${detailField("Difficulty", method.difficulty)}
      ${method.tags.length ? detailField("Tags", method.tags.join(", ")) : ""}
      ${detailSources(references, method.sourceIds)}
    </div>
  `;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog() {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function detailField(label, value, wide = false) {
  if (!text(value)) return "";
  return `
    <section class="detail-field ${wide ? "is-wide" : ""}">
      <span class="field-label">${escapeHtml(label)}</span>
      <div class="field-value">${escapeHtml(value)}</div>
    </section>
  `;
}

function detailSources(references, ids) {
  if (!references.length && !ids.length) return "";
  return `
    <section class="detail-field is-wide">
      <span class="field-label">Source references</span>
      <div class="detail-sources">
        ${
          references.length
            ? references
                .map(
                  (source) => `
                    <div>
                      <strong>${escapeHtml(source.id)} / ${escapeHtml(source.type || "Source")}</strong>
                      <div class="field-value">${escapeHtml(source.title || source.relevance || "Reference from workbook")}</div>
                      ${source.url ? `<a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : ""}
                    </div>
                  `,
                )
                .join("")
            : `<div class="field-value">${escapeHtml(ids.join(", "))}</div>`
        }
      </div>
    </section>
  `;
}

function evidenceNotes(method) {
  const score = method.evidenceScore !== null ? `Evidence score: ${method.evidenceScore}/5.` : "";
  const grade = method.evidenceGrade ? `Workbook grade: ${method.evidenceGrade}.` : "";
  return [grade, score].filter(Boolean).join(" ");
}

function renderProtocols() {
  app.innerHTML = `
    <section class="panel-header">
      <div>
        <h1 class="section-title">Protocols</h1>
        <p>Protocol cards are drawn from the workbook Protocols sheet. They are practical routines, not treatment plans.</p>
      </div>
    </section>
    ${
      state.protocols.length
        ? `<section class="grid protocols-grid">${state.protocols.map(protocolCard).join("")}</section>`
        : emptyState("No protocols found", "The Protocols sheet did not contain usable rows.")
    }
  `;
}

function protocolCard(protocol) {
  return `
    <article class="protocol-card">
      <div class="badge-row">
        ${badge(protocol.duration || "Duration not listed", "")}
        ${badge(protocol.goal || "Use case not listed", "")}
      </div>
      <h3>${escapeHtml(protocol.name)}</h3>
      ${protocol.goal ? `<p><strong>Goal:</strong> ${escapeHtml(protocol.goal)}</p>` : ""}
      ${protocol.steps ? `<ol class="protocol-steps">${stepsList(protocol.steps)}</ol>` : ""}
      ${protocol.notes ? `<p><strong>Safety/context notes:</strong> ${escapeHtml(protocol.notes)}</p>` : ""}
      ${protocol.related.length ? chipRow(protocol.related, "Related methods") : ""}
    </article>
  `;
}

function stepsList(value) {
  const parts = text(value)
    .split(/\s*(?=\d+\)\s*)/)
    .map((part) => part.replace(/^\d+\)\s*/, "").trim())
    .filter(Boolean);

  const steps = parts.length > 1 ? parts : splitList(value);
  return steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
}

function renderSafety() {
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <h1>Safety boundaries first</h1>
        <p>The safety notes preserve the workbook language: clinical boundary, medication, breathing, exposure, substances, tracking, and urgent symptoms. The tone is intentionally brief and non-alarming.</p>
      </div>
      <div class="hero-panel">
        <div>
          <h2>Not a crisis or clinical care tool</h2>
          <p>For urgent medical symptoms, dangerous impulses, or inability to stay safe, use local emergency or medical support immediately.</p>
        </div>
      </div>
    </section>
    ${
      state.safetyNotes.length
        ? `<section class="grid safety-grid">${state.safetyNotes.map(safetyCard).join("")}</section>`
        : emptyState("No safety notes found", "The Safety Notes sheet did not contain usable rows.")
    }
  `;
}

function safetyCard(note) {
  return `
    <article class="safety-card">
      <h3>${escapeHtml(note.topic)}</h3>
      <p>${escapeHtml(note.guidance)}</p>
    </article>
  `;
}

function renderSources() {
  const types = unique(state.sources.map((source) => source.type)).sort();
  const filtered = state.sources.filter((source) => {
    const haystack = [source.id, source.type, source.title, source.relevance, source.notes, source.url].join(" ").toLowerCase();
    if (state.sourceQuery && !haystack.includes(state.sourceQuery.toLowerCase())) return false;
    if (state.sourceType && source.type !== state.sourceType) return false;
    return true;
  });

  app.innerHTML = `
    <section class="panel-header">
      <div>
        <h1 class="section-title">Sources</h1>
        <p>References are displayed from the workbook Sources sheet. Reddit sources and clinical/public guidance sources are labeled separately.</p>
      </div>
    </section>

    <section class="sources-tools">
      <input class="control" id="sourceSearch" type="search" value="${escapeAttr(state.sourceQuery)}" placeholder="Search sources, relevance, URLs" aria-label="Search sources" />
      <select class="control" id="sourceType" aria-label="Filter source type">
        <option value="">All source types</option>
        ${types.map((type) => `<option value="${escapeAttr(type)}" ${state.sourceType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
      </select>
    </section>

    ${
      filtered.length
        ? `<section class="sources-list">${filtered.map(sourceCard).join("")}</section>`
        : emptyState("No sources match", "Try removing the search term or source type filter.")
    }
  `;

  document.querySelector("#sourceSearch")?.addEventListener("input", (event) => {
    state.sourceQuery = event.target.value;
    renderSources();
    document.querySelector("#sourceSearch")?.focus();
  });
  document.querySelector("#sourceType")?.addEventListener("change", (event) => {
    state.sourceType = event.target.value;
    renderSources();
  });
}

function sourceCard(source) {
  return `
    <article class="source-card">
      <div>
        <div class="badge-row">
          ${badge(source.id || "Source", "")}
          ${badge(source.type || "Type not listed", "")}
        </div>
        <h3>${escapeHtml(source.title || source.relevance || source.url || "Untitled source")}</h3>
        ${source.relevance && source.title ? `<p>${escapeHtml(source.relevance)}</p>` : ""}
        ${source.notes ? `<p>${escapeHtml(source.notes)}</p>` : ""}
      </div>
      ${source.url ? `<a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
    </article>
  `;
}

function distribution(items, getter) {
  const counts = new Map();
  items.forEach((item) => {
    const label = getter(item) || "Unspecified";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function evidenceClass(label) {
  const value = text(label).toLowerCase();
  if (value.includes("high") && !value.includes("low")) return "evidence-high";
  if (value.includes("low") && !value.includes("moderate")) return "evidence-low";
  return "evidence-moderate";
}

function safetyClass(score) {
  if (score === null) return "";
  if (score >= 4) return "safety-low";
  if (score >= 3) return "safety-medium";
  return "safety-high";
}

function scoreText(value) {
  return value === null || value === undefined ? "n/a" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function shorten(value, max) {
  const content = text(value);
  if (content.length <= max) return content;
  return `${content.slice(0, max - 3).trim()}...`;
}

function emptyState(title, detail) {
  return `
    <section class="empty-state">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(detail)}</p>
      </div>
    </section>
  `;
}

function warnMissing(message) {
  if (missingWarnings.has(message)) return;
  missingWarnings.add(message);
  console.warn(message);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

const initialTab = window.location.hash.replace("#", "");
if (["dashboard", "methods", "protocols", "safety", "sources"].includes(initialTab)) {
  state.tab = initialTab;
}
