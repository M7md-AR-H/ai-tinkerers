import { z } from "zod";
import { handleVisitorReport } from "@/lib/admin-actions";
import { getScannableKnowledge } from "@/lib/convex-server";

const bodySchema = z.object({
  scannableId: z.string().min(1),
  kind: z.enum(["wrong_info", "fixed", "problem", "other"]),
  summary: z.string().min(5).max(2000),
  details: z.string().max(4000).optional(),
});

/**
 * Used by the voice (Talk) agent, whose tools run in the browser.
 * The chat agent calls handleVisitorReport directly inside the CopilotKit runtime.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { scannableId, kind, summary, details } = parsed.data;
  const scannable = await getScannableKnowledge(scannableId);
  if (!scannable) {
    return Response.json({ ok: false, error: "Agent not found" }, { status: 404 });
  }

  const outcome = await handleVisitorReport({
    kind,
    summary,
    details,
    scannableId: String(scannable._id),
    scannableName: scannable.name,
    channel: "voice",
  });

  const ok = outcome.emailed || outcome.taskAction !== "none";
  return Response.json(
    {
      ok,
      message: outcome.visitorMessage,
      taskAction: outcome.taskAction,
      taskKey: outcome.taskKey,
      taskUrl: outcome.taskUrl,
      emailed: outcome.emailed,
      error: ok ? undefined : (outcome.emailError ?? outcome.taskError ?? "Could not reach the owner"),
    },
    { status: ok ? 200 : 502 },
  );
}
