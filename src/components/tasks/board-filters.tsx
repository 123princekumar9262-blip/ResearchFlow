"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Option = { value: string; label: string };

/** Filters as removable chips; the URL holds them, so a filtered board can be bookmarked. */
export function BoardFilters({ assignees, milestones, doneCount }: { assignees: Option[]; milestones: Option[]; doneCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string | null) => {
    const q = new URLSearchParams(params);
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const hideDone = params.get("hide") === "done";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip label="Assignee" any="anyone" options={assignees} value={params.get("assignee")} onChange={(v) => set("assignee", v)} />
      <Chip label="Milestone" any="all" options={milestones} value={params.get("milestone")} onChange={(v) => set("milestone", v)} />
      <button
        type="button"
        onClick={() => set("hide", hideDone ? null : "done")}
        aria-pressed={hideDone}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
          hideDone ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Hide done{doneCount > 0 && <span className="font-mono text-[10.5px] opacity-70">{doneCount}</span>}
      </button>
    </div>
  );
}

function Chip({ label, any, options, value, onChange }: { label: string; any: string; options: Option[]; value: string | null; onChange: (v: string | null) => void }) {
  const current = options.find((o) => o.value === value);
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full border text-xs", current ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground")}>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-full items-center gap-1 rounded-full pr-1.5 pl-2.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          {label}: <span className={cn(current && "font-medium")}>{current?.label ?? any}</span>
          {!current && <ChevronDown className="size-3 opacity-60" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
            <DropdownMenuRadioItem value="">{any[0].toUpperCase() + any.slice(1)}</DropdownMenuRadioItem>
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {current && (
        <button type="button" onClick={() => onChange(null)} className="mr-1.5 rounded-full p-0.5 hover:bg-primary/10" aria-label={`Clear ${label.toLowerCase()} filter`}>
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
