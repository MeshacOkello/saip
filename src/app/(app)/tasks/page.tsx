import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { EditorLink } from "@/components/editor-link";
import { IconCheck } from "@/components/icons";
import {
  Badge,
  Editor,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusDot,
  Surface,
  Textarea,
} from "@/components/ui";
import { assignableMembers, currentBoardYear } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { createTaskAction, updateTaskAction } from "@/lib/work/actions";
import { eventsWithTasks, listTasks } from "@/lib/work/service";

export const metadata = { title: "Tasks · SAIP Board" };

type Query = {
  scope?: string;
  status?: string;
  who?: string;
  event?: string;
  sort?: string;
};

const SORTS: Record<string, string> = {
  due: "Due date",
  created: "Newest",
  assignee: "Assignee",
};

function href(current: Query, patch: Query) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== "any" && !(key === "scope" && value === "mine")) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const member = await requireMember();
  const year = await currentBoardYear();
  if (!year) {
    return (
      <Surface padded={false}>
        <EmptyState icon={<IconCheck />} title="No board year yet">
          An administrator needs to create the current board year first.
        </EmptyState>
      </Surface>
    );
  }

  const scope = query.scope === "everyone" ? "everyone" : "mine";
  const status = query.status ?? "open";
  const sort = query.sort ?? "due";

  const [all, members, eventOptions] = await Promise.all([
    listTasks({ boardYearId: year.id, includeDone: true }),
    assignableMembers(),
    eventsWithTasks(year.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // Filtering and sorting happen here rather than in the query: the board's task
  // list is small, and keeping one fetch means the counts below always agree.
  let tasks = all.filter((t) =>
    scope === "mine" ? t.assigneeUserId === member.userId : true,
  );
  if (query.who && query.who !== "any") {
    tasks = tasks.filter((t) => t.assigneeUserId === query.who);
  }
  if (query.event && query.event !== "any") {
    tasks = tasks.filter((t) => t.eventId === query.event);
  }
  if (status === "open") tasks = tasks.filter((t) => t.status !== "done");
  if (status === "done") tasks = tasks.filter((t) => t.status === "done");
  if (status === "overdue") {
    tasks = tasks.filter(
      (t) => t.status !== "done" && t.dueOn && t.dueOn < today,
    );
  }

  tasks = [...tasks].sort((a, b) => {
    if (sort === "assignee") {
      return (a.assigneeName ?? "").localeCompare(b.assigneeName ?? "");
    }
    if (sort === "created") return 0; // listTasks already returns newest first
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn.localeCompare(b.dueOn);
  });

  const mine = all.filter(
    (t) => t.assigneeUserId === member.userId && t.status !== "done",
  ).length;
  const overdue = all.filter(
    (t) => t.status !== "done" && t.dueOn && t.dueOn < today,
  ).length;

  const filterLink = (
    label: string,
    patch: Query,
    active: boolean,
    count?: number,
  ) => (
    <Link
      key={label}
      href={href(query, patch)}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {count ? <span className="filter-count">{count}</span> : null}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Board work"
        title="Tasks"
        description="Everything the board owes, from events, meetings and everyday work."
        meta={
          <>
            <span>{year.label}</span>
            <span>{mine} assigned to you</span>
            {overdue > 0 ? (
              <span className="text-warn">{overdue} overdue</span>
            ) : null}
          </>
        }
        actions={<EditorLink id="new-task">New task</EditorLink>}
      />

      <div className="task-toolbar">
        <nav className="segmented" aria-label="Whose tasks">
          {filterLink("Mine", { scope: "mine" }, scope === "mine")}
          {filterLink("Everyone", { scope: "everyone" }, scope === "everyone")}
        </nav>

        <nav className="segmented" aria-label="Task status">
          {filterLink("Open", { status: "open" }, status === "open")}
          {filterLink(
            "Overdue",
            { status: "overdue" },
            status === "overdue",
            overdue,
          )}
          {filterLink("Done", { status: "done" }, status === "done")}
          {filterLink("All", { status: "any" }, status === "any")}
        </nav>

        <form className="task-filters" action="/tasks">
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="status" value={status} />
          <label>
            <span className="sr-only">Assignee</span>
            <Select name="who" defaultValue={query.who ?? "any"}>
              <option value="any">Anyone</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
          {eventOptions.length > 0 ? (
            <label>
              <span className="sr-only">Event</span>
              <Select name="event" defaultValue={query.event ?? "any"}>
                <option value="any">Any event</option>
                {eventOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label>
            <span className="sr-only">Sort by</span>
            <Select name="sort" defaultValue={sort}>
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  Sort: {label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className="filter-apply">
            Apply
          </button>
        </form>
      </div>

      <Surface padded={false}>
        {tasks.length > 0 ? (
          <ul className="task-list">
            {tasks.map((t) => {
              const late = t.dueOn && t.dueOn < today && t.status !== "done";
              return (
                <li key={t.id}>
                  <ActionForm
                    action={updateTaskAction}
                    submitLabel={t.status === "done" ? "Reopen" : "Complete"}
                    variant="ghost"
                    size="sm"
                    inline
                    hidden={{
                      taskId: t.id,
                      status: t.status === "done" ? "todo" : "done",
                    }}
                  />
                  <Link href={`/tasks/${t.id}`} className="task-main">
                    <StatusDot
                      tone={
                        t.status === "done"
                          ? "secondary"
                          : late
                            ? "warn"
                            : "primary"
                      }
                    />
                    <span
                      className={`task-title ${t.status === "done" ? "is-done" : ""}`}
                    >
                      {t.title}
                    </span>
                    {t.eventTitle ? (
                      <span className="task-context">{t.eventTitle}</span>
                    ) : null}
                  </Link>
                  <span className="task-meta">
                    {t.assigneeName ? (
                      <Badge
                        tone={
                          t.assigneeUserId === member.userId ? "primary" : "neutral"
                        }
                      >
                        {t.assigneeUserId === member.userId ? "You" : t.assigneeName}
                      </Badge>
                    ) : (
                      <Badge tone="warn">Unassigned</Badge>
                    )}
                    {t.dueOn ? (
                      <Badge tone={late ? "warn" : "neutral"}>{t.dueOn}</Badge>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<IconCheck />}
            title={
              status === "overdue"
                ? "Nothing overdue"
                : scope === "mine"
                  ? "Nothing on your plate"
                  : "No tasks match"
            }
          >
            Tasks can stand alone, belong to an event, or come out of a meeting —
            and any message in a discussion can become one.
          </EmptyState>
        )}
      </Surface>

      <Editor
        id="new-task"
        title="New task"
        description="Assigning to someone else needs permission to assign work."
      >
        <ActionForm
          action={createTaskAction}
          submitLabel="Add task"
          hidden={{ boardYearId: year.id }}
        >
          <Field label="What needs doing">
            <Input name="title" required placeholder="Reach out to the DJ" />
          </Field>
          <Field label="Detail" hint="Optional.">
            <Textarea name="details" rows={3} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assign to">
              <Select name="assigneeUserId" defaultValue="">
                <option value="">Me</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due">
              <Input type="date" name="dueOn" />
            </Field>
          </div>
        </ActionForm>
      </Editor>
    </div>
  );
}
