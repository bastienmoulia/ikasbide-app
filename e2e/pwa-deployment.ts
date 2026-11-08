import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';

/** Two app-shell releases on an isolated origin, using the real Angular worker. */
export async function pwaDeployment() {
  const releases = await Promise.all(
    ['dist/ikasbide/browser', 'dist/pwa-release/browser'].map(async (path) => {
      const root = resolve(path);
      const originalIndex = await readFile(resolve(root, 'index.html'), 'utf8');
      const manifest = JSON.parse(await readFile(resolve(root, 'ngsw.json'), 'utf8')) as {
        hashTable: Record<string, string>;
        timestamp: number;
      };
      return { root, originalIndex, manifest };
    }),
  );
  let version = 1;
  let broken = false;
  const release = () => releases[version === 1 ? 0 : 1];
  const index = () =>
    release().originalIndex.replace(
      '<head>',
      `<head><meta name="test-release" content="${version}">`,
    );
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const { root, manifest } = release();
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/ngsw.json') {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            ...manifest,
            timestamp: manifest.timestamp + version,
            hashTable: {
              ...manifest.hashTable,
              '/index.html': createHash('sha1').update(index()).digest('hex'),
            },
          }),
        );
        return;
      }
      const file = resolve(root, '.' + decodeURIComponent(pathname));
      if (file !== root && !file.startsWith(root + '/')) {
        response.writeHead(400).end();
        return;
      }
      if (!extname(pathname) || pathname === '/index.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end(index() + (broken ? '<!-- incomplete deployment -->' : ''));
        return;
      }
      response.setHeader(
        'Content-Type',
        {
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
          '.woff2': 'font/woff2',
        }[extname(pathname)] ?? 'application/octet-stream',
      );
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
        // Keep old hashed assets available while clients finish their old release.
        data = await readFile(resolve(releases[0].root, '.' + decodeURIComponent(pathname)));
      }
      response.end(data);
    })().catch((error: unknown) => {
      console.error('Test deployment request failed.', error);
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test deployment port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    deploy: (incomplete = false) => {
      version += 1;
      broken = incomplete;
    },
    repair: () => (broken = false),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
