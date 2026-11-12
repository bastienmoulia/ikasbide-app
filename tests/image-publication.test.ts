import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  dogImage,
  catImage,
  illustratedCurriculum,
  imageReference,
} from './fixtures/illustrated-curriculum.ts';
import { illustrationUrl } from '../tools/curriculum/illustrations.ts';
import { publishIllustrationAssets } from '../tools/curriculum/publish-images.ts';

test('publication uploads each immutable asset once and refuses all uploads if a referenced file is corrupt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ikasbide-image-publish-'));
  try {
    await mkdir(join(root, 'illustrations'));
    const book = illustratedCurriculum('publication-test');
    const bucket = 'test.firebasestorage.app';
    for (const activity of book.chapters[0].sequences[0].contents) {
      if (activity.type !== 'activity' || !('items' in activity)) continue;
      for (const item of activity.items) {
        if ('image' in item) item.image.url = illustrationUrl(bucket, item.image.sha256);
      }
    }
    for (const bytes of [dogImage, catImage]) {
      await writeFile(join(root, `illustrations/${imageReference(bytes).sha256}.png`), bytes);
    }
    const uploaded: string[] = [];
    await publishIllustrationAssets(root, [book], async (asset) => {
      uploaded.push(asset.path);
    });
    assert.equal(uploaded.length, 2);
    assert.equal(new Set(uploaded).size, 2);
    await writeFile(join(root, `illustrations/${imageReference(catImage).sha256}.png`), dogImage);
    uploaded.length = 0;
    await assert.rejects(
      () =>
        publishIllustrationAssets(root, [book], async (asset) => {
          uploaded.push(asset.path);
        }),
      /digest/i,
    );
    assert.deepEqual(uploaded, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
