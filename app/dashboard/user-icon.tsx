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
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-sm font-medium text-zinc-700 outline-none ring-zinc-400 marker:hidden [&::-webkit-details-marker]:hidden dark:bg-zinc-800 dark:text-zinc-200"
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
      <div className="absolute right-0 mt-2 min-w-40 rounded-xl border border-black/[.08] bg-white p-2 shadow-lg dark:border-white/[.145] dark:bg-zinc-950">
        <p className="truncate px-2 py-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          {label}
        </p>
        <a
          href="/auth/logout"
          className="block rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          Log out
        </a>
      </div>
    </details>
  );
}
