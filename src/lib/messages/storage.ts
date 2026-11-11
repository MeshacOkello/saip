import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded files live.
 *
 * Two backends, chosen by what the environment provides, because the two places this
 * application runs have genuinely different filesystems:
 *
 *   - A normal server, or a laptop: a directory on disk, outside `public/`.
 *   - Vercel: a private Blob store, because the function filesystem is thrown away
 *     after every request and every deploy. Attachment rows would survive while the
 *     bytes quietly did not.
 *
 * Both are private. Nothing here is reachable by URL: `/api/files/[attachmentId]`
 * checks that the viewer may read the conversation before it calls `read`, and a
 * private blob cannot be fetched without the store's credentials, which only the
 * server has. The storage key is what the database holds, and it means the same thing
 * to both backends, so a store can be changed without rewriting history.
 */

/** Vercel sets one of these when a Blob store is connected to the project. */
const blobConfigured = Boolean(
  process.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_STORE_ID,
);

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "var", "uploads");

/** Which backend is in use, for a deployment check to report honestly. */
export const storageBackend = blobConfigured ? "vercel-blob" : "local-disk";

/** The stored name is generated here; a client-supplied filename never reaches storage. */
function newKey() {
  return `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
}

/**
 * Resolves a storage key to a path under the upload directory, and refuses anything
 * that climbs out of it — a traversal in a stored key, however it got there.
 *
 * The `turbopackIgnore` comments are not a weakening of that check, which happens at
 * runtime regardless. They tell the bundler to stop trying to follow a path it cannot
 * know: `UPLOAD_DIR` is read from the environment, so static analysis gives up and
 * traces the entire project into the serverless bundle, which first bloats the
 * function and then fails the build outright while collecting page data. The bundler
 * is right that it cannot resolve this; it is simply not something it needs to.
 */
function onDisk(storageKey: string) {
  const root = path.resolve(/*turbopackIgnore: true*/ UPLOAD_DIR);
  const target = path.resolve(/*turbopackIgnore: true*/ root, storageKey);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Refusing to touch anything outside the upload directory.");
  }
  return target;
}

export async function store(file: File) {
  const key = newKey();

  if (blobConfigured) {
    // Imported here so a laptop with no Blob store never loads the SDK, and the
    // tests stay offline.
    const { put } = await import("@vercel/blob");
    await put(key, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
    });
    return key;
  }

  const target = onDisk(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return key;
}

/**
 * Stores a file under a key chosen by the caller, for things that are not message
 * attachments and need a predictable name — a profile picture keeps its extension
 * so the download route can say what type it is without another column.
 */
export async function storeAt(key: string, file: File) {
  if (blobConfigured) {
    const { put } = await import("@vercel/blob");
    await put(key, file, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: file.type || "application/octet-stream",
    });
    return key;
  }

  const target = onDisk(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return key;
}

/** Removes a stored file. Missing is fine — the point is that it is gone. */
export async function remove(storageKey: string) {
  if (blobConfigured) {
    const { del, head } = await import("@vercel/blob");
    try {
      const found = await head(storageKey);
      if (found) await del(found.url);
    } catch {
      /* already gone */
    }
    return;
  }
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(onDisk(storageKey));
  } catch {
    /* already gone */
  }
}

export async function read(storageKey: string): Promise<Buffer> {
  if (blobConfigured) {
    const { get } = await import("@vercel/blob");
    const result = await get(storageKey, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("That file is not in the blob store.");
    }
    // Attachments are capped well below the function's memory, so buffering is fine
    // and keeps the download route identical for both backends.
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  return readFile(onDisk(storageKey));
}
