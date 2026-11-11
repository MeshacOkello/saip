import { ActionForm } from "@/components/action-form";
import { Avatar, PageHeader, Section, Surface } from "@/components/ui";
import { clearAvatarAction, setAvatarAction } from "@/lib/profile/actions";
import { avatarSrc } from "@/lib/profile/service";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Your profile · SAIP Board" };

export default async function SettingsPage() {
  const member = await requireMember();
  const picture = avatarSrc(member);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Your profile"
        description="How you appear to the rest of the board."
      />

      <Section title="Photo">
        <Surface>
          <div className="profile-photo">
            <Avatar name={member.name} size={96} src={picture} />
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="text-small text-muted">{member.email}</p>
              </div>

              <ActionForm action={setAvatarAction} submitLabel="Save photo">
                <label className="profile-pick">
                  <input
                    type="file"
                    name="photo"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Choose a photo"
                    required
                  />
                  <span className="text-caption text-muted">
                    JPEG, PNG or WebP, up to 2 MB.
                  </span>
                </label>
              </ActionForm>

              {picture ? (
                <ActionForm
                  action={clearAvatarAction}
                  submitLabel="Remove photo"
                  variant="ghost"
                  size="sm"
                  inline
                  confirm="Remove your photo?"
                />
              ) : null}
            </div>
          </div>
        </Surface>
      </Section>
    </div>
  );
}
