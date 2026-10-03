"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** J / K move through the review queue (outside text fields). */
export function ReviewKeys({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || document.querySelector("[role=dialog]")) return;
      if (e.key === "j" && next) router.push(next);
      else if (e.key === "k" && prev) router.push(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);
  return null;
}
