// One-time: gives each object its own Ambiguous agent identity + email address.
// Usage (PowerShell, project root): node scripts/provision-ambiguous.mjs
// Needs AMBIGUOUS_API_KEY (admin) in .env.local. Appends AMBIGUOUS_AGENT_KEY_<ID> lines; safe to re-run.
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
try {
  process.loadEnvFile(envPath);
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

const admin = process.env.AMBIGUOUS_API_KEY;
if (!admin) {
  console.error("Set AMBIGUOUS_API_KEY in .env.local first.");
  process.exit(1);
}

const objects = [
  ["projector", "Main Hall Projector"],
  ["coffee", "Lobby Coffee Machine"],
  ["room", "Meeting Room 2 Door"],
];

let append = "";
for (const [id, name] of objects) {
  const envName = `AMBIGUOUS_AGENT_KEY_${id.toUpperCase()}`;
  if (process.env[envName]) {
    console.log(`${id}: already provisioned, skipping`);
    continue;
  }
  const res = await fetch("https://app.ambiguous.ai/api/admin/users/provision-agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: name, role: "member" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.api_key) {
    console.error(`${id}: failed (${res.status}) ${data.error ?? data.message ?? ""}`);
    continue;
  }
  append += `${envName}=${data.api_key}\n`;
  console.log(`${id}: ${data.user?.workspace_email ?? "(no email in response)"}`);
}

if (append) {
  fs.appendFileSync(envPath, `\n${append}`);
  console.log("Agent keys written to .env.local");
}
