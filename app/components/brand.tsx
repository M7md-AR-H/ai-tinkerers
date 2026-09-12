import type { ReactNode } from "react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-[8px] bg-white/[0.08] ring-1 ring-white/10"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
          <rect x="2" y="10.4" width="12" height="2.2" rx="1" opacity="0.35" />
          <rect x="4" y="6.9" width="8" height="2.2" rx="1" opacity="0.65" />
          <rect x="6" y="3.4" width="4" height="2.2" rx="1" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">scannable</span>
    </a>
  );
}

export function AppHeader({
  children,
  trailing,
}: {
  children?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#141416]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          {children}
        </div>
        {trailing ? (
          <div className="flex shrink-0 items-center gap-2">{trailing}</div>
        ) : null}
      </div>
    </header>
  );
}
