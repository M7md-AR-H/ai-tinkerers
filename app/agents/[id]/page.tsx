import Link from "next/link";
import { loadAgentContext } from "@/lib/agent-brain";
import { getUser } from "@/lib/auth";
import AgentClient from "./agent-client";
import AutoRefresh from "./auto-refresh";

// Reads the object's memory file on every render; without this the facts panel never updates.
export const dynamic = "force-dynamic";

function when(at: string) {
  return new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadAgentContext(id);

  if (!ctx) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Agent not found</h1>
        <p className="text-sm text-zinc-500">This QR code doesn&apos;t point to a known object.</p>
        <Link href="/" className="text-sm underline">
          Go home
        </Link>
      </main>
    );
  }

  const obj = ctx.kind === "object" ? ctx.obj : null;
  const user = obj?.canSpend ? await getUser() : null;
  const suggestions = obj
    ? ["What's wrong with you?", "Report a problem", ...(obj.canSpend ? ["Order supplies"] : [])]
    : ["What can you tell me?", "Something here is broken"];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.name}</h1>
          {obj && (
            <p className="text-sm text-zinc-500">
              {obj.location} · {obj.model}
            </p>
          )}
        </div>
        {obj?.canSpend &&
          (user?.email ? (
            <div className="text-right text-xs text-zinc-500">
              Logged in as {user.email}
              <br />
              <a href="/auth/logout" className="underline">
                Log out
              </a>
            </div>
          ) : (
            <a
              href={`/auth/login?returnTo=${encodeURIComponent(`/agents/${id}`)}`}
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-100"
            >
              Staff login
            </a>
          ))}
      </header>

      {ctx.kind === "object" && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">What I know about myself</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {ctx.memory.facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </section>
      )}

      <AgentClient id={id} suggestions={suggestions} />

      {ctx.kind === "object" && ctx.memory.log.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent events</h2>
          <ul className="space-y-1 text-xs text-zinc-600">
            {ctx.memory.log.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="text-zinc-400">{when(e.at)}</span> · {e.event}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx.kind === "object" && <AutoRefresh seconds={5} />}
    </main>
  );
}
