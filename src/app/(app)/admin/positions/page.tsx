import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Surface,
  Textarea,
} from "@/components/ui";
import { listPositions } from "@/lib/admin/queries";
import { listBundles } from "@/lib/admin/service";

import {
  createPositionAction,
  retirePositionAction,
  updatePositionAction,
} from "../actions";

export const metadata = { title: "Positions · SAIP Board" };

export default async function PositionsPage() {
  const [positions, bundles] = await Promise.all([
    listPositions(),
    listBundles(),
  ]);
  const active = positions.filter((p) => p.isActive).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Positions"
        description="The board is not fixed. Create positions, retire the ones SAIP no longer uses, and choose what access each one starts with — none of this is built into the application."
        meta={
          <>
            <span>{active} active</span>
            {positions.length - active > 0 ? (
              <span>{positions.length - active} retired</span>
            ) : null}
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        <Section title="Add a position">
          <Surface>
            <ActionForm
              action={createPositionAction}
              submitLabel="Create position"
            >
              <Field label="Name">
                <Input name="name" required placeholder="Social Media Chair" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starting access" hint="Seeded on appointment.">
                  <Select name="defaultBundleId" defaultValue="">
                    <option value="">No access</option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Order" hint="Lower sorts first.">
                  <Input name="sortOrder" defaultValue="50" />
                </Field>
              </div>
              <Field label="Description">
                <Input
                  name="description"
                  placeholder="What this officer is for"
                />
              </Field>
              <Field label="Responsibilities" hint="One per line.">
                <Textarea name="responsibilities" rows={4} />
              </Field>
            </ActionForm>
          </Surface>
        </Section>

        <Section title="Current positions">
          <div className="space-y-3">
            {positions.map((p) => (
              <Surface key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                      {p.name}
                      {p.holder ? (
                        <Badge tone="secondary">{p.holder}</Badge>
                      ) : (
                        <Badge tone="warn">Vacant</Badge>
                      )}
                      {!p.isActive ? (
                        <Badge tone="neutral">Retired</Badge>
                      ) : null}
                    </h3>
                    {p.description ? (
                      <p className="mt-1 text-[14px] text-muted">
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                  <ActionForm
                    action={retirePositionAction}
                    submitLabel={p.isActive ? "Retire" : "Restore"}
                    variant="ghost"
                    size="sm"
                    inline
                    hidden={{ positionId: p.id, retire: String(p.isActive) }}
                    confirm={
                      p.isActive
                        ? `Retire ${p.name}? Past appointments keep their meaning; it just stops being offered.`
                        : undefined
                    }
                  />
                </div>

                <details className="group mt-3">
                  <summary className="inline-flex cursor-pointer list-none text-[14px] text-primary">
                    <span className="group-open:hidden">Edit</span>
                    <span className="hidden group-open:inline">Close</span>
                  </summary>
                  <div className="mt-4 border-t border-line pt-4">
                    <ActionForm
                      action={updatePositionAction}
                      submitLabel="Save changes"
                      variant="secondary"
                      hidden={{ positionId: p.id }}
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Name">
                          <Input name="name" defaultValue={p.name} />
                        </Field>
                        <Field label="Starting access">
                          <Select
                            name="defaultBundleId"
                            defaultValue={p.bundleId ?? ""}
                          >
                            <option value="">No access</option>
                            {bundles.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Order">
                          <Input name="sortOrder" defaultValue={p.sortOrder} />
                        </Field>
                      </div>
                      <Field label="Description">
                        <Input
                          name="description"
                          defaultValue={p.description ?? ""}
                        />
                      </Field>
                      <Field label="Responsibilities">
                        <Textarea
                          name="responsibilities"
                          rows={5}
                          defaultValue={p.responsibilities ?? ""}
                        />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              </Surface>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
