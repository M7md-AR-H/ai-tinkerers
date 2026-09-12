// Owner-only functions are called from the Next.js server after it checks the Auth0 session.
export function assertServer(secret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected) throw new Error("CONVEX_SERVER_SECRET is not set on the Convex deployment.");
  if (secret !== expected) throw new Error("Unauthorized");
}
