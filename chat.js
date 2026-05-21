/**
 * chat.js — AI Copilot widget for AnxietyFlow
 *
 * Configuration: Set CHAT_CONFIG.geminiModel or edgeFunctionUrl to override defaults.
 * The widget is appended directly to document.body so it is never buried
 * inside the app-shell stacking context.
 *
 * Reads live app state via window._anxietyApp.getState() (set by app.js).
 */

// ── Configuration ────────────────────────────────────────────
const CHAT_CONFIG = {
  provider: "gemini",
  geminiModel: "gemini-2.5-flash",
  edgeFunctionUrl: "https://jdcjmygysexvvtxxxpvo.supabase.co/functions/v1/anxiety-copilot",
};

// ── Module state ─────────────────────────────────────────────
let chatOpen = false;
let isStreaming = false;
const conversationHistory = [];

// ── DOM references (populated in init) ──────────────────────
let fabEl = null;
let widgetEl = null;
let messagesEl = null;
let inputEl = null;
let sendBtn = null;

// ── App state bridge ─────────────────────────────────────────
function getAppState() {
  return window._anxietyApp?.getState?.() ?? {};
}

function getEdgeFunctionUrl() {
  const supabaseUrl = window._anxietyApp?.supabaseUrl || CHAT_CONFIG.edgeFunctionUrl.replace("/functions/v1/anxiety-copilot", "");
  return `${supabaseUrl}/functions/v1/anxiety-copilot`;
}

function getGreeting() {
  const appState = getAppState();
  const user = appState.authUser;
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const name = (metadata.name || metadata.full_name || user.email || "").split("@")[0].trim();
  return name || null;
}

// ── Context payload builder ───────────────────────────────────
function buildContextPayload() {
  const appState = getAppState();
  const methods = appState.methods ?? [];
  const supplements = appState.supplements ?? [];
  const safetyNotes = appState.safetyNotes ?? [];
  const protocols = appState.protocols ?? [];
  return {
    topMethods: methods.slice(0, 10).map((m) => {
      const parts = [`- ${m.name}`];
      if (m.evidenceGrade) parts.push(`evidence: ${m.evidenceGrade}`);
      if (m.safetyLevel) parts.push(`caution: ${m.safetyLevel}`);
      if (m.summary) parts.push(`— ${m.summary}`);
      return parts.join(" | ");
    }).join("\n"),
    topSupplements: supplements.slice(0, 6).map((s) => {
      const parts = [`- ${s.name}`];
      if (s.risk) parts.push(`risk: ${s.risk}`);
      if (s.symptoms) parts.push(`targets: ${s.symptoms}`);
      if (s.interactions) parts.push(`interactions: ${s.interactions}`);
      return parts.join(" | ");
    }).join("\n"),
    keySafetyNotes: safetyNotes.slice(0, 5)
      .map((n) => `- ${n.topic || ""}: ${n.guidance || ""}`.trim())
      .join("\n"),
    currentTab: appState.tab ?? "dashboard",
    userName: getGreeting() ?? "",
    methodCount: methods.length,
    supplementCount: supplements.length,
    protocolCount: protocols.length,
  };
}

