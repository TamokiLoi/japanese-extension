// Imported by the generated service worker. Existing clients are moved to a
// new worker only after the user applies an update, or after index.html
// explicitly activates it to recover from a failed stale lazy chunk.
const replacingExistingWorker = Boolean(self.registration.active);

self.addEventListener("activate", (event) => {
  if (!replacingExistingWorker) return;

  event.waitUntil(
    (async () => {
      const scope = new URL(self.registration.scope);
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      await Promise.all(
        clients.map((client) => {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin !== scope.origin || !clientUrl.pathname.startsWith(scope.pathname)) return;

          // The page may be executing an old cached shell whose lazy chunks
          // were removed by the latest deploy. A single navigation loads the
          // new precached shell; all study state is persisted separately.
          return client.navigate(client.url).catch(() => null);
        }),
      );
    })(),
  );
});
