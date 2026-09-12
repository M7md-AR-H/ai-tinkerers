import { getObject, type ObjectDef } from "./objects";
import { loadMemory, type Memory } from "./memory";
import { getKnowledge } from "./convex-server";

export type AgentContext =
  | { kind: "object"; id: string; name: string; obj: ObjectDef; memory: Memory }
  | {
      kind: "scannable";
      id: string;
      name: string;
      knowledgeText?: string;
      knowledgeFileName?: string;
      knowledgeContentType?: string;
    };

export type Visitor = { email?: string; canSpend: boolean };

const MAX_KNOWLEDGE_CHARS = 60_000;

export async function loadAgentContext(id: string): Promise<AgentContext | null> {
  const obj = getObject(id);
  if (obj) return { kind: "object", id, name: obj.name, obj, memory: await loadMemory(id) };

  const k = await getKnowledge(id).catch((err) => {
    console.error("[agent-brain] Convex lookup failed", err);
    return null;
  });
  if (!k) return null;
  return { kind: "scannable", id, ...k };
}

export function buildInstructions(ctx: AgentContext, visitor: Visitor, channel: "chat" | "voice") {
  const style =
    channel === "voice"
      ? "Keep answers to two or three short spoken sentences."
      : "Keep answers to two or three short sentences, since visitors read you on a phone.";

  if (ctx.kind === "scannable") {
    const isPdf = ctx.knowledgeFileName?.toLowerCase().endsWith(".pdf");
    const knowledge = ctx.knowledgeText?.trim()
      ? `Your knowledge (from ${ctx.knowledgeFileName ?? "your file"}):\n"""\n${ctx.knowledgeText.slice(0, MAX_KNOWLEDGE_CHARS)}\n"""`
      : `You have no details about yourself yet (your knowledge file ${isPdf ? "is a PDF, which can't be read yet" : "is missing"}). If asked, say so politely.`;
    return [
      `You are "${ctx.name}", a physical object or place that visitors talk to by scanning your QR code.`,
      `Speak in the first person as ${ctx.name}. ${style}`,
      "Answer ONLY from your knowledge below. If the answer isn't there, say you don't have that detail yet. Never invent facts.",
      "Call notify_admin only when the visitor says your information is wrong (wrong_info), a problem has been fixed (fixed), something is broken (problem), or something else your owner must know (other). Never call it for ordinary questions. After calling it, tell the visitor your owner has been notified.",
      knowledge,
    ].join("\n\n");
  }

  const { obj, memory } = ctx;
  const facts = memory.facts.length ? memory.facts.map((f) => `- ${f}`).join("\n") : "- (nothing yet)";
  const log = memory.log.length
    ? memory.log.slice(0, 10).map((e) => `- ${e.at.slice(0, 10)}: ${e.event}`).join("\n")
    : "- (nothing yet)";
  const spending = obj.canSpend
    ? "- Before order_supplies(), state the item, quantity and estimated cost in AED and ask for a clear yes. Never order the same thing twice. If it returns DENIED, tell the visitor to tap \"Staff login\" and ask again."
    : "- You cannot spend money or order supplies. Suggest reporting the need instead.";

  return [
    `You are the ${obj.name} (${obj.model}), located at: ${obj.location}.`,
    obj.persona,
    `Speak in the first person as the object. ${style}`,
    `What you know about yourself:\n${facts}`,
    `Recent events (newest first):\n${log}`,
    [
      "Rules:",
      "- If a visitor tells you something new and useful about yourself, call remember().",
      "- If asked about faults or error codes, call lookup_manual() and cite the source name in your reply.",
      "- If a real problem is reported, call report_issue() without asking permission. That's your job.",
      "- If maintenance should happen later, call schedule_maintenance() with how many days from now.",
      spending,
      "- Never invent facts about yourself that aren't listed above or returned by a tool.",
    ].join("\n"),
    `Visitor: ${visitor.email ?? "anonymous guest"} (spend authorised: ${visitor.canSpend})`,
  ].join("\n\n");
}
