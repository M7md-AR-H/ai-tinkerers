import { tasks } from "@trigger.dev/sdk";
import type { maintenanceDue } from "@/trigger/maintenance";

export async function scheduleMaintenance(objectId: string, taskName: string, inDays: number) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.log("[scheduler stub] no TRIGGER_SECRET_KEY", { objectId, taskName, inDays });
    return { ok: true, stub: true };
  }
  try {
    const handle = await tasks.trigger<typeof maintenanceDue>(
      "maintenance-due",
      { objectId, taskName },
      { delay: `${inDays}d` }
    );
    return { ok: true, runId: handle.id };
  } catch (err) {
    console.error("[scheduler] trigger failed", err);
    return { ok: false, error: String(err) };
  }
}
