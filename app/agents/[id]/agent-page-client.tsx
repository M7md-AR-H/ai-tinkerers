"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CopilotChat, CopilotKitProvider, useRenderTool } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { SCANNABLE_HEADER } from "@/lib/constants";
import { TalkPanel } from "./talk-panel";

type Mode = "talk" | "chat";

export function AgentPageClient({ id }: { id: string }) {
  const agent = useQuery(api.scannables.getById, { id });
  const [mode, setMode] = useState<Mode>("talk");

  if (agent === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (agent === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Agent not found</h1>
        <p className="mt-2 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
          This link does not match a scannable object.
        </p>
      </div>
    );
  }

  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      headers={{ [SCANNABLE_HEADER]: id }}
      onError={({ code, error }) => console.error("[copilotkit]", code, error)}
    >
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-background">
        <header className="flex flex-col items-center gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
          <div
            role="tablist"
            aria-label="Conversation mode"
            className="grid w-full max-w-xs grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900"
          >
            {(["talk", "chat"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={`h-10 rounded-full text-sm font-medium capitalize transition-colors ${
                  mode === value
                    ? "bg-foreground text-background"
                    : "text-zinc-600 hover:text-foreground dark:text-zinc-400"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              {mode === "talk" ? "Talking to" : "Chatting with"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{agent.name}</h1>
          </div>
        </header>

        {mode === "talk" ? (
          <TalkPanel scannableId={id} name={agent.name} />
        ) : (
          <ChatPanel name={agent.name} />
        )}
      </div>
    </CopilotKitProvider>
  );
}

const notifyAdminParams = z.object({
  kind: z.enum(["wrong_info", "fixed", "problem", "other"]),
  summary: z.string(),
  details: z.string().optional(),
});

const KIND_LABEL: Record<z.infer<typeof notifyAdminParams>["kind"], string> = {
  wrong_info: "Flagged wrong info",
  fixed: "Marked as fixed",
  problem: "Reported a problem",
  other: "Heads-up sent",
};

function ChatPanel({ name }: { name: string }) {
  useRenderTool(
    {
      name: "notify_admin",
      parameters: notifyAdminParams,
      render: ({ status, parameters, ...rest }) => {
        const kind = parameters?.kind;
        const label = kind ? KIND_LABEL[kind] : "Notifying owner";

        let sent: boolean | null = null;
        let errorText: string | null = null;
        const result = status === "complete" && "result" in rest ? rest.result ?? "" : null;
        if (result !== null) {
          try {
            const parsed = JSON.parse(result) as { status?: string; error?: string };
            sent = parsed.status === "sent";
            errorText = parsed.error ?? null;
          } catch {
            sent = /sent/i.test(result);
          }
        }

        const tone =
          sent === true
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : sent === false
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";

        return (
          <div className={`my-2 rounded-2xl border px-4 py-3 text-sm ${tone}`}>
            <p className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">{sent === true ? "✓" : sent === false ? "!" : "…"}</span>
              {sent === true
                ? `${label} — owner emailed`
                : sent === false
                  ? "Could not reach the owner"
                  : `${label}…`}
            </p>
            {parameters?.summary ? (
              <p className="mt-1 opacity-80">{parameters.summary}</p>
            ) : null}
            {errorText ? (
              <p className="mt-1 break-words text-xs opacity-70">{errorText}</p>
            ) : null}
          </div>
        );
      },
    },
    [],
  );

  return (
    <main className="agent-chat flex min-h-0 flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <CopilotChat
        labels={{
          chatInputPlaceholder: `Message ${name}`,
          welcomeMessageText: `Hi, I'm ${name}. Ask me anything — and tell me if something looks wrong or broken.`,
          chatDisclaimerText: "",
        }}
      />
    </main>
  );
}
