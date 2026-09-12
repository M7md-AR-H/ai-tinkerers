import {
  BuiltInAgent,
  CopilotRuntime,
  createCopilotRuntimeHandler,
  defineTool,
} from "@copilotkit/runtime/v2";
import { z } from "zod";
import { buildInstructions } from "@/lib/agent-brain";
import { sendAdminAlert } from "@/lib/ambiguous";
import { SCANNABLE_HEADER } from "@/lib/constants";
import { getScannableKnowledge } from "@/lib/convex-server";
import { createChatModel } from "@/lib/llm";

const runtime = new CopilotRuntime({
  // Per-request agent: the chat page tells us which scannable it is via a header,
  // we load that scannable's knowledge from Convex and build its brain on the fly.
  agents: async ({ request }) => {
    const scannableId = request.headers.get(SCANNABLE_HEADER);
    const scannable = scannableId ? await getScannableKnowledge(scannableId) : null;

    if (!scannable) {
      return {
        default: new BuiltInAgent({
          model: createChatModel(),
          prompt:
            "You are a placeholder. Tell the visitor this link does not match a scannable object and to scan the QR code again.",
        }),
      };
    }

    const notifyAdmin = defineTool({
      name: "notify_admin",
      description:
        "Email the owner/admin when the visitor reveals that the knowledge base is wrong or outdated, that a problem has been fixed, that there is a new problem, or anything else the owner must know. Do not use for ordinary questions.",
      parameters: z.object({
        kind: z
          .enum(["wrong_info", "fixed", "problem", "other"])
          .describe("wrong_info = knowledge base is wrong/outdated; fixed = issue resolved; problem = new issue; other = anything else important"),
        summary: z
          .string()
          .min(5)
          .describe("One or two plain sentences with the concrete facts the visitor reported."),
        details: z
          .string()
          .optional()
          .describe("Optional extra context, e.g. which knowledge-base line is wrong and what it should say."),
      }),
      execute: async ({ kind, summary, details }) => {
        const result = await sendAdminAlert({
          kind,
          summary,
          details,
          scannableId: String(scannable._id),
          scannableName: scannable.name,
          channel: "chat",
        });
        return result.ok
          ? { status: "sent", message: "The owner has been emailed." }
          : {
              status: "failed",
              message:
                "Emailing the owner failed. Tell the visitor you could not reach the owner right now and that they should tell a human directly.",
              error: result.error,
            };
      },
    });

    return {
      default: new BuiltInAgent({
        model: createChatModel(),
        prompt: buildInstructions(scannable),
        tools: [notifyAdmin],
        maxSteps: 4,
      }),
    };
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
