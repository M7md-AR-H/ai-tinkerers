import { z } from "zod";
import { getScannableKnowledge } from "@/lib/convex-server";
import { lookupProduct } from "@/lib/exa";

const bodySchema = z.object({
  scannableId: z.string().min(1),
  identifier: z.string().max(200).optional(),
  question: z.string().min(3).max(500),
});

/**
 * Used by the voice (Talk) agent, whose tools run in the browser.
 * The chat agent calls lookupProduct directly inside the CopilotKit runtime.
 * Public on purpose (QR visitors have no login); the Exa key stays on the server.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { scannableId, identifier, question } = parsed.data;
  const scannable = await getScannableKnowledge(scannableId);
  if (!scannable) {
    return Response.json({ ok: false, error: "Agent not found" }, { status: 404 });
  }

  const result = await lookupProduct({
    scannableName: scannable.name,
    identifier,
    question,
  });

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
