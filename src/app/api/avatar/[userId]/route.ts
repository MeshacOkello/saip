import { NextResponse } from "next/server";

import { read } from "@/lib/messages/storage";
import { avatarKeyFor, contentTypeForKey } from "@/lib/profile/service";
import { currentMember } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Serves a board member's picture to other board members.
 *
 * Pictures are stored privately, the same as every other upload, so this route is
 * the only way to see one and it checks the viewer first. Nothing here is public:
 * a member's face is not something to leave on an open URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await currentMember();
  if (!viewer) return new NextResponse("Not signed in", { status: 401 });

  const { userId } = await params;
  const key = await avatarKeyFor(userId);
  if (!key) return new NextResponse("No picture", { status: 404 });

  try {
    const bytes = await read(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": contentTypeForKey(key),
        // Safe to cache hard: the address carries a version taken from the stored
        // key, so replacing a picture changes the URL rather than the contents.
        "cache-control": "private, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("That picture is missing", { status: 404 });
  }
}
