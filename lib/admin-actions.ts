// Server-side only. The "back office" half of the agent brain:
// a visitor report comes in → we look at the owner's open tasks for this
// scannable → a small LLM call decides whether it is new, a repeat, or a fix
// → we act on the Ambiguous task board → we email the owner what happened.
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  ADMIN_ALERT_LABEL,
  appAgentUrl,
  commentOnTask,
  createTask,
  listOpenTasksFor,
  sendAdminAlert,
  taskTitlePrefix,
  updateTask,
  type AdminAlert,
  type AmbiguousTask,
  type TaskPriority,
} from "./ambiguous";
import { createChatModel } from "./llm";

export type TaskAction = "created" | "commented" | "resolved" | "none";

export type VisitorReportOutcome = {
  /** Did the owner get an email? */
  emailed: boolean;
  emailError?: string;
  /** What happened on the task board. */
  taskAction: TaskAction;
  taskKey?: string;
  taskUrl?: string;
  taskError?: string;
  /** One sentence the agent can relay to the visitor. */
  visitorMessage: string;
};

const PRIORITY_BY_KIND: Record<AdminAlert["kind"], TaskPriority> = {
  problem: "high",
  wrong_info: "medium",
  other: "medium",
  fixed: "low",
};

const triageSchema = z.object({
  decision: z
    .enum(["new", "duplicate", "resolves", "unrelated"])
    .describe(
      "new = nothing similar is open; duplicate = same issue as an open task; resolves = the visitor says an open task's issue is now fixed; unrelated = this is a fix report but no open task matches.",
    ),
  taskId: z
    .string()
    .nullable()
    .describe("The id of the matching open task for duplicate/resolves, otherwise null."),
  reason: z.string().max(200).describe("One short sentence explaining the decision."),
});

type Triage = z.infer<typeof triageSchema>;

/**
 * Handle a report from a visitor end to end. Never throws: every failure is
 * folded into the returned outcome so the agent can tell the visitor what
 * actually happened.
 */
export async function handleVisitorReport(alert: AdminAlert): Promise<VisitorReportOutcome> {
  const outcome: VisitorReportOutcome = {
    emailed: false,
    taskAction: "none",
    visitorMessage: "",
  };

  // 1. Look at what the owner already has open for this object.
  const open = await listOpenTasksFor(alert.scannableName);
  const openTasks = open.ok ? open.value : [];
  if (!open.ok) outcome.taskError = open.error;

  // 2. Decide what to do with the task board (cheap heuristics first, LLM only when needed).
  const triage = await triageReport(alert, openTasks);

  // 3. Act.
  let extrasOutcome: string | undefined;
  if (triage.decision === "resolves" && triage.taskId) {
    const task = openTasks.find((t) => t.id === triage.taskId);
    const patched = await updateTask(triage.taskId, { status: "done" });
    if (patched.ok) {
      await commentOnTask(triage.taskId, reportComment(alert, "Visitor reports this is fixed"));
      outcome.taskAction = "resolved";
      outcome.taskKey = patched.value.key ?? task?.key;
      outcome.taskUrl = patched.value.url;
      extrasOutcome = `Marked task ${labelFor(patched.value)} as done — ${triage.reason}`;
    } else {
      outcome.taskError = patched.error;
    }
  } else if (triage.decision === "duplicate" && triage.taskId) {
    const task = openTasks.find((t) => t.id === triage.taskId);
    const commented = await commentOnTask(
      triage.taskId,
      reportComment(alert, "Reported again by another visitor"),
    );
    if (commented.ok) {
      // A repeat report is a stronger signal: bump anything below "high".
      if (task && (task.priority === "low" || task.priority === "medium")) {
        await updateTask(triage.taskId, { priority: "high" });
      }
      outcome.taskAction = "commented";
      outcome.taskKey = task?.key;
      outcome.taskUrl = task?.url;
      extrasOutcome = `Added to existing task ${task ? labelFor(task) : triage.taskId} (repeat report) — ${triage.reason}`;
    } else {
      outcome.taskError = commented.error;
    }
  } else if (alert.kind !== "fixed") {
    const created = await createTask({
      title: `${taskTitlePrefix(alert.scannableName)} ${ADMIN_ALERT_LABEL[alert.kind]}: ${alert.summary}`,
      description: taskDescription(alert),
      priority: PRIORITY_BY_KIND[alert.kind],
    });
    if (created.ok) {
      outcome.taskAction = "created";
      outcome.taskKey = created.value.key;
      outcome.taskUrl = created.value.url;
      extrasOutcome = `Opened task ${labelFor(created.value)} (${created.value.priority} priority).`;
    } else {
      outcome.taskError = created.error;
    }
  } else {
    extrasOutcome = "Visitor reports a fix, but no matching open task was found.";
  }

  // 4. Tell the owner.
  const mail = await sendAdminAlert(alert, { outcome: extrasOutcome, taskUrl: outcome.taskUrl });
  outcome.emailed = mail.ok;
  if (!mail.ok) outcome.emailError = mail.error;

  outcome.visitorMessage = describeForVisitor(outcome);
  console.info(
    `[admin-actions] ${alert.kind} via ${alert.channel}: task=${outcome.taskAction}${outcome.taskKey ? ` ${outcome.taskKey}` : ""} emailed=${outcome.emailed}`,
  );
  return outcome;
}

