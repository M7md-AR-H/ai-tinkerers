// Server-side only: reads AMBIGUOUS_API_KEY / ADMIN_EMAIL. Import from route handlers.
// Override AMBIGUOUS_API_URL if `npx ambiguous whoami --json` reports a different apiUrl.
const AMBIGUOUS_ORIGIN = (process.env.AMBIGUOUS_API_URL ?? "https://app.ambiguous.ai").replace(/\/$/, "");
const AMBIGUOUS_API = `${AMBIGUOUS_ORIGIN}/api`;

export type AdminAlertKind = "wrong_info" | "fixed" | "problem" | "other";

export const ADMIN_ALERT_LABEL: Record<AdminAlertKind, string> = {
  wrong_info: "Knowledge base is wrong",
  fixed: "Issue fixed",
  problem: "New problem reported",
  other: "Heads-up",
};

export type AdminAlert = {
  kind: AdminAlertKind;
  scannableId: string;
  scannableName: string;
  summary: string;
  details?: string;
  channel: "chat" | "voice";
};

export type AdminAlertResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/** Extra lines appended to the alert email once the task workflow has run. */
export type AdminAlertExtras = {
  /** Human sentence describing what happened on the task board, e.g. "Opened task WS-12". */
  outcome?: string;
  taskUrl?: string;
};

type Credentials = { apiKey: string; adminEmail: string };

function credentials(): Credentials | { error: string } {
  const apiKey = process.env.AMBIGUOUS_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey) return { error: "AMBIGUOUS_API_KEY is not set" };
  if (!adminEmail) return { error: "ADMIN_EMAIL is not set" };
  return { apiKey, adminEmail };
}

function authHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "API-Version": "1",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

/**
 * Email the admin through their Ambiguous agent.
 * Ambiguous renders body_markdown into a formatted HTML email.
 */
