"use client";

import { IconPlus } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export function EditorLink({ id, children }: { id: string; children: string }) {
  return (
    <a
      href={`#${id}`}
      className={buttonClass()}
      onClick={(event) => {
        const editor = document.getElementById(id);
        if (editor instanceof HTMLDialogElement) {
          event.preventDefault();
          editor.showModal();
          history.replaceState(null, "", `#${id}`);
        }
      }}
    >
      <IconPlus />
      {children}
    </a>
  );
}
