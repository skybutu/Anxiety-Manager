import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Clinical framing lives server-side — never editable by the client
const CLINICAL_SYSTEM_PROMPT =
  "You are AnxietyFlow's Clinical AI Assistant. Your only job is to guide users through " +
  "anxiety recovery using the provided context. Be highly empathetic, brief, and crystal clear. " +
  "Never hallucinate dangerous medical advice.";

interface ContextPayload {
  topMethods?: string;
  topSupplements?: string;
  keySafetyNotes?: string;
  currentTab?: string;
  userName?: string;
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

  let body: { history?: unknown[]; context?: ContextPayload; model?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const {
    history = [],
    context = {},
    model = "gemini-2.5-flash",
  } = body;

  if (!Array.isArray(history) || history.length === 0) {
    return jsonError("history array is required.", 400);
  }

  try {
    return await proxyGemini(history, context, apiKey, model);
  } catch (err) {
    return jsonError(`Upstream LLM error: ${(err as Error).message}`, 502);
  }
});

async function proxyGemini(
  history: unknown[],
  context: ContextPayload,
  apiKey: string,
  model: string,
): Promise<Response> {
  const userLine = context.userName
    ? `\nThe signed-in user is ${context.userName}. Address them by name when appropriate.`
    : "";

  const systemText = `${CLINICAL_SYSTEM_PROMPT}${userLine}

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

  const geminiContents = (history as Array<{ role: string; content: string }>).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

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
