"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { removePushSubscription, savePushSubscription } from "@/server/actions/notifications";

export type PushSupport = "unknown" | "supported" | "install-first" | "unsupported";

const noop = () => () => {};

function detectSupport(): PushSupport {
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

/**
 * This device's phone/desktop notifications: whether they can work here,
 * whether they're on, and turning them on or off. `blocked` means the person
 * said no in the browser's own prompt; only the browser's site settings can undo that.
 */
export function usePush() {
  const support = useSyncExternalStore(noop, detectSupport, () => "unknown" as PushSupport);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (support !== "supported") return;
    let live = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!live) return;
        setSubscribed(Boolean(sub));
        setBlocked(Notification.permission === "denied");
      })
      .catch(() => live && setSubscribed(false));
    return () => {
      live = false;
    };
  }, [support]);

  const turnOn = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBlocked(permission === "denied");
        setError("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }));
      const json = sub.toJSON();
      const result = await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent.slice(0, 300) });
      if (!result.ok) throw new Error(result.error);
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications on.");
      return false;
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

  return { support, subscribed, blocked, busy, error, ready: Boolean(publicKey), turnOn, turnOff };
}
