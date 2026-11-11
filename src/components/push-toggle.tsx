"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui";

type State =
  | "checking"
  | "unsupported"
  | "blocked"
  | "off"
  | "on"
  | "working"
  | "failed";

/** The browser hands back base64url; the push API wants raw bytes. */
function toBytes(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Turns browser push on for this device. Notifications are recorded either way —
 * this only decides whether the browser also pops one up when the app is closed.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Everything here is async so the effect never sets state synchronously.
    void (async () => {
      if (!publicKey) {
        if (!cancelled) {
          setState("unsupported");
          setDetail("Push is not configured on the server.");
        }
        return;
      }
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) {
          setState("unsupported");
          setDetail("This browser cannot receive push notifications.");
        }
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      try {
        const registration =
          await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setState(subscription ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("working");
    setDetail(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toBytes(publicKey),
        }));

      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error(await response.text());

      setState("on");
    } catch (error) {
      setState("failed");
      setDetail(error instanceof Error ? error.message : "Could not turn push on.");
    }
  }

  async function disable() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch(`/api/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("failed");
      setDetail("Could not turn push off.");
    }
  }

  if (state === "checking") {
    return <p className="text-[14px] text-muted">Checking this browser…</p>;
  }

  if (state === "unsupported") {
    return <p className="text-[14px] text-muted">{detail}</p>;
  }

  if (state === "blocked") {
    return (
      <p className="text-[14px] text-muted">
        This browser is blocking notifications for the site. Allow them in the
        browser&rsquo;s site settings, then come back.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={state === "on" ? "secondary" : "primary"}
          size="sm"
          disabled={state === "working"}
          onClick={state === "on" ? disable : enable}
        >
          {state === "working"
            ? "Working…"
            : state === "on"
              ? "Turn off on this browser"
              : "Turn on for this browser"}
        </Button>
        <span className="text-[13px] text-muted">
          {state === "on"
            ? "This browser will pop up notifications even when the app is closed."
            : "Notifications are still recorded here; the browser just stays quiet."}
        </span>
      </div>
      {detail ? (
        <p role="alert" className="text-[13px] text-danger">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
