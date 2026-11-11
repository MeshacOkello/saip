/*
 * SAIP Board service worker.
 *
 * Two jobs: receive pushes, and keep the app usable enough to say something honest
 * when the network is gone.
 *
 * It deliberately caches almost nothing. Board records — messages, finances, member
 * details — are authenticated and private, so no HTML page and no API response is
 * ever written to the cache. Only the build's own immutable static assets and the
 * offline page are kept.
 */

/*
 * Bump this whenever anything in PRECACHE changes.
 *
 * The precache is filled once, at install. An installed copy keeps serving the
 * version it already has, so editing offline.html without changing this number
 * means the old page is what people actually see — which is exactly what
 * happened to the offline copy rewritten in the previous commit.
 */
const VERSION = "saip-v4";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

const PRECACHE = [
  "/offline.html",
  "/saip-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
  // Wait for the user to accept the update rather than swapping under their feet.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !name.startsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** The page asks for the new version when the person says yes. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Hashed build output and our own icons: safe to keep, never personal. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/saip-logo.png" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch authentication, the API, uploaded files or the worker itself.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sw.js" ||
    request.headers.get("accept")?.includes("text/event-stream")
  ) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages always come from the network. If the network is gone, say so — the page
  // itself is never cached, because it is somebody's private board data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match("/offline.html");
        return (
          offline ??
          new Response("You are offline.", {
            status: 503,
            headers: { "content-type": "text/plain" },
          })
        );
      }),
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Push                                                                        */
/* -------------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "SAIP Board", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "SAIP Board";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-maskable-192.png",
      // The notification id collapses repeats of the same event into one.
      tag: payload.id || undefined,
      renotify: Boolean(payload.id),
      data: { href: payload.href || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  const target = new URL(href, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          if ("navigate" in client) await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
