import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The upload directory holds board records. A storage key comes from our own
 * database, but a key is still a string, and the day one is wrong this guard is the
 * only thing between a download route and the rest of the filesystem.
 */
describe("uploads stay inside the upload directory", () => {
  it("reads a key that belongs to the directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "saip-uploads-"));
    process.env.UPLOAD_DIR = root;
    const { read, storageBackend } = await import("@/lib/messages/storage");
    expect(storageBackend).toBe("local-disk");

    await writeFile(path.join(root, "quote.pdf"), "pretend pdf");
    expect((await read("quote.pdf")).toString()).toBe("pretend pdf");
  });

  it("refuses a key that climbs out, however it is written", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "saip-uploads-"));
    process.env.UPLOAD_DIR = root;
    const { read } = await import("@/lib/messages/storage");

    // Something the board should never be able to serve, next to the directory.
    const secret = path.join(path.dirname(root), "secret.txt");
    await writeFile(secret, "not for the internet");

    for (const key of [
      "../secret.txt",
      "../../etc/passwd",
      "2026-11/../../secret.txt",
      path.join(path.dirname(root), "secret.txt"), // absolute
    ]) {
      await expect(read(key)).rejects.toThrow(/outside the upload directory/);
    }
  });

  it("is not fooled by a sibling directory that merely starts the same", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "saip-"));
    const root = path.join(base, "uploads");
    const sibling = path.join(base, "uploads-elsewhere");
    await import("node:fs/promises").then((fs) =>
      Promise.all([
        fs.mkdir(root, { recursive: true }),
        fs.mkdir(sibling, { recursive: true }),
      ]),
    );
    await writeFile(path.join(sibling, "leak.txt"), "nope");

    process.env.UPLOAD_DIR = root;
    const { read } = await import("@/lib/messages/storage");
    await expect(read("../uploads-elsewhere/leak.txt")).rejects.toThrow(
      /outside the upload directory/,
    );
    // And the file really is readable by other means, so the refusal is the guard
    // doing its job rather than the file being absent.
    expect((await readFile(path.join(sibling, "leak.txt"))).toString()).toBe("nope");
  });
});
