"use client";

import { useEffect, useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Id } from "@/convex/_generated/dataModel";

function agentPath(id: Id<"scannables">) {
  return `/agents/${id}`;
}

function agentAbsoluteUrl(id: Id<"scannables">) {
  if (typeof window === "undefined") {
    return agentPath(id);
  }
  return `${window.location.origin}${agentPath(id)}`;
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ShareScannableDialog({
  open,
  name,
  scannableId,
  onClose,
}: {
  open: boolean;
  name: string;
  scannableId: Id<"scannables">;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  // Mounts fresh each time the dialog opens, so `copied` resets without an effect.
  return (
    <ShareScannablePanel name={name} scannableId={scannableId} onClose={onClose} />
  );
}

function ShareScannablePanel({
  name,
  scannableId,
  onClose,
}: {
  name: string;
  scannableId: Id<"scannables">;
  onClose: () => void;
}) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const url = agentAbsoluteUrl(scannableId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function shareLink() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: name,
          text: `Talk to ${name}`,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyLink();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {name}
        </h2>
        <div className="mt-5 flex justify-center">
          <div className="flex size-[232px] items-center justify-center overflow-hidden rounded-2xl bg-white p-4">
            <QRCodeSVG
              value={url}
              size={200}
              level="M"
              marginSize={0}
              className="block size-[200px]"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background px-3">
          <p className="min-w-0 flex-1 truncate py-3 text-xs text-zinc-300">
            {url}
          </p>
          <button
            type="button"
            aria-label={copied ? "Link copied" : "Copy link"}
            onClick={copyLink}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-foreground"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-white/[0.05]"
          >
            Open link
          </a>
          <button
            type="button"
            onClick={shareLink}
            className="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-medium text-[#17171a]"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

export { agentPath, agentAbsoluteUrl };
