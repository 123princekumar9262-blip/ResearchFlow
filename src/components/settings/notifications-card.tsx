"use client";

import { BellRing, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useServerAction } from "@/components/common/use-server-action";
import { usePush } from "@/components/pwa/use-push";
import { sendTestNotification, setDigestEmail } from "@/server/actions/notifications";

/** Settings → Notifications: phone notifications for this device, and the morning email. */
export function NotificationsCard({ digestEmail, emailReady }: { digestEmail: boolean; emailReady: boolean }) {
  const { support, subscribed, busy, error, ready, turnOn, turnOff } = usePush();
  const test = useServerAction();
  const digest = useServerAction();
  const publicKey = ready;

  return (
    <div className="divide-y">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BellRing className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Phone notifications</p>
          <p className="text-xs text-muted-foreground">
            {support === "install-first"
              ? "On iPhone, install the app first (Share → Add to Home Screen), then open it and turn this on."
              : support === "unsupported"
                ? "This browser can't receive notifications. Use Chrome, Edge or Firefox, or the installed app."
                : !publicKey
                  ? "Notifications aren't set up on the server yet."
                  : "Pop-ups with sound for feedback, reviews, new tasks, meetings and extension decisions, plus a morning and evening nudge. On this device only."}
          </p>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
        {support === "supported" && publicKey && (
          <div className="flex items-center gap-2">
            {subscribed && (
              <Button size="sm" variant="ghost" disabled={test.pending} onClick={() => test.run(() => sendTestNotification())}>
                {test.pending ? <Loader2 className="animate-spin" /> : <Send />} Test
              </Button>
            )}
            <Switch checked={!!subscribed} disabled={busy || subscribed === null} onCheckedChange={(on) => void (on ? turnOn() : turnOff())} aria-label="Phone notifications" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
          <Mail className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Morning email</p>
          <p className="text-xs text-muted-foreground">
            {emailReady
              ? "One email at 8:00: what's due, what's overdue, and what your professor needs."
              : "Email isn't set up on the server yet; this takes effect once it is."}
          </p>
        </div>
        <Switch checked={digestEmail} disabled={digest.pending} onCheckedChange={(on) => digest.run(() => setDigestEmail({ enabled: on }))} aria-label="Morning email" />
      </div>
    </div>
  );
}
