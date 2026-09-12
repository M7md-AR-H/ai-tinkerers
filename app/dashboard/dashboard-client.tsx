"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@auth0/nextjs-auth0/types";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CreateScannableDialog,
  type ScannableFormTarget,
} from "./create-scannable-dialog";
import { DeleteScannableDialog } from "./delete-scannable-dialog";
import { ShareScannableDialog } from "./share-scannable-dialog";
import { AppHeader } from "../components/brand";
import { UserIcon } from "./user-icon";

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function ScannableRowMenu({
  name,
  onEdit,
  onShare,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  function close() {
    setOpen(false);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 160;
      setCoords({
        top: rect.bottom + 4,
        left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    function onViewportChange() {
      close();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
      >
        <MoreIcon />
      </button>
      {open && coords ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-40 min-w-40 rounded-xl border border-border bg-surface-2 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ top: coords.top, left: coords.left }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onShare();
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
          >
            Share
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/[0.06]"
          >
            Delete
          </button>
        </div>
      ) : null}
    </>
  );
}

export function DashboardClient({
  user,
  ownerId,
}: {
  user: User;
  ownerId: Id<"users">;
}) {
  const scannables = useQuery(api.scannables.listByOwner, { ownerId });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScannableFormTarget | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    id: Id<"scannables">;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"scannables">;
    name: string;
  } | null>(null);
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (scannables !== undefined && scannables.length === 0 && !didAutoOpen.current) {
      didAutoOpen.current = true;
      setEditTarget(null);
      setDialogOpen(true);
    }
  }, [scannables]);

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function closeForm() {
    setDialogOpen(false);
    setEditTarget(null);
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        trailing={
          <>
            <button
              type="button"
              aria-label="Create a scannable"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-[#17171a] transition-colors hover:bg-zinc-200"
            >
              <PlusIcon />
              <span className="hidden sm:inline">New agent</span>
            </button>
            <UserIcon user={user} />
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 text-sm text-muted">
            Scannable objects tagged to your account
          </p>
        </div>
        {scannables === undefined ? (
          <p className="text-sm text-muted">Loading agents…</p>
        ) : scannables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
            <p className="text-sm text-muted">
              No agents yet. Use New agent to create your first scannable.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#1f1f23] shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-white/[0.03]">
                    <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      Name
                    </th>
                    <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      Knowledge
                    </th>
                    <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      Created
                    </th>
                    <th className="w-14 px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scannables.map((scannable) => (
                    <tr
                      key={scannable._id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-4 font-medium">{scannable.name}</td>
                      <td className="px-5 py-4">
                        {scannable.knowledgeFileUrl ? (
                          <a
                            href={scannable.knowledgeFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-56 truncate rounded-lg bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-200 ring-1 ring-white/8 hover:bg-white/[0.08]"
                          >
                            {scannable.knowledgeFileName}
                          </a>
                        ) : (
                          <span className="text-muted">
                            {scannable.knowledgeFileName || "No file"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 tabular-nums text-muted">
                        {new Date(scannable._creationTime).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <ScannableRowMenu
                          name={scannable.name}
                          onEdit={() => {
                            setEditTarget({
                              id: scannable._id,
                              name: scannable.name,
                              knowledgeFileName: scannable.knowledgeFileName,
                            });
                            setDialogOpen(true);
                          }}
                          onShare={() =>
                            setShareTarget({
                              id: scannable._id,
                              name: scannable.name,
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              id: scannable._id,
                              name: scannable.name,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <CreateScannableDialog
        open={dialogOpen}
        ownerId={ownerId}
        scannable={editTarget}
        onClose={closeForm}
      />
      {shareTarget ? (
        <ShareScannableDialog
          open
          name={shareTarget.name}
          scannableId={shareTarget.id}
          onClose={() => setShareTarget(null)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteScannableDialog
          open
          name={deleteTarget.name}
          scannableId={deleteTarget.id}
          ownerId={ownerId}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
