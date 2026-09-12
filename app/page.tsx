import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { AppHeader } from "./components/brand";

export default async function Home() {
  const session = await auth0.getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px] rounded-2xl border border-white/[0.1] bg-[#222226] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Welcome
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Sign in to scannable
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Continue to your agents dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <a
              href="/auth/login"
              className="flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-medium text-[#17171a] transition-colors hover:bg-zinc-200"
            >
              Log in
            </a>
            <a
              href="/auth/login?screen_hint=signup"
              className="flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.05]"
            >
              Sign up
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