// ── Edge function streaming ───────────────────────────────────
async function streamViaEdge(history, context, onToken, onDone, onError) {
  const supabase = window._anxietyApp?.supabaseClient;
  let accessToken = null;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data?.session?.access_token ?? null;
    } catch {
      // Session lookup failed — fall through to auth error
    }
  }

  if (!accessToken) {
    onError("Please sign in to use the AI Copilot. Click Sign In in the top navigation.");
    return;
  }

  let response;
  try {
    response = await fetch(getEdgeFunctionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        history,
        context,
        model: CHAT_CONFIG.geminiModel,
      }),
    });
  } catch (err) {
    onError(`Could not reach the AI service. Check your connection. (${err.message})`);
    return;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch { /* non-JSON error body */ }
    onError(`AI Copilot error (${response.status}): ${detail}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const token = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (token) onToken(token);
      } catch { /* malformed SSE line */ }
    }
  }

  onDone();
}

// ── Message rendering ────────────────────────────────────────
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `copilot-msg is-${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Send message ─────────────────────────────────────────────
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  inputEl.value = "";
  inputEl.style.height = "";
  isStreaming = true;
  sendBtn.disabled = true;

  appendMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  const assistantBubble = appendMessage("assistant", "");
  assistantBubble.classList.add("copilot-cursor");

  const context = buildContextPayload();

  let accumulated = "";

  const onToken = (token) => {
    accumulated += token;
    assistantBubble.textContent = accumulated;
    assistantBubble.classList.add("copilot-cursor");
    scrollToBottom();
  };

  const onDone = () => {
    assistantBubble.classList.remove("copilot-cursor");
    conversationHistory.push({ role: "assistant", content: accumulated });
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.focus();
  };

  const onError = (errorMessage) => {
    assistantBubble.remove();
    appendMessage("error", errorMessage);
    conversationHistory.pop(); // Remove the user message we just added
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.focus();
  };

  await streamViaEdge(conversationHistory, context, onToken, onDone, onError);
}

// ── Toggle chat window ───────────────────────────────────────
function toggleChat() {
  chatOpen = !chatOpen;
  widgetEl.classList.toggle("is-hidden", !chatOpen);
  fabEl.setAttribute("aria-expanded", String(chatOpen));

  if (chatOpen) {
    inputEl.focus();
    scrollToBottom();
  }
}

// ── Create widget DOM ────────────────────────────────────────
function createWidgetDOM() {
  // FAB
  const fab = document.createElement("button");
  fab.id = "chatToggle";
  fab.type = "button";
  fab.setAttribute("aria-label", "Open AI Copilot");
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-controls", "chatWidget");
  fab.textContent = "💬";

  // Chat window
  const widget = document.createElement("div");
  widget.id = "chatWidget";
  widget.setAttribute("role", "dialog");
  widget.setAttribute("aria-label", "AI Copilot");
  widget.classList.add("is-hidden");

  const providerLabel = CHAT_CONFIG.provider === "gemini" ? "Gemini" : "OpenAI";
  const greeting = getGreeting();
  const greetLine = greeting ? `<span class="copilot-header-greeting">Hi, ${greeting}</span>` : "";

  widget.innerHTML = `
    <div class="copilot-header">
      <span class="copilot-header-dot" aria-hidden="true"></span>
      <span class="copilot-header-title">AI Copilot</span>
      ${greetLine}
      <span class="copilot-header-sub">${providerLabel}</span>
      <button class="copilot-close-btn" type="button" aria-label="Close AI Copilot">✕</button>
    </div>
    <div class="copilot-messages" role="log" aria-live="polite" aria-label="Conversation">
      <div class="copilot-msg is-system">Ask about anxiety coping methods, supplements, or protocols in this database. Avoid entering personal or medical information.</div>
    </div>
    <div class="copilot-input-row">
      <textarea
        class="copilot-input"
        placeholder="Ask the copilot…"
        rows="1"
        aria-label="Message input"
        autocomplete="off"
        spellcheck="true"
      ></textarea>
      <button class="copilot-send-btn" type="button" aria-label="Send message">➤</button>
    </div>
    <div class="copilot-provider-badge">Educational info only · Not medical advice · Messages sent to AI service · Avoid entering personal or health details</div>
  `;

  return { fab, widget };
}

// ── Initialize ───────────────────────────────────────────────
function init() {
  const { fab, widget } = createWidgetDOM();
  document.body.appendChild(fab);
  document.body.appendChild(widget);

  fabEl = fab;
  widgetEl = widget;
  messagesEl = widget.querySelector(".copilot-messages");
  inputEl = widget.querySelector(".copilot-input");
  sendBtn = widget.querySelector(".copilot-send-btn");

  // FAB toggle
  fab.addEventListener("click", toggleChat);

  // Close button inside widget
  widget.querySelector(".copilot-close-btn").addEventListener("click", () => {
    chatOpen = false;
    widgetEl.classList.add("is-hidden");
    fab.setAttribute("aria-expanded", "false");
    fab.focus();
  });

  // Send on button click
  sendBtn.addEventListener("click", sendMessage);

  // Send on Enter (Shift+Enter for newline)
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 100)}px`;
  });

  // Close on Escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chatOpen) {
      chatOpen = false;
      widgetEl.classList.add("is-hidden");
      fab.setAttribute("aria-expanded", "false");
      fab.focus();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
