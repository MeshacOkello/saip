import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { IconArrowLeft, IconCalendar } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Section,
  Select,
  Surface,
  Textarea,
  WorkspaceHeader,
} from "@/components/ui";
import { currentBoardYear } from "@/lib/board";
import {
  linkContactAction,
  removeContactAction,
  unlinkContactAction,
  updateContactAction,
} from "@/lib/contacts/actions";
import { CONTACT_KINDS, KIND_LABEL, contactById } from "@/lib/contacts/service";
import { requireMember } from "@/lib/session";
import { listEvents } from "@/lib/work/service";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const member = await requireMember();
  const item = await contactById(contactId);
  if (!item || item.deletedAt) notFound();

  const canManage = member.capabilities.has("contacts.manage");
  const year = await currentBoardYear();
  const events = year ? await listEvents(year.id) : [];
  const unlinked = events.filter(
    (e) => !item.events.some((used) => used.eventId === e.id),
  );

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        back={
          <Link href="/contacts" className="workspace-back">
            <IconArrowLeft className="size-4" />
            All contacts
          </Link>
        }
        title={item.name}
        status={<Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>}
        meta={
          <>
            {item.organisation ? <span>{item.organisation}</span> : null}
            {item.email ? (
              <a href={`mailto:${item.email}`} className="text-primary hover:underline">
                {item.email}
              </a>
            ) : null}
            {item.phone ? <span>{item.phone}</span> : null}
            <span>
              {item.events.length > 0
                ? `Used at ${item.events.length} event${item.events.length === 1 ? "" : "s"}`
                : "Not used yet"}
            </span>
          </>
        }
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section
            title="What we know"
            description="Prices, lead times, how it went. The part that is worth passing on."
          >
            <Surface>
              {canManage ? (
                <ActionForm
                  action={updateContactAction}
                  submitLabel="Save"
                  variant="secondary"
                  hidden={{ contactId: item.id }}
                >
                  <Textarea name="notes" rows={7} defaultValue={item.notes ?? ""} />
                </ActionForm>
              ) : item.notes ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
                  {item.notes}
                </p>
              ) : (
                <p className="text-[15px] text-muted">Nothing recorded yet.</p>
              )}
            </Surface>
          </Section>

          <Section
            title="Events they were used at"
            description="Answering “who did we use last time?” without asking around."
          >
            <Surface padded={false}>
              {item.events.length > 0 ? (
                <ul className="ledger">
                  {item.events.map((e) => (
                    <li key={e.eventId}>
                      <span className="ledger-main">
                        <Link
                          href={`/events/${e.eventId}`}
                          className="ledger-title hover:text-primary"
                        >
                          {e.title}
                        </Link>
                        <span className="ledger-sub">
                          {e.startsAt ? DATE.format(e.startsAt) : "No date"}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      </span>
                      {canManage ? (
                        <ActionForm
                          action={unlinkContactAction}
                          submitLabel="Unlink"
                          variant="ghost"
                          size="sm"
                          inline
                          hidden={{ contactId: item.id, eventId: e.eventId }}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<IconCalendar />} title="Not linked to an event yet">
                  Link them from here or from the event&rsquo;s own page.
                </EmptyState>
              )}
              {canManage && unlinked.length > 0 ? (
                <div className="border-t border-line p-4">
                  <ActionForm
                    action={linkContactAction}
                    submitLabel="Link to event"
                    variant="secondary"
                    size="sm"
                    hidden={{ contactId: item.id }}
                  >
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                      <Select name="eventId" required defaultValue="">
                        <option value="" disabled>
                          Choose an event
                        </option>
                        {unlinked.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title}
                          </option>
                        ))}
                      </Select>
                      <Input name="note" placeholder="What they did" />
                    </div>
                  </ActionForm>
                </div>
              ) : null}
            </Surface>
          </Section>
        </div>

        {canManage ? (
          <aside className="min-w-0 space-y-7" aria-label="Contact details">
            <Section title="Details">
              <Surface>
                <ActionForm
                  action={updateContactAction}
                  submitLabel="Save details"
                  variant="secondary"
                  hidden={{ contactId: item.id }}
                >
                  <Field label="Name">
                    <Input name="name" defaultValue={item.name} required />
                  </Field>
                  <Field label="Kind">
                    <Select name="kind" defaultValue={item.kind}>
                      {CONTACT_KINDS.map((value) => (
                        <option key={value} value={value}>
                          {KIND_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Organisation">
                    <Input name="organisation" defaultValue={item.organisation ?? ""} />
                  </Field>
                  <Field label="Email">
                    <Input type="email" name="email" defaultValue={item.email ?? ""} />
                  </Field>
                  <Field label="Phone">
                    <Input name="phone" defaultValue={item.phone ?? ""} />
                  </Field>
                </ActionForm>
              </Surface>
            </Section>

            <Surface>
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Removing a contact hides it from the directory. The events they were
                used at keep their record.
              </p>
              <ActionForm
                action={removeContactAction}
                submitLabel="Remove contact"
                variant="danger"
                size="sm"
                hidden={{ contactId: item.id }}
                confirm={`Remove ${item.name} from the contact book?`}
              />
            </Surface>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
