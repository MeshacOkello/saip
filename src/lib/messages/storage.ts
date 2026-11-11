import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Uploaded files live on disk, outside the database and outside `public/` — nothing
 * is served without the conversation check in the download route.
 *
 * This is the simple option that works locally and on a normal server. A deployment
 * with an ephemeral filesystem needs object storage instead; only this file changes.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "var", "uploads");

/** The stored name is generated here; a client-supplied filename never touches disk. */
export async function store(file: File) {
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  const target = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function read(storageKey: string) {
  // Defend against a traversal in a stored key, however it got there.
  const target = path.resolve(UPLOAD_DIR, storageKey);
  if (!target.startsWith(path.resolve(UPLOAD_DIR))) {
    throw new Error("Refusing to read outside the upload directory.");
  }
  return readFile(target);
}
