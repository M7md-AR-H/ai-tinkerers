import Exa from "exa-js";

export async function lookupManual(model: string, question: string) {
  const key = process.env.EXA_API_KEY;
  if (!key) return "I couldn't reach my manual (no Exa key is configured).";
  try {
    const res = await new Exa(key).search(`${model} ${question} manual troubleshooting`, {
      numResults: 3,
      contents: { text: { maxCharacters: 1500 } },
    });
    if (!res.results.length) return "I couldn't find anything in my manual about that.";
    return res.results.map((r) => `SOURCE: ${r.title ?? "Untitled"} (${r.url})\n${r.text ?? ""}`).join("\n\n");
  } catch (err) {
    console.error("[exa]", err);
    return "I couldn't reach my manual right now.";
  }
}
