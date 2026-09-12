"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ScannableRow } from "@/lib/convex-server";
import CreateScannableDialog from "./create-scannable-dialog";
import PhotoScannableDialog from "./photo-scannable-dialog";
import ShareScannableDialog from "./share-scannable-dialog";
import DeleteScannableDialog from "./delete-scannable-dialog";

type Builtin = { id: string; name: string; location: string; facts: number; lastEvent: { at: string; event: string } | null };
type ShareTarget = { id: string; name: string; email?: string | null };

type Props = {
  user: { name: string; email?: string; picture?: string };
  scannables: ScannableRow[];
  builtins: Builtin[];
  convexError: string | null;
  publicUrl: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 ${danger ? "text-red-600" : ""}`}
    >
      {children}
    </button>
  );
}

export default function DashboardClient({ user, scannables, builtins, convexError, publicUrl }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editing, setEditing] = useState<ScannableRow | null>(null);
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const [deleting, setDeleting] = useState<ScannableRow | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    if (!convexError && scannables.length === 0) setCreateOpen(true);
    // Only on first load: an empty dashboard opens "create" once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <Link href="/dashboard" className="font-semibold">
          Every Object Gets an Agent
        </Link>
        <div className="relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            aria-label="Account"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-zinc-900 text-sm font-medium text-white"
          >
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(user.name)
            )}
          </button>
          {userMenu && (
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg">
              <div className="px-2 py-1 font-medium">{user.name}</div>
              {user.email && <div className="truncate px-2 pb-2 text-zinc-500">{user.email}</div>}
              <a href="/auth/logout" className="block rounded px-2 py-1.5 hover:bg-zinc-100">
                Log out
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Your scannables</h1>
              <p className="text-sm text-zinc-500">Objects and places you&apos;ve given a voice and an inbox.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPhotoOpen(true)}
                disabled={!!convexError}
                className="h-9 rounded-full border border-zinc-300 bg-white px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40"
              >
                From photo
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                disabled={!!convexError}
                aria-label="Create scannable"
                className="h-9 w-9 rounded-full bg-zinc-900 text-xl leading-none text-white disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {convexError ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Convex isn&apos;t reachable: {convexError}
            </div>
          ) : scannables.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              Nothing yet. Tap + or From photo to create your first scannable.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Inbox</th>
                    <th className="px-3 py-2 font-medium">Knowledge</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {scannables.map((s) => (
                    <tr key={s._id} className="border-t border-zinc-100">
                      <td className="px-3 py-2">
                        <Link href={`/agents/${s._id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.ambiguousEmail ? (
                          <span className="font-mono">{s.ambiguousEmail}</span>
                        ) : (
                          <span className="text-zinc-400">workspace</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {s.fileUrl ? (
                          <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                            {s.knowledgeFileName ?? "file"}
                          </a>
                        ) : (
                          <span className="text-zinc-400">None</span>
                        )}
                        {s.knowledgeFileName?.toLowerCase().endsWith(".pdf") && (
                          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">not read</span>
                        )}
                      </td>
                      <td className="relative px-3 py-2 text-right">
                        <button
                          onClick={() => setMenuFor(menuFor === s._id ? null : s._id)}
                          aria-label="Actions"
                          className="rounded px-2 hover:bg-zinc-100"
                        >
                          ⋯
                        </button>
                        {menuFor === s._id && (
                          <div className="absolute right-3 z-10 mt-1 w-32 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                            <MenuItem onClick={() => { setEditing(s); setMenuFor(null); }}>Edit</MenuItem>
                            <MenuItem onClick={() => { setSharing({ id: s._id, name: s.name, email: s.ambiguousEmail }); setMenuFor(null); }}>Share</MenuItem>
                            <MenuItem danger onClick={() => { setDeleting(s); setMenuFor(null); }}>Delete</MenuItem>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Built-in demo objects</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Each has its own memory, its own email inbox, and books its own maintenance.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {builtins.map((b) => (
              <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-zinc-500">{b.location}</div>
                </div>
                <div className="text-xs text-zinc-600">
                  {b.facts} facts{b.lastEvent && <> · last: {b.lastEvent.event}</>}
                </div>
                <div className="mt-auto flex gap-2">
                  <Link href={`/agents/${b.id}`} className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-50">
                    Open
                  </Link>
                  <button
                    onClick={() => setSharing({ id: b.id, name: b.name })}
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-50"
                  >
                    Share
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <CreateScannableDialog
        key={editing?._id ?? (createOpen ? "new" : "closed")}
        open={createOpen || !!editing}
        editing={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onUsePhoto={() => {
          setCreateOpen(false);
          setPhotoOpen(true);
        }}
      />
      <PhotoScannableDialog
        key={photoOpen ? "photo-open" : "photo-closed"}
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onCreated={(agent) => {
          setPhotoOpen(false);
          setSharing(agent);
        }}
      />
      <ShareScannableDialog target={sharing} publicUrl={publicUrl} onClose={() => setSharing(null)} />
      <DeleteScannableDialog target={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
