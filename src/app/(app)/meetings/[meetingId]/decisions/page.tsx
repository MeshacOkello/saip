import { ActionForm } from "@/components/action-form";
import { IconNotes } from "@/components/icons";
import {
  EmptyState,
  Field,
  Input,
  Section,
  Surface,
  Textarea,
} from "@/components/ui";
import { recordDecisionAction } from "@/lib/work/actions";
import { loadMeetingWorkspace } from "@/lib/work/meeting-workspace";

export default async function MeetingDecisionsPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { meeting } = await loadMeetingWorkspace(meetingId);

  return (
    <div className="space-y-7">
      <Section
        title="Decisions"
        description="Kept apart from the minutes on purpose: these are what the board committed to, and they outlive the meeting."
      >
        <Surface padded={false}>
          {meeting.decisions.length > 0 ? (
            <ol className="decision-list">
              {meeting.decisions.map((d) => (
                <li key={d.id}>
                  <p className="decision-date">{d.decidedOn}</p>
                  <div>
                    <p className="font-semibold">{d.title}</p>
                    {d.detail ? (
                      <p className="mt-1 text-[14px] leading-relaxed text-muted">
                        {d.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={<IconNotes />} title="Nothing recorded yet">
              Record a decision below, or promote a message from the discussion.
            </EmptyState>
          )}
          <div className="border-t border-line p-4">
            <ActionForm
              action={recordDecisionAction}
              submitLabel="Record decision"
              variant="secondary"
              size="sm"
              hidden={{ boardYearId: meeting.boardYearId, meetingId: meeting.id }}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="What was decided">
                  <Input name="title" required placeholder="Potluck moves to the 22nd" />
                </Field>
                <Field label="Why, or what it depends on">
                  <Textarea name="detail" rows={2} placeholder="Campus Club was unavailable" />
                </Field>
              </div>
            </ActionForm>
          </div>
        </Surface>
      </Section>
    </div>
  );
}
