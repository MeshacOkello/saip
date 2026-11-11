import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Select the official mark from the static brand assets.
 */
const CANDIDATES = ["saip-logo.svg", "saip-logo.png", "saip-logo.jpg"];

export function logoSrc(): string | null {
  for (const name of CANDIDATES) {
    if (existsSync(path.join(process.cwd(), "public", name))) return `/${name}`;
  }
  return null;
}
