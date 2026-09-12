import OpenAI from "openai";
import { z } from "zod";

export const PhotoAnalysis = z.object({
  objectType: z.string(),
  suggestedName: z.string(),
  brandModel: z.string().nullable(),
  description: z.string(),
  observations: z.array(z.string()),
  questions: z.array(z.string()),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysis>;

const ANALYZE_PROMPT = `You help someone turn a physical object or place into a talking agent that visitors reach by scanning a QR code stuck on it.
Look at the photo and identify what it is. Then write 3 to 5 short follow-up questions for the owner whose answers the agent will need to help visitors: for example where exactly it is, how to use it, known quirks or problems, who looks after it and how to report issues, rules or opening hours. Don't ask about anything obvious from the photo.
Reply with JSON only:
{"objectType": string, "suggestedName": string (short display name, e.g. "Lobby Printer"), "brandModel": string or null (only if readable or clearly identifiable), "description": string (1-2 sentences about what you see), "observations": string[] (visible details such as labels, buttons, condition, surroundings), "questions": string[]}`;

const KNOWLEDGE_PROMPT = `You write the knowledge file for a QR-code agent that speaks as a physical object. You get its name, an analysis of its photo, and the owner's answers to follow-up questions.
Write concise Markdown with these sections, only where you have information: "# <name>", "## What I am", "## Where I am", "## How to use me", "## Known quirks and problems", "## Care and maintenance", "## Who to contact".
Use only facts from the input. Never invent specifics such as phone numbers, prices, dates or people's names.
Reply with JSON only: {"knowledge": string}`;

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  return new OpenAI({ apiKey });
}

async function askJson(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<Record<string, unknown>> {
  const res = await client().chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages,
  });
  return JSON.parse(res.choices[0]?.message?.content || "{}");
}

export async function analyzePhoto(dataUrl: string): Promise<PhotoAnalysis> {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 3_000_000) {
    throw new Error("Please use a JPEG, PNG or WebP photo.");
  }
  const raw = await askJson([
    { role: "system", content: ANALYZE_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Here is the photo." },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ]);
  const a = PhotoAnalysis.parse({ ...raw, brandModel: raw.brandModel ?? null });
  return { ...a, observations: a.observations.slice(0, 8), questions: a.questions.slice(0, 5) };
}

export async function writeKnowledge(name: string, analysis: PhotoAnalysis, qa: { question: string; answer: string }[]) {
  const raw = await askJson([
    { role: "system", content: KNOWLEDGE_PROMPT },
    { role: "user", content: JSON.stringify({ name, analysis, answers: qa.filter((q) => q.answer.trim()) }) },
  ]);
  return z.object({ knowledge: z.string().min(1) }).parse(raw).knowledge;
}
