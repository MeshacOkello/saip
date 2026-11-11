"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Avatar, Button } from "@/components/ui";
import type { ActionState } from "@/lib/profile/actions";

const FORMATS = ["image/jpeg", "image/png", "image/webp"];

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Choosing a profile photo.
 *
 * The size is checked here, before anything is sent. That is not politeness: a
 * file over the server's request limit is rejected by the framework before any
 * of our code runs, which produces a bare 413 and no useful message at all. The
 * server checks again — the browser is never the authority — but the person
 * finds out instantly and from something that can explain itself.
 */
export function AvatarPicker({
  name,
  current,
  maxBytes,
  save,
  remove,
}: {
  name: string;
  current: string | null;
  maxBytes: number;
  save: (previous: ActionState, form: FormData) => Promise<ActionState>;
  remove: (previous: ActionState) => Promise<ActionState>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Revoke the object URL when it stops being the one on screen, so choosing a
  // dozen photos does not leave a dozen blobs behind.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!FORMATS.includes(file.type)) {
      setProblem("Use a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      setProblem(
        `That image is ${size(file.size)}. The limit is ${size(maxBytes)}.`,
      );
      return;
    }
    setProblem(null);
    setNote(null);
    setChosen(file);
    setPreview(URL.createObjectURL(file));
  }

  function cancel() {
    setChosen(null);
    setPreview(null);
    setProblem(null);
    if (picker.current) picker.current.value = "";
  }

  function commit() {
    if (!chosen) return;
    const data = new FormData();
    data.set("photo", chosen);
    start(async () => {
      const result = await save({ ok: true }, data);
      if (result.ok) {
        cancel();
        setNote("Photo updated.");
      } else {
        setProblem(result.error ?? "That did not save. Try again.");
      }
    });
  }

  function drop() {
    start(async () => {
      const result = await remove({ ok: true });
      if (result.ok) {
        cancel();
        setNote("Photo removed.");
      } else {
        setProblem(result.error ?? "That did not save. Try again.");
      }
    });
  }

  return (
    <div className="avatar-picker">
      <Avatar name={name} size={88} src={preview ?? current} />

      <div className="avatar-picker-actions">
        <input
          ref={picker}
          type="file"
          accept={FORMATS.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => choose(event.target.files?.[0])}
        />

        {chosen ? (
          <>
            <p className="avatar-picker-file">
              {chosen.name} · {size(chosen.size)}
            </p>
            <div className="avatar-picker-row">
              <Button size="sm" onClick={commit} disabled={pending}>
                {pending ? "Saving…" : "Save photo"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancel}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="avatar-picker-row">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => picker.current?.click()}
              disabled={pending}
            >
              {current ? "Change photo" : "Add a photo"}
            </Button>
            {current ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={drop}
                disabled={pending}
              >
                Remove
              </Button>
            ) : null}
          </div>
        )}

        {problem ? (
          <p role="alert" className="avatar-picker-problem">
            {problem}
          </p>
        ) : null}
        {note ? <p className="avatar-picker-note">{note}</p> : null}
      </div>
    </div>
  );
}
