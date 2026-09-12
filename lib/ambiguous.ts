const BASE = "https://app.ambiguous.ai";

// Each object is its own Ambiguous agent; sending with its key sends from its own address.
function agentKey(objectId: string) {
  return process.env[`AMBIGUOUS_AGENT_KEY_${objectId.toUpperCase()}`];
}

export async function sendFromObject(objectId: string, to: string, subject: string, body: string) {
  const key = agentKey(objectId);
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
