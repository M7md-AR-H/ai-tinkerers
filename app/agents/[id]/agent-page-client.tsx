"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  CopilotChat,
  CopilotKitProvider,
  useConfigureSuggestions,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/app/components/brand";
import { SCANNABLE_HEADER } from "@/lib/constants";
import { TalkPanel } from "./talk-panel";

type Mode = "talk" | "chat";

export function AgentPageClient({ id }: { id: string }) {
  const agent = useQuery(api.scannables.getById, { id });
  const [mode, setMode] = useState<Mode>("talk");

  if (agent === undefined) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (agent === null) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Agent not found</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">
            This link does not match a scannable object.
          </p>
        </div>
      </div>
    );
  }

  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      headers={{ [SCANNABLE_HEADER]: id }}
      onError={({ code, error }) => console.error("[copilotkit]", code, error)}
    >
      <div className="flex h-dvh w-full flex-col">
        <AppHeader
          trailing={
            <div
              role="tablist"
              aria-label="Conversation mode"
              className="grid grid-cols-2 rounded-xl bg-white/[0.05] p-0.5 ring-1 ring-white/8"
            >
              {(["talk", "chat"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={`h-8 rounded-[10px] px-3.5 text-sm font-medium capitalize transition-colors ${
                    mode === value
                      ? "bg-white text-[#17171a]"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          }
        />

        <div className="border-b border-border px-5 py-4 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            {mode === "talk" ? "Talking to" : "Chatting with"}
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {agent.name}
          </h1>
        </div>

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

const TASK_ACTION_LABEL: Record<string, string> = {
  created: "task opened",
  commented: "added to existing task",
  resolved: "task marked done",
};

const lookupParams = z.object({
  identifier: z.string().optional(),
  question: z.string(),
});

type LookupSource = { title: string; url: string; publishedDate?: string };

function parseJson<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function ChatPanel({ name }: { name: string }) {
  // Follow-up buttons under the chat. A dedicated, tool-free "suggestion brain"
  // on the server (see /api/copilotkit) generates these after every turn.
  useConfigureSuggestions(
    {
      instructions: `Suggest what the visitor could ask "${name}" next. Base suggestions on the knowledge base and on what was just discussed. Mix one practical how-to, one "what if something goes wrong" and, if a brand/model/product number has come up, one public-info question about it.`,
      minSuggestions: 2,
      maxSuggestions: 3,
      available: "always",
    },
    [name],
  );

  useRenderTool(
    {
      name: "notify_admin",
      parameters: notifyAdminParams,
      render: ({ status, parameters, ...rest }) => {
        const kind = parameters?.kind;
        const label = kind ? KIND_LABEL[kind] : "Notifying owner";

        const result =
          status === "complete" && "result" in rest
            ? parseJson<{
                status?: string;
                error?: string;
                taskAction?: string;
                taskKey?: string;
                taskUrl?: string;
                emailed?: boolean;
              }>(rest.result)
            : null;
        const sent = result ? result.status === "sent" : null;

        const tone =
          sent === true
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            : sent === false
              ? "border-red-500/20 bg-red-500/10 text-red-200"
              : "border-border bg-surface-2 text-zinc-300";

        const outcome: string[] = [];
        if (result?.taskAction && TASK_ACTION_LABEL[result.taskAction]) {
          outcome.push(
            `${TASK_ACTION_LABEL[result.taskAction]}${result.taskKey ? ` ${result.taskKey}` : ""}`,
          );
        }
        if (result?.emailed) outcome.push("owner emailed");

        return (
          <div className={`my-2 rounded-2xl border px-4 py-3 text-sm ${tone}`}>
            <p className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">{sent === true ? "✓" : sent === false ? "!" : "…"}</span>
              {sent === true
                ? `${label} — ${outcome.join(", ") || "owner notified"}`
                : sent === false
                  ? "Could not reach the owner"
                  : `${label}…`}
            </p>
            {parameters?.summary ? (
              <p className="mt-1 opacity-80">{parameters.summary}</p>
            ) : null}
            {result?.taskUrl ? (
              <a
                href={result.taskUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                View task on the owner&apos;s board
              </a>
            ) : null}
            {result?.error && sent === false ? (
              <p className="mt-1 break-words text-xs opacity-70">{result.error}</p>
            ) : null}
          </div>
        );
      },
    },
    [],
  );

  useRenderTool(
    {
      name: "lookup_product",
      parameters: lookupParams,
      render: ({ status, parameters, ...rest }) => {
        const result =
          status === "complete" && "result" in rest
            ? parseJson<{ status?: string; sources?: LookupSource[]; error?: string }>(rest.result)
            : null;
        const failed = result?.status === "failed";
        const sources = result?.sources ?? [];
        const subject = parameters?.identifier?.trim();

        return (
          <div
            className={`my-2 rounded-2xl border px-4 py-3 text-sm ${
              failed
                ? "border-red-500/20 bg-red-500/10 text-red-200"
                : "border-sky-500/20 bg-sky-500/10 text-sky-100"
            }`}
          >
            <p className="flex items-center gap-2 font-medium">
              <span aria-hidden="true">{result ? (failed ? "!" : "🌐") : "…"}</span>
              {result
                ? failed
                  ? "Web lookup failed"
                  : `Looked up online${subject ? `: ${subject}` : ""}`
                : `Searching the web${subject ? ` for ${subject}` : ""}…`}
            </p>
            {parameters?.question ? (
              <p className="mt-1 opacity-80">{parameters.question}</p>
            ) : null}
            {sources.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block max-w-[16rem] truncate rounded-full bg-white/[0.06] px-2.5 py-1 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]"
                      title={source.url}
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {failed && result?.error ? (
              <p className="mt-1 break-words text-xs opacity-70">{result.error}</p>
            ) : null}
          </div>
        );
      },
    },
    [],
  );

  return (
    <main className="agent-chat mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
