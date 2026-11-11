"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReactNode } from "react";

/** How close to the bottom still counts as following the conversation. */
const NEAR_BOTTOM = 120;

/**
 * The scrolling half of a conversation.
 *
 * Messages start at the top and grow down, so a conversation with two messages
 * shows two messages at the top with space below — not two messages pushed to
 * the floor, which is what bottom-aligning a short history looks like. Opening
 * one long enough to scroll lands on the newest message, because that is what
 * you came to read.
 *
 * A new message pulls the view down only if you were already at the bottom. If
 * you are reading something from last week your place is kept and a button
 * appears instead, which you are free to ignore.
 */
export function ChatScroll({
  count,
  children,
}: {
  /** How many messages are rendered. A change means the thread moved on. */
  count: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  // Only flips at the threshold, so scrolling does not re-render on every pixel.
  const [atBottom, setAtBottom] = useState(true);
  const [seen, setSeen] = useState(count);
  const [waiting, setWaiting] = useState(false);

  // Working this out while rendering keeps the button in step with the messages
  // it is describing, rather than a frame behind them.
  if (count !== seen) {
    const grew = count > seen;
    setSeen(count);
    if (grew && !atBottom) setWaiting(true);
  }

  // Setting scrollTop rather than asking for a smooth scroll. Smooth scrolling
  // is refused outright in some environments — an embedded or backgrounded view
  // will accept the call and not move — and a jump that silently does nothing is
  // a worse bug than a jump that does not animate.
  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Land on the newest message when the conversation opens.
  useEffect(() => {
    toBottom();
  }, []);

  // The thread grew while we were following it, so keep following it.
  useEffect(() => {
    if (atBottom) toBottom();
  }, [seen, atBottom]);

  // Nothing pushes messages to this page, so ask the server now and then, and
  // only while somebody is actually looking at the tab.
  useEffect(() => {
    const ask = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(ask, 15_000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [router]);

  return (
    <div className="chat-scroll-wrap">
      <div
        className="chat-scroll"
        ref={box}
        onScroll={(event) => {
          const el = event.currentTarget;
          const close =
            el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
          if (close !== atBottom) setAtBottom(close);
          if (close && waiting) setWaiting(false);
        }}
      >
        {children}
      </div>

      {waiting ? (
        <button
          type="button"
          className="chat-jump"
          onClick={() => {
            toBottom();
            setAtBottom(true);
            setWaiting(false);
          }}
        >
          New messages
        </button>
      ) : null}
    </div>
  );
}
