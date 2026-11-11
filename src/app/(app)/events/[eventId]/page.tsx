import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { IconBook, IconCheck, IconUsers } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Item,
  Rows,
  Section,
  Select,
  Surface,
  TextLink,
} from "@/components/ui";
import {
  addChecklistItemAction,
  removeChecklistItemAction,
  removeTeamAction,
  setTeamAction,
  toggleChecklistItemAction,
  updateEventAction,
} from "@/lib/work/actions";
import {
  linkContactAction,
  unlinkContactAction,
} from "@/lib/contacts/actions";
import { KIND_LABEL, contactsForEvent, listContacts } from "@/lib/contacts/service";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, members, canEdit, member } = await loadEventWorkspace(eventId);
  const canManageContacts = member.capabilities.has("contacts.manage");
  const [used, everyContact] = await Promise.all([
    contactsForEvent(event.id),
    canManageContacts ? listContacts() : Promise.resolve([]),
  ]);
  const available = everyContact.filter(
    (c) => !used.some((u) => u.id === c.id),
  );

  const done = event.checklist.filter((c) => c.done).length;
  const openTasks = event.tasks.filter((t) => t.status !== "done").length;
  const progress =
    event.checklist.length > 0
      ? Math.round((done / event.checklist.length) * 100)
      : 0;

  return (
    <div className="workspace-grid">
      <div className="min-w-0 space-y-7">
        {event.summary ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
            {event.summary}
          </p>
        ) : null}

        <Section
          title="Planning checklist"
          description="Carried over unticked when someone starts next year's event from this one."
          actions={
            event.checklist.length > 0 ? (
              <span className="text-sm text-muted">
                {done} of {event.checklist.length} · {progress}%
              </span>
            ) : null
          }
        >
          <Surface padded={false}>
            {event.checklist.length > 0 ? (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Checklist progress"
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <Rows>
                  {event.checklist.map((c) => (
                    <Item key={c.id}>
                      <ActionForm
                        action={toggleChecklistItemAction}
                        submitLabel={c.done ? "Done" : "Mark done"}
                        variant={c.done ? "ghost" : "secondary"}
                        size="sm"
                        inline
                        hidden={{ itemId: c.id, done: String(!c.done) }}
                      />
                      <span
                        className={`min-w-0 flex-1 text-[15px] ${
                          c.done ? "text-muted line-through" : ""
                        }`}
                      >
                        {c.label}
                      </span>
                      {canEdit ? (
                        <ActionForm
                          action={removeChecklistItemAction}
                          submitLabel="Remove"
                          variant="ghost"
                          size="sm"
                          inline
                          hidden={{ itemId: c.id }}
                        />
                      ) : null}
                    </Item>
                  ))}
                </Rows>
              </>
            ) : (
              <EmptyState icon={<IconCheck />} title="Nothing on the checklist">
                Add the steps this event always needs: book the room, register it in
                MyPrincetonU, order the food, make the poster.
              </EmptyState>
            )}
            {canEdit ? (
              <div className="border-t border-line p-4">
                <ActionForm
                  action={addChecklistItemAction}
                  submitLabel="Add step"
                  variant="secondary"
                  size="sm"
                  hidden={{ eventId: event.id }}
                >
                  <Input name="label" required placeholder="Book the room" />
                </ActionForm>
              </div>
            ) : null}
          </Surface>
        </Section>
      </div>

      <aside className="min-w-0 space-y-7" aria-label="Event team and settings">
        <Section
          title="Team"
          description="Responsibilities on this event. They do not change what anyone can do in the app."
        >
          <Surface padded={false}>
            {event.team.length > 0 ? (
              <Rows>
                {event.team.map((t) => (
                  <Item key={t.userId}>
                    <span className="min-w-0 flex-1 text-[14px]">{t.name}</span>
                    <Badge tone={t.role === "lead" ? "primary" : "neutral"}>
                      {t.role}
                    </Badge>
                    {canEdit ? (
                      <ActionForm
                        action={removeTeamAction}
                        submitLabel="Remove"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ eventId: event.id, userId: t.userId }}
                      />
                    ) : null}
                  </Item>
                ))}
              </Rows>
            ) : (
              <EmptyState icon={<IconUsers />} title="No one assigned yet">
                Add the people running this event and what each of them owns.
              </EmptyState>
            )}
            {canEdit ? (
              <div className="border-t border-line p-4">
                <ActionForm
                  action={setTeamAction}
                  submitLabel="Add to team"
                  variant="secondary"
                  size="sm"
                  hidden={{ eventId: event.id }}
                >
                  <Select name="userId" required defaultValue="">
                    <option value="" disabled>
                      Choose a member
                    </option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  <Input name="role" placeholder="publicity" defaultValue="team" />
                </ActionForm>
              </div>
            ) : null}
          </Surface>
        </Section>

        <Section
          title="Who we used"
          description="Caterers, DJs and offices tied to this event, kept for the next board."
        >
          <Surface padded={false}>
            {used.length > 0 ? (
              <Rows>
                {used.map((c) => (
                  <Item key={c.id}>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="text-[14px] font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      {c.note ? (
                        <span className="block text-[12px] text-muted">{c.note}</span>
                      ) : null}
                    </span>
                    <Badge tone="neutral">{KIND_LABEL[c.kind]}</Badge>
                    {canManageContacts ? (
                      <ActionForm
                        action={unlinkContactAction}
                        submitLabel="Remove"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ contactId: c.id, eventId: event.id }}
                      />
                    ) : null}
                  </Item>
                ))}
              </Rows>
            ) : (
              <EmptyState icon={<IconBook />} title="No contacts linked">
                Link the vendor or speaker so next year knows who to call.
              </EmptyState>
            )}
            {canManageContacts && available.length > 0 ? (
              <div className="border-t border-line p-4">
                <ActionForm
                  action={linkContactAction}
                  submitLabel="Link contact"
                  variant="secondary"
                  size="sm"
                  hidden={{ eventId: event.id }}
                >
                  <Select name="contactId" required defaultValue="">
                    <option value="" disabled>
                      Choose a contact
                    </option>
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.organisation ? ` — ${c.organisation}` : ""}
                      </option>
                    ))}
                  </Select>
                  <Input name="note" placeholder="What they did" />
                </ActionForm>
              </div>
            ) : null}
          </Surface>
        </Section>

        <Section title="At a glance">
          <Surface padded={false}>
            <dl className="fact-list">
              <div>
                <dt>Open tasks</dt>
                <dd>
                  {openTasks > 0 ? (
                    <TextLink href={`/events/${event.id}/tasks`}>
                      {openTasks} to do
                    </TextLink>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
              <div>
                <dt>Turnout</dt>
                <dd>{event.turnout ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Lead</dt>
                <dd>
                  {event.team.find((t) => t.role === "lead")?.name ?? "Unassigned"}
                </dd>
              </div>
            </dl>
          </Surface>
        </Section>

        {canEdit ? (
          <Section title="Status">
            <Surface>
              <ActionForm
                action={updateEventAction}
                submitLabel="Save"
                variant="secondary"
                hidden={{ eventId: event.id }}
              >
                <Field label="Event status">
                  <Select name="status" defaultValue={event.status}>
                    <option value="idea">Idea</option>
                    <option value="planning">Planning</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="happened">Happened</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </Field>
                <Field
                  label="MyPrincetonU registration"
                  hint="An expense report needs a matching registered event, with dates that agree."
                >
                  <Select name="registration" defaultValue={event.registration}>
                    <option value="not_started">Not registered</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="not_required">Not required</option>
                  </Select>
                </Field>
              </ActionForm>
            </Surface>
          </Section>
        ) : null}
      </aside>
    </div>
  );
}
