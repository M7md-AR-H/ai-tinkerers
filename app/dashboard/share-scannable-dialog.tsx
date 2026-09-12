"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "./modal";
import { CheckIcon, CopyIcon, ExternalIcon, MailIcon, PrinterIcon, ShareIcon } from "./icons";
import { btnPrimary, btnSecondary } from "./ui";

export default function ShareScannableDialog({
  target,
  publicUrl,
  onClose,
}: {
  target: { id: string; name: string; email?: string | null } | null;
  publicUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!target) return null;

  const url = `${(publicUrl || window.location.origin).replace(/\/$/, "")}/agents/${target.id}`;
  const canShare = typeof navigator.share === "function";
  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal title={`Share ${target.name}`} description="Print the sticker and put it on the real thing. Anyone who scans it can talk to it." onClose={close}>
      <div className="flex flex-col gap-4">
        <div className="print-area mx-auto flex w-full max-w-xs flex-col items-center rounded-3xl border border-zinc-200 bg-white px-6 py-6 text-center shadow-sm">
          <div className="rounded-2xl bg-white p-2 ring-1 ring-zinc-100">
            <QRCodeSVG value={url} size={200} marginSize={1} />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight">Talk to me</p>
          <p className="mt-1 font-medium text-zinc-700">{target.name}</p>
          <p className="mt-1 text-xs text-zinc-500">Scan with your phone camera</p>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-indigo-600">Scannable</p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1.5 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600">{url}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {target.email && (
          <p className="flex items-center justify-center gap-2 text-sm text-zinc-600">
            <MailIcon className="h-4 w-4 text-zinc-400" />
            Its inbox: <span className="font-mono text-xs text-zinc-800">{target.email}</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center">
          <button onClick={() => window.print()} className={btnPrimary}>
            <PrinterIcon className="h-4 w-4" />
            Print sticker
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
            <ExternalIcon className="h-4 w-4" />
            Open
          </a>
          {canShare && (
            <button onClick={() => navigator.share({ title: target.name, url }).catch(() => {})} className={`${btnSecondary} col-span-2 sm:col-span-1`}>
              <ShareIcon className="h-4 w-4" />
              Share…
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
