"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function MessageFrame({ navigation, children }: { navigation: ReactNode; children: ReactNode }) {
  const selected = usePathname() !== "/messages";
  return (
    <div className={`message-workspace ${selected ? "message-selected" : ""}`}>
      <aside className="message-navigation">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-semibold">Conversations</h2>
          <Link href="/messages#new-message" className="text-sm font-medium text-primary">New</Link>
        </div>
        {navigation}
      </aside>
      <div className="message-main">{children}</div>
    </div>
  );
}
