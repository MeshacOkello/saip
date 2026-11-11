"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { IconPaperclip, IconSend } from "@/components/icons";
import type { ActionState } from "@/lib/messages/actions";

const MAX_ROWS_PX = 160;

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Writing a message.
 *
 * One row until there is more than one line to show. The file picker is a
 * paperclip rather than a native file input, because "Choose Files / No file
 * chosen" is the browser talking, not the application — chosen files appear as
 * chips that can be taken off again, which a file input cannot do.
 *
 * The form data is assembled here instead of being read off the form, so that
 * removing an attachment actually removes it.
 */
export function ChatComposer({
  conversationId,
  action,
  placeholder,
  maxBytes,
}: {
  conversationId: string;
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  placeholder: string;
  maxBytes: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Grow with the message, then stop and scroll.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [body]);

  const empty = body.trim().length === 0 && files.length === 0;

  function send() {
    if (empty || pending) return;
    const data = new FormData();
    data.set("conversationId", conversationId);
    data.set("body", body);
    for (const file of files) data.append("files", file);

    start(async () => {
      const result = await action({ ok: true }, data);
      if (result.ok) {
        // Clear only once it is actually away, so a refusal does not cost
        // somebody the message they just typed.
        setBody("");
        setFiles([]);
        setError(null);
        input.current?.focus();
      } else {
        setError(result.error ?? "That did not send. Try again.");
      }
    });
  }

  function choose(picked: FileList | null) {
    if (!picked) return;
    const next: File[] = [];
    for (const file of Array.from(picked)) {
      if (file.size > maxBytes) {
        setTooBig(`${file.name} is over ${maxBytes / 1024 / 1024} MB.`);
        continue;
      }
      next.push(file);
    }
    if (next.length > 0) setTooBig(null);
    setFiles((current) => [...current, ...next]);
    if (picker.current) picker.current.value = "";
  }

  return (
    <div className="chat-composer">
      {files.length > 0 ? (
        <ul className="composer-files">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className="composer-file-name">{file.name}</span>
              <span className="composer-file-size">{size(file.size)}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="composer-error">
          {error}
        </p>
      ) : null}
      {tooBig ? (
        <p role="alert" className="composer-error">
          {tooBig}
        </p>
      ) : null}

      <div className="composer-row">
        <button
          type="button"
          className="composer-button"
          onClick={() => picker.current?.click()}
          aria-label="Attach a file"
        >
          <IconPaperclip className="size-5" />
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => choose(event.target.files)}
        />

        <textarea
          ref={input}
          rows={1}
          value={body}
          placeholder={placeholder}
          aria-label="Message"
          enterKeyHint="send"
          className="composer-input"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />

        <button
          type="button"
          className="composer-send"
          onClick={send}
          disabled={empty || pending}
          aria-label="Send message"
        >
          <IconSend className="size-5" />
        </button>
      </div>
    </div>
  );
}
