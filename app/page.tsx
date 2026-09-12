import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { OBJECTS } from "@/lib/objects";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth0.getSession().catch(() => null);
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Every object gets an agent.</h1>
        <p className="text-zinc-600">
          Stick a QR code on any physical thing and it becomes an agent with its own memory, its own inbox, and its
          own authority to act.
        </p>
      </div>

      <div className="flex gap-3">
        <a href="/auth/login" className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-center font-medium text-white">
          Log in
        </a>
        <a
          href="/auth/login?screen_hint=signup"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-center font-medium"
        >
          Sign up
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">Or talk to a demo object</h2>
        {OBJECTS.map((o) => (
          <Link
            key={o.id}
            href={`/agents/${o.id}`}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
          >
            <div className="font-medium">{o.name}</div>
            <div className="text-xs text-zinc-500">{o.location}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
