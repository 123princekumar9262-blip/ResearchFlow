"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/components/onboarding/provider";
import { saveOnboarding } from "@/server/actions/onboarding";

/**
 * "Show everything" (calm redesign spec, Phase 01): every page, section and
 * tool at once, instead of each appearing when the work behind it exists.
 */
export function ShowEverything() {
  const api = useOnboarding();
  const router = useRouter();
  const [pending, start] = useTransition();
  const on = !!api.state.all;

  return (
    <div className="flex items-start gap-3 border-t px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Show everything</p>
        <p className="text-muted-foreground">
          {api.persisted
            ? "Every page, section and filter from the start. Off: each one appears once the work behind it exists, so you only see what matters now."
            : "Available once the onboarding database update is applied."}
        </p>
      </div>
      <Switch
        checked={on}
        disabled={!api.persisted || pending}
        aria-label="Show everything"
        onCheckedChange={(v) =>
          start(async () => {
            api.update({ all: v });
            await saveOnboarding({ all: v });
            router.refresh();
          })
        }
      />
    </div>
  );
}
