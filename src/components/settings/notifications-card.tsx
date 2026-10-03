"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useServerAction } from "@/components/common/use-server-action";
import { removePushSubscription, savePushSubscription, sendTestNotification, setDigestEmail } from "@/server/actions/notifications";

type Support = "unknown" | "supported" | "install-first" | "unsupported";

const noop = () => () => {};

function detectSupport(): Support {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ios && !standalone) return "install-first";
  return capable ? "supported" : "unsupported";
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Settings → Notifications: phone notifications for this device, and the morning email. */
export function NotificationsCard({ digestEmail, emailReady }: { digestEmail: boolean; emailReady: boolean }) {
  const support = useSyncExternalStore(noop, detectSupport, () => "unknown" as Support);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const test = useServerAction();
  const digest = useServerAction();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (support !== "supported") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, [support]);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }));
      const json = sub.toJSON();
      const result = await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent.slice(0, 300) });
      if (!result.ok) throw new Error(result.error);
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

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
                  : "Professor feedback, reviews, extension decisions, and a morning and evening nudge. On this device only."}
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
