import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

export interface SummaryTile {
  label: string;
  value: string | number;
  href: string;
  icon: LucideIcon;
  /** Colour when the number needs attention. */
  tone?: "danger" | "warning" | "info" | "success" | "primary";
  /** Show the tone only when this is true (e.g. overdue > 0). */
  hot?: boolean;
}

const TONE = {
  danger: { icon: "bg-danger/12 text-danger", value: "text-danger" },
  warning: { icon: "bg-warning/12 text-warning", value: "text-warning" },
  info: { icon: "bg-info/12 text-info", value: "text-info" },
  success: { icon: "bg-success/12 text-success", value: "text-success" },
  primary: { icon: "bg-primary/12 text-primary", value: "text-foreground" },
} as const;

/**
 * The phone dashboard's summary (laptops see the same facts spread over the
 * page): four numbers you can tap, then whatever the role adds below.
 */
export function MobileSummary({ title, aside, tiles, children }: { title: React.ReactNode; aside?: React.ReactNode; tiles: SummaryTile[]; children?: React.ReactNode }) {
  return (
    <section aria-label="Summary" className="rf-rise overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-lift)] md:hidden">
      <header className="flex items-baseline justify-between gap-3 bg-wash-primary px-4 pt-3.5 pb-3">
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {aside && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{aside}</span>}
      </header>
      <div className="grid grid-cols-2 gap-px border-t bg-border/70">
        {tiles.map((t) => {
          const tone = TONE[t.tone ?? "primary"];
          const hot = t.hot ?? true;
          return (
            <Link key={t.label} href={t.href} className="flex items-center gap-3 bg-card px-3.5 py-3 transition-colors active:bg-accent">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", hot ? tone.icon : "bg-muted text-muted-foreground")}>
                <t.icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block font-mono text-[20px] leading-tight font-semibold tabular", hot ? tone.value : "text-foreground")}>{t.value}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{t.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
      {children && <div className="border-t">{children}</div>}
    </section>
  );
}
