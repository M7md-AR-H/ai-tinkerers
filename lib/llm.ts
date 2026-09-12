import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, wrapLanguageModel } from "ai";

const OPENROUTER_TIMEOUT_MS = 30_000;

function shouldFallback(err: unknown) {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    return status === undefined || status === 429 || status >= 500;
  }
  return (err as { name?: string } | null)?.name === "TimeoutError" || err instanceof TypeError;
}

// OpenRouter first; OpenAI directly on OpenRouter timeout, 429 or 5xx.
export function chatModel() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const fallback = openaiKey
    ? createOpenAI({ apiKey: openaiKey }).chat(process.env.OPENAI_FALLBACK_MODEL || "gpt-4.1-mini")
    : null;

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    if (!fallback) throw new Error("Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.local");
    return fallback;
  }

  const primary = createOpenAI({
    name: "openrouter",
    apiKey: openrouterKey,
    baseURL: "https://openrouter.ai/api/v1",
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)])
          : AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      }),
  }).chat(process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini");
  if (!fallback) return primary;

  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (err) {
          if (!shouldFallback(err)) throw err;
          console.warn("[llm] OpenRouter failed, falling back to OpenAI", err);
          return fallback.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (err) {
          if (!shouldFallback(err)) throw err;
          console.warn("[llm] OpenRouter failed, falling back to OpenAI", err);
          return fallback.doStream(params);
        }
      },
    },
  });
}
