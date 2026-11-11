import { NextResponse } from "next/server";

import { attachmentFor } from "@/lib/messages/service";
import { read } from "@/lib/messages/storage";
import { currentMember } from "@/lib/session";

/**
 * Serves an uploaded file only to someone who may read the conversation it was
 * posted in. The bytes live outside `public/`, so this check cannot be bypassed by
 * guessing a URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const member = await currentMember();
  if (!member) return new NextResponse("Not signed in", { status: 401 });

  const { attachmentId } = await params;

  let file;
  try {
    file = await attachmentFor(member, attachmentId);
  } catch {
    return new NextResponse("Not allowed", { status: 403 });
  }
  if (!file) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await read(file.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("That file is missing from storage", { status: 410 });
  }
}
