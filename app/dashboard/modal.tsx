"use client";

import { useEffect, type ReactNode } from "react";
import { XIcon } from "./icons";

// Bottom sheet on phones, centred card on larger screens. Esc or a click outside closes it.
export default function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-5">{children}</div>
      </div>
    </div>
  );
}
