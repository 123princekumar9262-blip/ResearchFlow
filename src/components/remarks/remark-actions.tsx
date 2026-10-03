"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/common/use-server-action";
import { setRemarkAddressed } from "@/server/actions/remarks";

export function AddressedToggle({ remarkId, addressed }: { remarkId: string; addressed: boolean }) {
  const { pending, run } = useServerAction();
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={() => run(() => setRemarkAddressed({ remarkId, addressed: !addressed }))}
      title={addressed ? "Reopen: it still needs a response" : "Mark as addressed without creating a task"}
    >
      {addressed ? <RotateCcw /> : <Check />}
      {addressed ? "Reopen" : "Mark addressed"}
    </Button>
  );
}
