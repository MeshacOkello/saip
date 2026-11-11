"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose, IconPlus } from "@/components/icons";

export function DialogEditor({ title, description, children, id }: {
  title: string; description?: string; children: ReactNode; id: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (location.hash === `#${id}` && !dialog.current?.open) dialog.current?.showModal();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id]);
  return (
    <div className="dialog-editor">
      <button type="button" className="editor-trigger" onClick={() => dialog.current?.showModal()}>
        <IconPlus />{title}
      </button>
      <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="form-dialog">
        <header className="flex items-center justify-between gap-4 border-b border-line p-5">
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Close dialog" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" onClick={() => dialog.current?.close()}><IconClose /></button>
        </header>
        <div className="p-5">
          {description ? <p className="mb-4 text-sm text-muted">{description}</p> : null}
          {children}
        </div>
      </dialog>
    </div>
  );
}
