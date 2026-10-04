"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, fail, ok, unwrap } from "@/lib/actions";
import { isPushConfigured, pushToUsers } from "@/lib/notify/push";
import { adminClient } from "@/lib/supabase/admin";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://"),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  userAgent: z.string().max(300).default(""),
});

/** This device agreed to notifications: remember where to send them. */
export async function savePushSubscription(input: z.input<typeof subscriptionSchema>) {
  return action(subscriptionSchema, input, async (d, { supabase, userId }) => {
    const { data: mine } = await supabase.from("push_subscriptions").select("id").eq("endpoint", d.endpoint).maybeSingle();
    if (mine) return ok(null, "Notifications are on for this device");
    // A shared device that was subscribed under another account now belongs to this one.
    await adminClient()?.from("push_subscriptions").delete().eq("endpoint", d.endpoint).neq("user_id", userId);
    unwrap(await supabase.from("push_subscriptions").insert({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, user_agent: d.userAgent }));
    return ok(null, "Notifications are on for this device");
  });
}

export async function removePushSubscription(input: { endpoint: string }) {
  return action(z.object({ endpoint: z.string().min(1) }), input, async (d, { supabase }) => {
    unwrap(await supabase.from("push_subscriptions").delete().eq("endpoint", d.endpoint));
    return ok(null, "Notifications are off for this device");
  });
}

export async function sendTestNotification() {
  return action(z.object({}), {}, async (_d, { userId }) => {
    if (!isPushConfigured()) return fail("Notifications aren't set up on the server yet.");
    const sent = await pushToUsers([userId], {
      title: "Notifications are working",
      body: "You'll get a pop-up like this for feedback, new tasks, reviews and meetings.",
      url: "/dashboard",
      tag: "test",
    });
    return sent > 0 ? ok(null, "Test sent. It should arrive in a few seconds.") : fail("No device is subscribed yet. Turn notifications on first.");
  });
}

export async function setDigestEmail(input: { enabled: boolean }) {
  return action(z.object({ enabled: z.boolean() }), input, async (d, { supabase, userId }) => {
    unwrap(await supabase.from("profiles").update({ digest_email: d.enabled }).eq("id", userId));
    refresh();
    return ok(null, d.enabled ? "Morning email on" : "Morning email off");
  });
}
