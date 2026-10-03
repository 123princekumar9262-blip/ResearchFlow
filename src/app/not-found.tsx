import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <h1 className="mt-2 text-lg font-semibold">Not found, or not yours to see</h1>
      <p className="mt-1 text-muted-foreground">
        Projects are visible only to their members. If you expected access, ask a member to add you.
      </p>
      <Button asChild className="mt-5">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
