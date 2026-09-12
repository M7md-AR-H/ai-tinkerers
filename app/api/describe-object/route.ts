import { generateText, Output } from "ai";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { createChatModel } from "@/lib/llm";

// ~6 MB of base64 ≈ 4.5 MB image. The client downscales before sending,
// so real payloads are far smaller; this is just a sanity ceiling.
const MAX_IMAGE_DATA_URL_CHARS = 6_000_000;

const bodySchema = z.object({
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Image must be a JPEG, PNG or WebP data URL")
    .max(MAX_IMAGE_DATA_URL_CHARS, "Image is too large"),
  hint: z.string().max(500).optional(),
});

const draftSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .describe("Short display name for the object or place, e.g. 'Lobby coffee machine'."),
  knowledge: z
    .string()
    .min(1)
    .describe(
      "Plain-text knowledge file describing the object so it can answer visitor questions in first person.",
    ),
});

const SYSTEM_PROMPT = [
  "You help people turn a physical object or place into a small talking agent.",
  "You are given a photo (and sometimes a short hint from the owner).",
  "Produce two things:",
  "1. name: a short, human-friendly display name for what is in the photo.",
  "2. knowledge: a plain-text knowledge file the agent will answer from.",
  "",
  "Rules for the knowledge file:",
  "- Write it as short Markdown sections with headings, e.g. '# What I am', '# How to use me', '# Details visible in the photo', '# Care and troubleshooting', '# Things I don't know yet'.",
  "- Only state facts you can actually see (brand, model, labels, buttons, signs, condition, surroundings) or that follow with very high confidence from them.",
  "- If a detail is not visible, do not invent it. Instead add a clear placeholder on its own line such as 'TODO: opening hours', 'TODO: who to contact when broken', 'TODO: Wi-Fi password'.",
  "- Never invent prices, times, codes, phone numbers, or names of people.",
  "- Keep it practical: what the thing is, how to use it, common questions visitors ask, what to do when something goes wrong.",
  "- Aim for roughly 150 to 400 words.",
].join("\n");

/**
 * Dashboard helper: look at a photo of an object and draft the agent's
 * name + knowledge text. The owner reviews and edits the draft before it
 * is saved as a .txt knowledge file. Owners only; never reachable by
 * QR visitors.
 */
export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid payload";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  const { image, hint } = parsed.data;

  try {
    const { output } = await generateText({
      model: createChatModel(),
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: draftSchema, name: "agent_draft" }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: hint?.trim()
                ? `Owner's hint about this object: ${hint.trim()}\n\nDescribe the object in this photo.`
                : "Describe the object in this photo.",
            },
            { type: "image", image },
          ],
        },
      ],
      maxOutputTokens: 1200,
    });

    return Response.json({
      ok: true,
      name: output.name.trim(),
      knowledge: output.knowledge.trim(),
    });
  } catch (cause) {
    console.error("[describe-object] failed", cause);
    return Response.json(
      { ok: false, error: "Could not read the photo. Try a clearer picture or type the details instead." },
      { status: 502 },
    );
  }
}
