import {
  BuiltInAgent,
  CopilotRuntime,
  createCopilotRuntimeHandler,
  defineTool,
} from "@copilotkit/runtime/v2";
import { z } from "zod";
import { handleVisitorReport } from "@/lib/admin-actions";
import { buildInstructions, buildSuggestionInstructions } from "@/lib/agent-brain";
import { SCANNABLE_HEADER } from "@/lib/constants";
import { getScannableKnowledge } from "@/lib/convex-server";
import { lookupProduct } from "@/lib/exa";
import { createChatModel } from "@/lib/llm";

/** CopilotKit's follow-up-suggestion engine hits `/agent/<id>/suggest`. */
function isSuggestionRequest(request: Request) {
  try {
    return new URL(request.url).pathname.replace(/\/$/, "").endsWith("/suggest");
  } catch {
    return false;
  }
}

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

    // Follow-up buttons: a separate, cheaper brain with no side-effect tools.
    // It is forced to answer through the client-provided `copilotkitSuggest` tool.
    if (isSuggestionRequest(request)) {
      return {
        default: new BuiltInAgent({
          model: createChatModel(),
          prompt: buildSuggestionInstructions(scannable),
          toolChoice: { type: "tool", toolName: "copilotkitSuggest" },
          maxSteps: 1,
          maxOutputTokens: 300,
          temperature: 0.7,
        }),
      };
    }

    const notifyAdmin = defineTool({
      name: "notify_admin",
      description:
        "Tell the owner/admin when the visitor reveals that the knowledge base is wrong or outdated, that a problem has been fixed, that there is a new problem, or anything else the owner must know. Files or updates a task on the owner's board and emails them. Do not use for ordinary questions.",
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
        const outcome = await handleVisitorReport({
          kind,
          summary,
          details,
          scannableId: String(scannable._id),
          scannableName: scannable.name,
          channel: "chat",
        });
        const reached = outcome.emailed || outcome.taskAction !== "none";
        return {
          status: reached ? "sent" : "failed",
          taskAction: outcome.taskAction,
          taskKey: outcome.taskKey,
          taskUrl: outcome.taskUrl,
          emailed: outcome.emailed,
          message: reached
            ? `Tell the visitor: ${outcome.visitorMessage}`
            : "Reaching the owner failed. Tell the visitor you could not reach the owner right now and that they should tell a human directly.",
          error: outcome.emailError ?? outcome.taskError,
        };
      },
    });

    const lookup = defineTool({
      name: "lookup_product",
      description:
        "Search the web (via Exa) for public information about the product/brand/model this object is, or about a product, model or serial number the visitor mentions: manuals, specs, how-to steps, error codes, compatible parts, recalls. Never for private/local facts (this building, owner, Wi-Fi, prices).",
      parameters: z.object({
        identifier: z
          .string()
          .optional()
          .describe("Most specific product identifier available: model number, product name, or brand + model. Omit if none."),
        question: z
          .string()
          .min(3)
          .describe("What the visitor wants to know, as a short natural-language question."),
      }),
      execute: async ({ identifier, question }) => {
        const result = await lookupProduct({
          scannableName: scannable.name,
          identifier,
          question,
        });
        if (!result.ok) {
          return {
            status: "failed",
            error: result.error,
            message: "The web lookup failed. Tell the visitor you could not check online right now.",
          };
        }
        return {
          status: "ok",
          answer: result.answer,
          sources: result.sources,
          message:
            "Summarise `answer` in your own words, say it comes from the web, and mention at most two source names. Do not read out URLs.",
        };
      },
    });

    return {
      default: new BuiltInAgent({
        model: createChatModel(),
        prompt: buildInstructions(scannable),
        tools: [notifyAdmin, lookup],
        maxSteps: 5,
      }),
    };
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
