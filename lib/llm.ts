// Server-side only: reads provider API keys. Import from route handlers.
import { createOpenAI } from "@ai-sdk/openai";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENAI_BASE = "https://api.openai.com/v1";

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini";
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL ?? "gpt-4.1-mini";

/**
 * Chat model for the text brain.
 *
 * Primary: OpenRouter (OpenAI-compatible /chat/completions).
 * Fallback: OpenAI directly, used when OpenRouter throws, times out,
 * rate-limits (429) or returns a 5xx. Both speak the same wire format,
 * so the fallback is a URL + key + model swap on the same request.
 */
export function createChatModel() {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openrouterKey && !openaiKey) {
    throw new Error("Set OPENROUTER_API_KEY and/or OPENAI_API_KEY");
  }

  // No OpenRouter key: go straight to OpenAI.
  if (!openrouterKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai.chat(OPENAI_FALLBACK_MODEL);
  }

  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: OPENROUTER_BASE,
    headers: {
      "HTTP-Referer": process.env.APP_BASE_URL ?? "http://localhost:3000",
      "X-Title": "AI Tinkerers",
    },
    fetch: openaiKey ? withOpenAIFallback(openaiKey) : undefined,
  });

  // .chat() targets /chat/completions, which OpenRouter implements.
  return openrouter.chat(OPENROUTER_MODEL);
}

function withOpenAIFallback(openaiKey: string): typeof fetch {
  return async (input, init) => {
    let primaryError: string | null = null;

    try {
      const response = await fetch(input, init);
      const shouldFallback = response.status === 429 || response.status >= 500;
      if (!shouldFallback) {
        return response;
      }
      primaryError = `OpenRouter ${response.status}`;
    } catch (cause) {
      primaryError = cause instanceof Error ? cause.message : "OpenRouter request failed";
    }

    console.warn(`[llm] ${primaryError} — falling back to OpenAI`);

    const url = toUrlString(input).replace(OPENROUTER_BASE, OPENAI_BASE);

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${openaiKey}`);
    headers.delete("HTTP-Referer");
    headers.delete("X-Title");

    let body = init?.body;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed.model = OPENAI_FALLBACK_MODEL;
        body = JSON.stringify(parsed);
      } catch {
        // leave body untouched
      }
    }

    return fetch(url, { ...init, headers, body });
  };
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
