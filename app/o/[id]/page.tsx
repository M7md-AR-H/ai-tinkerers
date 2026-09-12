import { redirect } from "next/navigation";

export default async function LegacyObjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/agents/${encodeURIComponent(id)}`);
}
