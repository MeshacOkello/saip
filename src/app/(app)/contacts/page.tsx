import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { EditorLink } from "@/components/editor-link";
import { IconUsers } from "@/components/icons";
import {
  Badge,
  Button,
  Editor,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Surface,
  Textarea,
} from "@/components/ui";
import { createContactAction } from "@/lib/contacts/actions";
import { CONTACT_KINDS, KIND_LABEL, listContacts } from "@/lib/contacts/service";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Contacts · SAIP Board" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { kind, q } = await searchParams;
  const member = await requireMember();
  const rows = await listContacts({ kind, q });
  const canManage = member.capabilities.has("contacts.manage");

  const tab = (label: string, value: string) => {
    const params = new URLSearchParams();
    if (value !== "any") params.set("kind", value);
    if (q) params.set("q", q);
    const href = params.toString() ? `/contacts?${params}` : "/contacts";
    return (
      <Link
        key={value}
        href={href}
        aria-current={(kind ?? "any") === value ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organisation"
        title="Contacts"
        description="Vendors, speakers, campus offices and partner groups you’ve worked with."
        meta={
          <span>
            {rows.length} contact{rows.length === 1 ? "" : "s"}
          </span>
        }
        actions={canManage ? <EditorLink id="new-contact">Add contact</EditorLink> : null}
      />

      <div className="task-toolbar">
        <nav className="segmented" aria-label="Kind of contact">
          {tab("All", "any")}
          {CONTACT_KINDS.map((value) => tab(KIND_LABEL[value], value))}
        </nav>
        <form className="task-filters" action="/contacts">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, organisation or notes"
            aria-label="Search contacts"
            className="min-w-[14rem]"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      </div>

      {rows.length > 0 ? (
        <div className="contact-grid">
          {rows.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} className="contact-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="contact-name">{c.name}</p>
                  {c.organisation ? (
                    <p className="contact-org">{c.organisation}</p>
                  ) : null}
                </div>
                <Badge tone="neutral">{KIND_LABEL[c.kind]}</Badge>
              </div>
              {c.notes ? <p className="contact-notes">{c.notes}</p> : null}
              <p className="contact-foot">
                {c.timesUsed > 0
                  ? `Used at ${c.timesUsed} event${c.timesUsed === 1 ? "" : "s"}`
                  : "Not used yet"}
                {c.lastUsedOn ? ` · last ${c.lastUsedOn}` : ""}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <Surface padded={false}>
          <EmptyState icon={<IconUsers />} title="No contacts yet">
            Add the caterer, the DJ, the Davis IC officer — with what they charge and
            how it went. Next year&rsquo;s board will not have to ask around.
          </EmptyState>
        </Surface>
      )}

      {canManage ? (
        <Editor
          id="new-contact"
          title="Add a contact"
          description="Everyone can see contacts. You need permission to change them."
        >
          <ActionForm action={createContactAction} submitLabel="Add contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" required placeholder="Five Loaves" />
              </Field>
              <Field label="Kind">
                <Select name="kind" defaultValue="vendor">
                  {CONTACT_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {KIND_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Organisation">
                <Input name="organisation" placeholder="Catering, Trenton" />
              </Field>
              <Field label="Email">
                <Input type="email" name="email" />
              </Field>
              <Field label="Phone">
                <Input name="phone" />
              </Field>
            </div>
            <Field
              label="Notes"
              hint="Prices, lead times, how it went. Be blunt — this is for the next board."
            >
              <Textarea name="notes" rows={4} />
            </Field>
          </ActionForm>
        </Editor>
      ) : null}
    </div>
  );
}
