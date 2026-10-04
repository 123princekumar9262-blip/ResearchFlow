"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, EllipsisVertical, ExternalLink, MonitorDown, MonitorSmartphone, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LogoMark } from "@/components/brand";
import { useLocalStorage } from "@/components/common/use-local-storage";

// ───────────────────────────── install state ─────────────────────────────

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * - "installed": running as the installed app, or installed in this session.
 * - "prompt": the browser offered installation (Chrome, Edge, Android).
 * - "ios": Safari on iPhone/iPad, where installing is Share → Add to Home Screen.
 * - "unavailable": not offered here (unsupported browser, or not served over HTTPS).
 */
export type InstallState = "installed" | "prompt" | "ios" | "unavailable";

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own mini-infobar from popping up; the app offers it in context instead.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    standalone.removeEventListener("change", onChange);
  };
}

function snapshot(): InstallState {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || installedNow) return "installed";
  if (deferred) return "prompt";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "unavailable";
}

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const state = useSyncExternalStore(subscribe, snapshot, () => "unavailable" as const);
  const install = async () => {
    if (!deferred) return;
    const event = deferred;
    deferred = null;
    await event.prompt();
    await event.userChoice;
    emit();
  };
  return { state, install };
}

// ───────────────────────────── service worker ─────────────────────────────

/** Registers the service worker that keeps the offline page on the device. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
    navigator.serviceWorker.register(url, { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the app works without it, just with no offline page.
    });
  }, []);
  return null;
}

// ───────────────────────────── UI ─────────────────────────────

function IosSteps({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        <div>
          <DialogTitle>Add ResearchFlow to your Home Screen</DialogTitle>
          <DialogDescription>It opens full screen, like any app, straight to today.</DialogDescription>
        </div>
        <ol className="space-y-3 text-[14px]">
          <li className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
              <Share className="size-4" aria-hidden />
            </span>
            <span>
              Tap <b>Share</b> in Safari&apos;s toolbar.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
              <SquarePlus className="size-4" aria-hidden />
            </span>
            <span>
              Scroll down and tap <b>Add to Home Screen</b>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
              <LogoMark className="size-4" />
            </span>
            <span>
              Tap <b>Add</b>. Open ResearchFlow from its new icon.
            </span>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}

type Platform = "android" | "desktop" | "in-app";

function platform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // Browsers inside other apps (WhatsApp, Instagram, Gmail…) can't install anything.
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua)) return "in-app";
  return /Android/i.test(ua) ? "android" : "desktop";
}

function Step({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** How to install from the browser's own menu, when it doesn't offer a one-tap install. */
function ManualSteps({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const where = platform();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        <div>
          <DialogTitle>Install ResearchFlow</DialogTitle>
          <DialogDescription>It opens full screen, like any app. This takes three taps.</DialogDescription>
        </div>
        <ol className="space-y-3 text-[14px]">
          {where === "in-app" && (
            <Step icon={<ExternalLink className="size-4" aria-hidden />}>
              This page is open inside another app. Open the menu and choose <b>Open in Chrome</b> (or your browser) first.
            </Step>
          )}
          {where !== "desktop" ? (
            <>
              <Step icon={<EllipsisVertical className="size-4" aria-hidden />}>
                In <b>Chrome</b>, tap the <b>⋮</b> menu at the top right.
              </Step>
              <Step icon={<SquarePlus className="size-4" aria-hidden />}>
                Tap <b>Install app</b> (on some phones: <b>Add to Home screen</b>).
              </Step>
              <Step icon={<LogoMark className="size-4" />}>
                Tap <b>Install</b>. Open ResearchFlow from its new icon.
              </Step>
            </>
          ) : (
            <>
              <Step icon={<MonitorDown className="size-4" aria-hidden />}>
                In <b>Chrome</b> or <b>Edge</b>, click the <b>install icon</b> at the right end of the address bar.
              </Step>
              <Step icon={<EllipsisVertical className="size-4" aria-hidden />}>
                No icon? Open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b> (in Edge: <b>…</b> → <b>Apps</b> → <b>Install this site as an app</b>).
              </Step>
              <Step icon={<LogoMark className="size-4" />}>
                Click <b>Install</b>. ResearchFlow opens in its own window.
              </Step>
            </>
          )}
        </ol>
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          If the menu says <b className="text-foreground">Open app</b> instead, ResearchFlow is already installed: look for its icon on your home screen or in your apps.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** "Install app" in the account menu, when this device can install it. */
export function InstallMenuItem() {
  const { state, install } = useInstall();
  const [steps, setSteps] = useState(false);
  if (state === "installed") return null;
  return (
    <>
      <DropdownMenuItem onSelect={() => (state === "prompt" ? void install() : setSteps(true))}>
        <Download /> Install app
      </DropdownMenuItem>
      {state === "ios" ? <IosSteps open={steps} onOpenChange={setSteps} /> : <ManualSteps open={steps} onOpenChange={setSteps} />}
    </>
  );
}

/** A one-line offer above the page, until it's taken or dismissed on this device. */
export function InstallBanner() {
  const { state, install } = useInstall();
  const [dismissed, setDismissed] = useLocalStorage("rf.install.dismissed");
  const [steps, setSteps] = useState(false);
  if ((state !== "prompt" && state !== "ios") || dismissed) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-3.5 py-2.5 print:hidden">
      <LogoMark className="size-7 shrink-0" />
      <p className="min-w-0 flex-1 text-[12.5px]">
        <b className="font-semibold">Install ResearchFlow</b>
        <span className="text-muted-foreground"> · opens full screen from your {state === "ios" ? "Home Screen" : "home screen or desktop"}, like any app.</span>
      </p>
      <Button size="sm" onClick={() => (state === "prompt" ? void install() : setSteps(true))}>
        <Download /> Install
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Not now" onClick={() => setDismissed("1")}>
        <X />
      </Button>
      <IosSteps open={steps} onOpenChange={setSteps} />
    </div>
  );
}

/** Settings: install status and the way to install on this device. */
export function InstallCard() {
  const { state, install } = useInstall();
  const [steps, setSteps] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <MonitorSmartphone className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Install the app</p>
        <p className="text-xs text-muted-foreground">
          {state === "installed"
            ? "You're using the installed app on this device."
            : "Opens full screen from your home screen or desktop, with shortcuts to Today's log and My tasks."}
        </p>
      </div>
      {state !== "installed" && (
        <Button size="sm" onClick={() => (state === "prompt" ? void install() : setSteps(true))}>
          <Download /> Install
        </Button>
      )}
      {state === "ios" ? <IosSteps open={steps} onOpenChange={setSteps} /> : <ManualSteps open={steps} onOpenChange={setSteps} />}
    </div>
  );
}
