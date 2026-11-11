"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and offers the new version when one is ready.
 *
 * The worker never activates on its own: a board member mid-way through writing
 * minutes should not have the page swapped underneath them, so the swap happens
 * only when they say yes.
 */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          if (!cancelled) setWaiting(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller &&
              !cancelled
            ) {
              setWaiting(installing);
            }
          });
        });

        // Catch a version published while the tab stayed open.
        const timer = window.setInterval(
          () => void registration.update().catch(() => undefined),
          60 * 60 * 1000,
        );
        return () => window.clearInterval(timer);
      } catch {
        // An unregistered worker only costs offline messaging, never the app.
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="update-prompt" role="status">
      <p>A new version of SAIP is ready.</p>
      <div>
        <button
          type="button"
          onClick={() => {
            setApplying(true);
            waiting.postMessage({ type: "SKIP_WAITING" });
          }}
          disabled={applying}
        >
          {applying ? "Updating…" : "Reload"}
        </button>
        <button type="button" onClick={() => setWaiting(null)} className="is-quiet">
          Later
        </button>
      </div>
    </div>
  );
}
