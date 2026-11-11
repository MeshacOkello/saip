import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { IconBell } from "@/components/icons";
import { PushToggle } from "@/components/push-toggle";
import {
  Badge,
  EmptyState,
  PageHeader,
  Section,
  Surface,
} from "@/components/ui";
import {
  dismissAction,
  dismissAllAction,
  markAllReadAction,
  markReadAction,
  removeSubscriptionAction,
  sendTestNotificationAction,
} from "@/lib/notifications/actions";
import {
  inbox,
  pushConfigured,
  subscriptionsFor,
  unreadCount,
} from "@/lib/notifications/service";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Notifications · SAIP Board" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const KIND_LABEL: Record<string, string> = {
  message: "Message",
  mention: "Mention",
  task_assigned: "Task",
  task_due: "Due",
  admin_transfer: "Administration",
  reimbursement: "Money",
  event: "Event",
  meeting: "Meeting",
};

/** A rough, honest name for a browser, from its user agent. */
function browserName(userAgent: string | null) {
  if (!userAgent) return "A browser";
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  return "A browser";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ history?: string }>;
}) {
  const { history } = await searchParams;
  const member = await requireMember();
  const showingHistory = history === "1";

  const [rows, unread, browsers] = await Promise.all([
    inbox(member, { includeDismissed: showingHistory }),
    unreadCount(member),
    subscriptionsFor(member),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Your latest updates."
        meta={
          <>
            <span>{unread} unread</span>
            <span>
              {rows.length} {showingHistory ? "in history" : "in your inbox"}
            </span>
          </>
        }
        actions={
          <div className="segmented">
            <Link href="/notifications" aria-current={showingHistory ? undefined : "page"}>
              Inbox
            </Link>
            <Link href="/notifications?history=1" aria-current={showingHistory ? "page" : undefined}>
              History
            </Link>
          </div>
        }
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-4">
          {rows.length > 0 && !showingHistory ? (
            <div className="flex flex-wrap gap-2">
              <ActionForm
                action={markAllReadAction}
                submitLabel="Mark all read"
                variant="secondary"
                size="sm"
                inline
              />
              <ActionForm
                action={dismissAllAction}
                submitLabel="Clear inbox"
                variant="ghost"
                size="sm"
                inline
                confirm="Clear all notifications?"
              />
            </div>
          ) : null}

          <Surface padded={false}>
            {rows.length > 0 ? (
              <ul className="notification-list">
                {rows.map((n) => (
                  <li key={n.id} className={n.readAt ? "" : "is-unread"}>
                    <span className="notification-kind">
                      <Badge tone={n.kind === "mention" ? "primary" : "neutral"}>
                        {KIND_LABEL[n.kind] ?? n.kind}
                      </Badge>
                    </span>
                    <Link href={n.href} className="notification-main">
                      <span className="notification-title">{n.title}</span>
                      {n.body ? (
                        <span className="notification-body">{n.body}</span>
                      ) : null}
                      <span className="notification-when">
                        {WHEN.format(n.createdAt)}
                        {n.dismissedAt ? " · dismissed" : ""}
                      </span>
                    </Link>
                    {!n.dismissedAt ? (
                      <span className="notification-actions">
                        {n.readAt ? null : (
                          <ActionForm
                            action={markReadAction}
                            submitLabel="Read"
                            variant="ghost"
                            size="sm"
                            inline
                            hidden={{ notificationId: n.id }}
                          />
                        )}
                        <ActionForm
                          action={dismissAction}
                          submitLabel="Dismiss"
                          variant="ghost"
                          size="sm"
                          inline
                          hidden={{ notificationId: n.id }}
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<IconBell />}
                title={showingHistory ? "Nothing in history" : "Nothing waiting"}
              >
                Messages, mentions, tasks handed to you, offers of administration and
                movement on your reimbursements all land here.
              </EmptyState>
            )}
          </Surface>
        </div>

        <aside className="min-w-0 space-y-7" aria-label="Notification settings">
          <Section
            title="Notifications on this device"
            description="Get notified about new messages, tasks and upcoming events."
          >
            <Surface>
              <PushToggle
                publicKey={
                  pushConfigured
                    ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null)
                    : null
                }
              />
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm
                  action={sendTestNotificationAction}
                  submitLabel="Send a test"
                  variant="secondary"
                  size="sm"
                />
              </div>
            </Surface>
          </Section>

          {browsers.length > 0 ? (
            <Section title={`Registered browsers · ${browsers.length}`}>
              <Surface padded={false}>
                <ul className="ledger">
                  {browsers.map((b) => (
                    <li key={b.id}>
                      <span className="ledger-main">
                        <span className="ledger-title">
                          {browserName(b.userAgent)}
                        </span>
                        <span className="ledger-sub">
                          added {b.createdAt.toISOString().slice(0, 10)}
                          {b.lastUsedAt
                            ? ` · last pushed ${b.lastUsedAt.toISOString().slice(0, 10)}`
                            : " · never pushed"}
                          {b.failedAt ? " · failing" : ""}
                        </span>
                      </span>
                      <ActionForm
                        action={removeSubscriptionAction}
                        submitLabel="Remove"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ endpoint: b.endpoint }}
                      />
                    </li>
                  ))}
                </ul>
              </Surface>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
