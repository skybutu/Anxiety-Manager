const DATA_URL = "data/workbook.json";
const SUPABASE_URL = "https://jdcjmygysexvvtxxxpvo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-qvco9QQ_eMPhChR-aRJuA_V37Q_Sv-";
const CLOUD_METADATA_KEY = "anxietyflow";

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

const SUPPLEMENT_ALIASES = {
  name: ["Supplement_Name", "Supplement Name", "Name"],
  symptoms: ["Target_Symptoms", "Target Symptoms", "Symptoms"],
  clinicalEvidence: ["Clinical_Evidence", "Clinical Evidence"],
  redditPopularity: ["Reddit_Popularity", "Reddit Popularity"],
  interactions: ["Psych_Med_Interactions", "Psych Med Interactions", "Medication Interactions"],
  risk: ["Risk_Level", "Risk Level", "Risk"],
};

const state = {
  tab: "dashboard",
  data: null,
  dashboard: {
    metrics: [],
    topMethods: [],
    title: "",
    subtitle: "",
    interpretation: "",
  },
  methods: [],
  supplements: [],
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
  methodPreset: "",
  sourceQuery: "",
  sourceType: "",
  sourceCategory: "",
  filtersOpen: false,
  authSession: null,
  authUser: null,
  authMode: "login",
  authMessage: "",
  authLoading: false,
};

const VALID_TABS = ["dashboard", "methods", "supplements", "protocols", "safety", "sources"];
const missingWarnings = new Set();
const app = document.querySelector("#app");
const dialog = document.querySelector("#methodDialog");
const dialogContent = document.querySelector("#dialogContent");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsContent = document.querySelector("#settingsContent");
const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let revealObserver = null;
const revealCompleteTimers = new WeakMap();
const revealCompleteHandlers = new WeakMap();
const revealStartTimes = new WeakMap();
let revealSafetyTimers = [];
let revealCycle = 0;
const REVEAL_COMPLETE_TIMEOUT = 1150;
const REVEAL_MIN_COMPLETE_MS = 360;

const supabaseClient = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) || null;

const authButton = document.querySelector("#authButton");
const authOverlay = document.querySelector("#authOverlay");
const authForm = document.querySelector("#authForm");
const authCloseButton = document.querySelector("#authCloseButton");
const authTitle = document.querySelector("#authTitle");
const authSubmitButton = document.querySelector("#authSubmitButton");
const authModeToggle = document.querySelector("#authModeToggle");
const googleAuthButton = document.querySelector("#googleAuthButton");
const authStatus = document.querySelector("#authStatus");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");

let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncPending = false;

applyStandaloneClasses();
registerServiceWorker();
init();

function applyStandaloneClasses() {
  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  const update = () => {
    const isIosStandalone = window.navigator.standalone === true;
    const isStandalone = isIosStandalone || standaloneQuery?.matches === true;
    document.documentElement.classList.toggle("ios-pwa-standalone", isStandalone);
    document.body.classList.toggle("ios-pwa-standalone", isStandalone);
    document.body.classList.toggle("ios-standalone", isIosStandalone);
    document.body.classList.toggle("pwa-standalone", isStandalone);
    console.log("IOS_PWA_TOP_NAV_TEXT_FIX_ACTIVE_v1", {
      standalone: isStandalone,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    });
  };

  update();
  standaloneQuery?.addEventListener?.("change", update);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch((error) => {
      console.warn("Service worker registration skipped.", error);
    });
  });
}

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
    initScrollAnimations();
  }
}

function bindShell() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });

  settingsButton.addEventListener("click", openSettings);
  settingsDialog.querySelector(".settings-close").addEventListener("click", closeSettings);
  settingsDialog.addEventListener("click", (event) => {
    if (event.target === settingsDialog) closeSettings();
  });

  dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) closeDialog();
    if (event.key === "Escape" && settingsDialog.open) closeSettings();
  });

  window.addEventListener("hashchange", syncTabFromHash);
  reducedMotionQuery?.addEventListener?.("change", initScrollAnimations);

  initAuth();
  authButton?.addEventListener("click", () => {
    if (state.authUser) {
      handleLogout();
    } else {
      openAuthModal("login");
    }
  });
  authForm?.addEventListener("submit", handleAuthSubmit);
  authCloseButton?.addEventListener("click", closeAuthModal);
  authModeToggle?.addEventListener("click", () =>
    setAuthMode(state.authMode === "login" ? "signup" : "login")
  );
  googleAuthButton?.addEventListener("click", handleGoogleAuth);
  authOverlay?.addEventListener("click", (event) => {
    if (event.target === authOverlay) closeAuthModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && authOverlay && !authOverlay.classList.contains("is-hidden")) {
      closeAuthModal();
    }
  });
}

// ── Auth functions ────────────────────────────────────────────

async function initAuth() {
  updateAuthNavbar();
  if (!supabaseClient) {
    setAuthMessage("Cloud sign-in is unavailable right now. Local mode is still active.");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.warn("Supabase session lookup failed.", error);
  }
  await applyAuthSession(data?.session || null);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "USER_UPDATED") {
      state.authSession = session || null;
      state.authUser = session?.user || null;
      updateAuthNavbar();
      return;
    }
    applyAuthSession(session);
  });
}

async function applyAuthSession(session) {
  const previousUserId = state.authUser?.id || "";
  state.authSession = session || null;
  state.authUser = session?.user || null;
  updateAuthNavbar();

  if (!state.authUser) return;

  applyCloudPreferences(state.authUser);
  if (state.data && previousUserId !== state.authUser.id) {
    render();
  }
  await syncUserPreferencesNow();
}

function updateAuthNavbar() {
  if (!authButton) return;
  if (state.authUser) {
    const label = profileLabel(state.authUser);
    authButton.classList.add("is-signed-in");
    authButton.textContent = `${label} · Log Out`;
    authButton.setAttribute("aria-label", `Signed in as ${label}. Log out.`);
    return;
  }
  authButton.classList.remove("is-signed-in");
  authButton.textContent = "Sign In";
  authButton.setAttribute("aria-label", "Sign in or create an AnxietyFlow account");
}

function profileLabel(user) {
  const metadata = user?.user_metadata || {};
  return text(metadata.name || metadata.full_name || user?.email || "Profile").split("@")[0] || "Profile";
}

function openAuthModal(mode = "login") {
  if (!authOverlay) return;
  setAuthMode(mode);
  document.body.classList.add("auth-active");
  authOverlay.classList.remove("is-hidden");
  authOverlay.setAttribute("aria-hidden", "false");
  if (!supabaseClient) setAuthMessage("Cloud sign-in is unavailable because the Supabase SDK did not load. Your local toolkit still works.");
  authEmail?.focus({ preventScroll: true });
}

function closeAuthModal() {
  if (!authOverlay) return;
  document.body.classList.remove("auth-active");
  authOverlay.classList.add("is-hidden");
  authOverlay.setAttribute("aria-hidden", "true");
  authButton?.focus({ preventScroll: true });
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";
  const isSignup = state.authMode === "signup";
  if (authTitle) authTitle.textContent = isSignup ? "Create your account" : "Sign in to sync";
  if (authSubmitButton) authSubmitButton.textContent = isSignup ? "Create Account" : "Sign In";
  if (authModeToggle) authModeToggle.textContent = isSignup ? "Already have an account? Sign in" : "Create Account";
  if (authPassword) authPassword.autocomplete = isSignup ? "new-password" : "current-password";
  setAuthMessage(
    isSignup
      ? "Create an account to sync your toolkit, streak, and check-ins across devices."
      : "Sign in to restore your AnxietyFlow toolkit on this device."
  );
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Cloud sign-in is unavailable because the Supabase SDK did not load.");
    return;
  }
  const email = text(authEmail?.value);
  const password = String(authPassword?.value || "");
  if (!email || !password) {
    setAuthMessage("Enter an email and password to continue.", true);
    return;
  }
  setAuthLoading(true);
  const authCall =
    state.authMode === "signup"
      ? supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.href.split("#")[0] },
        })
      : supabaseClient.auth.signInWithPassword({ email, password });

  const { data, error } = await authCall;
  setAuthLoading(false);
  if (error) {
    setAuthMessage(error.message || "Authentication failed. Please try again.", true);
    return;
  }
  if (state.authMode === "signup" && !data?.session) {
    setAuthMessage("Account created. Check your email to confirm the sign-in link.");
    return;
  }
  setAuthMessage("Signed in. Syncing your AnxietyFlow toolkit now.");
  closeAuthModal();
}

async function handleGoogleAuth() {
  if (!supabaseClient) {
    setAuthMessage("Google sign-in is unavailable because the Supabase SDK did not load.", true);
    return;
  }
  setAuthLoading(true);
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  setAuthLoading(false);
  if (error) setAuthMessage(error.message || "Google sign-in could not start.", true);
}

async function handleLogout() {
  if (!supabaseClient) return;
  await syncUserPreferencesNow();
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.warn("Supabase sign-out failed.", error);
    return;
  }
  state.authSession = null;
  state.authUser = null;
  updateAuthNavbar();
  setAuthMessage("Signed out. Local mode is active.");
}

function setAuthLoading(loading) {
  state.authLoading = loading;
  if (authSubmitButton) authSubmitButton.disabled = loading;
  if (googleAuthButton) googleAuthButton.disabled = loading;
  if (authModeToggle) authModeToggle.disabled = loading;
}

function setAuthMessage(message, isError = false) {
  state.authMessage = message;
  if (!authStatus) return;
  authStatus.textContent = message || "";
  authStatus.classList.toggle("is-error", isError);
}

// applyCloudPreferences is a no-op in this build — toolkit/streak state not present yet.
function applyCloudPreferences(_user) {}

function cloudPreferencesFromUser(user) {
  const metadata = user?.user_metadata || {};
  return metadata[CLOUD_METADATA_KEY] || {};
}

function cloudPreferencesPayload() {
  return { updated_at: new Date().toISOString() };
}

function scheduleCloudSync(delay = 700) {
  if (!state.authUser || !supabaseClient) return;
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    syncUserPreferencesNow();
  }, delay);
}

async function syncUserPreferencesNow() {
  if (!state.authUser || !supabaseClient) return;
  if (cloudSyncInFlight) {
    cloudSyncPending = true;
    return;
  }
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = null;
  cloudSyncInFlight = true;

  const existingMetadata = state.authUser.user_metadata || {};
  const { data, error } = await supabaseClient.auth.updateUser({
    data: { ...existingMetadata, [CLOUD_METADATA_KEY]: cloudPreferencesPayload() },
  });

  cloudSyncInFlight = false;
  if (cloudSyncPending) {
    cloudSyncPending = false;
    scheduleCloudSync(100);
  }
  if (error) {
    console.warn("Supabase preference sync failed.", error);
    return;
  }
  if (data?.user) {
    state.authUser = data.user;
    updateAuthNavbar();
  }
}

// ── End auth functions ────────────────────────────────────────

function hydrateState(payload) {
  const sheets = payload.sheets || {};
  const dashboardSheet = sheets.Dashboard || firstSheetByName(sheets, "dashboard");
  const methodsSheet = sheets["Methods Database"] || firstSheetByName(sheets, "methods");
  const supplementsSheet = sheets.Supplements || firstSheetByName(sheets, "supplement");
  const protocolsSheet = sheets.Protocols || firstSheetByName(sheets, "protocol");
  const safetySheet = sheets["Safety Notes"] || firstSheetByName(sheets, "safety");
  const sourcesSheet = sheets.Sources || firstSheetByName(sheets, "source");

  state.dashboard = mapDashboard(dashboardSheet);
  state.sources = (sourcesSheet?.rows || []).map(mapSource).filter((source) => source.id || source.url);
  state.methods = (methodsSheet?.rows || []).map((row, index) => mapMethod(row, index)).filter((method) => method.name);
  state.supplements = (supplementsSheet?.rows || []).map((row, index) => mapSupplement(row, index)).filter((supplement) => supplement.name);
  applyDashboardRanks();
  state.protocols = (protocolsSheet?.rows || []).map(mapProtocol).filter((protocol) => protocol.name);
  state.safetyNotes = (safetySheet?.rows || []).map(mapSafetyNote).filter((note) => note.topic || note.guidance);

  if (!hasAnyField(methodsSheet?.headers, FIELD_ALIASES.tags)) {
    warnMissing("Optional column missing: Tags. Tag filter and tag chips are hidden.");
  }
}

function applyDashboardRanks() {
  const rankMap = new Map(state.dashboard.topMethods.map((entry) => [normalizeKey(entry.method), entry.rank]));
  state.methods.forEach((method) => {
    method.dashboardRank = rankMap.get(normalizeKey(method.name)) || null;
  });
}

