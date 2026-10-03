"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/components/common/use-server-action";
import { joinProfessor } from "@/server/actions/profile";

/** A student links to their professor with the professor's join code. */
export function JoinProfessorCard({ compact }: { compact?: boolean }) {
  const [code, setCode] = useState("");
  const { pending, run } = useServerAction();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => joinProfessor({ code }), { onSuccess: () => setCode("") });
      }}
      className={cn("flex flex-col gap-3 rounded-xl border border-dashed bg-card p-4 sm:flex-row sm:items-center", compact && "py-3")}
    >
      <Link2 className="hidden size-5 text-muted-foreground sm:block" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Link your professor</p>
        <p className="text-muted-foreground">
          Enter the join code from your professor. Once you add them to a project, they own its deadlines and approve your work.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7Q2MX4P"
          aria-label="Professor join code"
          className="w-36 font-mono tracking-widest uppercase"
          maxLength={20}
        />
        <Button type="submit" disabled={pending || code.trim().length < 4}>
          {pending && <Loader2 className="animate-spin" />} Link
        </Button>
      </div>
    </form>
  );
}