export async function sendAdminAlert(
  alert: AdminAlert,
  extras: AdminAlertExtras = {},
): Promise<AdminAlertResult> {
  const creds = credentials();
  if ("error" in creds) return { ok: false, error: creds.error };
  const { apiKey, adminEmail } = creds;

  const agentUrl = appAgentUrl(alert.scannableId);
  const label = ADMIN_ALERT_LABEL[alert.kind];

  const subject = `[${alert.scannableName}] ${label}: ${truncate(alert.summary, 70)}`;

  const body_markdown = [
    `# ${label}`,
    "",
    `**Agent:** ${alert.scannableName}`,
    `**Reported via:** ${alert.channel === "voice" ? "Talk (voice)" : "Chat"}`,
    `**When:** ${new Date().toISOString()}`,
    "",
    "## What the visitor said",
    "",
    alert.summary,
    ...(alert.details ? ["", "## Details", "", alert.details] : []),
    ...(extras.outcome || extras.taskUrl
      ? [
          "",
          "## Task board",
          "",
          ...(extras.outcome ? [extras.outcome] : []),
          ...(extras.taskUrl ? [`[Open the task](${extras.taskUrl})`] : []),
        ]
      : []),
    ...(agentUrl ? ["", `[Open this agent](${agentUrl})`] : []),
    "",
    "_Sent automatically by the AI Tinkerers agent brain._",
  ].join("\n");

  try {
    const response = await fetch(`${AMBIGUOUS_API}/mail/send`, {
      method: "POST",
      headers: authHeaders(apiKey, { "Idempotency-Key": crypto.randomUUID() }),
      body: JSON.stringify({
        to: [adminEmail],
        subject,
        body_markdown,
        labels: ["ai-tinkerers"],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let hint = "";
      if (response.status === 401 || response.status === 403) {
        hint = await diagnoseKey(apiKey);
      }
      const error = `Ambiguous mail/send failed (${response.status}): ${truncate(text, 300)}${hint}`;
      console.error("[ambiguous]", error);
      return { ok: false, error };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    console.info(`[ambiguous] admin alert sent (${alert.kind}) id=${data.id ?? "?"} → ${adminEmail}`);
    return { ok: true, id: data.id };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Unknown error contacting Ambiguous";
    console.error("[ambiguous]", error);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Tasks — one ticket per real-world issue, so reports don't drown in email.
// ---------------------------------------------------------------------------

export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled" | "blocked";

export type AmbiguousTask = {
  id: string;
  key?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  url: string;
  updatedAt?: string;
};

export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: string };

const OPEN_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];

/** Title prefix that ties tasks to a scannable so we can find them again. */
export function taskTitlePrefix(scannableName: string) {
  return `[${scannableName}]`;
}

export async function listOpenTasksFor(scannableName: string): Promise<TaskResult<AmbiguousTask[]>> {
  const creds = credentials();
  if ("error" in creds) return { ok: false, error: creds.error };

  const params = new URLSearchParams({
    q: taskTitlePrefix(scannableName),
    limit: "20",
    sort: "updated_at",
  });

  try {
    const response = await fetch(`${AMBIGUOUS_API}/tasks?${params}`, {
      headers: authHeaders(creds.apiKey),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `Ambiguous tasks list failed (${response.status}): ${truncate(text, 200)}` };
    }
    const data = (await response.json()) as { data?: RawTask[] };
    const tasks = (data.data ?? [])
      .map(toTask)
      .filter((task) => OPEN_STATUSES.includes(task.status))
      // `q` is fuzzy; keep only tasks that really carry our prefix.
      .filter((task) => task.title.startsWith(taskTitlePrefix(scannableName)));
    return { ok: true, value: tasks };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown error contacting Ambiguous" };
  }
}

export async function createTask(input: {
  title: string;
  description: string;
  priority: TaskPriority;
}): Promise<TaskResult<AmbiguousTask>> {
  const creds = credentials();
  if ("error" in creds) return { ok: false, error: creds.error };

  try {
    const response = await fetch(`${AMBIGUOUS_API}/tasks`, {
      method: "POST",
      headers: authHeaders(creds.apiKey),
      body: JSON.stringify({
        title: truncate(input.title, 255),
        description: input.description,
        priority: input.priority,
        status: "todo",
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `Ambiguous tasks create failed (${response.status}): ${truncate(text, 200)}` };
    }
    const data = (await response.json()) as { task?: RawTask };
    if (!data.task) return { ok: false, error: "Ambiguous returned no task" };
    const task = toTask(data.task);
    console.info(`[ambiguous] task created ${task.key ?? task.id} (${task.priority})`);
    return { ok: true, value: task };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown error contacting Ambiguous" };
  }
}

export async function updateTask(
  id: string,
  patch: { status?: TaskStatus; priority?: TaskPriority },
): Promise<TaskResult<AmbiguousTask>> {
  const creds = credentials();
  if ("error" in creds) return { ok: false, error: creds.error };

  try {
    const response = await fetch(`${AMBIGUOUS_API}/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(creds.apiKey),
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `Ambiguous tasks update failed (${response.status}): ${truncate(text, 200)}` };
    }
    const data = (await response.json()) as { task?: RawTask };
    if (!data.task) return { ok: false, error: "Ambiguous returned no task" };
    console.info(`[ambiguous] task ${id} updated ${JSON.stringify(patch)}`);
    return { ok: true, value: toTask(data.task) };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown error contacting Ambiguous" };
  }
}

export async function commentOnTask(id: string, contentMarkdown: string): Promise<TaskResult<null>> {
  const creds = credentials();
  if ("error" in creds) return { ok: false, error: creds.error };

  try {
    const response = await fetch(`${AMBIGUOUS_API}/tasks/${encodeURIComponent(id)}/comments`, {
      method: "POST",
      headers: authHeaders(creds.apiKey),
      body: JSON.stringify({ content: contentMarkdown }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `Ambiguous task comment failed (${response.status}): ${truncate(text, 200)}` };
    }
    return { ok: true, value: null };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown error contacting Ambiguous" };
  }
}

type RawTask = {
  id: string;
  task_key?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  updated_at?: string;
};

function toTask(raw: RawTask): AmbiguousTask {
  return {
    id: raw.id,
    key: raw.task_key ?? undefined,
    title: raw.title,
    description: raw.description ?? undefined,
    status: raw.status,
    priority: raw.priority,
    url: `${AMBIGUOUS_ORIGIN}/tasks/${raw.id}`,
    updatedAt: raw.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function appAgentUrl(scannableId: string): string | null {
  const appBase = process.env.APP_BASE_URL ?? process.env.PUBLIC_URL ?? "";
  return appBase ? `${appBase.replace(/\/$/, "")}/agents/${scannableId}` : null;
}

/** Tells apart "key is invalid" from "key is valid but lacks mail permission". */
async function diagnoseKey(apiKey: string): Promise<string> {
  try {
    const me = await fetch(`${AMBIGUOUS_API}/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}`, "API-Version": "1" },
    });
    if (me.ok) {
      const data = (await me.json().catch(() => ({}))) as {
        email?: string;
        display_name?: string;
        role?: string;
      };
      return ` | key is valid for ${data.display_name ?? data.email ?? "an account"} (role: ${data.role ?? "?"}) but cannot send mail — check the key's permissions/scopes in Ambiguous workspace settings`;
    }
    return ` | users/me also returned ${me.status}: the key itself is rejected at ${AMBIGUOUS_API} (revoked, wrong workspace/API origin, or not an agent key). Run \`npx ambiguous@latest whoami --json\` and set AMBIGUOUS_API_URL to its apiUrl if different.`;
  } catch {
    return "";
  }
}

function truncate(value: string, max: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
