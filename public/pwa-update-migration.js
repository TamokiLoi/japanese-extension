// Imported by the generated service worker. Store whether a worker already
// controlled this registration before this one installed; first-time PWA
// installs should not cause a pointless reload.
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
