import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Choose a new password" };

/** Where the emailed reset link lands, already signed in by /auth/confirm. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">This link has expired</h1>
        <p className="text-muted-foreground">
          Reset links work once, for an hour, in the browser you requested them from. Ask for a new one and open it here.
        </p>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Send a new reset link</Link>
        </Button>
      </div>
    );
  }
  return <ResetPasswordForm email={data.user.email ?? "your account"} />;
}
