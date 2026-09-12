// Server-side only: reads EXA_API_KEY. Import from route handlers / the CopilotKit runtime.
// Exa /answer: web search + grounded answer with citations in one call.
// Docs: https://docs.exa.ai/reference/answer
const EXA_API = "https://api.exa.ai";
const EXA_MODEL = process.env.EXA_MODEL ?? "exa";
const TIMEOUT_MS = 20_000;
const MAX_SOURCES = 5;

export type ProductLookupInput = {
  /** Name of the scannable (persona), used to anchor the query. */
  scannableName: string;
  /** Model number, serial, SKU, brand+model, product name — whatever the visitor or knowledge base gave. */
  identifier?: string;
  /** What the visitor actually wants to know. */
  question: string;
  /** Optional 2-letter country code to localise results (e.g. "AE"). */
  country?: string;
};

export type ProductSource = {
  title: string;
  url: string;
  publishedDate?: string;
};

export type ProductLookupResult =
  | { ok: true; answer: string; sources: ProductSource[]; query: string }
  | { ok: false; error: string; query: string };

/**
 * Ask the web about a product / place using Exa's /answer endpoint.
 * Returns a short grounded answer plus the pages it was built from so the
 * agent can attribute what it says and the UI can show links.
 */
export async function lookupProduct(input: ProductLookupInput): Promise<ProductLookupResult> {
  const query = buildQuery(input);
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return { ok: false, error: "EXA_API_KEY is not set", query };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${EXA_API}/answer`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        model: EXA_MODEL,
        // We only need the answer + citation metadata, not full page text.
        text: false,
        systemPrompt:
          "Prefer official manufacturer pages, manuals and reputable retailers. Answer concisely in plain language for someone standing in front of the product. If sources disagree or nothing relevant is found, say so.",
        ...(input.country ? { userLocation: input.country } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = `Exa answer failed (${response.status}): ${truncate(text, 300)}`;
      console.error("[exa]", error);
      return { ok: false, error, query };
    }

    const data = (await response.json()) as {
      answer?: string | Record<string, unknown>;
      citations?: Array<{ title?: string; url?: string; publishedDate?: string }>;
    };

    // Exa numbers its citations inline ([1][2]); we surface sources separately, so drop the markers.
    const answer =
      typeof data.answer === "string"
        ? data.answer.replace(/\s*\[\d+\]/g, "").replace(/[ \t]{2,}/g, " ").trim()
        : JSON.stringify(data.answer ?? "");
    const sources: ProductSource[] = (data.citations ?? [])
      .filter((c): c is { title?: string; url: string; publishedDate?: string } => !!c.url)
      .slice(0, MAX_SOURCES)
      .map((c) => ({
        title: c.title?.trim() || hostname(c.url),
        url: c.url,
        publishedDate: c.publishedDate?.slice(0, 10),
      }));

    if (!answer) {
      return { ok: false, error: "Exa returned no answer for this query", query };
    }

    console.info(`[exa] lookup ok (${sources.length} sources) q="${truncate(query, 80)}"`);
    return { ok: true, answer, sources, query };
  } catch (cause) {
    const error =
      cause instanceof Error && cause.name === "AbortError"
        ? "Exa lookup timed out"
        : cause instanceof Error
          ? cause.message
          : "Unknown error contacting Exa";
    console.error("[exa]", error);
    return { ok: false, error, query };
  } finally {
    clearTimeout(timer);
  }
}

function buildQuery({ scannableName, identifier, question }: ProductLookupInput): string {
  const subject = [identifier?.trim(), scannableName.trim()].filter(Boolean).join(" ");
  return `${question.trim()} (about: ${subject})`;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function truncate(value: string, max: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
