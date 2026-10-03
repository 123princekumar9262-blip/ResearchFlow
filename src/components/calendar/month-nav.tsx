"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MonthNav({ prev, next, today, label }: { prev: string; next: string; today: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowLeft") router.push(`/calendar?month=${prev}`);
      else if (e.key === "ArrowRight") router.push(`/calendar?month=${next}`);
      else if (e.key === "t") router.push(`/calendar?month=${today}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next, today]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <h1 className="mr-3 min-w-44 text-[22px] font-semibold tracking-tight">{label}</h1>
      <Button variant="outline" size="icon-sm" asChild>
        <Link href={`/calendar?month=${prev}`} aria-label="Previous month">
          <ChevronLeft />
        </Link>
      </Button>
      <Button variant="outline" size="icon-sm" asChild>
        <Link href={`/calendar?month=${next}`} aria-label="Next month">
          <ChevronRight />
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/calendar?month=${today}`}>
          Today <kbd>T</kbd>
        </Link>
      </Button>
    </div>
  );
}
