"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  type RealtimeItem,
} from "@openai/agents-realtime";
import { z } from "zod";

type Status = "idle" | "connecting" | "live" | "error";

type TranscriptLine = { id: string; role: "user" | "assistant"; text: string };

type Source = { title: string; url: string; publishedDate?: string };

type Activity =
  | { kind: "notified"; text: string; taskUrl?: string }
  | { kind: "lookup"; question: string; sources: Source[] };

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-10 w-10"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-9 w-9">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

function toTranscript(history: RealtimeItem[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const item of history) {
    if (item.type !== "message" || item.role === "system") continue;
    const text = item.content
      .map((part) => {
        if ("text" in part && typeof part.text === "string") return part.text;
        if ("transcript" in part && typeof part.transcript === "string") return part.transcript;
        return "";
      })
      .join(" ")
      .trim();
    if (text) {
      lines.push({ id: item.itemId, role: item.role, text });
    }
  }
  return lines;
}

export function TalkPanel({ scannableId, name }: { scannableId: string; name: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus("idle");
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [transcript]);

  async function start() {
    setError(null);
    setStatus("connecting");
    setTranscript([]);
    setActivity([]);

    try {
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scannableId }),
      });
      const data = (await response.json()) as {
        clientSecret?: string;
        model?: string;
        instructions?: string;
        error?: string;
      };
      if (!response.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Could not start a voice session.");
      }

      const notifyAdmin = tool({
        name: "notify_admin",
        description:
          "Email the owner/admin when the visitor reveals that the knowledge base is wrong or outdated, that a problem has been fixed, that there is a new problem, or anything else the owner must know. Do not use for ordinary questions.",
        parameters: z.object({
          kind: z.enum(["wrong_info", "fixed", "problem", "other"]),
          summary: z.string().describe("One or two plain sentences with the concrete facts."),
          details: z.string().nullable().describe("Optional extra context, or null."),
        }),
        execute: async ({ kind, summary, details }) => {
          const res = await fetch("/api/notify-admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scannableId, kind, summary, details: details ?? undefined }),
          });
          const result = (await res.json()) as {
            ok: boolean;
            message?: string;
            taskKey?: string;
            taskUrl?: string;
            error?: string;
          };
          if (result.ok) {
            const text = result.message
              ? result.message.charAt(0).toUpperCase() + result.message.slice(1)
              : "Owner notified";
            setActivity((prev) => [...prev, { kind: "notified", text, taskUrl: result.taskUrl }]);
            return `Done — ${result.message ?? "the owner has been notified."} Tell the visitor this in one sentence.`;
          }
          return `Could not reach the owner: ${result.error ?? "unknown error"}. Tell the visitor to speak to a human directly.`;
        },
      });

      const lookupProduct = tool({
        name: "lookup_product",
        description:
          "Search the web for public information about the product/brand/model this object is, or about a product, model or serial number the visitor mentions: manuals, specs, how-to steps, error codes, compatible parts, recalls. Never for private/local facts (this building, owner, Wi-Fi, prices).",
        parameters: z.object({
          identifier: z
            .string()
            .nullable()
            .describe("Most specific product identifier: model number, product name, or brand + model. Null if none."),
          question: z.string().describe("What the visitor wants to know, as a short question."),
        }),
        execute: async ({ identifier, question }) => {
          const res = await fetch("/api/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scannableId, identifier: identifier ?? undefined, question }),
          });
          const result = (await res.json()) as
            | { ok: true; answer: string; sources: Source[] }
            | { ok: false; error: string };
          if (!result.ok) {
            return `Web lookup failed (${result.error}). Tell the visitor you could not check online right now.`;
          }
          setActivity((prev) => [...prev, { kind: "lookup", question, sources: result.sources }]);
          const names = result.sources.slice(0, 2).map((s) => s.title).join(" and ");
          return [
            `Web answer: ${result.answer}`,
            names ? `Sources: ${names}.` : "",
            "Summarise this in your own words, say it comes from the web, and do not read out URLs.",
          ]
            .filter(Boolean)
            .join("\n");
        },
      });

      const agent = new RealtimeAgent({
        name,
        instructions: data.instructions,
        tools: [notifyAdmin, lookupProduct],
      });

      const session = new RealtimeSession(agent, {
        model: data.model,
        config: {
          audio: {
            input: {
              // Suppress room noise before voice detection kicks in.
              noiseReduction: { type: "near_field" },
              // Semantic VAD: respond when the visitor finishes a thought, not on any sound.
              turnDetection: {
                type: "semantic_vad",
                eagerness: "low",
                createResponse: true,
                interruptResponse: true,
              },
            },
          },
        },
      });
      sessionRef.current = session;

      session.on("history_updated", (history) => setTranscript(toTranscript(history)));
      session.on("audio_start", () => setSpeaking(true));
      session.on("audio_stopped", () => setSpeaking(false));
      session.on("error", (event) => {
        console.error("[realtime]", event);
        setError("The voice connection dropped. Tap to try again.");
        stop();
        setStatus("error");
      });

      await session.connect({ apiKey: data.clientSecret });
      setStatus("live");
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : "Could not start a voice session.");
      stop();
      setStatus("error");
    }
  }

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center">
        <button
          type="button"
          onClick={live ? stop : start}
          disabled={connecting}
          aria-label={live ? `Stop talking to ${name}` : `Talk to ${name}`}
          className={`relative flex h-36 w-36 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-wait ${
            live
              ? "bg-red-500 text-white shadow-[0_0_0_12px_rgba(239,68,68,0.12),0_20px_50px_rgba(0,0,0,0.35)]"
              : "bg-white text-[#17171a] shadow-[0_0_0_12px_rgba(255,255,255,0.04),0_20px_50px_rgba(0,0,0,0.35)]"
          }`}
        >
          {(live || connecting) && (
            <span
              className={`absolute inset-0 rounded-full ${
                live ? "bg-red-500/30" : "bg-white/20"
              } ${speaking ? "animate-ping [animation-duration:1.2s]" : connecting ? "animate-pulse" : "animate-ping [animation-duration:2.4s]"}`}
            />
          )}
          <span className="relative">{live ? <StopIcon /> : <MicIcon />}</span>
        </button>

        <p className="mt-8 text-sm text-muted">
          {connecting
            ? "Connecting…"
            : live
              ? speaking
                ? `${name} is speaking`
                : "Listening — just talk"
              : `Tap to talk to ${name}`}
        </p>

        {error ? (
          <p className="mt-2 max-w-xs text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {activity.length > 0 ? (
          <ul className="mt-3 flex w-full max-w-sm flex-col items-center gap-2">
            {activity.map((item, index) =>
              item.kind === "notified" ? (
                <li
                  key={index}
                  className="rounded-full bg-emerald-500/15 px-3 py-1 text-center text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/20"
                >
                  {item.text}
                  {item.taskUrl ? (
                    <>
                      {" "}
                      <a
                        href={item.taskUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-emerald-200"
                      >
                        View task
                      </a>
                    </>
                  ) : null}
                </li>
              ) : (
                <li
                  key={index}
                  className="w-full rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100"
                >
                  <p className="font-medium">Looked up online: {item.question}</p>
                  {item.sources.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 opacity-80">
                      {item.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-white"
                        >
                          {source.title}
                        </a>
                      ))}
                    </p>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        ) : null}
      </div>

      {transcript.length > 0 ? (
        <div
          ref={scrollRef}
          className="mt-4 max-h-52 w-full space-y-2 overflow-y-auto rounded-2xl border border-border bg-surface p-3"
        >
          {transcript.map((line) => (
            <div
              key={line.id}
              className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                  line.role === "user"
                    ? "bg-white/[0.08] text-foreground"
                    : "bg-surface-2 text-zinc-200 ring-1 ring-white/6"
                }`}
              >
                <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  {line.role === "user" ? "You" : name}
                </span>
                {line.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
