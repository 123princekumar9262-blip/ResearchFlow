// ResearchFlow service worker.
//
// Pages and data always come from the network: deadlines, reviews and logs
// must never be shown stale, and they are private to the signed-in user, so
// none of them is cached. Only two things are kept on the device:
//   - the offline page, shown when a page can't be reached;
//   - hashed build files (/_next/static), which never change once published.
// Registered as /sw.js?dev=1 during development, where build files do change,
// so nothing but the offline page is cached there.

const VERSION = "rf-v3";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: network only, with the offline page as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Content-hashed build output: cache first, it never changes.
  if (!DEV && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
  // Everything else (data, server actions, files) goes straight to the network.
});

// ───────────── Notifications ─────────────
// The server sends { title, body, url, tag }. Same-tag notifications replace
// each other, so a thread doesn't stack up on the lock screen.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ResearchFlow", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ResearchFlow", {
      body: data.body || "",
      icon: "/pwa-icon/192?purpose=any",
      badge: "/pwa-icon/192",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// Tapping a notification focuses an open ResearchFlow window (or opens one) on its page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
