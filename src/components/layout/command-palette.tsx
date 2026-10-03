"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { FolderKanban, Laptop, Moon, NotebookPen, Plus, Search, Sun } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { navFor, PROJECTS_ITEM, SETTINGS_ITEM } from "./nav";
import type { UserRole } from "@/types/database";

const OPEN_EVENT = "researchflow:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * ⌘K palette plus the global keyboard map: g-chords for navigation, "n" for a
 * new log, "?" for help. Keys are ignored while typing in a field.
 */
export function CommandPalette({ role, projects }: { role: UserRole; projects: { id: string; title: string }[] }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = useMemo(() => [...navFor(role), PROJECTS_ITEM, SETTINGS_ITEM], [role]);

  useEffect(() => {
    let chordAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;

      const key = e.key.toLowerCase();
      if (Date.now() - chordAt < 1200) {
        chordAt = 0;
        const target = nav.find((item) => item.chord === key);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "g") chordAt = Date.now();
      else if (key === "n" && role === "student") {
        e.preventDefault();
        router.push("/log/new");
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [router, role, nav]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search and run commands" description="Jump to a page or project, or run an action.">
        <CommandInput placeholder="Jump to a project or page, or run an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Actions">
            {role === "student" && (
              <CommandItem onSelect={() => go("/log/new")}>
                <NotebookPen /> Write today&apos;s progress log <CommandShortcut>N</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => go("/projects?new=1")}>
              <Plus /> New project
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Go to">
            {nav.map((item) => (
              <CommandItem key={item.href} onSelect={() => go(item.href)}>
                <item.icon /> {item.label}
                <CommandShortcut>G {item.chord.toUpperCase()}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          {projects.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Projects">
                {projects.map((p) => (
                  <CommandItem key={p.id} value={`project ${p.title}`} onSelect={() => go(`/projects/${p.id}`)}>
                    <FolderKanban /> {p.title}
                  </CommandItem>
                ))}
                {projects.map((p) => (
                  <CommandItem key={`${p.id}-tasks`} value={`tasks board ${p.title}`} onSelect={() => go(`/projects/${p.id}/tasks`)}>
                    <FolderKanban /> {p.title} › Tasks
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => (setTheme("light"), setOpen(false))}>
              <Sun /> Light
            </CommandItem>
            <CommandItem onSelect={() => (setTheme("dark"), setOpen(false))}>
              <Moon /> Dark
            </CommandItem>
            <CommandItem onSelect={() => (setTheme("system"), setOpen(false))}>
              <Laptop /> System
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <CommandDialog open={helpOpen} onOpenChange={setHelpOpen} title="Keyboard shortcuts" description="Shortcuts work anywhere outside a text field.">
        <div className="space-y-1 p-4 text-sm">
          <p className="mb-3 font-medium">Keyboard shortcuts</p>
          {[
            ["⌘K / Ctrl K", "Command palette"],
            ...nav.map((n) => [`G then ${n.chord.toUpperCase()}`, n.label]),
            ...(role === "student" ? [["N", "New progress log"]] : []),
            ["Ctrl/⌘ Enter", "Submit the form you're in"],
            ["?", "This help"],
            ["Esc", "Close"],
          ].map(([keys, label]) => (
            <div key={keys} className="flex items-center justify-between border-b py-1.5 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono text-xs">{keys}</span>
            </div>
          ))}
        </div>
      </CommandDialog>
    </>
  );
}

export function SearchButton() {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-2 text-muted-foreground" onClick={openCommandPalette}>
      <Search className="size-3.5" />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden sm:inline-flex">⌘K</kbd>
    </Button>
  );
}
