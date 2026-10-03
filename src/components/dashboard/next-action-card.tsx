"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Clock, MessageSquareWarning, Sparkle } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { NextAction } from "@/lib/domain/next-action";

const TONE = {
  danger: { box: "border-danger/35 bg-card bg-wash-danger", dot: "bg-[linear-gradient(135deg,var(--danger),#fb7185)] text-white", icon: CircleAlert },
  warning: { box: "border-warning/40 bg-card bg-wash-warning", dot: "bg-[linear-gradient(135deg,var(--warning),var(--deadline))] text-white", icon: Clock },
  info: { box: "border-info/35 bg-card bg-wash-info", dot: "bg-[linear-gradient(135deg,var(--info),var(--primary-2))] text-white", icon: Sparkle },
  default: { box: "border-primary/30 bg-card bg-wash-primary", dot: "bg-grad-primary text-white", icon: Sparkle },
  success: { box: "border-success/35 bg-card bg-wash-success", dot: "bg-[linear-gradient(135deg,var(--success),#22c55e)] text-white", icon: CheckCircle2 },
} as const;

/**
 * The one thing to do now, with the reason it won. Enter opens it unless
 * you're typing or a dialog is open. An optional secondary action sits beside
 * "Open" (e.g. "Convert to task" for a professor request).
 */
export function NextActionCard({ action, secondary }: { action: NextAction; secondary?: React.ReactNode }) {
  const router = useRouter();
  const tone = TONE[action.tone];
  const Icon = action.kind === "respond_remark" ? MessageSquareWarning : tone.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.target !== document.body) return;
      if (document.querySelector("[role=dialog]")) return;
      router.push(action.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, action.href]);

  return (
    <section className={cn("grid grid-cols-1 items-center gap-x-4 gap-y-3 rounded-xl border p-3.5 shadow-[var(--shadow-lift)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4 sm:px-[18px]", tone.box)}>
      <span className={cn("grid size-10 place-items-center rounded-full shadow-[0_6px_14px_-6px_rgba(0,0,0,0.35)] max-sm:hidden", tone.dot)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Next action</p>
        <Link href={action.href} className="mt-0.5 block text-[15px] leading-snug font-semibold outline-none hover:underline focus-visible:underline sm:text-base">
          <span className={cn(action.short && "max-sm:hidden")}>{action.title}</span>
          {action.short && <span className="sm:hidden">{action.short.title}</span>}
        </Link>
        <p className="mt-0.5 text-muted-foreground max-sm:line-clamp-2 max-sm:text-[12.5px]">
          <span className={cn(action.short && "max-sm:hidden")}>{action.reason}</span>
          {action.short && <span className="sm:hidden">{action.short.reason}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {/* Phones get one clear button; the secondary action lives on the item itself. */}
        {secondary && <span className="contents max-sm:hidden">{secondary}</span>}
        <Button asChild className="flex-1 sm:flex-none">
          <Link href={action.href}>
            Open
            <kbd className="hidden border-white/25 bg-white/15 text-inherit sm:inline-flex">↵</kbd>
            <ArrowRight className="sm:hidden" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
