// Server-side only: reads AMBIGUOUS_API_KEY / ADMIN_EMAIL. Import from route handlers.
// Override AMBIGUOUS_API_URL if `npx ambiguous whoami --json` reports a different apiUrl.
const AMBIGUOUS_API = `${(process.env.AMBIGUOUS_API_URL ?? "https://app.ambiguous.ai").replace(/\/$/, "")}/api`;

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

/**
 * Email the admin through their Ambiguous agent.
 * Ambiguous renders body_markdown into a formatted HTML email.
 */
export async function sendAdminAlert(alert: AdminAlert): Promise<AdminAlertResult> {
  const apiKey = process.env.AMBIGUOUS_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!apiKey) return { ok: false, error: "AMBIGUOUS_API_KEY is not set" };
  if (!adminEmail) return { ok: false, error: "ADMIN_EMAIL is not set" };

  const appBase = process.env.APP_BASE_URL ?? process.env.PUBLIC_URL ?? "";
  const agentUrl = appBase ? `${appBase.replace(/\/$/, "")}/agents/${alert.scannableId}` : null;
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
    ...(agentUrl ? ["", `[Open this agent](${agentUrl})`] : []),
    "",
    "_Sent automatically by the AI Tinkerers agent brain._",
  ].join("\n");

  try {
    const response = await fetch(`${AMBIGUOUS_API}/mail/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "API-Version": "1",
        "Idempotency-Key": crypto.randomUUID(),
      },
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
