import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { dogImage } from './fixtures/illustrated-curriculum.ts';
import { prepareIllustrations } from '../tools/curriculum/illustrations.ts';

test('preparing a chapter reuses a sense-based image and produces both variants plus a review preview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ikasbide-images-'));
  try {
    await mkdir(join(root, 'A1/chapters'), { recursive: true });
    await writeFile(
      join(root, 'A1/book.json'),
      await readFile('tests/fixtures/curriculum.sample/book.json'),
    );
    for (const id of ['chapter-1', 'chapter-2']) {
      await writeFile(
        join(root, `A1/chapters/${id}.json`),
        await readFile(`tests/fixtures/curriculum.sample/chapters/${id}.json`),
      );
    }
    await writeFile(join(root, 'dog.png'), dogImage);
    const draft = {
      sequenceId: 'origin',
      objectiveIds: ['say-origin-and-residence'],
      words: [
        {
          senseId: 'dog-animal',
          word: { eu: 'txakur', fr: 'chien' },
          imageFile: 'dog.png',
          distractors: ['katu', 'zaldi', 'ardi', 'behi', 'txori'],
        },
      ],
    };
    const first = await prepareIllustrations(
      root,
      'A1',
      'chapter-1',
      draft,
      'test.firebasestorage.app',
    );
    assert.match(first.preview, /txakur/);
    assert.match(first.preview, /illustrations\/[a-f0-9]{64}\.png/);
    const reused = {
      ...draft,
      words: draft.words.map(({ imageFile: _imageFile, ...word }) => word),
    };
    await rm(join(root, 'dog.png'));
    const second = await prepareIllustrations(
      root,
      'A1',
      'chapter-1',
      reused,
      'test.firebasestorage.app',
    );
    assert.equal(first.preview, second.preview);
    const chapter = JSON.parse(await readFile(join(root, 'A1/chapters/chapter-1.json'), 'utf8'));
    const activities = chapter.sequences.find(
      (sequence: { id: string }) => sequence.id === 'origin',
    ).contents;
    assert.equal(
      activities.filter((activity: { kind: string }) => activity.kind === 'image-choice').length,
      1,
    );
    assert.equal(
      activities.filter((activity: { kind: string }) => activity.kind === 'image-write').length,
      1,
    );
    assert.deepEqual(activities.at(-2).items[0].choices, [
      'txakur',
      'katu',
      'zaldi',
      'ardi',
      'behi',
      'txori',
    ]);
    assert.deepEqual(activities.at(-1).items[0].acceptedAnswers, ['txakur']);
    const before = await readFile(join(root, 'A1/chapters/chapter-1.json'), 'utf8');
    reused.words[0].distractors[0] = ' TXAKUR ';
    await assert.rejects(
      () => prepareIllustrations(root, 'A1', 'chapter-1', reused, 'test.firebasestorage.app'),
      /distinct words/,
    );
    assert.equal(await readFile(join(root, 'A1/chapters/chapter-1.json'), 'utf8'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