function mapDashboard(sheet) {
  const raw = sheet?.raw || [];
  const rows = sheet?.rows || [];
  const metrics = rows
    .filter((row) => text(row.Metric) && text(row.Value))
    .map((row) => ({
      metric: text(row.Metric),
      value: row.Value,
      definition: text(row.Definition),
    }));
  const topMethods = rows
    .filter((row) => text(row.Method) && toNumber(row.Rank) !== null)
    .map((row) => ({
      rank: toNumber(row.Rank),
      method: text(row.Method),
      category: text(row.Category),
      why: text(row["Why it ranks high"]),
      priorityScore: toNumber(row["Priority score"]),
    }))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const interpretation = rows.find((row) => text(row.Metric).startsWith("Interpretation:"))?.Metric || "";

  return {
    metrics,
    topMethods,
    title: text(raw[0]?.[0]),
    subtitle: text(raw[1]?.[0]),
    interpretation: text(interpretation),
  };
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

function mapSupplement(row, index) {
  return {
    id: `supplement-${index}`,
    name: text(read(row, SUPPLEMENT_ALIASES.name)),
    symptoms: text(read(row, SUPPLEMENT_ALIASES.symptoms)),
    clinicalEvidence: text(read(row, SUPPLEMENT_ALIASES.clinicalEvidence)),
    redditPopularity: text(read(row, SUPPLEMENT_ALIASES.redditPopularity)),
    interactions: text(read(row, SUPPLEMENT_ALIASES.interactions)),
    risk: normalizeRisk(read(row, SUPPLEMENT_ALIASES.risk)),
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

function normalizeRisk(value) {
  const risk = text(value);
  return risk || "Unspecified";
}

function safetyLevel(score) {
  if (score === null) return "Unspecified";
  if (score >= 5) return "Lower caution";
  if (score >= 4) return "Lower-moderate caution";
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
  if (state.tab === "supplements") renderSupplements();
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
  if (!VALID_TABS.includes(tab)) return;
  state.tab = tab;
  if (window.location.hash !== `#${tab}`) window.location.hash = tab;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncTabFromHash() {
  const tab = window.location.hash.replace("#", "");
  if (!VALID_TABS.includes(tab) || tab === state.tab) return;
  state.tab = tab;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const dashboardTop = dashboardTopMethods();
  const topByScore = dashboardTop.length ? dashboardTop : sortedMethods("rank").slice(0, 10);
  const topMethod = topByScore[0];
  const bestEvidence = topMethodsBy("evidenceScore");
  const lowestRisk = topMethodsBy("safetyScore");
  const fastestAcute = topMethodsBy("speedScore");
  const mostPractical = topMethodsBy("easeScore");
  const rankedSource = dashboardTop.length ? "Uses the workbook Dashboard sheet rank and priority score." : "Dashboard rank was not available, so this falls back to Methods sort order by workbook rank/score.";
  const evidenceDistribution = distribution(state.methods, (method) => method.evidenceGrade, { omitUnspecified: true });
  const safetyDistribution = distribution(state.methods, (method) => method.safetyLevel, { omitUnspecified: true });
  const useCaseDistribution = distribution(state.methods, (method) => method.useCase, { omitUnspecified: true });
  const categoryDistribution = distribution(state.methods, (method) => method.category, { omitUnspecified: true });
  const difficultyDistribution = distribution(state.methods, (method) => method.difficulty, { omitUnspecified: true });
  const timeDistribution = distribution(state.methods, (method) => method.timeHorizon, { omitUnspecified: true });
  const useCaseHasRepeatedValues = useCaseDistribution.some((item) => item.count > 1);
  const commonUseCaseData = useCaseHasRepeatedValues ? useCaseDistribution : categoryDistribution;
  const commonUseCaseTitle = useCaseHasRepeatedValues ? "Most common use-cases" : "Most common workbook themes";
  const commonUseCaseSubtitle = useCaseHasRepeatedValues
    ? "Grouped by repeated workbook use-case values."
    : "Exact workbook use-case values are mostly unique, so this uses the workbook Category field as a theme view.";
  const totalMethods = dashboardMetric("Total methods")?.value || state.methods.length;
  const highEvidence = dashboardMetric("High evidence methods")?.value || state.methods.filter((method) => method.evidenceScore >= 5).length;
  const immediateUse = dashboardMetric("Immediate-use methods")?.value || state.methods.filter((method) => method.speedScore >= 5).length;
  const cautionRows = dashboardMetric("Safety-sensitive / caution rows")?.value || state.methods.filter((method) => method.safetyScore <= 2).length;
  const lowestCautionCount = state.methods.filter((method) => method.safetyScore >= 5).length;
  const easyCount = state.methods.filter((method) => method.easeScore >= 4).length;
  const topPicks = dashboardTopPicks();
  const metricCards = dashboardMetricCards({ totalMethods, topMethod, highEvidence, lowestCautionCount, immediateUse, easyCount, cautionRows });
  const summaryWidgets = dashboardSummaryWidgets({ bestEvidence, lowestRisk, fastestAcute, mostPractical });
  const chartPanels = dashboardChartPanels({
    evidenceDistribution,
    safetyDistribution,
    difficultyDistribution,
    timeDistribution,
    commonUseCaseData,
    commonUseCaseTitle,
    commonUseCaseSubtitle,
    useCaseHasRepeatedValues,
  });

  app.innerHTML = `
    <section class="isolated-pacer-container" aria-label="Box breathing pacer">
      <div class="isolated-pacer-header">
        <span class="section-label">Calm tool</span>
        <h2 class="isolated-pacer-title">Box Breathing</h2>
        <p class="isolated-pacer-desc">4-count inhale &middot; 4-count hold &middot; 4-count exhale &middot; 4-count hold</p>
      </div>
      <div class="isolated-pacer-ring-wrap">
        <div class="isolated-pacer-ring" id="isolatedPacerRing">
          <span class="isolated-pacer-phase" id="isolatedPacerPhase">Ready</span>
          <span class="isolated-pacer-count" id="isolatedPacerCount"></span>
        </div>
      </div>
      <div class="isolated-pacer-controls">
        <button class="isolated-pacer-btn" id="isolatedPacerStart" type="button">Start</button>
        <button class="isolated-pacer-btn isolated-pacer-btn-secondary" id="isolatedPacerReset" type="button">Reset</button>
      </div>
    </section>

    <section class="hero" aria-labelledby="siteHeroTitle">
      <div class="hero-copy">
        <h1 id="siteHeroTitle">Anxiety Manager is an evidence-aware coping methods database</h1>
        <p>Explore workbook-derived anxiety coping methods, protocols, safety notes, and sources in one structured research resource. Reddit-derived patterns are presented as commonly reported observations, not clinical proof, and every method should be read as educational self-management support rather than medical advice.</p>
        <div class="hero-actions" aria-label="Primary website sections">
          <button class="site-button" type="button" data-scroll-target="dashboardMetrics">View dashboard</button>
          <button class="site-button" type="button" data-jump-tab="methods">Explore methods</button>
          <button class="site-button site-button-secondary" type="button" data-jump-tab="supplements">Supplements Matrix</button>
          <button class="site-button site-button-secondary" type="button" data-jump-tab="safety">Review safety</button>
          <button class="site-button site-button-secondary" type="button" data-jump-tab="sources">Inspect sources</button>
        </div>
      </div>
      <div class="hero-panel">
        <div>
          <h2>Built from a structured workbook</h2>
          <p>The source of truth is <strong>${escapeHtml(state.data.sourceWorkbook || "reddit_anxiety_methods_database.xlsx")}</strong>. Rankings, source references, protocols, evidence fields, and caution fields are derived from workbook data when available.</p>
        </div>
        <div class="mini-stack">
          ${miniRow("Source workbook", state.data.sourceWorkbook || "Workbook JSON")}
          ${miniRow("Methods available", state.methods.length)}
          ${miniRow("Supplements matrix", state.supplements.length)}
          ${miniRow("Protocols listed", state.protocols.length)}
          ${miniRow("Sources indexed", state.sources.length)}
        </div>
      </div>
    </section>

    <section class="public-value-section panel" aria-labelledby="publicValueTitle">
      <div class="panel-header">
        <div>
          <span class="section-label">Website guide</span>
          <h2 id="publicValueTitle">What this site does</h2>
          <p>Use the website to inspect coping-method data, compare workbook fields, and move between Dashboard, Methods, Protocols, Safety, and Sources without turning community-derived advice into clinical proof.</p>
        </div>
      </div>
      <div class="grid public-value-grid">
        ${publicValueCard("How the data is organized", "Methods are grouped and compared by workbook rank, priority score, category, evidence grade, caution level, ease, time horizon, use-case, and source references.")}
        ${publicValueCard("Explore evidence-aware methods", "Search, filter, and sort coping methods while keeping Reddit-derived observations separate from evidence and caution fields.")}
        ${publicValueCard("Why Safety Notes matter", "Safety notes highlight workbook boundaries around urgent symptoms, medications, exposure, substances, breathing, overuse, and clinician involvement.")}
        ${publicValueCard("Source transparency", "The Sources tab exposes workbook references and labels Reddit-derived, clinical, and public-guidance sources for context.")}
        ${publicValueCard("Limitations", "The site does not diagnose, treat, determine personal safety, or recommend a best method for every person.")}
      </div>
    </section>

    <section class="grid metrics-grid" id="dashboardMetrics" aria-label="Dashboard metrics">
      ${metricCards.join("")}
    </section>

    ${summaryWidgets.length ? `<section class="grid dashboard-widget-grid" aria-label="Dashboard method summaries">${summaryWidgets.join("")}</section>` : ""}

    <section class="dashboard-explainer panel">
      <div>
        <span class="section-label">How to read this dashboard</span>
        <p>Rankings, chart groupings, and top insight cards are workbook-derived summaries. Reddit-derived patterns describe what users commonly reported; they are not clinical proof. Evidence and caution fields should be interpreted conservatively as educational self-management support, not medical advice.</p>
      </div>
    </section>

    <section class="methodology-panel panel" id="methodology" aria-labelledby="methodologyTitle">
      <div class="panel-header">
        <div>
          <span class="section-label">Methodology</span>
          <h2 id="methodologyTitle">How this website interprets the workbook</h2>
          <p>The website presents the workbook as an interactive database. It does not diagnose, treat, determine personal safety, or replace a licensed clinician.</p>
        </div>
      </div>
      <div class="grid methodology-grid">
        ${methodologyCard("Spreadsheet source of truth", "Method names, summaries, protocols, scores, cautions, and sources are parsed from the workbook-derived data file.")}
        ${methodologyCard("Community-derived observations", "Reddit-derived patterns describe commonly reported user experience and visibility. They are observational and should not be read as treatment evidence.")}
        ${methodologyCard("Workbook-derived rankings", "Dashboard ranks, priority scores, insight groups, and charts use workbook fields such as evidence score, caution score, ease score, time horizon, category, and use-case.")}
        ${methodologyCard("Conservative interpretation", "Evidence and caution fields should be read carefully. Lower-caution rows do not mean suitable for everyone, and higher-evidence rows are not individualized recommendations.")}
        ${methodologyCard("Source transparency", "The Sources tab exposes workbook references and labels source categories so readers can inspect the context behind the database.")}
      </div>
      <div class="methodology-actions" aria-label="Methodology links">
        <button class="site-button site-button-secondary" type="button" data-jump-tab="sources">Inspect sources</button>
        <button class="site-button site-button-secondary" type="button" data-jump-tab="protocols">View protocols</button>
      </div>
    </section>

    ${topPicks.length ? `<section class="panel top-picks-panel">
      <div class="panel-header">
        <div>
          <h2>Workbook-derived insight groups</h2>
          <p>Each group uses only workbook fields such as evidence score, caution score, ease score, time horizon, category, use-case, and method text. Groups are for comparison and triage, not individualized recommendations.</p>
        </div>
      </div>
      <div class="grid top-picks-grid">
        ${topPicks.map((group) => topPickCard(group)).join("")}
      </div>
    </section>` : ""}

    <section class="grid dashboard-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <span class="section-label">Ranked workbook view</span>
            <h2>Highest workbook-ranked methods</h2>
            <p>${escapeHtml(rankedSource)} Select a row to inspect workbook-derived details.</p>
          </div>
        </div>
        <div class="rank-list">
          ${topByScore.map((method, index) => rankRow(method, index + 1)).join("")}
        </div>
      </div>

      <div class="grid dashboard-chart-stack">
        ${chartPanels.slice(0, 4).join("")}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <span class="section-label">Priority score</span>
            <h2>Top 10 score chart</h2>
            <p>Interactive method rows sorted by workbook priority score when available. Longer bars mean higher workbook priority score.</p>
          </div>
        </div>
        ${scoreChart(topByScore)}
      </div>

      ${chartPanels.slice(4).join("")}
    </section>

    <section class="about-scoring">
      <span class="section-label">About scoring</span>
      <p>${escapeHtml(state.dashboard.interpretation || "The dashboard uses workbook priority score, dashboard rank, evidence score, caution score, ease score, and time horizon fields when available. Practical difficulty is derived from workbook ease score only for filtering and display. These summaries are educational comparisons, not medical advice or a replacement for professional care.")}</p>
    </section>
  `;

  bindDashboardInteractions();
  initScrollAnimations();
}

function dashboardMetricCards({ totalMethods, topMethod, highEvidence, lowestCautionCount, immediateUse, easyCount, cautionRows }) {
  const cards = [
    metricCard("Total methods", totalMethods, dashboardMetric("Total methods")?.definition || "Rows in the Methods Database sheet.", "Workbook rows"),
  ];

  if (topMethod) {
    cards.push(metricCard("Highest workbook-ranked", topMethod.name, topMethod.priorityScore !== null ? `Priority score ${scoreText(topMethod.priorityScore)}` : "Top workbook-ranked method.", "Ranked"));
  }
  if (hasScoreField("evidenceScore")) {
    cards.push(metricCard("Higher evidence entries", highEvidence, dashboardMetric("High evidence methods")?.definition || "Rows with higher workbook evidence scores.", "Evidence"));
  }
  if (hasScoreField("safetyScore")) {
    cards.push(metricCard("Lowest-caution entries", lowestCautionCount, "Rows with the strongest workbook caution score. Lower caution does not mean suitable for everyone.", "Caution"));
    cards.push(metricCard("Requires caution", cautionRows, dashboardMetric("Safety-sensitive / caution rows")?.definition || "Rows flagged for avoidance, professional input, or caution.", "Safety"));
  }
  if (hasTextField("timeHorizon")) {
    cards.push(metricCard("Fastest reported entries", immediateUse, dashboardMetric("Immediate-use methods")?.definition || "Rows with an immediate workbook time horizon.", "Time"));
  }
  if (hasScoreField("easeScore")) {
    cards.push(metricCard("Most practical entries", easyCount, "Rows marked easy or very easy from the workbook ease score.", "Ease"));
  }

  return cards;
}

function dashboardSummaryWidgets({ bestEvidence, lowestRisk, fastestAcute, mostPractical }) {
  return [
    hasScoreField("evidenceScore") ? methodSummaryWidget("Best evidence-supported methods", bestEvidence, "Evidence score") : "",
    hasScoreField("safetyScore") ? methodSummaryWidget("Lowest-caution methods", lowestRisk, "Caution score") : "",
    hasTextField("timeHorizon") ? methodSummaryWidget("Fastest reported methods", fastestAcute, "Time horizon") : "",
    hasScoreField("easeScore") ? methodSummaryWidget("Most practical / easy methods", mostPractical, "Ease score") : "",
  ].filter(Boolean);
}

function dashboardChartPanels({ evidenceDistribution, safetyDistribution, difficultyDistribution, timeDistribution, commonUseCaseData, commonUseCaseTitle, commonUseCaseSubtitle, useCaseHasRepeatedValues }) {
  return [
    chartPanel("Evidence-grade distribution", "Workbook evidence grade counts. Select a bar to filter the Methods tab.", evidenceDistribution, "evidence", "Evidence"),
    chartPanel("Caution / safety distribution", "Workbook caution labels derived from safety score. Select a bar to filter the Methods tab.", safetyDistribution, "safety", "Caution"),
    chartPanel("Difficulty distribution", "Practical difficulty derived from workbook ease score. Select a bar to filter the Methods tab.", difficultyDistribution, "difficulty", "Difficulty"),
    chartPanel("Reported time horizon", "Workbook-reported speed or time horizon. Select a bar to filter the Methods tab.", timeDistribution, "speed", "Time"),
    chartPanel(commonUseCaseTitle, commonUseCaseSubtitle, commonUseCaseData, useCaseHasRepeatedValues ? "useCaseCategory" : "", useCaseHasRepeatedValues ? "Use-case" : "Theme"),
  ];
}

function hasScoreField(field) {
  return state.methods.some((method) => method[field] !== null && method[field] !== undefined);
}

function hasTextField(field) {
  return state.methods.some((method) => text(method[field]));
}

function dashboardTopPicks() {
  const groups = [
    {
      title: "Evidence + lower caution",
      note: "Workbook evidence score plus lower-caution rows, sorted by evidence, caution, then priority score.",
      methods: topMethodsByComposite(
        (method) => method.evidenceScore !== null && method.safetyScore !== null && method.safetyScore >= 4,
        [(method) => method.evidenceScore, (method) => method.safetyScore, (method) => method.priorityScore],
      ),
      scoreLabel: "Evidence",
      score: (method) => `E ${scoreText(method.evidenceScore)} · C ${scoreText(method.safetyScore)}`,
    },
    {
      title: "Fastest acute regulation",
      note: "Workbook text match for acute, panic-like, arousal, grounding, or racing-body contexts, sorted by reported time horizon.",
      methods: topMethodsByComposite(
        (method) => method.speedScore > 0 && methodTextIncludes(method, ["acute", "panic", "arousal", "grounding", "racing body"]),
        [(method) => method.speedScore, (method) => method.priorityScore, (method) => method.safetyScore],
      ),
      scoreLabel: "Time",
      score: (method) => method.timeHorizon || scoreText(method.speedScore),
    },
    {
      title: "Low-effort options",
      note: "Workbook rows marked easy or very easy, sorted by ease score, caution score, then priority score.",
      methods: topMethodsByComposite(
        (method) => method.easeScore !== null && method.easeScore >= 4,
        [(method) => method.easeScore, (method) => method.safetyScore, (method) => method.priorityScore],
      ),
      scoreLabel: "Ease",
      score: (method) => `Ease ${scoreText(method.easeScore)}`,
    },
    {
      title: "Rumination-focused methods",
      note: "Workbook text match for rumination, worry, thought loops, or catastrophizing.",
      methods: topMethodsByComposite(
        (method) => methodTextIncludes(method, ["rumination", "worry", "catastrophizing", "thought", "loop"]),
        [(method) => method.priorityScore, (method) => method.evidenceScore, (method) => method.safetyScore],
      ),
      scoreLabel: "Score",
      score: (method) => scoreText(method.priorityScore),
    },
    {
      title: "Sleep-supportive methods",
      note: "Workbook text match for sleep, bedtime, night worry, pre-sleep, or insomnia-related anxiety.",
      methods: topMethodsByComposite(
        (method) => methodTextIncludes(method, ["sleep", "bedtime", "night", "pre-sleep", "insomnia"]),
        [(method) => method.priorityScore, (method) => method.easeScore, (method) => method.safetyScore],
      ),
      scoreLabel: "Score",
      score: (method) => scoreText(method.priorityScore),
    },
    {
      title: "Avoidance / exposure-related",
      note: "Workbook text match for exposure, avoidance, behavioral activation, facing situations, or approach practice.",
      methods: topMethodsByComposite(
        (method) => methodTextIncludes(method, ["exposure", "avoidance", "behavioral activation", "facing", "situations", "approach"]),
        [(method) => method.priorityScore, (method) => method.evidenceScore, (method) => method.safetyScore],
      ),
      scoreLabel: "Score",
      score: (method) => scoreText(method.priorityScore),
    },
  ];
  return groups
    .map((group) => ({ ...group, methods: uniqueMethods(group.methods).slice(0, 4) }))
    .filter((group) => group.methods.length);
}

function topMethodsByComposite(filterFn, sortFns, limit = 4) {
  return state.methods
    .filter(filterFn)
    .sort((a, b) => {
      for (const score of sortFns) {
        const result = compareNumber(score(b), score(a));
        if (result) return result;
      }
      return compareNumber(a.rank, b.rank);
    })
    .slice(0, limit);
}

function methodTextIncludes(method, terms) {
  const searchable = [method.category, method.name, method.summary, method.useCase, method.protocol].join(" ").toLowerCase();
  return terms.some((term) => searchable.includes(term));
}

function topMethodsBy(field) {
  return [...state.methods]
    .filter((method) => method[field] !== null && method[field] !== undefined && method[field] !== 0)
    .sort((a, b) => compareNumber(b[field], a[field]) || compareNumber(b.priorityScore, a.priorityScore))
    .slice(0, 3);
}

function dashboardMetric(metricName) {
  return state.dashboard.metrics.find((item) => normalizeKey(item.metric) === normalizeKey(metricName));
}

function dashboardTopMethods() {
  return state.dashboard.topMethods
    .map((entry) => {
      const method = state.methods.find((item) => normalizeKey(item.name) === normalizeKey(entry.method));
      if (!method) {
        warnMissing(`Dashboard method not found in Methods Database: ${entry.method}`);
        return null;
      }
      return {
        ...method,
        rank: entry.rank || method.rank,
        category: entry.category || method.category,
        priorityScore: entry.priorityScore ?? method.priorityScore,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function miniRow(label, value) {
  return `<div class="mini-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function publicValueCard(title, body) {
  return `
    <article class="public-value-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function methodologyCard(title, body) {
  return `
    <article class="methodology-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function metricCard(label, value, note, kicker = "Workbook") {
  return `
    <article class="metric-card dashboard-metric-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(kicker)}</span>
      <p>${escapeHtml(note || "")}</p>
    </article>
  `;
}

function methodSummaryWidget(label, methods, scoreLabel) {
  if (!methods.length) {
    return "";
  }
  return `
    <article class="metric-card method-summary-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(methods.length)}</strong>
      <p>Top workbook rows for this signal. Select a row for details.</p>
      <div class="summary-method-list">
        ${methods
          .map(
            (method) => `
              <button class="summary-method" type="button" data-method-id="${method.id}">
                <span>${escapeHtml(method.name)}</span>
                <em>${escapeHtml(scoreLabel)} ${escapeHtml(summaryScore(method, scoreLabel))}</em>
              </button>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function topPickCard(group) {
  return `
    <article class="top-pick-card dashboard-insight-card app-card">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${badge("Insight group", "")}
          ${badge(group.scoreLabel, "")}
        </div>
        <h3 class="card-title">${escapeHtml(group.title)}</h3>
        <p class="card-summary">${escapeHtml(group.note)}</p>
      </div>
      ${
        group.methods.length
          ? `<div class="dashboard-pick-list">${group.methods.map((method) => dashboardPickRow(method, group.score(method))).join("")}</div>`
          : emptyChartState("Not available in workbook.")
      }
    </article>
  `;
}

function dashboardPickRow(method, score) {
  return `
    <button class="dashboard-pick" type="button" data-method-id="${method.id}">
      <span>
        <strong>${escapeHtml(method.name)}</strong>
        <small>${escapeHtml(method.useCase || method.category || "Workbook row")}</small>
      </span>
      <em>${escapeHtml(score)}</em>
    </button>
  `;
}

function summaryScore(method, label) {
  if (label === "Evidence score") return scoreText(method.evidenceScore);
  if (label === "Caution score") return scoreText(method.safetyScore);
  if (label === "Ease score") return scoreText(method.easeScore);
  return method.timeHorizon || scoreText(method.speedScore);
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

function chartPanel(title, subtitle, data, filterType, eyebrow = "Workbook chart") {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const hasData = data.length > 0;
  return `
    <div class="panel dashboard-chart-panel">
      <div class="panel-header">
        <div>
          <span class="section-label">${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        ${hasData ? `<span class="chart-total">${escapeHtml(total)} rows</span>` : ""}
      </div>
      <div class="chart-legend" aria-hidden="true">
        <span>Workbook value</span>
        <span>Share</span>
        <span>Count</span>
      </div>
      ${barChart(data, filterType, title)}
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

function barChart(items, filterType, title = "chart") {
  if (!items.length) {
    return emptyChartState(`No ${title.toLowerCase()} data available from the spreadsheet.`);
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  return `
    <div class="chart-list">
      ${items
        .map((item) => {
          const width = `${Math.max(5, (item.count / max) * 100)}%`;
          const attributes = filterType ? `button class="chart-row" type="button" data-chart-filter="${filterType}" data-chart-value="${escapeAttr(item.label)}"` : `div class="chart-row is-static"`;
          return `
            <${attributes}>
              <span class="chart-label">${escapeHtml(item.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="--width:${width}"></span></span>
              <span class="chart-value">${item.count}</span>
            </${filterType ? "button" : "div"}>
          `;
        })
        .join("")}
    </div>
  `;
}

function emptyChartState(message) {
  return `
    <div class="chart-empty-state">
      <p>${escapeHtml(message)}</p>
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
      if (type === "useCaseCategory") state.filters.useCase = value;
      if (type === "difficulty") state.filters.difficulty = value;
      if (type === "speed") state.filters.speed = value;
      state.tab = "methods";
      render();
    });
  });

  document.querySelectorAll("[data-jump-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.jumpTab));
  });

  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.scrollTarget}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  initIsolatedPacer();
}

function initIsolatedPacer() {
  const ring = document.getElementById("isolatedPacerRing");
  const phaseEl = document.getElementById("isolatedPacerPhase");
  const countEl = document.getElementById("isolatedPacerCount");
  const startBtn = document.getElementById("isolatedPacerStart");
  const resetBtn = document.getElementById("isolatedPacerReset");
  if (!ring || !startBtn) return;

  const PHASES = [
    { name: "Inhale", duration: 4, cls: "is-inhale" },
    { name: "Hold",   duration: 4, cls: "is-hold" },
    { name: "Exhale", duration: 4, cls: "is-exhale" },
    { name: "Hold",   duration: 4, cls: "is-hold2" },
  ];
  let running = false;
  let timer = null;
  let phaseIndex = 0;
  let countdown = 0;

  function tick() {
    if (!running) return;
    const phase = PHASES[phaseIndex];
    ring.className = `isolated-pacer-ring ${phase.cls}`;
    phaseEl.textContent = phase.name;
    countEl.textContent = countdown;
    countdown--;
    if (countdown < 0) {
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      countdown = PHASES[phaseIndex].duration;
    }
    timer = setTimeout(tick, 1000);
  }

  startBtn.addEventListener("click", () => {
    if (running) {
      running = false;
      clearTimeout(timer);
      startBtn.textContent = "Resume";
    } else {
      running = true;
      if (countdown === 0) {
        phaseIndex = 0;
        countdown = PHASES[0].duration;
      }
      tick();
      startBtn.textContent = "Pause";
    }
  });

  resetBtn.addEventListener("click", () => {
    running = false;
    clearTimeout(timer);
    phaseIndex = 0;
    countdown = 0;
    ring.className = "isolated-pacer-ring";
    phaseEl.textContent = "Ready";
    countEl.textContent = "";
    startBtn.textContent = "Start";
  });
}

function renderMethods() {
  const filtered = uniqueMethods(filteredMethods());
  const tags = unique(state.methods.flatMap((method) => method.tags)).sort();
  const hasTags = tags.length > 0;
  const preset = activeMethodPreset();

  app.innerHTML = `
    <section class="methods-toolbar">
      <div class="search-row">
        <input id="methodSearch" type="search" value="${escapeAttr(state.query)}" placeholder="Search methods" aria-label="Search methods, summaries, steps, use-cases, and cautions" />
        ${sortControlMarkup()}
        <button class="filter-toggle" id="filterToggle" type="button">${state.filtersOpen ? "Hide filters" : "Filters"}</button>
        <button class="reset-button" id="resetFilters" type="button">Reset view</button>
      </div>
      ${methodPresetBar()}
      ${activeFilterChips()}
      ${preset ? presetExplanation(preset, filtered.length) : ""}
    </section>

    <section class="methods-layout">
      <aside class="panel filters ${state.filtersOpen ? "is-open" : ""}" id="filtersPanel">
        ${selectFilter("Anxiety target / use-case", "useCase", unique(state.methods.map((method) => method.useCase)).sort())}
        ${selectFilter("Evidence grade", "evidence", unique(state.methods.map((method) => method.evidenceGrade)).sort())}
        ${selectFilter("Caution level", "safety", unique(state.methods.map((method) => method.safetyLevel)).sort())}
        ${selectFilter("Reported time horizon", "speed", unique(state.methods.map((method) => method.timeHorizon)).sort())}
        ${selectFilter("Practical difficulty", "difficulty", unique(state.methods.map((method) => method.difficulty)).sort())}
        ${hasTags ? selectFilter("Tags", "tags", tags) : ""}
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

    ${methodRankingNote()}
  `;

  bindMethodControls();
  initScrollAnimations();
}

function renderSupplements() {
  const groups = supplementRiskGroups();
  const total = state.supplements.length;
  const highRiskCount = state.supplements.filter((supplement) => normalizeKey(supplement.risk) === "high").length;

  app.innerHTML = `
    <section class="supplements-hero panel">
      <div>
        <span class="section-label">Supplements Matrix</span>
        <h1 class="section-title">Supplement signals separated from coping methods</h1>
        <p>This matrix is parsed from the dedicated Supplements workbook sheet. It is educational database content only and is not medical advice, diagnosis, treatment, supplement recommendation, or medication guidance.</p>
        <p class="legal-notice-inline">Supplement information is general educational content only and is not a recommendation to use, stop, combine, or dose any supplement. Discuss supplement decisions with a licensed clinician or pharmacist, especially when using medication or managing a health condition.</p>
      </div>
      <div class="supplements-summary-grid" aria-label="Supplements matrix summary">
        ${smallFact("Supplements", total)}
        ${smallFact("High-risk flags", highRiskCount)}
        ${smallFact("Sort", "Risk level")}
      </div>
    </section>

    <section class="supplements-warning panel" role="note">
      <span class="section-label">Educational Note: Medication Interactions</span>
      <p>The workbook notes that combining supplements with psychiatric medication, sedatives, thyroid medication, blood thinners, blood pressure medication, nitroglycerin, SSRIs, SNRIs, or MAOIs without consulting a physician or licensed pharmacist may carry significant risks. This is general educational information only. Discuss all supplement and medication decisions with a licensed clinician or pharmacist.</p>
    </section>

    ${
      groups.length
        ? groups.map(supplementRiskSection).join("")
        : emptyState("No supplement matrix found", "The workbook did not include a Supplements sheet.")
    }
  `;

  initScrollAnimations();
}

function supplementRiskGroups() {
  const order = ["High", "Moderate", "Low", "Unspecified"];
  const groups = new Map(order.map((risk) => [risk, []]));

  sortedSupplements().forEach((supplement) => {
    const key = order.find((risk) => normalizeKey(risk) === normalizeKey(supplement.risk)) || "Unspecified";
    groups.get(key).push(supplement);
  });

  return [...groups.entries()]
    .filter(([, supplements]) => supplements.length)
    .map(([risk, supplements]) => ({ risk, supplements }));
}

function sortedSupplements() {
  return [...state.supplements].sort((a, b) => {
    const riskOrder = { high: 0, moderate: 1, low: 2, unspecified: 3 };
    const left = riskOrder[normalizeKey(a.risk)] ?? 3;
    const right = riskOrder[normalizeKey(b.risk)] ?? 3;
    return left - right || a.name.localeCompare(b.name);
  });
}

function supplementRiskSection(group) {
  return `
    <section class="supplement-risk-section ${supplementRiskClass(group.risk)}">
      <div class="supplement-risk-heading">
        <div>
          <span class="section-label">Risk level</span>
          <h2>${escapeHtml(group.risk)} Risk</h2>
        </div>
        <span>${group.supplements.length} entr${group.supplements.length === 1 ? "y" : "ies"}</span>
      </div>
      <div class="grid supplements-grid">
        ${group.supplements.map(supplementCard).join("")}
      </div>
    </section>
  `;
}

function supplementCard(supplement) {
  const isHighRisk = normalizeKey(supplement.risk) === "high";
  return `
    <article class="supplement-card ${supplementRiskClass(supplement.risk)} app-card">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${badge(supplement.risk, supplementRiskClass(supplement.risk))}
          ${supplement.clinicalEvidence ? badge(`Evidence Notes: ${supplement.clinicalEvidence}`, clinicalEvidenceClass(supplement.clinicalEvidence)) : ""}
        </div>
        <h3 class="card-title">${escapeHtml(supplement.name)}</h3>
      </div>

      <div class="supplement-matrix-fields">
        ${supplementMatrixField("Target symptoms", supplement.symptoms)}
        ${supplementMatrixField("Reddit popularity", supplement.redditPopularity)}
        ${supplementInteractionBlock(supplement.interactions, isHighRisk)}
      </div>
    </article>
  `;
}

function supplementMatrixField(label, value) {
  if (!text(value)) return "";
  return `
    <div class="supplement-field">
      <span class="field-label">${escapeHtml(label)}</span>
      <div class="field-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function supplementInteractionBlock(value, isHighRisk = false) {
  if (!text(value)) return "";
  return `
    <div class="supplement-safety-alert ${isHighRisk ? "is-critical" : ""}">
      <span class="field-label">${isHighRisk ? "High-Risk Interaction Warning" : "Psych med interactions"}</span>
      <div class="field-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function supplementRiskClass(risk) {
  const value = normalizeKey(risk);
  if (value === "high") return "risk-high";
  if (value === "moderate") return "risk-moderate";
  if (value === "low") return "risk-low";
  return "risk-unspecified";
}

function sortControlMarkup() {
  return `
    <label class="sort-control" for="sortSelect">
      <span>Sort</span>
      <select id="sortSelect">
        ${sortOption("rank", "Workbook rank")}
        ${sortOption("total", "Workbook score")}
        ${sortOption("reddit", "Reddit-derived consensus / visibility")}
        ${sortOption("evidence", "Evidence strength")}
        ${sortOption("safety", "Caution score")}
        ${sortOption("ease", "Ease of implementation")}
        ${sortOption("speed", "Reported time horizon")}
        ${sortOption("balance", "Best overall balance")}
      </select>
    </label>
  `;
}

function methodPresetBar() {
  const presets = availableMethodPresets();
  if (!presets.length) return "";
  return `
    <div class="method-presets" aria-label="Recommendation views">
      ${presets
        .map(
          (preset) => `
            <button class="preset-chip ${state.methodPreset === preset.id ? "is-active" : ""}" type="button" data-method-preset="${preset.id}">
              <span>${escapeHtml(preset.label)}</span>
              <small>${escapeHtml(preset.signal)}</small>
            </button>
          `,
        )
        .join("")}
      ${state.methodPreset ? `<button class="preset-chip preset-clear" type="button" data-clear-preset>Clear preset</button>` : ""}
    </div>
  `;
}

function presetExplanation(preset, count) {
  const activeFilters = activeFilterItems().filter((item) => item.key !== "preset");
  return `
    <div class="preset-explanation" role="note">
      <div>
        <span class="section-label">${escapeHtml(preset.label)}</span>
        <p>${escapeHtml(preset.description)}</p>
        <p class="preset-combine-note">${escapeHtml(activeFilters.length ? "This preset is combined with the current search and filters." : "This preset can be combined with search and filters.")}</p>
      </div>
      <strong>${count} matching method${count === 1 ? "" : "s"}</strong>
    </div>
  `;
}

function methodRankingNote() {
  return `
    <section class="about-scoring method-ranking-note">
      <span class="section-label">About ranking</span>
      <p>Recommendation views are workbook-derived comparisons using fields such as workbook rank or score, evidence score, caution score, ease score, time horizon, category, use-case, and workbook text. Reddit-derived consensus is not clinical proof. Evidence and caution fields should be interpreted conservatively. This is educational self-management information, not medical advice.</p>
    </section>
  `;
}

function activeFilterChips() {
  const chips = activeFilterItems();
  if (!chips.length) return "";
  return `
    <div class="active-filter-chips" aria-label="Active filters">
      ${chips
        .map(
          (chip) => `
            <button class="active-filter-chip" type="button" data-clear-filter="${escapeAttr(chip.key)}">
              <span>${escapeHtml(chip.label)}: ${escapeHtml(chip.value)}</span>
              <strong aria-hidden="true">x</strong>
            </button>
          `,
        )
        .join("")}
      ${chips.length > 1 ? `<button class="active-filter-chip active-filter-clear" type="button" data-reset-all>Clear all</button>` : ""}
    </div>
  `;
}

function activeFilterItems() {
  const labels = {
    query: "Search",
    useCase: "Use-case",
    evidence: "Evidence",
    safety: "Caution",
    speed: "Time horizon",
    difficulty: "Difficulty",
    tags: "Tag",
    preset: "View",
  };
  const items = [];
  if (state.query.trim()) items.push({ key: "query", label: labels.query, value: state.query.trim() });
  const preset = activeMethodPreset();
  if (preset) items.push({ key: "preset", label: labels.preset, value: preset.label });
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) items.push({ key, label: labels[key] || key, value });
  });
  return items;
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
  const preset = activeMethodPreset();
  const presetReason = preset?.matches(method) ? preset.reason(method) : "";
  const derivedChips = methodDerivedChips(method, preset).slice(0, 3);
  const tags = method.tags.length ? chipRow(method.tags.slice(0, 3), "Tags") : "";
  const practicalPreview = text(method.protocol);
  return `
    <button class="method-card app-card" type="button" data-method-id="${method.id}">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${badge(method.evidenceGrade, evidenceClass(method.evidenceGrade))}
          ${badge(method.safetyLevel, safetyClass(method.safetyScore))}
          ${badge(method.category || "Uncategorized", "")}
        </div>
        <h3 class="card-title">${escapeHtml(method.name)}</h3>
        <p class="card-summary">${escapeHtml(method.summary || "No summary provided in the workbook.")}</p>
      </div>

      <div class="method-signal-grid" aria-label="Workbook-derived signals">
        ${methodSignal("Evidence", scoreDisplay(method.evidenceScore), method.evidenceGrade)}
        ${methodSignal("Caution", scoreDisplay(method.safetyScore), method.safetyLevel)}
        ${methodSignal("Time", method.timeHorizon, "")}
        ${methodSignal("Ease", scoreDisplay(method.easeScore), method.difficulty)}
      </div>

      <div class="card-preview-stack method-card-detail">
        ${method.useCase ? `<div class="method-use-case"><span class="field-label">May be useful for</span><strong>${escapeHtml(method.useCase)}</strong></div>` : ""}
        ${presetReason ? `<div class="detail-field card-preview preset-reason"><span class="field-label">Why shown here</span><div class="field-value">${escapeHtml(shorten(presetReason, 135))}</div></div>` : ""}
        ${practicalPreview ? `<div class="detail-field card-preview method-practical-preview"><span class="field-label">Practical preview</span><div class="field-value">${escapeHtml(shorten(practicalPreview, 130))}</div></div>` : ""}
        ${derivedChips.length ? `<div class="card-chips">${chipRow(derivedChips, "Workbook-derived fit markers")}</div>` : tags ? `<div class="card-chips">${tags}</div>` : ""}
      </div>
    </button>
  `;
}

function methodSignal(label, value, hint) {
  const safeValue = text(value);
  const safeHint = text(hint);
  if (!safeValue && !safeHint) return "";
  const displayValue = safeValue || safeHint;
  return `
    <span class="method-signal">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(displayValue)}</strong>
      ${safeValue && safeHint && safeHint !== safeValue ? `<em>${escapeHtml(safeHint)}</em>` : ""}
    </span>
  `;
}

function scoreDisplay(value) {
  return value === null || value === undefined ? "" : scoreText(value);
}

function smallFact(label, value) {
  return `
    <div>
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(value || "Unspecified")}</span>
    </div>
  `;
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

function clinicalEvidenceClass(label) {
  const value = normalizeKey(label);
  if (value.includes("high") && !value.includes("medium")) return "supplement-evidence-high";
  if (value.includes("mediumhigh")) return "supplement-evidence-medium-high";
  if (value.includes("medium")) return "supplement-evidence-medium";
  if (value.includes("low")) return "supplement-evidence-low";
  return "supplement-evidence-neutral";
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
    resetMethodView();
    renderMethods();
  });

  document.querySelector("[data-reset-all]")?.addEventListener("click", () => {
    resetMethodView();
    renderMethods();
  });

  document.querySelectorAll("[data-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.clearFilter;
      if (key === "query") state.query = "";
      if (key === "preset") state.methodPreset = "";
      if (Object.prototype.hasOwnProperty.call(state.filters, key)) state.filters[key] = "";
      renderMethods();
    });
  });

  document.querySelectorAll("[data-method-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = methodPresetById(button.dataset.methodPreset);
      if (!preset) return;
      state.methodPreset = preset.id;
      state.sort = preset.defaultSort || state.sort;
      renderMethods();
    });
  });

  document.querySelector("[data-clear-preset]")?.addEventListener("click", () => {
    state.methodPreset = "";
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

function resetMethodView() {
  state.query = "";
  state.filters = { useCase: "", evidence: "", safety: "", speed: "", difficulty: "", tags: "" };
  state.sort = "rank";
  state.methodPreset = "";
}

function filteredMethods() {
  const query = state.query.trim().toLowerCase();
  const preset = activeMethodPreset();
  return sortedMethods(state.sort).filter((method) => {
    const searchable = [
      method.name,
      method.summary,
      method.tags.join(" "),
      method.protocol,
      method.useCase,
      method.evidenceGrade,
      evidenceNotes(method),
      method.cautions,
      method.category,
      method.visibility,
      method.redditSupport,
    ]
      .join(" ")
      .toLowerCase();

    if (preset && !preset.matches(method)) return false;
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

function uniqueMethods(methods) {
  const seen = new Set();
  return methods.filter((method) => {
    const key = normalizeKey(method.name) || method.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortedMethods(sortKey) {
  return [...state.methods].sort((a, b) => {
    if (sortKey === "rank") {
      const leftRank = a.dashboardRank ?? Infinity;
      const rightRank = b.dashboardRank ?? Infinity;
      return compareNumber(leftRank, rightRank) || compareNumber(b.priorityScore, a.priorityScore) || compareNumber(a.rank, b.rank);
    }
    if (sortKey === "total") return compareNumber(b.priorityScore, a.priorityScore) || compareNumber(a.rank, b.rank);
    if (sortKey === "reddit") return compareNumber(redditScore(b), redditScore(a)) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "evidence") return compareNumber(b.evidenceScore, a.evidenceScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "safety") return compareNumber(b.safetyScore, a.safetyScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "ease") return compareNumber(b.easeScore, a.easeScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "speed") return compareNumber(b.speedScore, a.speedScore) || compareNumber(b.priorityScore, a.priorityScore);
    if (sortKey === "balance") return compareNumber(methodBalanceScore(b), methodBalanceScore(a)) || compareNumber(b.priorityScore, a.priorityScore);
    return compareNumber(b.priorityScore, a.priorityScore) || compareNumber(a.rank, b.rank);
  });
}

function methodPresets() {
  return [
    {
      id: "balance",
      label: "Best overall balance",
      signal: "Evidence + caution + ease",
      description: "Prioritizes methods with stronger workbook evidence, lower caution, practical difficulty that is not too high, and workbook rank or score when available.",
      defaultSort: "balance",
      available: () => state.methods.some((method) => method.evidenceScore !== null && method.safetyScore !== null && method.easeScore !== null),
      matches: (method) =>
        methodBalanceScore(method) > 0 &&
        method.evidenceScore !== null &&
        method.safetyScore !== null &&
        method.easeScore !== null &&
        method.evidenceScore >= 3 &&
        method.safetyScore >= 3 &&
        method.easeScore >= 3,
      reason: (method) => [
        scorePhrase("Workbook evidence", method.evidenceScore),
        scorePhrase("caution", method.safetyScore),
        scorePhrase("ease", method.easeScore),
        method.priorityScore !== null ? `workbook priority score ${scoreText(method.priorityScore)}` : workbookRankPhrase(method),
      ]
        .filter(Boolean)
        .join("; "),
    },
    {
      id: "acute",
      label: "Fastest acute regulation",
      signal: "Time horizon + body cues",
      description: "Prioritizes immediate or short reported time horizons and workbook text related to acute anxiety, panic-like arousal, grounding, tension, or a rapid downshift.",
      defaultSort: "speed",
      available: () => state.methods.some((method) => acutePresetMatch(method)),
      matches: acutePresetMatch,
      reason: (method) => [
        method.timeHorizon ? `workbook reported time horizon: ${method.timeHorizon}` : scorePhrase("speed", method.speedScore),
        methodTextMatchLabel(method, ACUTE_TERMS),
        scorePhrase("caution", method.safetyScore),
      ]
        .filter(Boolean)
        .join("; "),
    },
    {
      id: "low-effort",
      label: "Low-effort options",
      signal: "Ease + lower caution",
      description: "Prioritizes rows marked easy or very easy in the workbook, with lower caution when that field is available.",
      defaultSort: "ease",
      available: () => state.methods.some((method) => method.easeScore !== null),
      matches: (method) => scoreAtLeast(method.easeScore, 4) && scoreAtLeast(method.safetyScore, 3),
      reason: (method) => [
        method.difficulty ? `workbook difficulty: ${method.difficulty}` : scorePhrase("ease", method.easeScore),
        scorePhrase("caution", method.safetyScore),
        method.useCase ? `use-case: ${method.useCase}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    },
    {
      id: "rumination",
      label: "Rumination-focused",
      signal: "Workbook text match",
      description: "Matches existing workbook text for rumination, worry, intrusive thoughts, cognitive loops, catastrophizing, or OCD-style overthinking.",
      defaultSort: "balance",
      available: () => state.methods.some((method) => methodRecommendationTextIncludes(method, RUMINATION_TERMS)),
      matches: (method) => methodRecommendationTextIncludes(method, RUMINATION_TERMS),
      reason: (method) => [
        methodTextMatchLabel(method, RUMINATION_TERMS),
        method.useCase ? `use-case: ${method.useCase}` : "",
        scorePhrase("evidence", method.evidenceScore),
      ]
        .filter(Boolean)
        .join("; "),
    },
    {
      id: "sleep",
      label: "Sleep-supportive",
      signal: "Sleep-related workbook text",
      description: "Matches existing workbook text for sleep anxiety, bedtime, insomnia, wind-down, night anxiety, or restlessness.",
      defaultSort: "balance",
      available: () => state.methods.some((method) => methodRecommendationTextIncludes(method, SLEEP_TERMS)),
      matches: (method) => methodRecommendationTextIncludes(method, SLEEP_TERMS),
      reason: (method) => [
        methodTextMatchLabel(method, SLEEP_TERMS),
        method.timeHorizon ? `workbook reported time horizon: ${method.timeHorizon}` : "",
        scorePhrase("ease", method.easeScore),
      ]
        .filter(Boolean)
        .join("; "),
    },
    {
      id: "exposure",
      label: "Avoidance / exposure",
      signal: "Approach practice text",
      description: "Matches existing workbook text related to exposure, behavioral activation, facing situations, reducing avoidance, or CBT-oriented practice.",
      defaultSort: "balance",
      available: () => state.methods.some((method) => methodRecommendationTextIncludes(method, EXPOSURE_TERMS)),
      matches: (method) => methodRecommendationTextIncludes(method, EXPOSURE_TERMS),
      reason: (method) => [
        methodTextMatchLabel(method, EXPOSURE_TERMS),
        method.useCase ? `use-case: ${method.useCase}` : "",
        scorePhrase("evidence", method.evidenceScore),
      ]
        .filter(Boolean)
        .join("; "),
    },
  ];
}

const ACUTE_TERMS = ["acute", "panic", "arousal", "grounding", "tension", "downshift", "immediate", "racing body", "body anxiety"];
const RUMINATION_TERMS = ["rumination", "worry", "intrusive", "thought", "loop", "catastrophizing", "overthinking", "ocd"];
const SLEEP_TERMS = ["sleep", "bedtime", "insomnia", "wind-down", "night", "restlessness", "pre-sleep", "rest"];
const EXPOSURE_TERMS = ["exposure", "avoidance", "behavioral activation", "facing", "situations", "cbt", "phobia", "approach"];

function availableMethodPresets() {
  return methodPresets().filter((preset) => preset.available());
}

function methodPresetById(id) {
  return availableMethodPresets().find((preset) => preset.id === id) || null;
}

function activeMethodPreset() {
  if (!state.methodPreset) return null;
  return methodPresetById(state.methodPreset);
}

function acutePresetMatch(method) {
  return method.speedScore >= 4 && scoreAtLeast(method.safetyScore, 3) && methodRecommendationTextIncludes(method, ACUTE_TERMS);
}

function methodBalanceScore(method) {
  const parts = [
    weightedScore(method.evidenceScore, 0.34),
    weightedScore(method.safetyScore, 0.28),
    weightedScore(method.easeScore, 0.18),
    weightedScore(method.speedScore, 0.08),
    weightedScore(method.priorityScore, 0.12),
  ].filter((value) => value !== null);
  if (!parts.length) return 0;
  return parts.reduce((sum, value) => sum + value, 0);
}

function weightedScore(score, weight) {
  if (score === null || score === undefined || score === 0) return null;
  return score * weight;
}

function scoreAtLeast(score, minimum) {
  return score === null || score === undefined ? true : score >= minimum;
}

function methodRecommendationText(method) {
  return [
    method.category,
    method.name,
    method.summary,
    method.redditSupport,
    method.visibility,
    method.evidenceGrade,
    evidenceNotes(method),
    method.useCase,
    method.protocol,
    method.cautions,
    method.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function methodRecommendationTextIncludes(method, terms) {
  const searchable = methodRecommendationText(method);
  return terms.some((term) => searchable.includes(term));
}

function methodTextMatchLabel(method, terms) {
  const searchable = methodRecommendationText(method);
  const match = terms.find((term) => searchable.includes(term));
  return match ? `workbook text match: ${match}` : "";
}

function scorePhrase(label, score) {
  return score === null || score === undefined ? "" : `${label} score ${score}/5`;
}

function workbookRankPhrase(method) {
  return method.dashboardRank ? `workbook rank ${method.dashboardRank}` : "";
}

function methodDerivedChips(method, preset) {
  const chips = [];
  if (preset) chips.push(preset.label);
  if (method.evidenceScore >= 4) chips.push("Evidence-supported");
  if (method.safetyScore >= 4) chips.push("Lower caution");
  if (method.easeScore >= 4) chips.push("Low effort");
  if (acutePresetMatch(method)) chips.push("Acute fit");
  if (methodRecommendationTextIncludes(method, RUMINATION_TERMS)) chips.push("Rumination fit");
  if (methodRecommendationTextIncludes(method, SLEEP_TERMS)) chips.push("Sleep fit");
  if (methodRecommendationTextIncludes(method, EXPOSURE_TERMS)) chips.push("Exposure fit");
  return unique(chips).slice(0, 4);
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
  const active = Object.values(state.filters).filter(Boolean).length + (state.query ? 1 : 0) + (activeMethodPreset() ? 1 : 0);
  return active ? `${active} active view/filter${active === 1 ? "" : "s"}` : "No filters active";
}

function openMethod(methodId) {
  const method = state.methods.find((item) => item.id === methodId);
  if (!method) return;
  const sourceMap = new Map(state.sources.map((source) => [source.id, source]));
  const references = method.sourceIds.map((id) => sourceMap.get(id) || { id, missing: true });
  const preset = activeMethodPreset();
  const presetReason = preset?.matches(method) ? preset.reason(method) : "";

  dialogContent.innerHTML = `
    <header class="dialog-header">
      <h2 class="dialog-title" id="dialogTitle">${escapeHtml(method.name)}</h2>
      <div class="badge-row">
        ${badge(method.evidenceGrade, evidenceClass(method.evidenceGrade))}
        ${badge(method.safetyLevel, safetyClass(method.safetyScore))}
        ${method.priorityScore !== null ? badge(`Score ${scoreText(method.priorityScore)}`, "") : ""}
        ${badge(method.category || "Uncategorized", "")}
      </div>
    </header>

    <div class="dialog-section-stack">
      ${detailSection("Overview", [
        detailField("Workbook summary", method.summary, true),
        detailField("May be useful for", method.useCase),
        detailField("Workbook category", method.category),
      ])}
      ${detailSection("Practical use", [
        detailField("Workbook practical steps", method.protocol, true),
        detailField("Reported time horizon", method.timeHorizon),
        detailField("Difficulty / ease", method.difficulty),
        method.easeScore !== null ? detailField("Ease score", `${method.easeScore}/5`) : "",
      ])}
      ${detailSection("Evidence / Reddit pattern", [
        detailField("Evidence grade", method.evidenceGrade),
        detailField("Workbook evidence notes", evidenceNotes(method), true),
        detailField("Reddit-derived pattern", method.redditSupport),
        detailField("Upvote / visibility notes", method.visibility),
      ])}
      ${detailSection("Safety / caution", [
        detailField("Caution level", method.safetyLevel),
        method.safetyScore !== null ? detailField("Caution score", `${method.safetyScore}/5`) : "",
        detailField("When to avoid or use caution", method.cautions, true),
      ])}
      ${detailSection("Tags / metadata", [
        method.tags.length ? detailField("Tags", method.tags.join(", ")) : "",
        method.sourceIds.length ? detailField("Workbook source IDs", method.sourceIds.join(", ")) : "",
        detailSources(references, method.sourceIds),
      ])}
      ${presetReason ? detailSection("Why shown here", [detailField("Workbook-derived preset relevance", presetReason, true)], "dialog-section-highlight") : ""}
    </div>
  `;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function detailSection(title, fields, className = "") {
  const content = fields.filter(Boolean).join("");
  if (!content) return "";
  return `
    <section class="dialog-section ${className}">
      <div class="dialog-section-header">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="detail-grid">
        ${content}
      </div>
    </section>
  `;
}

function closeDialog() {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function openSettings() {
  const sourceWorkbook = state.data?.sourceWorkbook || "reddit_anxiety_methods_database.xlsx";
  const generatedAt = state.data?.generatedAt ? ` Generated JSON timestamp: ${state.data.generatedAt}.` : "";

  settingsContent.innerHTML = `
    <header class="dialog-header settings-header">
      <span class="section-label">About / Methodology</span>
      <h2 class="dialog-title" id="settingsTitle">Anxiety Manager</h2>
      <p class="settings-version">Version v1.0.0</p>
    </header>

    <div class="dialog-section-stack">
      ${detailSection("Data source", [
        detailField("Source workbook", sourceWorkbook),
        detailField("Generated data", `Displayed content is parsed from the workbook-derived data file.${generatedAt}`, true),
      ])}
      ${detailSection("Disclaimer", [detailField("Clinical safety wording", DISCLAIMER, true)])}
      ${detailSection("Workbook-derived ranking", [
        detailField(
          "Ranking explanation",
          "Rankings, chart groupings, priority scores, evidence scores, caution scores, ease scores, time horizons, protocols, sources, and method details are derived from workbook fields when available. Reddit-derived patterns describe reported user patterns and are kept separate from evidence fields. These summaries are educational comparisons, not individualized recommendations, medical advice, diagnosis, psychotherapy, emergency care, medication management, crisis support, or a replacement for professional care.",
          true,
        ),
      ])}
    </div>

    <div class="dialog-legal-accordions">

      <details class="legal-accordion">
        <summary class="legal-accordion-summary">Legal &amp; Safety Notice</summary>
        <div class="legal-accordion-body">
          <p><strong>Educational use only.</strong> AnxietyFlow is a general information database. No clinician-patient relationship is formed by using this site.</p>
          <p><strong>No diagnosis or treatment.</strong> This site does not provide medical advice, diagnosis, clinical assessment, or treatment of any kind.</p>
          <p><strong>No psychotherapy.</strong> Content on this site is not a substitute for psychotherapy, counselling, or any licensed mental health service.</p>
          <p><strong>No crisis or emergency support.</strong> This site cannot assess risk or provide crisis intervention. If you need urgent or immediate help, contact local emergency services or a licensed crisis support provider.</p>
          <p><strong>No medication or supplement decisions.</strong> Information related to supplements or medications is general educational content only. It must not be used to start, stop, combine, or adjust any medication or supplement. Consult a licensed clinician or pharmacist for all personal health decisions.</p>
          <p><strong>Information may be incomplete, inaccurate, or outdated.</strong> Workbook-derived and Reddit-derived content reflects publicly available summaries at the time of compilation. It may contain errors or omissions.</p>
          <p><strong>Do not rely on this site for urgent or personal medical decisions.</strong> Always consult a licensed clinician or pharmacist before acting on any health-related information found here.</p>
        </div>
      </details>

      <details class="legal-accordion">
        <summary class="legal-accordion-summary">Terms of Use</summary>
        <div class="legal-accordion-body">
          <p><em>Draft terms — not attorney-reviewed. Subject to change.</em></p>
          <p><strong>1. Educational use only.</strong> By using AnxietyFlow, you agree that the site is an educational information database only. It is not a medical service, clinical tool, or licensed mental health resource.</p>
          <p><strong>2. No medical advice.</strong> Nothing on this site constitutes medical advice, diagnosis, clinical assessment, or treatment recommendation of any kind.</p>
          <p><strong>3. No psychotherapy.</strong> No use of this site creates a therapeutic or counselling relationship of any kind.</p>
          <p><strong>4. No crisis support.</strong> This site is not a crisis service and cannot provide emergency assistance. Do not use it for urgent mental health situations.</p>
          <p><strong>5. No clinician-patient relationship.</strong> Use of this site does not create any clinician-patient, therapist-client, or provider-user relationship.</p>
          <p><strong>6. User responsibility.</strong> You are solely responsible for how you use the information on this site. You agree not to rely on it for personal medical, psychiatric, or medication decisions.</p>
          <p><strong>7. Information may be incomplete or outdated.</strong> Content is derived from public workbook summaries and community-reported patterns. It may contain errors, omissions, or outdated references.</p>
          <p><strong>8. No reliance for urgent decisions.</strong> You agree not to use information from this site for urgent, emergency, or time-sensitive health decisions.</p>
          <p><strong>9. Prohibited misuse.</strong> You agree not to use this site as a substitute for professional care, not to share content as medical advice to others, and not to misrepresent the nature of this site.</p>
          <p><strong>10. Limitation of liability.</strong> To the fullest extent permitted by applicable law, the creators and operators of AnxietyFlow disclaim all liability for any harm, loss, or damages arising from use of or reliance on this site, including indirect, incidental, or consequential damages. This disclaimer applies even if the creators have been advised of the possibility of such damages. This site is provided "as is" without warranties of any kind.</p>
        </div>
      </details>

      <details class="legal-accordion">
        <summary class="legal-accordion-summary">Privacy Policy</summary>
        <div class="legal-accordion-body">
          <p><em>Draft policy — not attorney-reviewed. Subject to change.</em></p>
          <p><strong>1. What data may be collected.</strong> If you create an account or sign in, your email address is stored by Supabase, our backend provider, in order to support authentication and cloud sync. If you do not sign in, no personal account data is collected.</p>
          <p><strong>2. Browser and local storage.</strong> AnxietyFlow uses your browser's localStorage to remember your consent acknowledgement, toolkit selections, check-in state, and usage streak. This data is stored locally on your device and is not transmitted to any server unless you are signed in to a synced account.</p>
          <p><strong>3. Chat and user inputs.</strong> This site does not store or transmit the content of any notes, reflections, or text you enter in session-only fields beyond your current browser session, unless explicitly noted in a future feature.</p>
          <p><strong>4. Third-party processors.</strong> Authentication and cloud sync are provided by Supabase. If you sign in with Google, Google OAuth is used for authentication. These services have their own privacy policies. AnxietyFlow does not sell or share your data with advertisers or unrelated third parties.</p>
          <p><strong>5. Security limitations.</strong> While reasonable precautions are taken, no internet-based service can guarantee complete security. Do not enter sensitive health information unless you consider the risks and accept them.</p>
          <p><strong>6. Sensitive health information.</strong> You are advised to avoid entering sensitive personal health information into this site unless necessary. The site is a general educational tool and is not designed as a confidential health record system.</p>
          <p><strong>7. Data retention and deletion.</strong> To request deletion of your account data, contact us at the address listed below. Requests will be processed in a reasonable timeframe subject to applicable law.</p>
          <p><strong>8. Contact.</strong> For privacy, deletion, or data-access requests, contact: <a href="mailto:skybutuguy@gmail.com">skybutuguy@gmail.com</a>.</p>
        </div>
      </details>

    </div>
  `;

  if (typeof settingsDialog.showModal === "function") {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute("open", "");
  }
}

function closeSettings() {
  if (typeof settingsDialog.close === "function") {
    settingsDialog.close();
  } else {
    settingsDialog.removeAttribute("open");
  }
  settingsButton.focus({ preventScroll: true });
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
                      <strong>${escapeHtml(source.id)} / ${escapeHtml(source.type || "Source not found")}</strong>
                      <div class="field-value">${escapeHtml(source.missing ? "Referenced by the workbook but not listed in the Sources sheet." : source.title || source.relevance || "Reference from workbook")}</div>
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
  const stats = protocolSummaryStats();
  app.innerHTML = `
    <section class="panel-header">
      <div>
        <h1 class="section-title">Protocols</h1>
        <p>Protocol cards are drawn from the workbook Protocols sheet. They are educational self-management sequences, not treatment plans or a substitute for professional care.</p>
      </div>
    </section>
    <section class="protocols-note panel">
      <span class="section-label">How to read protocols</span>
      <p>Each card uses only workbook fields. Where related methods appear, they are labeled as potentially related because they are matched from workbook method names, use-cases, categories, and protocol text.</p>
    </section>
    <section class="protocol-summary-strip panel" aria-label="Protocol workbook summary">
      ${smallFact("Workbook sequences", stats.count)}
      ${stats.stepCount ? smallFact("Listed steps", stats.stepCount) : ""}
      ${stats.durationCount ? smallFact("With duration", stats.durationCount) : ""}
    </section>
    ${
      state.protocols.length
        ? `<section class="grid protocols-grid">${state.protocols.map(protocolCard).join("")}</section>`
        : emptyState("No protocols found", "The Protocols sheet did not contain usable rows.")
    }
  `;

  bindProtocolControls();
  initScrollAnimations();
}

function protocolCard(protocol, index) {
  const steps = protocolStepItems(protocol.steps);
  const previewSteps = steps.slice(0, 3);
  const related = protocolRelatedMethods(protocol);
  const detailId = `protocol-detail-${index}`;
  const hasDetails = steps.length > previewSteps.length || protocol.goal || protocol.notes || related.methods.length;
  return `
    <article class="protocol-card protocol-sequence-card app-card">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${badge("Workbook sequence", "")}
          ${protocol.duration ? badge(protocol.duration, "") : ""}
          ${steps.length ? badge(`${steps.length} steps`, "") : ""}
        </div>
        <h3 class="card-title">${escapeHtml(protocol.name)}</h3>
        ${protocol.goal ? `<p class="card-summary"><strong>Workbook use-case:</strong> ${escapeHtml(protocol.goal)}</p>` : ""}
      </div>

      <div class="protocol-fact-row">
        ${protocolMetaFact("Duration", protocol.duration)}
        ${protocolMetaFact("Use-case", protocol.goal)}
        ${steps.length ? protocolMetaFact("Steps", `${steps.length}`) : ""}
      </div>

      <div class="card-preview-stack">
        ${
          previewSteps.length
            ? `<div class="detail-field card-preview protocol-step-preview"><span class="field-label">${steps.length > previewSteps.length ? "First workbook steps" : "Workbook steps"}</span>${protocolStepList(previewSteps)}</div>`
            : ""
        }
        ${protocol.notes ? `<div class="detail-field card-preview protocol-caution"><span class="field-label">Workbook context / caution</span><p class="field-value">${escapeHtml(protocol.notes)}</p></div>` : ""}
        ${related.methods.length ? protocolRelatedBlock(related) : ""}
      </div>

      ${
        hasDetails
          ? `<details class="protocol-details" id="${detailId}">
        <summary>View workbook sequence</summary>
        <div class="protocol-detail-content">
          ${protocol.goal ? detailField("When this workbook sequence is used", protocol.goal, true) : ""}
          ${steps.length ? `<section class="detail-field is-wide protocol-step-detail"><span class="field-label">Full workbook steps</span>${protocolStepList(steps)}</section>` : ""}
          ${protocol.notes ? detailField("Workbook notes / caution", protocol.notes, true) : ""}
          ${related.methods.length ? protocolRelatedBlock(related, true) : ""}
        </div>
      </details>`
          : ""
      }
    </article>
  `;
}

function bindProtocolControls() {
  document.querySelectorAll("[data-protocol-method-id]").forEach((button) => {
    button.addEventListener("click", () => openMethod(button.dataset.protocolMethodId));
  });
}

function protocolMetaFact(label, value) {
  if (!text(value)) return "";
  return smallFact(label, value);
}

function protocolSummaryStats() {
  const stepCount = state.protocols.reduce((sum, protocol) => sum + protocolStepItems(protocol.steps).length, 0);
  const durationCount = state.protocols.filter((protocol) => text(protocol.duration)).length;
  return {
    count: state.protocols.length,
    stepCount,
    durationCount,
  };
}

function stepsList(value) {
  return protocolStepItems(value).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
}

function protocolStepList(steps) {
  return `<ol class="protocol-steps">${steps.map((step) => `<li><span>${escapeHtml(step)}</span></li>`).join("")}</ol>`;
}

function protocolStepItems(value) {
  const raw = text(value);
  if (!raw) return [];
  const parts = raw
    .split(/\s*(?=\d+\)\s*)/)
    .map((part) => part.replace(/^\d+\)\s*/, "").trim())
    .filter(Boolean);

  if (parts.length > 1) return parts.map(cleanProtocolStep).filter(Boolean);
  return splitList(raw).map(cleanProtocolStep).filter(Boolean);
}

function cleanProtocolStep(step) {
  return text(step).replace(/\.$/, "");
}

function protocolRelatedMethods(protocol) {
  const explicit = protocol.related
    .map((name) => state.methods.find((method) => normalizeKey(method.name) === normalizeKey(name)) || null)
    .filter(Boolean);

  if (explicit.length) {
    return {
      label: "Related methods from workbook",
      methods: explicit.slice(0, 5),
    };
  }

  const scored = state.methods
    .map((method) => ({ method, score: protocolMethodScore(protocol, method) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => compareNumber(b.score, a.score) || compareNumber(b.method.priorityScore, a.method.priorityScore) || compareNumber(a.method.rank, b.method.rank))
    .slice(0, 5)
    .map((entry) => entry.method);

  return {
    label: "Potentially related methods from workbook fields",
    methods: scored,
  };
}

function protocolMethodScore(protocol, method) {
  const protocolText = normalizeProtocolText([protocol.name, protocol.goal, protocol.steps, protocol.notes].join(" "));
  const methodText = normalizeProtocolText([method.name, method.category, method.useCase, method.protocol, method.summary].join(" "));
  const protocolTokens = protocolKeywords(protocolText);
  const methodTokens = protocolKeywords(methodText);
  let score = 0;

  methodTokens.forEach((token) => {
    if (protocolTokens.has(token)) score += token.length > 6 ? 1.2 : 1;
  });

  const methodNameTokens = protocolKeywords(normalizeProtocolText(method.name));
  methodNameTokens.forEach((token) => {
    if (protocolTokens.has(token)) score += 1.4;
  });

  if (method.category && protocolText.includes(normalizeProtocolText(method.category))) score += 1.5;
  if (method.useCase && tokenOverlap(protocolTokens, protocolKeywords(normalizeProtocolText(method.useCase))) >= 2) score += 1.3;
  if (protocolText.includes(normalizeProtocolText(method.name))) score += 4;

  return score;
}

function protocolKeywords(value) {
  const stopWords = new Set(["with", "when", "this", "that", "from", "into", "your", "until", "after", "before", "once", "extra", "short", "small", "general", "stable", "routine", "anxiety", "workbook"]);
  return new Set(
    normalizeProtocolText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 3 && !stopWords.has(token)),
  );
}

function normalizeProtocolText(value) {
  return text(value)
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(left, right) {
  let count = 0;
  right.forEach((token) => {
    if (left.has(token)) count += 1;
  });
  return count;
}

function protocolRelatedBlock(related, isDetail = false) {
  const methods = isDetail ? related.methods : related.methods.slice(0, 3);
  return `
    <section class="${isDetail ? "detail-field is-wide protocol-related-detail" : "detail-field card-preview protocol-related"}">
      <span class="field-label">${escapeHtml(related.label)}</span>
      <div class="protocol-related-list">
        ${methods
          .map(
            (method) => `
              <button class="related-method-pill" type="button" data-protocol-method-id="${method.id}">
                <strong>${escapeHtml(method.name)}</strong>
                <span>${escapeHtml(method.useCase || method.category || "Workbook method")}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSafety() {
  const sections = safetySections();
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <h1>Safety boundaries first</h1>
        <p>The safety notes preserve workbook cautions about clinical boundaries, medication, breathing, exposure, substances, tracking, and urgent symptoms. They are educational prompts for caution, not individualized safety advice.</p>
      </div>
      <div class="hero-panel">
        <div>
          <h2>Not a crisis or clinical care tool</h2>
          <p>This app cannot assess urgent symptoms or personal risk. For urgent medical concerns, dangerous impulses, or inability to stay safe, seek local emergency, crisis, or licensed medical support immediately.</p>
        </div>
        <div class="legal-notice-panel" role="note">
          <p><strong>This site is not a crisis service.</strong> If urgent or immediate help is needed, contact local emergency services or a licensed crisis support provider.</p>
          <p class="legal-notice-inline">This section is not medication guidance and must not be used to start, stop, combine, or adjust medications. Medication decisions should be made with a licensed clinician.</p>
        </div>
      </div>
    </section>
    ${sections.length ? `<section class="safety-map panel">
      <div>
        <span class="section-label">Workbook safety map</span>
        <p>Grouped from the Safety Notes sheet by topic and guidance text. These notes are caution boundaries for educational self-management information, not a substitute for clinical care.</p>
      </div>
      <div class="safety-map-grid">
        ${sections.map((section) => `<span>${escapeHtml(section.title)} <strong>${section.notes.length}</strong></span>`).join("")}
      </div>
    </section>` : ""}
    ${
      state.safetyNotes.length
        ? sections.map(safetySection).join("")
        : emptyState("No safety notes found", "The Safety Notes sheet did not contain usable rows.")
    }
  `;

  initScrollAnimations();
}

function safetySections() {
  const definitions = safetySectionDefinitions();
  const assigned = new Set();
  const sections = definitions
    .map((definition) => {
      const notes = state.safetyNotes.filter((note, index) => {
        if (assigned.has(index)) return false;
        const matches = safetyNoteBelongsToSection(note, definition);
        if (matches) assigned.add(index);
        return matches;
      });
      return { ...definition, notes };
    })
    .filter((section) => section.notes.length);

  const remaining = state.safetyNotes.filter((_, index) => !assigned.has(index));
  if (remaining.length) {
    sections.push({
      id: "other",
      title: "Other workbook safety notes",
      description: "Additional caution notes from the workbook.",
      tone: "is-boundary",
      notes: remaining,
    });
  }

  return sections;
}

function safetySectionDefinitions() {
  return [
    {
      id: "urgent",
      title: "Urgent support boundaries",
      description: "Workbook notes that identify situations for local medical or support contact.",
      terms: ["urgent", "emergency", "dangerous", "unable", "stay safe", "chest pain", "fainting", "confusion"],
      tone: "is-urgent",
      topics: ["urgent symptoms"],
    },
    {
      id: "clinician",
      title: "When to involve a clinician",
      description: "Workbook notes that point toward prescriber or clinician involvement.",
      terms: ["clinician", "prescriber", "medication", "trauma", "ocd", "panic disorder", "severe avoidance"],
      tone: "is-clinician",
      topics: ["medication", "exposure"],
    },
    {
      id: "reddit-limits",
      title: "Limitations of Reddit advice",
      description: "Workbook notes about clinical boundaries and the limits of Reddit-derived patterns.",
      terms: ["reddit", "diagnosis", "treatment", "replacement", "qualified clinician"],
      tone: "is-boundary",
      topics: ["clinical boundary"],
    },
    {
      id: "substances",
      title: "Substance-related cautions",
      description: "Workbook notes about substances or supplements that may worsen anxiety or create dependence cycles.",
      terms: ["cannabis", "nicotine", "alcohol", "caffeine", "supplements", "dependence", "substances"],
      tone: "is-substance",
      topics: ["substances"],
    },
    {
      id: "overuse",
      title: "Overuse / compulsive coping cautions",
      description: "Workbook notes about excessive checking or reassurance-loop patterns.",
      terms: ["excessive", "symptom-checking", "reassurance", "loop", "tracking"],
      tone: "is-overuse",
      topics: ["tracking"],
    },
    {
      id: "method-caution",
      title: "Requires caution",
      description: "Workbook notes about methods that may not be appropriate for everyone.",
      terms: ["breathing", "breath", "dizzy", "exposure", "worsen", "stop"],
      tone: "is-caution",
      topics: ["breathing exercises"],
    },
  ];
}

function safetyNoteBelongsToSection(note, definition) {
  const topic = normalizeKey(note.topic);
  const explicitDefinition = safetySectionDefinitions().find((item) => (item.topics || []).some((definedTopic) => topic === normalizeKey(definedTopic)));
  if (explicitDefinition) return explicitDefinition.id === definition.id;
  return safetyNoteMatches(note, definition.terms);
}

function safetyNoteMatches(note, terms) {
  const haystack = `${note.topic} ${note.guidance}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function safetySection(section) {
  return `
    <section class="safety-section">
      <div class="panel-header safety-section-header">
        <div>
          <span class="section-label">Workbook caution group</span>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.description)}</p>
        </div>
        <span class="safety-section-count">${section.notes.length} note${section.notes.length === 1 ? "" : "s"}</span>
      </div>
      <div class="grid safety-grid">
        ${section.notes.map((note) => safetyCard(note, section)).join("")}
      </div>
    </section>
  `;
}

function safetyCard(note, section) {
  const paragraphs = safetyParagraphs(note.guidance);
  return `
    <article class="safety-card app-card ${section.tone || ""}">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${badge("Workbook note", "")}
          ${badge(section.title, "")}
        </div>
        <h3 class="card-title">${escapeHtml(note.topic)}</h3>
      </div>
      ${
        paragraphs.length
          ? `<div class="detail-field card-preview safety-guidance"><span class="field-label">Workbook guidance</span>${paragraphs.map((paragraph) => `<p class="field-value">${escapeHtml(paragraph)}</p>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function safetyParagraphs(value) {
  const guidance = text(value);
  if (!guidance) return [];
  const sentences = guidance.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [guidance];
  if (sentences.length <= 2) return [guidance];
  return sentences;
}

function renderSources() {
  const types = unique(state.sources.map((source) => source.type)).sort();
  const categories = unique(state.sources.map(sourceCategory)).sort();
  const filtered = state.sources.filter((source) => {
    const category = sourceCategory(source);
    const haystack = [source.id, source.type, category, source.title, source.relevance, source.notes, source.url, sourceHost(source.url)].join(" ").toLowerCase();
    if (state.sourceQuery.trim() && !haystack.includes(state.sourceQuery.trim().toLowerCase())) return false;
    if (state.sourceType && source.type !== state.sourceType) return false;
    if (state.sourceCategory && category !== state.sourceCategory) return false;
    return true;
  });
  const sourceStats = sourceSummaryStats();

  app.innerHTML = `
    <section class="panel-header">
      <div>
        <h1 class="section-title">Sources</h1>
        <p>References are displayed from the workbook Sources sheet. Reddit-derived sources and clinical or public guidance sources are labeled separately so reported experience is not treated as clinical proof.</p>
      </div>
    </section>

    <section class="sources-note panel">
      <span class="section-label">Source interpretation</span>
      <p>Sources are workbook references used for context and evidence comparison. Reddit-derived discussion sources are not clinical proof, and the workbook should not be read as an exhaustive evidence review.</p>
    </section>

    <section class="sources-summary-strip panel" aria-label="Source workbook summary">
      ${smallFact("Workbook sources", state.sources.length)}
      ${smallFact("Valid links", sourceStats.validLinks)}
      ${smallFact("Source categories", categories.length)}
      ${sourceStats.redditCount ? smallFact("Reddit-derived", sourceStats.redditCount) : ""}
    </section>

    <section class="sources-tools" aria-label="Source search and filters">
      <input class="control" id="sourceSearch" type="search" value="${escapeAttr(state.sourceQuery)}" placeholder="Search sources, relevance, URLs" aria-label="Search sources" />
      <select class="control" id="sourceCategory" aria-label="Filter source category">
        <option value="">All categories</option>
        ${categories.map((category) => `<option value="${escapeAttr(category)}" ${state.sourceCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
      </select>
      <select class="control" id="sourceType" aria-label="Filter source type">
        <option value="">All source types</option>
        ${types.map((type) => `<option value="${escapeAttr(type)}" ${state.sourceType === type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
      </select>
      <button class="reset-button source-reset" id="sourceReset" type="button">Reset</button>
    </section>

    <div class="results-meta sources-meta">
      <span>${filtered.length} of ${state.sources.length} workbook sources</span>
      <span>${escapeHtml(sourceFilterSummary())}</span>
    </div>

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
  document.querySelector("#sourceCategory")?.addEventListener("change", (event) => {
    state.sourceCategory = event.target.value;
    renderSources();
  });
  document.querySelector("#sourceReset")?.addEventListener("click", () => {
    state.sourceQuery = "";
    state.sourceType = "";
    state.sourceCategory = "";
    renderSources();
  });

  initScrollAnimations();
}

function initScrollAnimations() {
  const cycle = ++revealCycle;
  disconnectRevealObserver();
  clearRevealSafetyTimers();
  document.body.classList.remove("motion-ready");

  try {
    applyMotionClasses(app);

    const revealItems = [...app.querySelectorAll(".scroll-reveal")];
    if (!revealItems.length) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      completeAllReveals(app);
      return;
    }

    revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.intersectionRatio <= 0) return;
          startReveal(entry.target, observer);
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.1,
      },
    );

    replayActiveTabMotion(app, revealItems, cycle);
  } catch {
    document.body.classList.remove("motion-ready");
    completeAllReveals(app);
  }
}

function disconnectRevealObserver() {
  revealObserver?.disconnect();
  revealObserver = null;
}

function prepareRevealItem(item) {
  cancelRevealComplete(item);
  item.classList.remove("is-visible", "is-complete", "scroll-reveal-visible");
  item.classList.remove("is-replaying");
  item.style.removeProperty("opacity");
  item.style.removeProperty("transform");
  item.style.removeProperty("filter");
  item.style.removeProperty("visibility");
  item.style.removeProperty("pointer-events");
}

function applyMotionClasses(root) {
  if (!root) return;

  [...root.children].forEach((section) => {
    section.classList.add("scroll-section", "scroll-reveal", "motion-panel");
  });

  root
    .querySelectorAll(".hero, .panel-header, .methods-toolbar, .sources-tools, .results-meta")
    .forEach((item) => item.classList.add("scroll-reveal", "motion-soft"));

  root
    .querySelectorAll(".grid, .rank-list, .chart-list, .summary-method-list, .sources-list, .safety-map-grid")
    .forEach((group) => group.classList.add("stagger-group"));

  root
    .querySelectorAll(
      [
        ".metric-card",
        ".public-value-card",
        ".methodology-card",
        ".dashboard-chart-panel",
        ".top-pick-card",
        ".method-card",
        ".supplement-card",
        ".protocol-card",
        ".safety-card",
        ".source-card",
        ".rank-row",
        ".summary-method",
        ".dashboard-pick",
        ".chart-row",
        ".empty-state",
        ".chart-empty-state",
        ".preset-explanation",
      ].join(", "),
    )
    .forEach((item) => item.classList.add("scroll-reveal", "motion-card", "stagger-item"));

  root.querySelectorAll(".stagger-group").forEach((group) => {
    [...group.querySelectorAll(":scope > .stagger-item, :scope > .scroll-reveal, :scope > article, :scope > button, :scope > .panel")]
      .slice(0, 36)
      .forEach((item, index) => {
        item.classList.add("stagger-item");
        item.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 70}ms`);
      });
  });
}

function replayActiveTabMotion(root, revealItems = [...root.querySelectorAll(".scroll-reveal")], cycle = revealCycle) {
  revealItems.forEach((item) => {
    prepareRevealItem(item);
    item.classList.add("is-replaying");
  });
  document.body.classList.add("motion-ready");

  window.requestAnimationFrame(() => {
    if (cycle !== revealCycle) return;

    const replayItems = [];

    revealItems.forEach((item) => {
      revealObserver?.observe(item);
      if (isInRevealSafetyRange(item)) replayItems.push(item);
    });

    const replaySet = new Set(replayItems);
    revealItems.forEach((item) => {
      if (!replaySet.has(item) && !item.classList.contains("is-visible")) {
        item.classList.remove("is-replaying");
      }
    });

    replayItems.forEach((item, index) => {
      item.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 70}ms`);
    });

    if (replayItems.length) {
      replayItems[0].getBoundingClientRect();
    }

    window.requestAnimationFrame(() => {
      if (cycle !== revealCycle) return;
      replayItems.forEach((item) => startReveal(item));
    });

    revealSafetyTimers.push(window.setTimeout(() => {
      if (cycle !== revealCycle) return;
      completeVisibleReveals(root, true);
    }, REVEAL_COMPLETE_TIMEOUT));
    revealSafetyTimers.push(window.setTimeout(() => {
      if (cycle !== revealCycle) return;
      completeVisibleReveals(root, true);
    }, REVEAL_COMPLETE_TIMEOUT + 500));
  });
}

function clearRevealSafetyTimers() {
  revealSafetyTimers.forEach((timer) => window.clearTimeout(timer));
  revealSafetyTimers = [];
}

function startReveal(item, observer = revealObserver) {
  if (!item || item.classList.contains("is-complete")) return;

  const isReplay = item.classList.contains("is-replaying");
  item.classList.add("is-visible", "scroll-reveal-visible");
  observer?.unobserve(item);
  scheduleRevealComplete(item, isReplay);
}

function scheduleRevealComplete(item, completeOnTimeoutOnly = false) {
  cancelRevealComplete(item);
  revealStartTimes.set(item, performance.now());

  const complete = (event) => {
    if (event && event.target !== item) return;
    if (event && !["opacity", "transform"].includes(event.propertyName)) return;
    const startedAt = revealStartTimes.get(item) || 0;
    if (event && performance.now() - startedAt < REVEAL_MIN_COMPLETE_MS) return;
    completeReveal(item);
  };

  if (!completeOnTimeoutOnly) {
    item.addEventListener("transitionend", complete);
    revealCompleteHandlers.set(item, complete);
  }

  const timer = window.setTimeout(() => completeReveal(item), REVEAL_COMPLETE_TIMEOUT);
  revealCompleteTimers.set(item, timer);
}

function cancelRevealComplete(item) {
  const existingTimer = revealCompleteTimers.get(item);
  if (existingTimer) window.clearTimeout(existingTimer);
  revealCompleteTimers.delete(item);

  const existingHandler = revealCompleteHandlers.get(item);
  if (existingHandler) item.removeEventListener("transitionend", existingHandler);
  revealCompleteHandlers.delete(item);
  revealStartTimes.delete(item);
}

function completeReveal(item) {
  if (!item) return;

  cancelRevealComplete(item);

  item.classList.add("is-visible", "is-complete", "scroll-reveal-visible");
  item.classList.remove("is-replaying");
  item.style.removeProperty("--reveal-delay");
  item.style.removeProperty("opacity");
  item.style.removeProperty("transform");
  item.style.removeProperty("filter");
  item.style.removeProperty("visibility");
  item.style.removeProperty("pointer-events");
  revealObserver?.unobserve(item);
}

function completeVisibleReveals(root, forceComplete = false) {
  root?.querySelectorAll(".scroll-reveal:not(.is-complete)").forEach((item) => {
    if (!isInRevealSafetyRange(item)) return;
    if (forceComplete) {
      completeReveal(item);
    } else {
      startReveal(item);
    }
  });
}

function completeAllReveals(root) {
  root?.querySelectorAll(".scroll-reveal").forEach((item) => {
    completeReveal(item);
  });
}

function prefersReducedMotion() {
  return reducedMotionQuery?.matches === true;
}

function isInRevealSafetyRange(item) {
  const rect = item.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.bottom >= -120 && rect.top <= viewportHeight + 160;
}

function sourceCard(source) {
  const category = sourceCategory(source);
  const url = validSourceUrl(source.url);
  const title = sourceDisplayTitle(source);
  const titleUsesRelevance = !source.title && source.relevance;
  const host = sourceHost(source.url);
  return `
    <article class="source-card ${sourceCategoryClass(category)} app-card">
      <div class="card-main">
        <div class="badge-row card-badges">
          ${source.id ? badge(source.id, "") : ""}
          ${badge(category, "")}
          ${source.type ? badge(source.type, "") : ""}
        </div>
        <h3 class="card-title">${escapeHtml(title)}</h3>
      </div>
      <div class="card-preview-stack">
        ${source.relevance && !titleUsesRelevance ? `<div class="detail-field card-preview source-role"><span class="field-label">Workbook role</span><p class="field-value">${escapeHtml(source.relevance)}</p></div>` : ""}
        ${source.notes ? `<div class="detail-field card-preview"><span class="field-label">Workbook notes</span><p class="field-value">${escapeHtml(source.notes)}</p></div>` : ""}
      </div>
      <div class="card-footer card-meta">
        ${sourceMetaFact("Category", category)}
        ${sourceMetaFact("Source type", source.type)}
        ${host ? sourceMetaFact("Host", host) : ""}
      </div>
      ${
        url
          ? `<div class="card-actions source-actions"><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeAttr(title)}">Open source<span>${escapeHtml(host)}</span></a></div>`
          : ""
      }
    </article>
  `;
}

function sourceMetaFact(label, value) {
  if (!text(value)) return "";
  return smallFact(label, value);
}

function sourceDisplayTitle(source) {
  return source.title || source.relevance || (source.id ? `Workbook source ${source.id}` : "Workbook source");
}

function sourceSummaryStats() {
  return {
    validLinks: state.sources.filter((source) => validSourceUrl(source.url)).length,
    redditCount: state.sources.filter((source) => sourceCategory(source).includes("Reddit")).length,
  };
}

function sourceFilterSummary() {
  const active = [state.sourceQuery.trim(), state.sourceCategory, state.sourceType].filter(Boolean).length;
  return active ? `${active} active source filter${active === 1 ? "" : "s"}` : "No source filters active";
}

function sourceCategory(source) {
  const type = text(source.type).toLowerCase();
  if (type.includes("reddit")) return "Reddit-derived discussion source";
  if (type.includes("pmc") || type.includes("et al") || type.includes("ncbi") || type.includes("bookshelf")) return "Clinical/research reference";
  if (type.includes("nhs") || type.includes("mayo") || type.includes("american psychological association") || type.includes("apa")) return "Clinical/public guidance source";
  return "Workbook source";
}

function sourceCategoryClass(category) {
  const value = normalizeKey(category);
  if (value.includes("reddit")) return "is-reddit-source";
  if (value.includes("clinical") || value.includes("research")) return "is-clinical-source";
  return "is-workbook-source";
}

function validSourceUrl(value) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function sourceHost(value) {
  const url = validSourceUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function distribution(items, getter, options = {}) {
  const counts = new Map();
  items.forEach((item) => {
    const label = getter(item) || "Unspecified";
    if (options.omitUnspecified && label === "Unspecified") return;
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
if (VALID_TABS.includes(initialTab)) {
  state.tab = initialTab;
}

window._anxietyApp = {
  getState: () => state,
  supabaseClient,
  supabaseUrl: SUPABASE_URL,
};
