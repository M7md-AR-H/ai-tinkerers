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
  const [notified, setNotified] = useState(false);
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
    setNotified(false);

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
          const result = (await res.json()) as { ok: boolean; error?: string };
          if (result.ok) setNotified(true);
          return result.ok ? "The owner has been emailed." : `Could not email the owner: ${result.error}`;
        },
      });

      const agent = new RealtimeAgent({
        name,
        instructions: data.instructions,
        tools: [notifyAdmin],
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
    <main className="flex flex-1 flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center">
        <button
          type="button"
          onClick={live ? stop : start}
          disabled={connecting}
          aria-label={live ? `Stop talking to ${name}` : `Talk to ${name}`}
          className={`relative flex h-40 w-40 items-center justify-center rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.18)] transition-all active:scale-95 disabled:cursor-wait ${
            live
              ? "bg-red-500 text-white"
              : "bg-foreground text-background"
          }`}
        >
          {(live || connecting) && (
            <span
              className={`absolute inset-0 rounded-full ${
                live ? "bg-red-500/30" : "bg-foreground/20"
              } ${speaking ? "animate-ping [animation-duration:1.2s]" : connecting ? "animate-pulse" : "animate-ping [animation-duration:2.4s]"}`}
            />
          )}
          <span className="relative">{live ? <StopIcon /> : <MicIcon />}</span>
        </button>

        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          {connecting
            ? "Connecting…"
            : live
              ? speaking
                ? `${name} is speaking`
                : "Listening — just talk"
              : `Tap to talk to ${name}`}
        </p>

        {error ? (
          <p className="mt-2 max-w-xs text-center text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {notified ? (
          <p className="mt-3 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Owner notified
          </p>
        ) : null}
      </div>

      {transcript.length > 0 ? (
        <div
          ref={scrollRef}
          className="mt-4 max-h-44 w-full overflow-y-auto rounded-2xl border border-black/[.08] p-3 text-sm dark:border-white/[.145]"
        >
          {transcript.map((line) => (
            <p key={line.id} className="mb-1.5 last:mb-0">
              <span className="font-medium text-zinc-500">
                {line.role === "user" ? "You" : name}:
              </span>{" "}
              <span className="text-zinc-800 dark:text-zinc-200">{line.text}</span>
            </p>
          ))}
        </div>
      ) : null}
    </main>
  );
}
