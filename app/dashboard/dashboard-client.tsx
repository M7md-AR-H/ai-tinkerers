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
      className="h-5 w-5"
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
      >
        <MoreIcon />
      </button>
      {open && coords ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-40 min-w-40 rounded-xl border border-black/[.08] bg-white py-1 shadow-lg dark:border-white/[.145] dark:bg-zinc-950"
          style={{ top: coords.top, left: coords.left }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
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
            className="block w-full px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
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
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-black/[.04] dark:text-red-400 dark:hover:bg-white/[.06]"
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
      <header className="flex items-center justify-between gap-4 px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Scannable objects tagged to your account
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Create a scannable"
            onClick={openCreate}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
          >
            <PlusIcon />
          </button>
          <UserIcon user={user} />
        </div>
      </header>

      <main className="px-6 pb-10">
        {scannables === undefined ? (
          <p className="text-sm text-zinc-500">Loading agents…</p>
        ) : scannables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/[.08] px-6 py-12 text-center dark:border-white/[.145]">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No agents yet. Use + to create your first scannable.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-black/[.08] bg-zinc-50 text-zinc-600 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Knowledge</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="w-14 px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {scannables.map((scannable) => (
                  <tr
                    key={scannable._id}
                    className="border-b border-black/[.06] last:border-0 dark:border-white/[.08]"
                  >
                    <td className="px-4 py-3 font-medium">{scannable.name}</td>
                    <td className="px-4 py-3">
                      {scannable.knowledgeFileUrl ? (
                        <a
                          href={scannable.knowledgeFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-700 underline underline-offset-2 hover:text-foreground dark:text-zinc-300"
                        >
                          {scannable.knowledgeFileName}
                        </a>
                      ) : (
                        <span className="text-zinc-500">
                          {scannable.knowledgeFileName || "No file"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {new Date(scannable._creationTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
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
