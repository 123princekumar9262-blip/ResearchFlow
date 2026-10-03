"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions";

/**
 * Runs a Server Action inside a transition and reports the outcome as a toast.
 * Rule violations from the database come back as readable messages, so they
 * are shown as-is.
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition();

  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; onError?: (error: string) => void } = {},
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        const message = typeof opts.success === "function" ? opts.success(result.data) : (opts.success ?? result.message);
        if (message) toast.success(message);
        opts.onSuccess?.(result.data);
      } else {
        toast.error(result.error);
        opts.onError?.(result.error);
      }
    });
  }

  return { pending, run };
}
