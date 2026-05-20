/**
 * chat.js — AI Copilot widget for AnxietyFlow
 *
 * Configuration: Set CHAT_CONFIG.apiKey and optionally change provider/model.
 * The widget is appended directly to document.body so it is never buried
 * inside the app-shell stacking context.
 *
 * Reads live app state via window._anxietyApp.getState() (set by app.js).
 */

// ── Configuration ────────────────────────────────────────────
const CHAT_CONFIG = {
  provider: "openai",   // "openai" | "gemini"
  apiKey: "",           // Set your API key here
  model: "gpt-4o-mini",
  openaiEndpoint: "https://api.openai.com/v1/chat/completions",
  geminiModel: "gemini-1.5-flash",
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

// ── System prompt builder ────────────────────────────────────
function buildSystemPrompt() {
  const appState = getAppState();
  const methodCount = appState.methods?.length ?? 0;
  const topMethods = (appState.methods ?? [])
    .slice(0, 8)
    .map((m) => `- ${m.name}: ${m.summary ?? ""}`.trim())
    .join("\n");
  const supplementCount = appState.supplements?.length ?? 0;
  const protocolCount = appState.protocols?.length ?? 0;
  const currentTab = appState.tab ?? "dashboard";

  return `You are the AnxietyFlow Copilot, a helpful, evidence-aware assistant embedded in the AnxietyFlow anxiety coping methods database.

The database contains ${methodCount} anxiety coping methods, ${supplementCount} supplement entries, and ${protocolCount} protocols.

The user is currently viewing the "${currentTab}" section.

Top workbook-ranked methods available in this database:
${topMethods || "Data not yet loaded."}

Your role:
- Help users understand and navigate the coping methods in the database
- Explain concepts like evidence grades, safety scores, time horizons, and protocols
- Suggest which section or method to look at based on the user's needs
- Always maintain appropriate clinical boundaries — remind users this is educational information, not medical advice
- Never diagnose, prescribe, or replace professional mental health care
- If a user seems in crisis, always direct them to emergency services or a licensed professional

Keep responses concise and practical. Use plain language. Always distinguish between workbook-derived information and your own knowledge.`;
}

// ── OpenAI streaming ─────────────────────────────────────────
async function streamOpenAI(messages, onToken, onDone, onError) {
  const response = await fetch(CHAT_CONFIG.openaiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHAT_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_CONFIG.model,
      messages,
      stream: true,
      max_tokens: 600,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    onError(`OpenAI API error ${response.status}: ${errorText}`);
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
        const token = json.choices?.[0]?.delta?.content;
        if (token) onToken(token);
      } catch {
        // Malformed SSE line — skip
      }
    }
  }

  onDone();
}

// ── Gemini streaming ─────────────────────────────────────────
async function streamGemini(messages, onToken, onDone, onError) {
  // Convert OpenAI-style messages to Gemini format
  const geminiContents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_CONFIG.geminiModel}:streamGenerateContent?alt=sse&key=${CHAT_CONFIG.apiKey}`;

  const body = {
    contents: geminiContents,
    generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    onError(`Gemini API error ${response.status}: ${errorText}`);
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
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const token = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (token) onToken(token);
      } catch {
        // Malformed SSE line — skip
      }
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

  if (!CHAT_CONFIG.apiKey) {
    appendMessage("error", "No API key configured. Set CHAT_CONFIG.apiKey in chat.js to enable the AI Copilot.");
    return;
  }

  inputEl.value = "";
  inputEl.style.height = "";
  isStreaming = true;
  sendBtn.disabled = true;

  appendMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  const assistantBubble = appendMessage("assistant", "");
  assistantBubble.classList.add("copilot-cursor");

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...conversationHistory,
  ];

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

  try {
    if (CHAT_CONFIG.provider === "gemini") {
      await streamGemini(messages, onToken, onDone, onError);
    } else {
      await streamOpenAI(messages, onToken, onDone, onError);
    }
  } catch (err) {
    onError(`Connection error: ${err.message}`);
  }
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
  fab.textContent = "✦";

  // Chat window
  const widget = document.createElement("div");
  widget.id = "chatWidget";
  widget.setAttribute("role", "dialog");
  widget.setAttribute("aria-label", "AI Copilot");
  widget.classList.add("is-hidden");

  const noApiKey = !CHAT_CONFIG.apiKey;
  const providerLabel = CHAT_CONFIG.provider === "gemini" ? "Gemini" : "OpenAI";

  widget.innerHTML = `
    <div class="copilot-header">
      <span class="copilot-header-dot" aria-hidden="true"></span>
      <span class="copilot-header-title">AI Copilot</span>
      <span class="copilot-header-sub">${providerLabel}</span>
      <button class="copilot-close-btn" type="button" aria-label="Close AI Copilot">✕</button>
    </div>
    ${noApiKey ? `
    <div class="copilot-config-notice">
      To enable: set <code>CHAT_CONFIG.apiKey</code> in <code>chat.js</code> and choose your <code>provider</code> (openai or gemini).
    </div>
    ` : ""}
    <div class="copilot-messages" role="log" aria-live="polite" aria-label="Conversation">
      <div class="copilot-msg is-system">Ask anything about anxiety coping methods, supplements, or protocols in this database.</div>
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
    <div class="copilot-provider-badge">Educational info only · Not medical advice</div>
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
