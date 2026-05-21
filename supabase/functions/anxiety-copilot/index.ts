import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Clinical framing lives server-side — never editable by the client
const CLINICAL_SYSTEM_PROMPT =
  "You are AnxietyFlow's educational AI assistant. Your only job is to help users explore " +
  "the AnxietyFlow database of anxiety coping methods, protocols, and educational information. " +
  "You are not a clinical tool and do not provide therapy, diagnosis, or treatment. " +
  "Be helpful, brief, and clear. Never state or imply medical advice.";

interface ContextPayload {
  topMethods?: string;
  topSupplements?: string;
  keySafetyNotes?: string;
  currentTab?: string;
  methodCount?: number;
  supplementCount?: number;
  protocolCount?: number;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) {
    return jsonError("AI service not configured on the server.", 503);
  }

  let body: {
    prompt?: string;
    message?: string;
    history?: unknown[];
    context?: ContextPayload;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const {
    prompt,
    message,
    history = [],
    context = {},
    model = "gemini-2.5-flash",
  } = body;

  const currentMessage = message ?? prompt;

  if (typeof currentMessage !== "string" || currentMessage.trim().length === 0) {
    return jsonError("message is required.", 400);
  }

  if (!Array.isArray(history)) {
    return jsonError("history must be an array.", 400);
  }

  try {
    return await proxyGemini(currentMessage, history, context, apiKey, model);
  } catch {
    return jsonError("Upstream service error. Please try again.", 502);
  }
});

async function proxyGemini(
  message: string,
  history: unknown[],
  context: ContextPayload,
  apiKey: string,
  model: string,
): Promise<Response> {
  const systemText = `${CLINICAL_SYSTEM_PROMPT}

The user is currently viewing the "${context.currentTab ?? "dashboard"}" section of the AnxietyFlow database (${context.methodCount ?? 0} methods, ${context.supplementCount ?? 0} supplements, ${context.protocolCount ?? 0} protocols).

TOP RANKED COPING METHODS (workbook-derived):
${context.topMethods || "Data not yet loaded."}

SUPPLEMENT MATRIX (educational only — not medical advice):
${context.topSupplements || "No supplement data loaded."}

KEY SAFETY NOTES:
${context.keySafetyNotes || "No safety notes loaded."}

Your rules:
- Ground every response in the database content above. Label your source (e.g. "Per the workbook...").
- Maintain strict clinical boundaries: never diagnose, prescribe, or replace professional care.
- If the user describes a crisis or danger, immediately direct them to emergency services or a licensed professional.
- Keep responses under 120 words unless a detailed step-by-step is explicitly requested.
- Always distinguish workbook-derived observations from general knowledge.`;

  const geminiHistory = (history as Array<{ role: string; content: string }>).slice(-4).map((m) => ({
    role: m.role === "assistant" || m.role === "model" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const geminiContents = [
    ...geminiHistory,
    { role: "user", parts: [{ text: message }] },
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: geminiContents,
      systemInstruction: { parts: [{ text: systemText }] },
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => upstream.statusText);
    return jsonError(`Gemini error ${upstream.status}: ${text}`, 502);
  }

  return new Response(upstream.body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
