import { cn } from "cn";
import { formatDay, formatMinutes, weekdayShort } from "@/lib/domain/dates";

/** GitHub-style consistency grid: one column per week, Monday at the top. */
export function Heatmap({ cells, today }: { cells: { date: string; minutes: number; logs: number }[]; today: string }) {
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (m: number, logs: number) => (logs === 0 ? 0 : m < 60 ? 1 : m < 150 ? 2 : m < 300 ? 3 : 4);
  const shades = ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];
  const active = cells.filter((c) => c.logs > 0 && c.date <= today).length;
  const elapsed = cells.filter((c) => c.date <= today).length;

  return (
    <figure className="space-y-2">
      <div className="flex gap-2 overflow-x-auto">
        <div className="grid grid-rows-7 gap-[3px] pr-1 text-[9px] leading-[11px] text-muted-foreground">
          {[0, 2, 4].map((i) => (
            <span key={i} style={{ gridRow: i + 1 }}>
              {weekdayShort(i)}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week) => (
            <div key={week[0].date} className="grid grid-rows-7 gap-[3px]">
              {week.map((c) => (
                <span
                  key={c.date}
                  title={c.date > today ? undefined : `${formatDay(c.date)}: ${c.logs ? formatMinutes(c.minutes) : "no log"}`}
                  className={cn(
                    "size-[11px] rounded-[2px]",
                    c.date > today ? "bg-transparent" : shades[level(c.minutes, c.logs)],
                    c.date === today && "ring-1 ring-foreground/40",
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Logged on {active} of the last {elapsed} days
        </span>
        <span className="ml-auto flex items-center gap-1">
          less
          {shades.map((s) => (
            <span key={s} className={cn("size-[9px] rounded-[2px]", s)} />
          ))}
          more
        </span>
      </figcaption>
    </figure>
  );
}
