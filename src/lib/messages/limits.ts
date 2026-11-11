/**
 * Upload rules, kept apart from the filesystem code so pages can import them without
 * dragging node:fs into the client bundle's dependency trace.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED = [
  "image/",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument",
  "application/msword",
  "application/vnd.ms-excel",
];

export function isAllowedType(contentType: string) {
  return ALLOWED.some((prefix) => contentType.startsWith(prefix));
}
