"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RealtimeAgent, RealtimeSession, tool, type RealtimeItem } from "@openai/agents/realtime";
import { TOOL_DEFS, type ToolName } from "@/lib/tool-defs";

type Line = { id: string; role: "user" | "assistant"; text: string };

function toLines(history: RealtimeItem[]): Line[] {
  const lines: Line[] = [];
  for (const item of history) {
    if (item.type !== "message" || item.role === "system") continue;
    const text = item.content
      .map((c) => ("transcript" in c ? c.transcript : "text" in c ? c.text : "") ?? "")
      .join(" ")
      .trim();
    if (text) lines.push({ id: item.itemId, role: item.role, text });
  }
  return lines;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

export default function TalkPanel({ id }: { id: string }) {
  const router = useRouter();
  const session = useRef<RealtimeSession | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "live">("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => () => session.current?.close(), []);

  async function start() {
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start voice");

      // Tools run here in the browser and call the server, which executes them with the same code as chat.
      const tools = (data.tools as ToolName[]).map((name) =>
        tool({
          name,
          description: TOOL_DEFS[name].description,
          parameters: TOOL_DEFS[name].parameters,
          execute: async (args: unknown) => {
            const r = await fetch("/api/tools", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, tool: name, args }),
            });
            const out = await r.json().catch(() => ({}));
            router.refresh();
            return out.result ?? out.error ?? "Something went wrong.";
          },
        })
      );

      const agent = new RealtimeAgent({ name: data.name, instructions: data.instructions, tools, voice: data.voice });
      const s = new RealtimeSession(agent, { model: data.model });
      s.on("history_updated", (history) => setLines(toLines(history)));
      s.on("audio_start", () => setSpeaking(true));
      s.on("audio_stopped", () => setSpeaking(false));
      s.on("error", (e) => console.error("[talk]", e));
      await s.connect({ apiKey: data.clientSecret });
      session.current = s;
      setStatus("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }

  function stop() {
    session.current?.close();
    session.current = null;
    setSpeaking(false);
    setStatus("idle");
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <button
        onClick={status === "live" ? stop : start}
        disabled={status === "connecting"}
        aria-label={status === "live" ? "Stop talking" : "Start talking"}
        className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white transition disabled:opacity-60 ${
          status === "live" ? "bg-red-600" : "bg-zinc-900"
        }`}
      >
        {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/50" />}
        <MicIcon />
      </button>
      <p className="text-sm text-zinc-500">
        {status === "idle"
          ? "Tap the mic and start talking"
          : status === "connecting"
            ? "Connecting…"
            : speaking
              ? "Speaking…"
              : "Listening… tap to stop"}
      </p>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
      {lines.length > 0 && (
        <ul className="flex max-h-72 w-full flex-col gap-2 overflow-y-auto text-sm">
          {lines.map((l) => (
            <li
              key={l.id}
              className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                l.role === "user" ? "self-end bg-zinc-900 text-white" : "self-start bg-zinc-100"
              }`}
            >
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
