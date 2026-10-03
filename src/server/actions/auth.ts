"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string; email?: string } | undefined;

const credentials = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters."),
});

const signUpSchema = credentials.extend({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
  role: z.enum(["student", "professor"], "Choose student or professor."),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});

/** Only same-site relative paths, so ?next= can't bounce people elsewhere. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.code === "email_not_confirmed" ? "Confirm your email first. Check your inbox for the link." : "Wrong email or password.",
      email,
    };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    fullName: form.get("fullName"),
    role: form.get("role"),
    timezone: form.get("timezone") || "UTC",
  });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const { fullName, role, timezone, ...creds } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...creds,
    options: {
      data: { full_name: fullName, role, timezone },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/welcome`,
    },
  });
  if (error) {
    return { error: error.code === "user_already_exists" ? "An account with that email already exists. Sign in instead." : error.message, email };
  }
  // With email confirmation off, Supabase signs the user straight in.
  if (data.session) redirect("/welcome");
  return { notice: `We sent a confirmation link to ${creds.email}. Open it to finish signing up.`, email };
}

/** Emails a reset link. Says the same thing whether or not the account exists. */
export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.shape.email.safeParse(form.get("email"));
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { error: "Too many emails were sent just now. Wait a minute and try again.", email };
  }
  return {
    notice: `If an account exists for ${parsed.data}, a reset link is on its way. Open it in this browser to choose a new password.`,
    email,
  };
}

const newPasswordSchema = z
  .object({ password: credentials.shape.password, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

/** Sets a new password for the account the reset link signed in. */
export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.code === "same_password" ? "That's your current password. Choose a different one." : error.message };
  }
  return { notice: "Password changed. You're signed in with your new password." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
