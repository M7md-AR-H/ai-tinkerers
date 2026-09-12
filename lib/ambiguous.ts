const BASE = "https://app.ambiguous.ai";

// Built-in objects keep their agent keys in env. Dashboard-made agents pass their own key (stored in Convex).
// Anything without a key of its own sends with the workspace key.
function senderKey(objectId: string) {
  return process.env[`AMBIGUOUS_AGENT_KEY_${objectId.toUpperCase()}`] || process.env.AMBIGUOUS_API_KEY;
}

export async function sendFromObject(objectId: string, to: string, subject: string, body: string, agentKey?: string) {
  const key = agentKey || senderKey(objectId);
  if (!key) {
    console.log(`[ambiguous stub] ${objectId} -> ${to}: ${subject}\n${body}`);
    return { ok: true, stub: true };
  }

  try {
    const res = await fetch(`${BASE}/api/mail/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [to], subject, body_markdown: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[ambiguous] ${objectId} send failed ${res.status}`, data);
      return { ok: false, error: `Ambiguous returned ${res.status}` };
    }
    return { ok: true, id: data.id as string | undefined, status: data.status as string | undefined };
  } catch (err) {
    console.error(`[ambiguous] ${objectId} send error`, err);
    return { ok: false, error: String(err) };
  }
}

// Gives a new agent its own Ambiguous identity and email address. Returns null on failure so creation never blocks.
export async function provisionAgent(displayName: string): Promise<{ email: string; apiKey: string } | null> {
  const admin = process.env.AMBIGUOUS_API_KEY;
  if (!admin) return null;
  try {
    const res = await fetch(`${BASE}/api/admin/users/provision-agent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName, role: "member" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.api_key || !data.user?.workspace_email) {
      console.error(`[ambiguous] provisioning "${displayName}" failed ${res.status}`, data.error ?? data.message ?? "");
      return null;
    }
    return { email: data.user.workspace_email as string, apiKey: data.api_key as string };
  } catch (err) {
    console.error(`[ambiguous] provisioning "${displayName}" error`, err);
    return null;
  }
}
