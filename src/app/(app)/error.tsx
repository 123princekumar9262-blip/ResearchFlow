"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <TriangleAlert className="mb-3 size-6 text-warning" />
      <h1 className="text-lg font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-1 text-muted-foreground">
        Usually a dropped connection. Your data is safe: every change is saved the moment you make it.
        {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <Button className="mt-5" onClick={reset}>
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
