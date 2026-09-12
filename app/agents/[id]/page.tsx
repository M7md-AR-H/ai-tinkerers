import { AgentPageClient } from "./agent-page-client";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentPageClient id={id} />;
}
