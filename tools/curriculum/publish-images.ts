import { readFile } from 'node:fs/promises';
import type { CurriculumSource } from '../../src/app/curriculum/curriculum.model.ts';
import { illustrationUrl, validatePng, withinRepository } from './illustrations.ts';

interface IllustrationAsset {
  bucket: string;
  path: string;
  sha256: string;
  bytes: Buffer;
}

/** Validates the complete asset set before any upload, and uploads before Firestore publication. */
export async function publishIllustrationAssets(
  root: string,
  curricula: readonly CurriculumSource[],
  upload: (asset: IllustrationAsset) => Promise<void> = uploadToStorage,
  committedPaths?: ReadonlySet<string>,
): Promise<void> {
  const assets = new Map<string, IllustrationAsset>();
  for (const curriculum of curricula) {
    for (const chapter of curriculum.chapters) {
      for (const sequence of chapter.sequences) {
        for (const activity of sequence.contents) {
          if (activity.kind !== 'image-choice' && activity.kind !== 'image-write') continue;
          for (const { image } of activity.items) {
            const bucket = new URL(image.url).pathname.split('/')[3];
            if (!bucket || image.url !== illustrationUrl(bucket, image.sha256)) {
              throw new Error(
                'Illustrations must use the canonical Firebase Storage URL for their digest.',
              );
            }
            const path = `illustrations/${image.sha256}.png`;
            if (committedPaths && !committedPaths.has(path))
              throw new Error(`${path}: is not committed; nothing was published.`);
            const key = `${bucket}/${path}`;
            if (assets.has(key)) continue;
            const bytes = await readFile(await withinRepository(root, path));
            if (validatePng(bytes) !== image.sha256)
              throw new Error(`${path}: image digest mismatch; nothing was published.`);
            assets.set(key, { bucket, path, sha256: image.sha256, bytes });
          }
        }
      }
    }
  }
  if (assets.size && upload === uploadToStorage && process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error(
      'Refusing to contact production Storage from a Firestore emulator publication.',
    );
  }
  for (const asset of assets.values()) await upload(asset);
}

async function uploadToStorage(asset: IllustrationAsset): Promise<void> {
  const { Storage } = await import('@google-cloud/storage');
  const file = new Storage().bucket(asset.bucket).file(asset.path);
  try {
    await file.save(asset.bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: 'image/png',
        cacheControl: 'private, max-age=31536000, immutable',
        metadata: { sha256: asset.sha256 },
      },
    });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 412)) throw error;
    const [metadata] = await file.getMetadata();
    if (
      metadata.metadata?.['sha256'] !== asset.sha256 ||
      Number(metadata.size) !== asset.bytes.length
    ) {
      throw new Error(`${asset.path}: existing Storage object does not match the approved asset.`);
    }
  }
}
