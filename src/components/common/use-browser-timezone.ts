"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The device's IANA timezone. Renders `fallback` on the server and during
 * hydration, so markup matches, then switches to the browser's value.
 */
export function useBrowserTimezone(fallback: string): string {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => fallback,
  );
}
