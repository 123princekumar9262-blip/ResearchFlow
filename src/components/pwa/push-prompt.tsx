"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellRing, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestNotification } from "@/server/actions/notifications";
import { usePush } from "./use-push";

const KEY = "rf.push.prompt";
const SNOOZE_DAYS = 14;
const noop = () => () => {};

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY) ?? 0);
    return Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * On the dashboard until this device has notifications: one tap asks the
 * browser, subscribes, and sends a test so the person hears what it sounds like.
 * "Not now" hides it for two weeks.
 */
export function PushPrompt({ role }: { role: "student" | "professor" }) {
  const push = usePush();
  const hiddenEarlier = useSyncExternalStore(noop, snoozed, () => true);
  const [hidden, setHidden] = useState(false);

  if (hidden || hiddenEarlier || !push.ready || push.blocked) return null;
  if (push.support === "install-first") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5 text-[14px]">
        <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1">
          <b className="font-semibold">Want pop-ups on your iPhone?</b> Install the app first (Share → Add to Home Screen), open it from your home screen, then turn on notifications in{" "}
          <Link href="/settings#notifications" className="text-primary underline">
            Settings
          </Link>
          .
        </p>
        <Dismiss onClick={() => hide(setHidden)} />
      </div>
    );
  }
  if (push.support !== "supported" || push.subscribed !== false) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[14px] font-semibold">Get a pop-up when something needs you</p>
        <p className="text-[13px] text-muted-foreground">
          {role === "professor"
            ? "With sound, in your notification bar: submissions, blockers, extension requests and meetings."
            : "With sound, in your notification bar: feedback, new tasks, review results and meetings."}
        </p>
        {push.error && <p className="mt-1 text-xs text-danger">{push.error}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => hide(setHidden)}>
          Not now
        </Button>
        <Button
          size="sm"
          disabled={push.busy}
          onClick={async () => {
            if (!(await push.turnOn())) return;
            const res = await sendTestNotification();
            toast.success(res.ok ? "Notifications are on. A test is on its way." : "Notifications are on.");
          }}
        >
          {push.busy ? <Loader2 className="animate-spin" /> : <BellRing />} Turn on
        </Button>
      </div>
    </div>
  );
}

function hide(setHidden: (v: boolean) => void) {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {}
  setHidden(true);
}

function Dismiss({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      <X className="size-4" />
    </button>
  );
}
