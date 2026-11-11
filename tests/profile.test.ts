import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { membership, user } from "@/db/schema";
import { loadMemberContext } from "@/lib/access";
import { read } from "@/lib/messages/storage";
import {
  MAX_AVATAR_BYTES,
  ProfileError,
  avatarKeyFor,
  avatarSrc,
  clearOwnAvatar,
  setOwnAvatar,
} from "@/lib/profile/service";

const SUFFIX = `p${Date.now().toString(36)}`;
const created: string[] = [];

// A real 1×1 PNG, so the magic-byte check has something honest to pass.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function file(bytes: Buffer, name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function member(label: string) {
  const [row] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: label,
      email: `${label.toLowerCase().replace(/\s+/g, "-")}-${SUFFIX}@princeton.edu`,
    })
    .returning();
  created.push(row.id);
  await db
    .insert(membership)
    .values({ userId: row.id, status: "active", joinedAt: new Date() });
  const ctx = await loadMemberContext(row.id);
  if (!ctx) throw new Error("no context");
  return ctx;
}

afterAll(async () => {
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

/* -------------------------------------------------------------------------- */

describe("a member's own photo", () => {
  it("stores the picture and points the avatar at it", async () => {
    const me = await member("Photo Amina");
    expect(avatarSrc(me)).toBeNull(); // initials until there is one

    const key = await setOwnAvatar(me, file(PNG, "me.png", "image/png"));
    expect(key).toMatch(/^avatars\//);
    expect(key.endsWith(".png")).toBe(true);

    const [row] = await db.select().from(user).where(eq(user.id, me.userId));
    expect(row.image).toBe(key);

    // The bytes really are in storage, and they are the ones we sent.
    expect((await read(key)).equals(PNG)).toBe(true);

    const src = avatarSrc({ userId: me.userId, image: key });
    expect(src).toContain(`/api/avatar/${me.userId}`);
    expect(src).toMatch(/\?v=\d+/); // versioned, so a new photo is never cached over
  });

  it("replaces the old picture rather than collecting them", async () => {
    const me = await member("Photo Kwame");
    const first = await setOwnAvatar(me, file(PNG, "one.png", "image/png"));
    await new Promise((r) => setTimeout(r, 5));
    const second = await setOwnAvatar(me, file(PNG, "two.png", "image/png"));

    expect(second).not.toBe(first);
    expect(await avatarKeyFor(me.userId)).toBe(second);
    await expect(read(first)).rejects.toBeTruthy();
  });

  it("goes back to initials when removed", async () => {
    const me = await member("Photo Zuri");
    const key = await setOwnAvatar(me, file(PNG, "me.png", "image/png"));
    await clearOwnAvatar(me);

    expect(await avatarKeyFor(me.userId)).toBeNull();
    expect(avatarSrc({ userId: me.userId, image: null })).toBeNull();
    await expect(read(key)).rejects.toBeTruthy();
  });

  it("uses an address Google gave us as it is", () => {
    const src = avatarSrc({
      userId: "abc",
      image: "https://lh3.googleusercontent.com/a/portrait",
    });
    expect(src).toBe("https://lh3.googleusercontent.com/a/portrait");
  });
});

describe("what it refuses", () => {
  it("refuses a file that is not one of the three image formats", async () => {
    const me = await member("Photo Bad Type");
    await expect(
      setOwnAvatar(me, file(Buffer.from("hello"), "notes.txt", "text/plain")),
    ).rejects.toBeInstanceOf(ProfileError);
    expect(await avatarKeyFor(me.userId)).toBeNull();
  });

  it("refuses something only pretending to be an image", async () => {
    const me = await member("Photo Liar");
    // Right content type, wrong bytes — the declared type is the browser's word.
    const lie = file(Buffer.from("<?php echo 1; ?>"), "me.png", "image/png");
    await expect(setOwnAvatar(me, lie)).rejects.toThrow(/does not look like an image/);
    expect(await avatarKeyFor(me.userId)).toBeNull();
  });

  it("refuses an image over the size limit", async () => {
    const me = await member("Photo Huge");
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_AVATAR_BYTES)]);
    await expect(
      setOwnAvatar(me, file(big, "huge.png", "image/png")),
    ).rejects.toThrow(/2 MB/);
    expect(await avatarKeyFor(me.userId)).toBeNull();
  });

  it("refuses an empty file", async () => {
    const me = await member("Photo Empty");
    await expect(
      setOwnAvatar(me, file(Buffer.alloc(0), "me.png", "image/png")),
    ).rejects.toBeInstanceOf(ProfileError);
  });
});
