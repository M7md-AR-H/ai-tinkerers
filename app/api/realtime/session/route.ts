import { buildInstructions } from "@/lib/agent-brain";
import { getScannableKnowledge } from "@/lib/convex-server";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

/**
 * Mints a short-lived ephemeral key so the browser can open a WebRTC
 * session straight to OpenAI Realtime. The real API key never leaves the server.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const { scannableId } = (await request.json().catch(() => ({}))) as {
    scannableId?: string;
  };
  if (!scannableId) {
    return Response.json({ error: "scannableId is required" }, { status: 400 });
  }

  const scannable = await getScannableKnowledge(scannableId);
  if (!scannable) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const instructions = buildInstructions(scannable);

  const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        audio: {
          input: {
            // Phone/laptop mic held close: suppress room noise before VAD.
            noise_reduction: { type: "near_field" },
            // Semantic VAD waits for the visitor to actually finish a thought
            // instead of triggering on any sound; "low" eagerness = patient.
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: REALTIME_VOICE },
        },
      },
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return Response.json(
      { error: `OpenAI realtime session failed (${upstream.status}): ${text.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as { value?: string };
  if (!data.value) {
    return Response.json({ error: "No client secret returned" }, { status: 502 });
  }

  return Response.json({
    clientSecret: data.value,
    model: REALTIME_MODEL,
    instructions,
    name: scannable.name,
  });
}
