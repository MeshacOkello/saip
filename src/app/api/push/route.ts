import { NextResponse } from "next/server";

import { removeSubscription, saveSubscription } from "@/lib/notifications/service";
import { currentMember } from "@/lib/session";

/**
 * Where a browser registers itself for push. The subscription object comes from the
 * browser's own push service; we store the endpoint and its keys so the server can
 * send to it later.
 */
export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return new NextResponse("Not signed in", { status: 401 });

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: "That is not a push subscription" },
      { status: 400 },
    );
  }

  await saveSubscription(member, {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const member = await currentMember();
  if (!member) return new NextResponse("Not signed in", { status: 401 });

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "No endpoint given" }, { status: 400 });
  }

  await removeSubscription(member, endpoint);
  return NextResponse.json({ ok: true });
}
