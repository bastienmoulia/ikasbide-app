import type { VocabularyImage } from './curriculum.model';

export interface PreparedImages {
  urls: Map<string, string>;
  cacheUnavailable: boolean;
  release(): void;
}

const cacheName = 'ikasbide:vocabulary-images:v1';
const maxBytes = 1024 * 1024;

/** Downloads only missing assets and verifies cached bytes as well as network responses. */
export async function prepareVocabularyImages(
  images: readonly VocabularyImage[],
  signal: AbortSignal,
  firebaseToken: () => Promise<string>,
): Promise<PreparedImages> {
  const urls = new Map<string, string>();
  const unique = [...new Map(images.map((image) => [image.sha256, image])).values()];
  let cache: Cache | undefined;
  let cacheUnavailable = false;
  if (unique.length) {
    try {
      cache = await caches.open(cacheName);
    } catch (error) {
      console.error('Vocabulary image cache is unavailable.', error);
      cacheUnavailable = true;
    }
  }
  async function load(image: VocabularyImage): Promise<void> {
    const key = new URL(`/__vocabulary_images/${image.sha256}`, location.origin).href;
    let response: Response | undefined;
    try {
      response = await cache?.match(key);
    } catch (error) {
      console.error('Cached vocabulary image could not be read.', image.sha256, error);
      cacheUnavailable = true;
    }
    try {
      let blob: Blob | undefined;
      if (response) {
        try {
          blob = await verifiedImage(response, image.sha256);
        } catch (error) {
          console.error(
            'Cached vocabulary image is invalid; downloading again.',
            image.sha256,
            error,
          );
          await cache?.delete(key);
          response = undefined;
        }
      }
      if (!blob) {
        const headers = new Headers();
        if (new URL(image.url).hostname === 'firebasestorage.googleapis.com') {
          headers.set('Authorization', `Firebase ${await firebaseToken()}`);
        }
        response = await fetch(image.url, {
          headers,
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
        blob = await verifiedImage(response, image.sha256);
        try {
          await cache?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
        } catch (error) {
          console.error('Vocabulary image could not be cached.', image.sha256, error);
          cacheUnavailable = true;
        }
      }
      if (!signal.aborted) urls.set(image.sha256, URL.createObjectURL(blob));
    } catch (error) {
      if (!signal.aborted) console.error('Vocabulary image is unavailable.', image.sha256, error);
    }
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, unique.length) }, async () => {
      while (next < unique.length && !signal.aborted) await load(unique[next++]);
    }),
  );
  const release = () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  };
  if (signal.aborted) release();
  return { urls, cacheUnavailable, release };
}

async function verifiedImage(response: Response, sha256: string): Promise<Blob> {
  const blob = await response.blob();
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
    blob.size > maxBytes ||
    !blob.size
  ) {
    throw new Error('Expected a PNG, JPEG or WebP image no larger than 1 MiB.');
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256) throw new Error('Image SHA-256 mismatch.');
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob;
}
