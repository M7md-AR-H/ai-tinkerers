"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "./modal";

export default function ShareScannableDialog({
  target,
  publicUrl,
  onClose,
}: {
  target: { id: string; name: string } | null;
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
  const button = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50";

  return (
    <Modal title={`Share ${target.name}`} onClose={close}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <QRCodeSVG value={url} size={220} marginSize={1} />
        </div>
        <p className="text-2xl font-semibold">Talk to me</p>
        <p className="break-all text-center text-xs text-zinc-500">{url}</p>
        {!publicUrl && (
          <p className="text-center text-xs text-amber-700">
            Set PUBLIC_URL to your tunnel URL so phones can open this link.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            className={button}
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a className={button} href={url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
          {canShare && (
            <button className={button} onClick={() => navigator.share({ title: target.name, url }).catch(() => {})}>
              Share…
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
