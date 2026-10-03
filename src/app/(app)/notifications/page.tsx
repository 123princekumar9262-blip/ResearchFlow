import { BellOff, BellRing, Info } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/common/ui-bits";
import { InboxRow } from "@/components/layout/inbox";
import { getShell } from "@/lib/data/shell";

export const metadata = { title: "Notifications" };

/**
 * The inbox is derived from live data: an item disappears as soon as its cause
 * is resolved (a request addressed, a review done), so it never goes stale.
 */
export default async function NotificationsPage() {
  const { inbox } = await getShell();
  const needs = inbox.filter((i) => i.needsAction);
  const fyi = inbox.filter((i) => !i.needsAction);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader inTopBar title="Notifications" description="What's waiting on you, and decisions made about your work this week." />
      {inbox.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={BellOff} title="You're caught up">
            New requests, reviews and deadlines appear here.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-5">
          <Section icon={BellRing} title="Needs action" count={needs.length} tone="warning" bodyClassName="p-1.5">
            {needs.length === 0 ? <p className="px-3 py-5 text-center text-muted-foreground">Nothing is waiting on you.</p> : needs.map((i) => <InboxRow key={i.id} item={i} />)}
          </Section>
          {fyi.length > 0 && (
            <Section icon={Info} accent="info" title="For your information" count={fyi.length} bodyClassName="p-1.5">
              {fyi.map((i) => (
                <InboxRow key={i.id} item={i} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