async function triageReport(alert: AdminAlert, openTasks: AmbiguousTask[]): Promise<Triage> {
  if (openTasks.length === 0) {
    return {
      decision: alert.kind === "fixed" ? "unrelated" : "new",
      taskId: null,
      reason: "No open tasks for this object.",
    };
  }

  try {
    const { output } = await generateText({
      model: createChatModel(),
      output: Output.object({ schema: triageSchema, name: "triage" }),
      system: [
        "You triage visitor reports about a physical object against the owner's open task list.",
        "Match on the underlying real-world issue, not on wording. Be conservative: only pick a task when it is clearly the same issue.",
        "If the report says something is fixed/working again and an open task describes that issue, answer `resolves`.",
        "If the report describes an issue that an open task already covers, answer `duplicate`.",
        "If the report says something is fixed but nothing open matches, answer `unrelated`.",
        "Otherwise answer `new`.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `Object: ${alert.scannableName}`,
            `Report kind: ${alert.kind} (${ADMIN_ALERT_LABEL[alert.kind]})`,
            `Report: ${alert.summary}`,
            ...(alert.details ? [`Details: ${alert.details}`] : []),
            "",
            "Open tasks:",
            ...openTasks.map(
              (t) =>
                `- id=${t.id} [${t.status}/${t.priority}] ${t.title}${t.description ? ` — ${t.description.slice(0, 200).replace(/\s+/g, " ")}` : ""}`,
            ),
          ].join("\n"),
        },
      ],
      maxOutputTokens: 200,
    });

    // Guard against hallucinated ids.
    if (output.taskId && !openTasks.some((t) => t.id === output.taskId)) {
      return { decision: alert.kind === "fixed" ? "unrelated" : "new", taskId: null, reason: "No confident match." };
    }
    return output;
  } catch (cause) {
    console.warn("[admin-actions] triage failed, defaulting to new", cause);
    return {
      decision: alert.kind === "fixed" ? "unrelated" : "new",
      taskId: null,
      reason: "Triage unavailable.",
    };
  }
}

function taskDescription(alert: AdminAlert): string {
  const agentUrl = appAgentUrl(alert.scannableId);
  return [
    `**Reported via:** ${alert.channel === "voice" ? "Talk (voice)" : "Chat"}`,
    `**When:** ${new Date().toISOString()}`,
    "",
    "## What the visitor said",
    "",
    alert.summary,
    ...(alert.details ? ["", "## Details", "", alert.details] : []),
    ...(agentUrl ? ["", `[Open this agent](${agentUrl})`] : []),
    "",
    `_scannable:${alert.scannableId}_`,
  ].join("\n");
}

function reportComment(alert: AdminAlert, heading: string): string {
  return [
    `**${heading}** via ${alert.channel === "voice" ? "voice" : "chat"} · ${new Date().toISOString()}`,
    "",
    alert.summary,
    ...(alert.details ? ["", alert.details] : []),
  ].join("\n");
}

function labelFor(task: AmbiguousTask) {
  return task.key ?? task.id;
}

function describeForVisitor(outcome: VisitorReportOutcome): string {
  const parts: string[] = [];
  switch (outcome.taskAction) {
    case "created":
      parts.push("a task has been opened for the owner");
      break;
    case "commented":
      parts.push("this was already on the owner's list and has been flagged again");
      break;
    case "resolved":
      parts.push("the owner's task for this has been marked as done");
      break;
    case "none":
      break;
  }
  if (outcome.emailed) parts.push("the owner has been emailed");
  if (parts.length === 0) {
    return "Neither the task board nor email could be reached. Ask the visitor to tell a human directly.";
  }
  return `${parts.join(" and ")}.`;
}
