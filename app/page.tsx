import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";

export default async function Home() {
  const session = await auth0.getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <main className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">AI Tinkerers</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Sign in to continue to your dashboard.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <a
            href="/auth/login"
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Log in
          </a>
          <a
            href="/auth/login?screen_hint=signup"
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign up
          </a>
        </div>
      </main>
    </div>
  );
}
