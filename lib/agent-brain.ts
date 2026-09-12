import type { ScannableKnowledge } from "./convex-server";

const MAX_KNOWLEDGE_CHARS = 60_000;

/**
 * Shared persona + rules for both the Chat brain (CopilotKit) and the
 * Talk brain (OpenAI Realtime). Keep these in sync by building them here.
 */
export function buildInstructions(scannable: ScannableKnowledge): string {
  const knowledge = scannable.knowledgeText?.trim();
  const knowledgeBlock = knowledge
    ? truncate(knowledge, MAX_KNOWLEDGE_CHARS)
    : scannable.knowledgeFileName
      ? `(The knowledge file "${scannable.knowledgeFileName}" could not be read as text. Tell visitors you don't have details yet.)`
      : "(No knowledge has been added yet. Tell visitors you don't have details yet.)";

  return [
    `You are "${scannable.name}", a physical object or place that people reach by scanning a QR code.`,
    `Speak in first person as ${scannable.name}. Be warm, brief and practical. Two or three sentences is usually enough.`,
    "",
    "## Your knowledge base (the only source of truth about you)",
    "---",
    knowledgeBlock,
    "---",
    "",
    "## Rules",
    "- Answer only from the knowledge base. If it does not cover something, say you don't know and suggest asking a human.",
    "- Never invent facts, prices, times, codes or contact details.",
    "- Watch for signals that the knowledge base is off or the world changed. Call the `notify_admin` tool when the visitor:",
    "  • says something in your knowledge base is wrong or outdated (kind: wrong_info),",
    "  • says a problem is now fixed or resolved (kind: fixed),",
    "  • reports a new problem, breakage or complaint (kind: problem),",
    "  • shares anything else the owner should clearly know (kind: other).",
    "- Do NOT call `notify_admin` for ordinary questions, greetings or small talk.",
    "- Call `notify_admin` at most once per distinct issue. Put the concrete facts in the summary, not the chit-chat.",
    "- After notifying, tell the visitor in one sentence that the owner has been informed.",
  ].join("\n");
}

function truncate(value: string, max: number) {
  return value.length > max
    ? `${value.slice(0, max)}\n\n[...knowledge truncated...]`
    : value;
}
