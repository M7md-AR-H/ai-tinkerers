import { BuiltInAgent, CopilotRuntime, createCopilotRuntimeHandler, defineTool } from "@copilotkit/runtime/v2";
import { buildInstructions, loadAgentContext } from "@/lib/agent-brain";
import { availableTools, runTool } from "@/lib/object-tools";
import { TOOL_DEFS } from "@/lib/tool-defs";
import { getUser } from "@/lib/auth";
import { chatModel } from "@/lib/llm";
import { SCANNABLE_HEADER } from "@/lib/constants";

export const runtime = "nodejs";

async function agentFor(request: Request) {
  const id = request.headers.get(SCANNABLE_HEADER);
  const ctx = id ? await loadAgentContext(id) : null;
  if (!ctx) {
    return new BuiltInAgent({
      model: chatModel(),
      prompt:
        "You couldn't tell which object the visitor scanned. Say so in one sentence and ask them to scan the QR code again.",
    });
  }
  return new BuiltInAgent({
    model: chatModel(),
    maxSteps: 5,
    prompt: buildInstructions(ctx, await getUser(), "chat"),
    tools: availableTools(ctx).map((name) =>
      defineTool({
        name,
        description: TOOL_DEFS[name].description,
        parameters: TOOL_DEFS[name].parameters,
        execute: (args) => runTool(ctx, name, args, "chat"),
      })
    ),
  });
}

// A fresh agent per request, built for whichever object the page's x-scannable-id header names.
const copilotRuntime = new CopilotRuntime({
  agents: async ({ request }) => ({ default: await agentFor(request) }),
});

const handler = createCopilotRuntimeHandler({ runtime: copilotRuntime, basePath: "/api/copilotkit" });

export const GET = (req: Request) => handler(req);
export const POST = (req: Request) => handler(req);
