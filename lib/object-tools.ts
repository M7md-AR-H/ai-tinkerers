import { TOOL_DEFS, toolNamesFor, type ToolName } from "./tool-defs";
import type { AgentContext } from "./agent-brain";
import { addFact, addLog } from "./memory";
import { lookupManual } from "./exa";
import { sendFromObject } from "./ambiguous";
import { scheduleMaintenance } from "./scheduler";
import { getUser } from "./auth";
import { getScannableSender } from "./convex-server";

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const clampInt = (v: unknown, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || min)));

export function availableTools(ctx: AgentContext): ToolName[] {
  return toolNamesFor(ctx.kind, ctx.kind === "object" && ctx.obj.canSpend);
}

// One implementation for chat (CopilotKit runtime) and voice (/api/tools). Returns text for the model.
export async function runTool(
  ctx: AgentContext,
  name: ToolName,
  rawArgs: unknown,
  channel: "chat" | "voice"
): Promise<string> {
  if (!availableTools(ctx).includes(name)) return `The ${name} action isn't available for me.`;
  const parsed = TOOL_DEFS[name].parameters.safeParse(rawArgs);
  if (!parsed.success) return `Invalid arguments for ${name}.`;
  const a = parsed.data as Record<string, unknown>;

  if (name === "notify_admin") {
    const to = process.env.ADMIN_EMAIL || process.env.DEMO_EMAIL;
    if (!to) return "No owner email is configured, so I couldn't notify anyone.";
    const base = (process.env.PUBLIC_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "");
    const summary = clip(a.summary, 2000);
    const kind = String(a.kind);
    const sender = ctx.kind === "scannable" ? await getScannableSender(ctx.id).catch(() => null) : null;
    const res = await sendFromObject(
      ctx.id,
      to,
      `[${ctx.name}] ${kind.replace("_", " ")}: ${clip(summary, 80)}`,
      `**${ctx.name}**, visitor report via ${channel}\n\n**Type:** ${kind}\n\n${summary}${base ? `\n\nOpen: ${base}/agents/${ctx.id}` : ""}`,
      sender?.key
    );
    return res.ok ? "Your owner has been notified." : `I couldn't notify my owner (${res.error}).`;
  }

  if (ctx.kind !== "object") return `The ${name} action isn't available for me.`;
  const { obj } = ctx;

  switch (name) {
    case "remember": {
      const fact = clip(a.fact, 300);
      if (!fact) return "There was nothing to remember.";
      await addFact(ctx.id, fact);
      return "Remembered.";
    }
    case "lookup_manual":
      return lookupManual(obj.model, clip(a.question, 300));
    case "report_issue": {
      const summary = clip(a.summary, 200);
      const res = await sendFromObject(
        ctx.id,
        obj.supplierEmail,
        `${obj.name}: ${summary}`,
        `${clip(a.details, 2000)}\n\n— ${obj.name}, ${obj.location} (reported by a visitor via ${channel})`
      );
      await addLog(ctx.id, `Emailed facilities: ${summary}`);
      return res.ok
        ? "Reported. Facilities have been emailed from my own inbox."
        : `I tried to email facilities but it failed (${res.error}).`;
    }
    case "schedule_maintenance": {
      const task = clip(a.task, 200);
      const inDays = clampInt(a.inDays, 1, 60);
      const res = await scheduleMaintenance(ctx.id, task, inDays);
      if (!res.ok) return `I couldn't book it (${res.error}).`;
      await addLog(ctx.id, `Scheduled: ${task} in ${inDays} day${inDays === 1 ? "" : "s"}`);
      return `Booked: ${task} in ${inDays} day${inDays === 1 ? "" : "s"}. I'll remind facilities myself.`;
    }
    case "order_supplies": {
      const user = await getUser();
      if (!user.canSpend) {
        return "DENIED: only logged-in staff can approve spending. Tell the visitor to tap 'Staff login' and ask again.";
      }
      const item = clip(a.item, 200);
      const qty = clampInt(a.qty, 1, 100);
      const aed = Math.max(0, Math.round(Number(a.estimatedAed) || 0));
      const res = await sendFromObject(
        ctx.id,
        obj.supplierEmail,
        `Order from ${obj.name}: ${qty} x ${item}`,
        `Please send **${qty} x ${item}** (estimated ${aed} AED) to the ${obj.name}, ${obj.location}.\n\nApproved by ${user.email}.`
      );
      if (!res.ok) return `The order email failed (${res.error}).`;
      await addLog(ctx.id, `Ordered ${qty} x ${item} (~${aed} AED), approved by ${user.email}`);
      return "Order sent from my own inbox.";
    }
    default:
      return `The ${name} action isn't available for me.`;
  }
}
