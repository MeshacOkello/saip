import { ActionForm } from "@/components/action-form";
import { IconNotes } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Input,
  Section,
  Select,
  StatusDot,
  Surface,
  Textarea,
} from "@/components/ui";
import {
  addAgendaItemAction,
  createTaskAction,
  importAgendaAction,
  removeAgendaItemAction,
  setAttendanceAction,
  updateAgendaItemAction,
  updateMeetingAction,
  updateTaskAction,
} from "@/lib/work/actions";
import { agendaFor } from "@/lib/work/service";
import { agendaItems, loadMeetingWorkspace } from "@/lib/work/meeting-workspace";

/**
 * The meeting as a working document: each agenda item owns its own notes and the
 * action items that came out of it, with attendance as a strip you tick as people
 * arrive rather than a separate screen.
 */
export default async function MeetingDocumentPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { meeting, members, canManage, present } =
    await loadMeetingWorkspace(meetingId);

  const items = await agendaFor(meeting.id);
  const drafted = agendaItems(meeting.agenda);

  return (
    <div className="workspace-grid">
      <div className="min-w-0 space-y-7">
        <Section
          title="Agenda"
          description="Each item carries its own notes and the action items that came out of it."
        >
          {items.length > 0 ? (
            <ol className="agenda-items">
              {items.map((item, index) => (
                <li key={item.id}>
                  <Surface>
                    <div className="agenda-item-head">
                      <span className="agenda-number">{index + 1}</span>
                      <h3 className="min-w-0 flex-1 text-[16px] font-semibold">
                        {item.title}
                      </h3>
                      {canManage ? (
                        <ActionForm
                          action={removeAgendaItemAction}
                          submitLabel="Remove"
                          variant="ghost"
                          size="sm"
                          inline
                          hidden={{ agendaItemId: item.id }}
                          confirm={`Remove “${item.title}” from the agenda?`}
                        />
                      ) : null}
                    </div>

                    {canManage ? (
                      <ActionForm
                        action={updateAgendaItemAction}
                        submitLabel="Save notes"
                        variant="secondary"
                        size="sm"
                        hidden={{ agendaItemId: item.id }}
                      >
                        <Textarea
                          name="notes"
                          rows={3}
                          defaultValue={item.notes ?? ""}
                          aria-label={`Notes on ${item.title}`}
                          placeholder="What was said, what was agreed."
                        />
                      </ActionForm>
                    ) : item.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
                        {item.notes}
                      </p>
                    ) : (
                      <p className="mt-2 text-[14px] text-muted">No notes yet.</p>
                    )}

                    {item.actions.length > 0 ? (
                      <ul className="agenda-actions">
                        {item.actions.map((action) => (
                          <li key={action.id}>
                            <StatusDot
                              tone={
                                action.status === "done" ? "secondary" : "primary"
                              }
                            />
                            <span
                              className={`min-w-0 flex-1 ${
                                action.status === "done"
                                  ? "text-muted line-through"
                                  : ""
                              }`}
                            >
                              {action.title}
                            </span>
                            {action.assigneeName ? (
                              <Badge>{action.assigneeName}</Badge>
                            ) : null}
                            {action.dueOn ? (
                              <Badge tone="neutral">{action.dueOn}</Badge>
                            ) : null}
                            <ActionForm
                              action={updateTaskAction}
                              submitLabel={
                                action.status === "done" ? "Reopen" : "Done"
                              }
                              variant="ghost"
                              size="sm"
                              inline
                              hidden={{
                                taskId: action.id,
                                status: action.status === "done" ? "todo" : "done",
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="agenda-add">
                      <ActionForm
                        action={createTaskAction}
                        submitLabel="Add action item"
                        variant="ghost"
                        size="sm"
                        hidden={{
                          boardYearId: meeting.boardYearId,
                          meetingId: meeting.id,
                          agendaItemId: item.id,
                        }}
                      >
                        <div className="grid gap-2 md:grid-cols-[1fr_11rem_9.5rem]">
                          <Input
                            name="title"
                            required
                            placeholder="Who does what next?"
                            aria-label={`Action item for ${item.title}`}
                          />
                          <Select name="assigneeUserId" defaultValue="">
                            <option value="">Assign to me</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.name}
                              </option>
                            ))}
                          </Select>
                          <Input type="date" name="dueOn" aria-label="Due date" />
                        </div>
                      </ActionForm>
                    </div>
                  </Surface>
                </li>
              ))}
            </ol>
          ) : (
            <Surface padded={false}>
              <EmptyState icon={<IconNotes />} title="No agenda items yet">
                {canManage
                  ? "Add the first item below, or paste a drafted agenda and turn each line into an item."
                  : "Whoever manages meetings sets the agenda before the board sits."}
              </EmptyState>
            </Surface>
          )}

          {canManage ? (
            <Surface className="mt-4">
              <ActionForm
                action={addAgendaItemAction}
                submitLabel="Add item"
                variant="secondary"
                size="sm"
                hidden={{ meetingId: meeting.id }}
              >
                <Input name="title" required placeholder="Potluck budget" />
              </ActionForm>

              {items.length === 0 ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-[13px] leading-relaxed text-muted">
                    Or paste a whole agenda, one item per line, and turn each line
                    into an item that can hold notes.
                  </p>
                  <ActionForm
                    action={importAgendaAction}
                    submitLabel="Import as items"
                    variant="secondary"
                    size="sm"
                    hidden={{ meetingId: meeting.id }}
                  >
                    <Textarea
                      name="agenda"
                      rows={4}
                      defaultValue={drafted.join("\n")}
                      aria-label="Agenda to import"
                      placeholder={"Potluck budget\nSenior send-off date"}
                    />
                  </ActionForm>
                </div>
              ) : null}
            </Surface>
          ) : null}
        </Section>

        <Section
          title="Minutes"
          description="Anything that does not belong to a single agenda item. Saving marks the meeting as held."
        >
          {canManage ? (
            <Surface>
              <ActionForm
                action={updateMeetingAction}
                submitLabel="Save minutes"
                variant="secondary"
                hidden={{ meetingId: meeting.id, status: "held" }}
              >
                <Textarea
                  aria-label="Meeting minutes"
                  name="minutes"
                  rows={8}
                  defaultValue={meeting.minutes ?? ""}
                />
              </ActionForm>
            </Surface>
          ) : (
            <Surface>
              {meeting.minutes ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
                  {meeting.minutes}
                </p>
              ) : (
                <p className="text-[15px] text-muted">No minutes yet.</p>
              )}
            </Surface>
          )}
        </Section>
      </div>

      <aside className="min-w-0 space-y-7" aria-label="Attendance">
        <Section
          title="Attendance"
          description={`${present.size} of ${members.length} marked present.`}
        >
          <Surface padded={false}>
            <ul className="attendance-list">
              {members.map((m) => {
                const here = present.has(m.userId);
                return (
                  <li key={m.userId}>
                    <span className={`attendance-name ${here ? "is-present" : ""}`}>
                      {m.name}
                    </span>
                    {canManage ? (
                      <ActionForm
                        action={setAttendanceAction}
                        submitLabel={here ? "Present" : "Mark present"}
                        variant={here ? "secondary" : "ghost"}
                        size="sm"
                        inline
                        hidden={{
                          meetingId: meeting.id,
                          userId: m.userId,
                          present: String(!here),
                        }}
                      />
                    ) : (
                      <Badge tone={here ? "secondary" : "neutral"}>
                        {here ? "present" : "—"}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Surface>
        </Section>
      </aside>
    </div>
  );
}
