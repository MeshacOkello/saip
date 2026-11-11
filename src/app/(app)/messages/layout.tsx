import { MessageFrame } from "@/components/message-frame";
import { ConversationList } from "@/components/conversation-list";
import { inbox } from "@/lib/messages/service";
import { requireMember } from "@/lib/session";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireMember();
  const rows = await inbox(member);

  return (
    <MessageFrame navigation={<ConversationList rows={rows} />}>{children}</MessageFrame>
  );
}
