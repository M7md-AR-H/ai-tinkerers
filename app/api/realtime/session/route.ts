import OpenAI from "openai";
import { buildInstructions, loadAgentContext } from "@/lib/agent-brain";
import { availableTools } from "@/lib/object-tools";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

// Mints a short-lived Realtime key; the browser never sees OPENAI_API_KEY.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return Response.json({ error: "Missing id" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });

  const ctx = await loadAgentContext(body.id);
  if (!ctx) return Response.json({ error: "Agent not found" }, { status: 404 });

  const instructions = buildInstructions(ctx, await getUser(), "voice");
  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
  const voice = process.env.OPENAI_REALTIME_VOICE || "marin";

  try {
    const secret = await new OpenAI({ apiKey }).realtime.clientSecrets.create({
      session: { type: "realtime", model, instructions, audio: { output: { voice } } },
    });
    return Response.json({
      clientSecret: secret.value,
      model,
      voice,
      name: ctx.name,
      instructions,
      tools: availableTools(ctx),
    });
  } catch (err) {
    console.error("[realtime]", err);
    return Response.json({ error: "Could not start a voice session" }, { status: 502 });
  }
}
