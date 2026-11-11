import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Editor,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Surface,
} from "@/components/ui";
import { assignableMembers, currentBoardYear } from "@/lib/board";
import {
  createChannelAction,
  createGroupAction,
  openDirectAction,
} from "@/lib/messages/actions";
import { search } from "@/lib/messages/service";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Messages · SAIP Board" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const member = await requireMember();
  const [people, year, results] = await Promise.all([
    assignableMembers(),
    currentBoardYear(),
    q ? search(member, q) : Promise.resolve([]),
  ]);

  const others = people.filter((p) => p.userId !== member.userId);
  const canMakeChannel = member.capabilities.has("channels.manage");

  return (
    <div className="message-placeholder space-y-7">
      <PageHeader
        title="Messages"
        description="Pick a conversation, search everything you can see, or start something new. Direct messages and private groups stay between the people in them; channels are the board's record."
      />

      <Surface>
        <form className="flex flex-wrap gap-2" action="/messages">
          <Input
            type="search"
            aria-label="Search messages"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search messages…"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Surface>

      {q ? (
        <Section
          title={`${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`}
        >
          <Surface padded={false}>
            {results.length > 0 ? (
              <ul className="divide-y divide-line">
                {results.map((r) => (
                  <li key={r.messageId}>
                    <Link
                      href={
                        r.conversationType === "thread" &&
                        r.subjectType &&
                        r.subjectId
                          ? `/${r.subjectType}s/${r.subjectId}`
                          : `/messages/${r.conversationId}`
                      }
                      className="block px-5 py-3.5 transition-colors hover:bg-surface-2"
                    >
                      <p className="flex items-center gap-2 text-[13px] text-muted">
                        <Badge tone="neutral">
                          {r.conversationTitle ?? r.conversationType}
                        </Badge>
                        {r.authorName} · {WHEN.format(r.createdAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[14px]">{r.body}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing matched">
                Search covers channels, your own conversations, and every
                discussion attached to an event, task or meeting.
              </EmptyState>
            )}
          </Surface>
        </Section>
      ) : null}

      <div className="grid items-start gap-4">
        <Editor id="new-message" title="Message someone">
          <ActionForm action={openDirectAction} submitLabel="Open conversation">
            <Field label="Board member">
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  Choose a person
                </option>
                {others.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </Editor>

        <Editor id="new-group" title="Start a private group">
          <ActionForm action={createGroupAction} submitLabel="Create group">
            <Field label="Name">
              <Input name="title" required placeholder="Potluck planning" />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Group members
              </legend>
              <div className="max-h-44 space-y-3 overflow-y-auto rounded-lg bg-surface-2 p-3">
                {others.length ? (
                  others.map((p) => (
                    <Checkbox
                      key={p.userId}
                      name="userIds"
                      value={p.userId}
                      label={p.name}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted">
                    No other members are available.
                  </p>
                )}
              </div>
            </fieldset>
          </ActionForm>
        </Editor>

        {canMakeChannel ? (
          <Editor
            id="new-channel"
            title="Open a channel"
            description="Everyone with access joins automatically, and it stays searchable for future boards."
          >
            <ActionForm
              action={createChannelAction}
              submitLabel="Create channel"
            >
              <input type="hidden" name="boardYearId" value={year?.id ?? ""} />
              <Field label="Name">
                <Input name="title" required placeholder="announcements" />
              </Field>
            </ActionForm>
          </Editor>
        ) : null}
      </div>
    </div>
  );
}
