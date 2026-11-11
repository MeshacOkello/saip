import { AvatarPicker } from "@/components/avatar-picker";
import { PageHeader, Surface } from "@/components/ui";
import { appointmentsFor } from "@/lib/board";
import { clearAvatarAction, setAvatarAction } from "@/lib/profile/actions";
import { MAX_AVATAR_BYTES, avatarSrc } from "@/lib/profile/service";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Your profile · SAIP Board" };

export default async function SettingsPage() {
  const member = await requireMember();
  const appointments = await appointmentsFor(member.userId);
  const held = appointments.filter((a) => !a.endedOn).map((a) => a.positionName);

  return (
    <div className="profile-page">
      <PageHeader
        title="Your profile"
        description="How you appear to the rest of the board."
      />

      <Surface>
        <div className="profile-card">
          <AvatarPicker
            name={member.name}
            current={avatarSrc(member)}
            maxBytes={MAX_AVATAR_BYTES}
            save={setAvatarAction}
            remove={clearAvatarAction}
          />

          <dl className="profile-facts">
            <div>
              <dt>Name</dt>
              <dd>{member.name}</dd>
            </div>
            <div>
              <dt>Princeton email</dt>
              <dd>{member.email}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>{held.length > 0 ? held.join(" · ") : "Board member"}</dd>
            </div>
          </dl>
        </div>
      </Surface>
    </div>
  );
}
