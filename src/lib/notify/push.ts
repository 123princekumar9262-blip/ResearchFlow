import "server-only";

import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification opens. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
}

export interface PushOptions {
  /** Someone acted and is waiting on you: delivered at once, even to a phone in battery saving. */
  urgent?: boolean;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && adminClient());
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://researchflow.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Sends one notification to every device of each user. Devices the push
 * service no longer knows (uninstalled, permission revoked) are removed.
 * Never throws: a failed notification must not fail the action that caused it.
 */
export async function pushToUsers(userIds: string[], message: PushMessage, options: PushOptions = {}): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0 || !isPushConfigured()) return 0;
  configure();
  const admin = adminClient()!;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", unique);
  if (!subs?.length) return 0;

  const payload = JSON.stringify(message);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: options.urgent ? "high" : "normal" });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
      }
    }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return sent;
}
