import type { User } from "@auth0/nextjs-auth0/types";

function initialsFor(user: User) {
  const source = user.name || user.email || user.nickname || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function UserIcon({ user }: { user: User }) {
  const label = user.name || user.email || "Signed-in user";
  const initials = initialsFor(user);

  return (
    <details className="relative">
      <summary
        aria-label={label}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xs font-medium text-foreground outline-none ring-1 ring-white/10 marker:hidden [&::-webkit-details-marker]:hidden"
      >
        {user.picture ? (
          // Auth0 avatars can come from many identity providers.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.picture}
            alt={label}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{initials}</span>
        )}
      </summary>
      <div className="absolute right-0 mt-2 min-w-44 rounded-xl border border-border bg-surface-2 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
        <p className="truncate px-2.5 py-2 text-xs text-muted">{label}</p>
        <a
          href="/auth/logout"
          className="block rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-white/[0.06]"
        >
          Log out
        </a>
      </div>
    </details>
  );
}
