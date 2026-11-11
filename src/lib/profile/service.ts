import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import type { MemberContext } from "@/lib/access";
import { remove, storeAt } from "@/lib/messages/storage";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The three formats every browser renders, and the extension each is stored under. */
const FORMATS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export class ProfileError extends Error {}

/**
 * A declared content type is whatever the browser felt like sending, so the bytes
 * get the final say. This is not about malware — nothing here executes an upload —
 * but about not storing a file that claims to be a picture and then fails to render
 * for everyone, every time, with no clue why.
 */
function looksLikeImage(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    const ascii = (i: number) => String.fromCharCode(bytes[i] ?? 0);
    return (
      ascii(0) + ascii(1) + ascii(2) + ascii(3) === "RIFF" &&
      ascii(8) + ascii(9) + ascii(10) + ascii(11) === "WEBP"
    );
  }
  return false;
}

/** An address Google gave us, rather than a file we hold. */
export function isRemoteImage(image: string | null | undefined) {
  return Boolean(image && /^https?:\/\//i.test(image));
}

/**
 * Where to point an `<img>` for somebody's picture.
 *
 * Google hands back a full address when a member signs in; anything uploaded here is
 * stored privately and served through a route that checks the viewer first. Returns
 * null when there is no picture, and the initials stand in.
 */
export function avatarSrc(person: {
  userId?: string | null;
  id?: string | null;
  image?: string | null;
}) {
  const image = person.image;
  if (!image) return null;
  if (isRemoteImage(image)) return image;
  const id = person.userId ?? person.id;
  if (!id) return null;
  // The stored key carries the moment it was written. Putting that in the query
  // means the picture can be cached hard and still changes the instant it is
  // replaced, without the route guessing how long is safe.
  const stamp = image.match(/-(\d+)\./)?.[1];
  return stamp ? `/api/avatar/${id}?v=${stamp}` : `/api/avatar/${id}`;
}

/** The stored key for someone's picture, or null if they have none of ours. */
export async function avatarKeyFor(userId: string) {
  const [row] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row?.image || isRemoteImage(row.image)) return null;
  return row.image;
}

export function contentTypeForKey(key: string) {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * Replaces the signed-in member's own picture. Nobody can set anybody else's: the
 * actor is the subject, and there is no parameter that could say otherwise.
 */
export async function setOwnAvatar(actor: MemberContext, file: File) {
  if (!file || file.size === 0) {
    throw new ProfileError("Choose an image first.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new ProfileError("That image is larger than 2 MB. Try a smaller one.");
  }

  const extension = FORMATS.get(file.type);
  if (!extension) {
    throw new ProfileError("Use a JPEG, PNG or WebP image.");
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) {
    throw new ProfileError("That file does not look like an image.");
  }

  const previous = await avatarKeyFor(actor.userId);
  const key = `avatars/${actor.userId}-${Date.now()}.${extension}`;
  await storeAt(key, file);

  await db
    .update(user)
    .set({ image: key, updatedAt: new Date() })
    .where(eq(user.id, actor.userId));

  // Only once the new one is safely in place, so a failure never leaves a member
  // with no picture and no way back.
  if (previous && previous !== key) await remove(previous);

  return key;
}

/** Goes back to initials. A picture Google supplied comes back at next sign-in. */
export async function clearOwnAvatar(actor: MemberContext) {
  const previous = await avatarKeyFor(actor.userId);
  await db
    .update(user)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, actor.userId));
  if (previous) await remove(previous);
}
