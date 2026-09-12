"use client";

import { useState } from "react";
import { CopilotChat, CopilotKitProvider, useConfigureSuggestions } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { SCANNABLE_HEADER } from "@/lib/constants";
import TalkPanel from "./talk-panel";

function Chat({ suggestions }: { suggestions: string[] }) {
  // Quick-tap chips: judges won't type on stage.
  useConfigureSuggestions(
    { suggestions: suggestions.map((s) => ({ title: s, message: s })), available: "always" },
    [suggestions.join("|")]
  );
  return <CopilotChat className="h-[26rem] overflow-hidden rounded-xl border border-zinc-200 bg-white" />;
}

export default function AgentClient({ id, suggestions }: { id: string; suggestions: string[] }) {
  const [mode, setMode] = useState<"talk" | "chat">("chat");
  const tab = (m: "talk" | "chat") =>
    `flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === m ? "bg-zinc-900 text-white" : "text-zinc-600"}`;

  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit" headers={{ [SCANNABLE_HEADER]: id }} enableInspector={false}>
      <div className="flex flex-col gap-3">
        <div className="flex rounded-full border border-zinc-200 bg-white p-1">
          <button className={tab("talk")} onClick={() => setMode("talk")}>
            Talk
          </button>
          <button className={tab("chat")} onClick={() => setMode("chat")}>
            Chat
          </button>
        </div>
        <div hidden={mode !== "chat"}>
          <Chat suggestions={suggestions} />
        </div>
        {mode === "talk" && <TalkPanel id={id} />}
      </div>
    </CopilotKitProvider>
  );
}
