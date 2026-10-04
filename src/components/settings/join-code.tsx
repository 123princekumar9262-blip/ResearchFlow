"use client";

import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/common/use-server-action";
import { regenerateJoinCode } from "@/server/actions/profile";
import { useOnboardingMaybe } from "@/components/onboarding/provider";
import { formatCode, inviteMessage } from "@/lib/join-code";

export { formatCode, inviteMessage };

/** A professor's join code, for students to link with. */
export function JoinCodeCard({ code, compact }: { code: string; compact?: boolean }) {
  const { pending, run } = useServerAction();
  const onboarding = useOnboardingMaybe();
  return (
    <div data-tour="join-code" className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center", compact && "border-dashed py-3")}>
      <KeyRound className="hidden size-5 text-muted-foreground sm:block" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Your join code</p>
        <p className="text-muted-foreground">Students enter it under Settings → Link your professor.</p>
      </div>
      <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-base tracking-[0.2em]">{formatCode(code)}</code>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Copy code"
          onClick={() =>
            navigator.clipboard.writeText(formatCode(code)).then(() => {
              toast.success("Code copied");
              if (onboarding && !onboarding.state.shared) onboarding.update({ shared: true });
            })
          }
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Generate a new code"
          title="Generate a new code (the old one stops working)"
          disabled={pending}
          onClick={() => run(() => regenerateJoinCode())}
        >
          <RefreshCw className={cn(pending && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
