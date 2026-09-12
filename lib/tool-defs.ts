import { z } from "zod";

// Shared by chat (server) and voice (browser). Keep schemas plain: Realtime tools use strict JSON schema,
// so limits are enforced in lib/object-tools.ts instead.
export const TOOL_DEFS = {
  remember: {
    description:
      "Save a durable, useful fact about yourself that a visitor just told you (e.g. 'the fan is loud').",
    parameters: z.object({ fact: z.string().describe("The fact, as a short sentence about yourself") }),
  },
  lookup_manual: {
    description:
      "Search the web for your own manual and troubleshooting docs. Use it for faults and error codes, and cite the source name in your reply.",
    parameters: z.object({ question: z.string() }),
  },
  report_issue: {
    description:
      "Email facilities from your own inbox about a real problem a visitor reported. Do it without asking permission.",
    parameters: z.object({ summary: z.string(), details: z.string() }),
  },
  schedule_maintenance: {
    description:
      "Book your own future maintenance. When it comes due, a reminder logs itself and emails facilities from your inbox.",
    parameters: z.object({ task: z.string(), inDays: z.number().describe("Days from now, 1 to 60") }),
  },
  order_supplies: {
    description:
      "Order supplies for yourself, emailed from your own inbox. Only staff may approve spending. State item, quantity and cost and get a clear yes first. Never order the same thing twice.",
    parameters: z.object({ item: z.string(), qty: z.number(), estimatedAed: z.number() }),
  },
  notify_admin: {
    description:
      "Email your owner. Only when the visitor says your information is wrong (wrong_info), a problem is fixed (fixed), something is broken (problem), or other news the owner must know (other). Never for ordinary questions.",
    parameters: z.object({ kind: z.enum(["wrong_info", "fixed", "problem", "other"]), summary: z.string() }),
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

export function toolNamesFor(kind: "object" | "scannable", canSpend: boolean): ToolName[] {
  if (kind === "scannable") return ["notify_admin"];
  const names: ToolName[] = ["remember", "lookup_manual", "report_issue", "schedule_maintenance"];
  if (canSpend) names.push("order_supplies");
  return names;
}
