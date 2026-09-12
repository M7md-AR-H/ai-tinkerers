import { tasks } from "@trigger.dev/sdk";
import type { maintenanceDue } from "@/trigger/maintenance";
import { addLog } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDS = new Set(["projector", "coffee", "room"]);

// Hidden stage route: GET /auth/demo?id=coffee&task=descale -> log line now, "Maintenance due" 45s later.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "coffee";
  const taskName = url.searchParams.get("task") ?? "descale";
  if (!IDS.has(id)) return Response.json({ ok: false, error: "unknown object" }, { status: 400 });

  const handle = await tasks.trigger<typeof maintenanceDue>(
    "maintenance-due",
    { objectId: id, taskName },
    { delay: "45s" }
  );
  await addLog(id, `Booked my own ${taskName}. Reminder set.`);

  return Response.json({ ok: true, objectId: id, taskName, firesIn: "45s", runId: handle.id });
}
