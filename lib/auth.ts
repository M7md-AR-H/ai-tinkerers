import { auth0 } from "./auth0";

const STAFF = new Set(
  (process.env.STAFF_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export async function getUser(): Promise<{ email?: string; canSpend: boolean }> {
  const session = await auth0.getSession().catch(() => null);
  const email = session?.user?.email as string | undefined;
  return { email, canSpend: !!email && STAFF.has(email.toLowerCase()) };
}
