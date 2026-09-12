import { z } from "zod";
import { loadAgentContext } from "@/lib/agent-brain";
import { runTool } from "@/lib/object-tools";
import { TOOL_DEFS, type ToolName } from "@/lib/tool-defs";

export const runtime = "nodejs";

const Body = z.object({ id: z.string().min(1).max(100), tool: z.string(), args: z.unknown() });

// Voice tools run in the browser and call back here, so the chat and voice share one implementation.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !Object.hasOwn(TOOL_DEFS, parsed.data.tool)) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const ctx = await loadAgentContext(parsed.data.id);
  if (!ctx) return Response.json({ error: "Agent not found" }, { status: 404 });

  try {
    const result = await runTool(ctx, parsed.data.tool as ToolName, parsed.data.args ?? {}, "voice");
    return Response.json({ result });
  } catch (err) {
    console.error("[tools]", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
