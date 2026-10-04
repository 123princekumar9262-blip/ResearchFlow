"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteMessage } from "@/components/settings/join-code";
import { useOnboardingMaybe } from "./provider";
import { clickTourTarget, Tip } from "./tips";

/** Professor with no students: copy a ready-made invitation. */
export function InviteTip({ code }: { code: string }) {
  const api = useOnboardingMaybe();
  return (
    <Tip
      id="prof-no-students"
      kind="state"
      title="Share your join code."
      cta={{
        label: "Copy invite message",
        onClick: () =>
          navigator.clipboard.writeText(inviteMessage(code, window.location.origin)).then(
            () => {
              toast.success("Invite message copied");
              if (api && !api.state.shared) api.update({ shared: true });
            },
            () => toast.error("Couldn't copy. Your code is in Settings."),
          ),
      }}
    >
      Students appear here as soon as they enter it.
    </Tip>
  );
}

/** A project with no tasks yet. */
export function FirstTaskTip() {
  return (
    <Tip
      id="tasks-empty"
      kind="discovery"
      title="Start by creating your first task."
      cta={{
        label: (
          <>
            New task <kbd>C</kbd>
          </>
        ),
        onClick: () => clickTourTarget("new-task"),
      }}
    >
      Break the first milestone into pieces you can finish in a few days.
    </Tip>
  );
}

/** A project with no milestones yet. */
export function FirstMilestoneTip() {
  return (
    <Tip id="milestones-empty" kind="discovery" title="Add your first milestone." cta={{ label: "Add milestone", onClick: () => clickTourTarget("add-milestone") }}>
      Milestones are the checkpoints your professor tracks.
    </Tip>
  );
}

/** Stage 1, professors: the one primary action, a ready-made invitation. */
export function CopyInviteButton({ code }: { code: string }) {
  const api = useOnboardingMaybe();
  return (
    <Button
      size="lg"
      onClick={() =>
        navigator.clipboard.writeText(inviteMessage(code, window.location.origin)).then(
          () => {
            toast.success("Invite message copied");
            if (api && !api.state.shared) api.update({ shared: true });
          },
          () => toast.error("Couldn't copy. Select the code and copy it instead."),
        )
      }
    >
      <Copy /> Copy invite message
    </Button>
  );
}
