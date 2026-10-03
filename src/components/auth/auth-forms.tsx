"use client";

import Link from "next/link";
import { useBrowserTimezone } from "@/components/common/use-browser-timezone";
import { useActionState, useState } from "react";
import { GraduationCap, Loader2, Presentation } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, signIn, signUp, updatePassword, type AuthState } from "@/server/actions/auth";
import { PasswordInput } from "./password-input";

function Alert({ tone, children }: { tone: "error" | "notice"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success",
      )}
    >
      {children}
    </p>
  );
}

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-muted-foreground">Welcome back.</p>
      </div>
      {linkError && !state && (
        <Alert tone="error">
          That link is invalid or expired. Links work once, in the browser you requested them from.{" "}
          <Link href="/forgot-password" className="font-medium underline underline-offset-2">
            Get a new reset link
          </Link>
        </Alert>
      )}
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} autoFocus />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required minLength={8} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Sign in
      </Button>
      <p className="text-center text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

const ROLES = [
  { value: "student", label: "Student", hint: "I do the research", icon: GraduationCap },
  { value: "professor", label: "Professor", hint: "I supervise", icon: Presentation },
] as const;

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  const [role, setRole] = useState<"student" | "professor">("student");
  // The server can't know the visitor's timezone; the browser fills it in after hydration.
  const timezone = useBrowserTimezone("UTC");

  if (state?.notice) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <Alert tone="notice">{state.notice}</Alert>
        <Link href="/login" className="block text-center font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Create your account</h1>
        <p className="text-muted-foreground">Your role decides who owns deadlines and approvals.</p>
      </div>
      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">I am a</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
                role === value ? "border-primary bg-primary/5" : "hover:bg-accent",
              )}
            >
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
              <Icon className={cn("size-4", role === value ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <input type="hidden" name="timezone" value={timezone} />
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={120} placeholder={role === "professor" ? "Prof. Anita Mehta" : "Riya Gupta"} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Create account
      </Button>
      <p className="text-center text-muted-foreground">
        Already have one?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="text-muted-foreground">Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.</p>
      </div>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.notice ? (
        <Alert tone="notice">{state.notice}</Alert>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} autoFocus />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </>
      )}
      <p className="text-center text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  if (state?.notice) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Password changed</h1>
        <Alert tone="notice">{state.notice}</Alert>
        <Button asChild className="w-full">
          <Link href="/dashboard">Continue to ResearchFlow</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <p className="text-muted-foreground">For {email}.</p>
      </div>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} autoFocus />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save new password
      </Button>
    </form>
  );
}
