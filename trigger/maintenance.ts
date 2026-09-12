import { task } from "@trigger.dev/sdk";
import { addLog } from "../lib/memory";
import { getObject } from "../lib/objects";
import { sendFromObject } from "../lib/ambiguous";

export type MaintenancePayload = { objectId: string; taskName: string };

export const maintenanceDue = task({
  id: "maintenance-due",
  run: async ({ objectId, taskName }: MaintenancePayload) => {
    // Trigger runs tasks from its own build dir, so a cwd-relative fallback would write to the wrong file.
    if (!process.env.DATA_DIR) throw new Error("DATA_DIR is not set in .env.local");

    await addLog(objectId, `Maintenance due: ${taskName}`);

    const obj = getObject(objectId);
    const to = process.env.DEMO_EMAIL;
    if (to) {
      await sendFromObject(
        objectId,
        to,
        `Maintenance due: ${taskName}`,
        `Hi, this is the ${obj?.name ?? objectId}${obj ? ` (${obj.location})` : ""}. I booked this myself: "${taskName}" is due now. Please come and take care of it.`
      );
    }

    return { ok: true };
  },
});
