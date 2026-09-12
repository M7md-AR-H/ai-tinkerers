"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { ScannableRow } from "@/lib/convex-server";
import CreateScannableDialog from "./create-scannable-dialog";
import PhotoScannableDialog from "./photo-scannable-dialog";
import ShareScannableDialog from "./share-scannable-dialog";
import DeleteScannableDialog from "./delete-scannable-dialog";
import {
  CameraIcon,
  ChatIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  LogOutIcon,
  LogoMark,
  MailIcon,
  MoreIcon,
  PencilIcon,
  QrIcon,
  SparklesIcon,
  TrashIcon,
} from "./icons";
import { btnPrimary, btnSecondary } from "./ui";

type Builtin = { id: string; name: string; location: string; facts: number; lastEvent: { at: string; event: string } | null };
type ShareTarget = { id: string; name: string; email?: string | null };

type Props = {
  user: { name: string; email?: string; picture?: string };
  scannables: ScannableRow[];
  builtins: Builtin[];
  convexError: string | null;
  publicUrl: string;
};

const AVATAR_COLORS = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${colorFor(name)} text-sm font-semibold text-white shadow-sm`}
    >
      {initials(name)}
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy address"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group/copy flex min-w-0 items-center gap-1.5 text-left"
    >
      <span className="truncate font-mono text-xs text-zinc-700">{text}</span>
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover/copy:text-zinc-700" />
      )}
    </button>
  );
}

function KnowledgeStatus({ s }: { s: ScannableRow }) {
  if (!s.knowledgeFileName) return <span className="text-zinc-400">No knowledge yet</span>;
  const isPdf = s.knowledgeFileName.toLowerCase().endsWith(".pdf");
  return (
    <span className="flex min-w-0 items-center gap-2">
      {s.fileUrl ? (
        <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-zinc-700 hover:underline">
          {s.knowledgeFileName}
        </a>
      ) : (
        <span className="truncate text-zinc-700">{s.knowledgeFileName}</span>
      )}
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isPdf ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {isPdf ? "PDF, not read" : "Readable"}
      </span>
    </span>
  );
}

function MenuItem({ icon, onClick, danger, children }: { icon: ReactNode; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${danger ? "text-red-600" : "text-zinc-700"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onClick,
  primary,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-4 rounded-2xl p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "bg-white text-zinc-900 shadow-lg hover:-translate-y-0.5 hover:shadow-xl" : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary ? "bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white" : "bg-white/15"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className={`block text-sm ${primary ? "text-zinc-500" : "text-white/75"}`}>{subtitle}</span>
      </span>
    </button>
  );
}

function CardActions({ id, onShare }: { id: string; onShare: () => void }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Link href={`/agents/${id}`} className={`${btnSecondary} px-3 py-2`}>
        <ChatIcon className="h-4 w-4" />
        Talk to it
      </Link>
      <button onClick={onShare} className={`${btnPrimary} px-3 py-2`}>
        <QrIcon className="h-4 w-4" />
        QR code
      </button>
    </div>
  );
}

function AgentCard({ s, onShare, onEdit, onDelete }: { s: ScannableRow; onShare: () => void; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={s.name} />
        <div className="min-w-0 flex-1">
          <Link href={`/agents/${s._id}`} className="block truncate font-semibold hover:underline">
            {s.name}
          </Link>
          <p className="text-xs text-zinc-500">
            Created {new Date(s._creationTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} aria-label="More actions" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <MoreIcon className="h-5 w-5" />
          </button>
          {menu && (
            <>
              <button aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                <MenuItem icon={<PencilIcon className="h-4 w-4" />} onClick={() => { setMenu(false); onEdit(); }}>
                  Edit
                </MenuItem>
                <MenuItem icon={<TrashIcon className="h-4 w-4" />} danger onClick={() => { setMenu(false); onDelete(); }}>
                  Delete
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <MailIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          {s.ambiguousEmail ? <CopyText text={s.ambiguousEmail} /> : <span className="text-zinc-400">Shared workspace inbox</span>}
        </div>
        <div className="flex items-center gap-2">
          <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          <KnowledgeStatus s={s} />
        </div>
      </div>

      <CardActions id={s._id} onShare={onShare} />
    </div>
  );
}

function DemoCard({ b, onShare }: { b: Builtin; onShare: () => void }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={b.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/agents/${b.id}`} className="truncate font-semibold hover:underline">
              {b.name}
            </Link>
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Demo</span>
          </div>
          <p className="truncate text-xs text-zinc-500">{b.location}</p>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm text-zinc-600">
        <p>
          Remembers <span className="font-medium text-zinc-900">{b.facts}</span> {b.facts === 1 ? "fact" : "facts"}
        </p>
        {b.lastEvent && <p className="truncate text-xs text-zinc-500">Latest: {b.lastEvent.event}</p>}
      </div>
      <CardActions id={b.id} onShare={onShare} />
    </div>
  );
}

