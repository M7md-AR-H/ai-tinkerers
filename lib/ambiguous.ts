const BASE = "https://app.ambiguous.ai";

// Built-in objects are their own Ambiguous agents, so mail comes from their own address.
// Owner-created scannables have no identity of their own and send with the workspace key.
function senderKey(objectId: string) {
  return process.env[`AMBIGUOUS_AGENT_KEY_${objectId.toUpperCase()}`] || process.env.AMBIGUOUS_API_KEY;
}

export async function sendFromObject(objectId: string, to: string, subject: string, body: string) {
  const key = senderKey(objectId);
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
