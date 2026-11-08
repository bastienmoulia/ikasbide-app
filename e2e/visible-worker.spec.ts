import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('worker-initiated manifest requests require a visible client, but cached-app assets do not', async () => {
  let windows: { visibilityState: string }[] = [{ visibilityState: 'hidden' }];
  const scope = {
    location: new URL('http://localhost/visible-worker.js'),
    clients: { matchAll: async () => windows },
    fetch: async (_input: Request | string, _init?: RequestInit) => new Response('network'),
  };
  const imports: string[] = [];
  runInNewContext(await readFile('public/visible-worker.js', 'utf8'), {
    self: scope,
    URL,
    Response,
    importScripts: (path: string) => imports.push(path),
  });
  expect(imports).toEqual(['./ngsw-worker.js']);
  expect((await scope.fetch('http://localhost/ngsw.json?ngsw-cache-bust=1')).status).toBe(503);
  expect(await (await scope.fetch('http://localhost/main.js')).text()).toBe('network');
  windows = [];
  expect((await scope.fetch(new Request('http://localhost/ngsw.json'))).status).toBe(503);
  windows = [{ visibilityState: 'hidden' }, { visibilityState: 'visible' }];
  expect(await (await scope.fetch('http://localhost/ngsw.json')).text()).toBe('network');
});
