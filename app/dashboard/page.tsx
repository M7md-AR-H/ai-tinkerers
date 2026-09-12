import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { ensureConvexUser } from "@/lib/convex-server";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/auth/login?returnTo=/dashboard");
  }

  const ownerId = await ensureConvexUser(session.user);

  return <DashboardClient user={session.user} ownerId={ownerId} />;
}