function SetupCallout({ error }: { error: string }) {
  const code = "rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-xs";
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-semibold">Your agents&apos; database isn&apos;t connected yet</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Run <code className={code}>npx convex dev</code> once and log in.
        </li>
        <li>
          Run <code className={code}>npm run convex:secret</code>.
        </li>
        <li>
          Start the app with <code className={code}>npm run dev:all</code> and refresh this page.
        </li>
      </ol>
      <p className="mt-3 break-words font-mono text-xs text-amber-700/80">{error}</p>
    </div>
  );
}

export default function DashboardClient({ user, scannables, builtins, convexError, publicUrl }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editing, setEditing] = useState<ScannableRow | null>(null);
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const [deleting, setDeleting] = useState<ScannableRow | null>(null);
  const [userMenu, setUserMenu] = useState(false);

  const firstName = user.name.split(/\s+/)[0];
  const blocked = !!convexError;

  return (
    <div className="flex-1 bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <LogoMark />
            <span>Scannable</span>
          </Link>
          <div className="relative">
            <button
              onClick={() => setUserMenu((v) => !v)}
              aria-label="Account"
              className="flex items-center gap-2 rounded-full p-0.5 pr-3 hover:bg-zinc-100"
            >
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-900 text-xs font-medium text-white">
                {user.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(user.name)
                )}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{firstName}</span>
            </button>
            {userMenu && (
              <>
                <button aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <div className="truncate text-sm font-medium">{user.name}</div>
                    {user.email && <div className="truncate text-xs text-zinc-500">{user.email}</div>}
                  </div>
                  <a href="/auth/logout" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50">
                    <LogOutIcon className="h-4 w-4" />
                    Log out
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8">
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/30 blur-3xl" />
          <div className="relative">
            <p className="text-sm font-medium text-white/80">Welcome back, {firstName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Give something a voice</h1>
            <p className="mt-2 max-w-xl text-white/80">
              Snap a photo of any object and it becomes an agent with its own memory, its own inbox and a QR code to
              stick on it.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ActionTile
                primary
                icon={<CameraIcon className="h-5 w-5" />}
                title="Snap a photo"
                subtitle="We'll identify it and ask a few questions"
                onClick={() => setPhotoOpen(true)}
                disabled={blocked}
              />
              <ActionTile
                icon={<FileIcon className="h-5 w-5" />}
                title="Upload a knowledge file"
                subtitle="A .txt or .md it can answer from"
                onClick={() => setCreateOpen(true)}
                disabled={blocked}
              />
            </div>
          </div>
        </section>

        {convexError && <SetupCallout error={convexError} />}

        {!convexError && (
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                Your agents
                <span className="rounded-full bg-zinc-200/70 px-2 py-0.5 text-xs font-medium text-zinc-600">{scannables.length}</span>
              </h2>
              <p className="text-sm text-zinc-500">Talk to an agent, or show its QR code to stick on the real thing.</p>
            </div>

            {scannables.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <SparklesIcon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 font-semibold">No agents yet</h3>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  Point your camera at a printer, a plant, a meeting room, anything. It gets its own voice, memory and inbox.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button onClick={() => setPhotoOpen(true)} className={btnPrimary}>
                    <CameraIcon className="h-4 w-4" />
                    Snap a photo
                  </button>
                  <button onClick={() => setCreateOpen(true)} className={btnSecondary}>
                    <FileIcon className="h-4 w-4" />
                    Upload a file
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {scannables.map((s) => (
                  <AgentCard
                    key={s._id}
                    s={s}
                    onShare={() => setSharing({ id: s._id, name: s.name, email: s.ambiguousEmail })}
                    onEdit={() => setEditing(s)}
                    onDelete={() => setDeleting(s)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Demo objects</h2>
            <p className="text-sm text-zinc-500">
              Built in. They remember what visitors tell them, email from their own inbox and book their own maintenance.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {builtins.map((b) => (
              <DemoCard key={b.id} b={b} onShare={() => setSharing({ id: b.id, name: b.name })} />
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
