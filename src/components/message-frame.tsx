"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The two-column messaging workspace: conversations on the left, the open
 * conversation filling everything else.
 *
 * On a narrow screen only one of the two is on screen at a time, the way a
 * phone messaging app works — the list, then the conversation, with a back
 * button. `message-selected` is what switches between them.
 */
export function MessageFrame({
  list,
  children,
}: {
  list: ReactNode;
  children: ReactNode;
}) {
  const selected = usePathname() !== "/messages";
  return (
    <div className={`message-workspace${selected ? " message-selected" : ""}`}>
      {list}
      <div className="message-main">{children}</div>
    </div>
  );
}
