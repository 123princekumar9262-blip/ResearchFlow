import Link from "next/link";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

export type Accent = "primary" | "danger" | "warning" | "info" | "success" | "deadline";

/** Icon badges: the state colour as a soft chip, never a flat fill. */
export const ACCENT_BADGE: Record<Accent, string> = {
  primary: "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_18%,transparent),color-mix(in_srgb,var(--primary-2)_10%,transparent))] text-primary",
  danger: "bg-danger/14 text-danger",
  warning: "bg-warning/16 text-warning",
  info: "bg-info/14 text-info",
  success: "bg-success/14 text-success",
  deadline: "bg-deadline/14 text-deadline",
};

/** Card washes for tiles: the state colour fading into the surface. */
export const ACCENT_WASH: Record<Accent, string> = {
  primary: "bg-card bg-wash-primary",
  danger: "bg-card bg-wash-danger",
  warning: "bg-card bg-wash-warning",
  info: "bg-card bg-wash-info",
  success: "bg-card bg-wash-success",
  deadline: "bg-card bg-wash-warning",
};

export function initials(name: string): string {
  const parts = name.replace(/^(prof|dr)\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

// Stable hue per name, so a person keeps their colour across the app.
function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function UserAvatar({ name, className, title }: { name: string; className?: string; title?: string }) {
  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-card select-none",
        className,
      )}
      style={{ backgroundColor: `hsl(${hue(name)} 55% 45%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {names.slice(0, max).map((n) => (
        <UserAvatar key={n} name={n} />
      ))}
      {names.length > max && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-card">+{names.length - max}</span>
      )}
    </span>
  );
}

export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "success" | "danger" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <span
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <span
        className={cn(
          "rf-grow block h-full rounded-full transition-[width] duration-500",
          tone === "success"
            ? "bg-success bg-[linear-gradient(90deg,var(--success),color-mix(in_srgb,var(--success)_60%,#a3e635))]"
            : tone === "danger"
              ? "bg-danger bg-[linear-gradient(90deg,var(--danger),color-mix(in_srgb,var(--danger)_60%,#fb923c))]"
              : "bg-primary bg-grad-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  inTopBar = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** The top bar already names this page on phones, so the heading is kept for screen readers only. */
  inTopBar?: boolean;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", inTopBar && !actions && "max-md:mb-0")}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-muted-foreground">{eyebrow}</div>}
        <h1 className={cn("truncate text-xl font-semibold tracking-tight", inTopBar && "max-md:sr-only")}>{title}</h1>
        {description && <p className={cn("mt-1 text-muted-foreground", inTopBar && "max-md:hidden")}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A section card: 40px header (title, a count tinted by severity, one quiet
 * action) over a body. "alert" tints the whole header red, for Overdue.
 */
export function Section({
  title,
  count,
  action,
  children,
  className,
  bodyClassName,
  id,
  tone,
  alert,
  icon: Icon,
  accent,
  tour,
  tourEmpty,
}: {
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  tone?: "danger" | "warning" | "info";
  alert?: boolean;
  /** A coloured badge before the title, so each card is recognisable at a glance. */
  icon?: LucideIcon;
  /** The badge's colour; defaults to the tone, else indigo. */
  accent?: Accent;
  /** Product-tour anchor (data-tour). */
  tour?: string;
  /** The section has nothing in it yet; the tour shows a preview instead. */
  tourEmpty?: boolean;
}) {
  const hot = alert && (count === undefined || count > 0);
  const badge = accent ?? tone ?? "primary";
  const warm = tone && count !== undefined && count > 0;
  return (
    <section
      id={id}
      data-tour={tour}
      data-tour-empty={tourEmpty ? "true" : undefined}
      className={cn(
        "flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-[10px] border bg-card shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]",
        hot && "border-danger/35",
        tone === "warning" && !alert && count !== undefined && count > 0 && "border-warning/35",
        className,
      )}
    >
      <header
        className={cn(
          "flex min-h-10 items-center gap-2 border-b px-3.5 py-2",
          hot ? "border-danger/25 bg-wash-danger text-danger" : warm && tone === "warning" ? "bg-wash-warning" : warm && tone === "info" ? "bg-wash-info" : "bg-surface-2/60",
        )}
      >
        <h2 className="flex items-center gap-2 text-[12.5px] font-semibold">
          {Icon && (
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", ACCENT_BADGE[badge])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
          )}
          {title}
          {count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[11px] font-medium tabular",
                tone === "danger" && count > 0
                  ? "bg-danger/14 text-danger"
                  : tone === "warning" && count > 0
                    ? "bg-warning/16 text-warning"
                    : tone === "info" && count > 0
                      ? "bg-info/14 text-info"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          )}
        </h2>
        {action && <div className="ml-auto text-xs font-normal text-muted-foreground">{action}</div>}
      </header>
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Overline label that groups rows inside a section ("Due today", "Mon 5 Oct"). */
export function SectionGroup({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn("px-3.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase", !first && "border-t")}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-12")}>
      {Icon && <Icon className="mb-3 size-6 text-muted-foreground/70" aria-hidden />}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A row-shaped link used in dashboard lists. */
export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-10 items-center gap-2.5 px-4 py-2 transition-colors duration-150 outline-none hover:bg-primary/[0.04] focus-visible:bg-accent",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "warning" | "success";
  icon?: LucideIcon;
  accent?: Accent;
}) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 shadow-[var(--shadow-card)]", ACCENT_WASH[accent])}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && (
          <span className={cn("grid size-5 place-items-center rounded-md", ACCENT_BADGE[accent])}>
            <Icon className="size-3" aria-hidden />
          </span>
        )}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const PILL_TONE = {
  neutral: "border-border text-muted-foreground bg-card",
  danger: "border-danger/40 text-danger bg-danger/[0.08]",
  warning: "border-warning/40 text-warning bg-warning/[0.09]",
  deadline: "border-deadline/40 text-deadline bg-deadline/[0.08]",
  info: "border-info/40 text-info bg-info/[0.08]",
  success: "border-success/40 text-success bg-success/[0.08]",
  solidDanger: "border-transparent bg-danger text-white",
} as const;

export type PillTone = keyof typeof PILL_TONE;

/** Small rounded label for state: "At risk", "Overdue", "On track". */
export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[21px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap", PILL_TONE[tone], className)}>
      {children}
    </span>
  );
}
