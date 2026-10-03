"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

/**
 * Secondary detail that folds away on phones and is always open from md up,
 * so small screens lead with what you act on.
 */
export function MobileDetails({ summary, hint, children, className }: { summary: string; hint?: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[10px] border bg-card px-3.5 py-3 text-left md:hidden"
      >
        <span className="font-medium">{summary}</span>
        {hint && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hint}</span>}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("space-y-3 max-md:mt-3", !open && "max-md:hidden")}>{children}</div>
    </div>
  );
}
