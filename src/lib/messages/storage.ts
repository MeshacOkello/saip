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

/** Which backend is in use, for the deployment check page to report honestly. */
export const storageBackend = blobConfigured ? "vercel-blob" : "local-disk";

/** The stored name is generated here; a client-supplied filename never reaches storage. */
function newKey() {
  return `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
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

  const target = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return key;
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

  // Defend against a traversal in a stored key, however it got there.
  const target = path.resolve(UPLOAD_DIR, storageKey);
  if (!target.startsWith(path.resolve(UPLOAD_DIR))) {
    throw new Error("Refusing to read outside the upload directory.");
  }
  return readFile(target);
}
