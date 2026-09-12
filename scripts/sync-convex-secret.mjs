// Copies CONVEX_SERVER_SECRET from .env.local onto your Convex deployment.
// Run once after `npx convex dev` has created the deployment: npm run convex:secret
import { spawnSync } from "node:child_process";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const secret = process.env.CONVEX_SERVER_SECRET;
if (!secret) {
  console.error("CONVEX_SERVER_SECRET is missing from .env.local.");
  process.exit(1);
}

const result = spawnSync("npx", ["convex", "env", "set", "CONVEX_SERVER_SECRET", secret], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
