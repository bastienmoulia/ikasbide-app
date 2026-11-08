/* Keep Angular's own scheduled manifest checks behind the same visibility boundary. */
const networkFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    self.location.href,
  );
  if (url.origin === self.location.origin && url.pathname.endsWith('/ngsw.json')) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!windows.some((client) => client.visibilityState === 'visible')) {
      return new Response('', { status: 503, statusText: 'No visible app client' });
    }
  }
  return networkFetch(input, init);
};
importScripts('./ngsw-worker.js');
