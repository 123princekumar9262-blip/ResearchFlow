import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMinutes, formatShortDate } from "@/lib/domain/dates";

/**
 * Hours logged per week: one series, one hue, so no legend (the title names it).
 * Thin bars anchored to the baseline, rounded only at the data end, values on
 * hover, and a visually hidden table for screen readers.
 */
export function WeeklyHoursChart({ weeks, title = "Hours logged per week" }: { weeks: { weekStart: string; minutes: number }[]; title?: string }) {
  const max = Math.max(60, ...weeks.map((w) => w.minutes));
  const peak = weeks.reduce((best, w) => (w.minutes > best.minutes ? w : best), weeks[0]);

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between text-[13px] font-medium">
        {title}
        <span className="text-xs font-normal text-muted-foreground">last {weeks.length} weeks</span>
      </figcaption>
      <div className="relative h-32 border-b border-border" aria-hidden>
        {/* recessive gridline at the max */}
        <span className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <span className="absolute -top-2 right-0 bg-card pl-1 font-mono text-[10px] text-muted-foreground">{formatMinutes(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] pr-10">
          {weeks.map((w) => (
            <Tooltip key={w.weekStart}>
              <TooltipTrigger asChild>
                {/* Hit target is the full column, larger than the bar. */}
                <span className="flex h-full flex-1 items-end justify-center">
                  <span
                    className="block w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity hover:opacity-80"
                    style={{ height: w.minutes === 0 ? 0 : `max(2px, ${(w.minutes / max) * 100}%)` }}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Week of {formatShortDate(w.weekStart)}: {formatMinutes(w.minutes)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="flex gap-[2px] pr-10 font-mono text-[10px] text-muted-foreground" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.weekStart} className="flex-1 text-center">
            {i === 0 || i === weeks.length - 1 || w === peak ? formatShortDate(w.weekStart) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Week starting</th>
            <th>Time logged</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{w.weekStart}</td>
              <td>{formatMinutes(w.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
