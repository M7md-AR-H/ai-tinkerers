import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { ensureConvexUser, listScannables, type ScannableRow } from "@/lib/convex-server";
import { OBJECTS } from "@/lib/objects";
import { loadMemory } from "@/lib/memory";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth0.getSession().catch(() => null);
  if (!session) redirect("/auth/login?returnTo=/dashboard");
  const { user } = session;

  let scannables: ScannableRow[] = [];
  let convexError: string | null = null;
  try {
    await ensureConvexUser({ sub: user.sub, email: user.email, name: user.name });
    scannables = await listScannables(user.sub);
  } catch (err) {
    convexError = err instanceof Error ? err.message : String(err);
  }

  const builtins = await Promise.all(
    OBJECTS.map(async (o) => {
      const memory = await loadMemory(o.id);
      return { id: o.id, name: o.name, location: o.location, facts: memory.facts.length, lastEvent: memory.log[0] ?? null };
    })
  );

  return (
    <DashboardClient
      user={{ name: user.name ?? user.email ?? "You", email: user.email, picture: user.picture }}
      scannables={scannables}
      builtins={builtins}
      convexError={convexError}
      publicUrl={process.env.PUBLIC_URL ?? ""}
    />
  );
}
