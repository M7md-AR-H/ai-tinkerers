"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page so log lines written by Trigger.dev tasks appear on their own.
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
