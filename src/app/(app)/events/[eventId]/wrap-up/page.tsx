import { ActionForm } from "@/components/action-form";
import { IconNotes } from "@/components/icons";
import {
  EmptyState,
  Field,
  Input,
  Notice,
  Section,
  Surface,
  Textarea,
} from "@/components/ui";
import { updateEventAction } from "@/lib/work/actions";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

export default async function EventWrapUpPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, canEdit } = await loadEventWorkspace(eventId);

  const recorded =
    event.turnout != null || event.whatWorked || event.whatToAvoid;

  return (
    <div className="space-y-6">
      {event.status !== "happened" && !recorded ? (
        <Notice title="This event has not happened yet">
          Once it has, record the turnout and what you would change. It is what a
          funding application asks for, and what next year&rsquo;s board reads first.
        </Notice>
      ) : null}

      <Section
        title="After the event"
        description="The numbers and notes that make this event worth copying — or worth avoiding."
      >
        {canEdit ? (
          <Surface>
            <ActionForm
              action={updateEventAction}
              submitLabel="Save wrap-up"
              variant="secondary"
              hidden={{ eventId: event.id }}
            >
              <Field
                label="Turnout"
                hint="How many people actually came. Funding bodies ask for this."
              >
                <Input
                  type="number"
                  name="turnout"
                  min={0}
                  defaultValue={event.turnout ?? ""}
                  className="max-w-[10rem]"
                />
              </Field>
              <Field label="What worked">
                <Textarea
                  name="whatWorked"
                  rows={4}
                  defaultValue={event.whatWorked ?? ""}
                  placeholder="The vendor, the room, the timing, the way you advertised it…"
                />
              </Field>
              <Field label="What to avoid">
                <Textarea
                  name="whatToAvoid"
                  rows={4}
                  defaultValue={event.whatToAvoid ?? ""}
                  placeholder="What went wrong, and what you would do instead."
                />
              </Field>
            </ActionForm>
          </Surface>
        ) : recorded ? (
          <Surface>
            <dl className="fact-list">
              <div>
                <dt>Turnout</dt>
                <dd>{event.turnout ?? "Not recorded"}</dd>
              </div>
            </dl>
            {event.whatWorked ? (
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">
                {event.whatWorked}
              </p>
            ) : null}
            {event.whatToAvoid ? (
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
                {event.whatToAvoid}
              </p>
            ) : null}
          </Surface>
        ) : (
          <Surface padded={false}>
            <EmptyState icon={<IconNotes />} title="Nothing recorded yet">
              The event lead or an events manager can fill this in.
            </EmptyState>
          </Surface>
        )}
      </Section>
    </div>
  );
}
