import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { validateCurriculum } from '../tools/curriculum/validate.ts';
import type { ChapterSource } from '../src/app/curriculum/curriculum.model.ts';

async function illustratedSource() {
  const root = 'tests/fixtures/curriculum.sample';
  const book = JSON.parse(await readFile(`${root}/book.json`, 'utf8'));
  const chapters = new Map<string, ChapterSource>(
    await Promise.all(
      book.chapters.map(async (id: string) => [
        id,
        JSON.parse(await readFile(`${root}/chapters/${id}.json`, 'utf8')),
      ]),
    ),
  );
  const item = {
    id: 'illustrated-dog',
    objectiveIds: ['say-origin-and-residence'],
    image: { url: 'https://example.test/illustrations/dog.png', sha256: 'a'.repeat(64) },
    word: { eu: 'txakur', fr: 'chien' },
    choices: ['txakur', 'katu', 'zaldi', 'ardi', 'behi', 'txori'],
  };
  const chapter = chapters.get('chapter-1')!;
  chapter.sequences[1].contents.push({
    type: 'activity',
    kind: 'image-choice',
    id: 'illustrated-choices',
    title: { eu: 'Irudiak', fr: 'Images' },
    instructions: { eu: 'Aukeratu hitza.', fr: 'Choisissez le mot.' },
    items: [item],
  });
  return { book, chapters, chapter, item };
}

test('illustrated vocabulary is accepted by both source contracts', async () => {
  const { book, chapters, chapter } = await illustratedSource();
  const ajv = new Ajv2020({ strict: true, strictTypes: false });
  ajv.addSchema(JSON.parse(await readFile('tools/curriculum/book.schema.json', 'utf8')));
  const validate = ajv.compile(
    JSON.parse(await readFile('tools/curriculum/chapter.schema.json', 'utf8')),
  );
  assert.equal(validate(chapter), true, JSON.stringify(validate.errors));
  const result = validateCurriculum(book, chapters);
  assert.equal(result.valid, true, result.valid ? '' : result.errors.join('\n'));
});

test('written illustrated vocabulary requires the target first and accepts only explicit variants', async () => {
  const { book, chapters, chapter, item } = await illustratedSource();
  const activity = {
    type: 'activity' as const,
    kind: 'image-write' as const,
    id: 'illustrated-written',
    title: { eu: 'Idatzi', fr: 'Écrire' },
    instructions: { eu: 'Idatzi.', fr: 'Écrivez.' },
    items: [
      {
        id: 'write-illustrated-dog',
        objectiveIds: item.objectiveIds,
        image: item.image,
        word: item.word,
        acceptedAnswers: ['txakur', 'txakurra'],
      },
    ],
  };
  chapter.sequences[1].contents.push(activity);
  assert.equal(validateCurriculum(book, chapters).valid, true);
  const ajv = new Ajv2020({ strict: true, strictTypes: false });
  ajv.addSchema(JSON.parse(await readFile('tools/curriculum/book.schema.json', 'utf8')));
  const validate = ajv.compile(
    JSON.parse(await readFile('tools/curriculum/chapter.schema.json', 'utf8')),
  );
  assert.equal(validate(chapter), true, JSON.stringify(validate.errors));
  activity.items[0].acceptedAnswers.reverse();
  assert.equal(validateCurriculum(book, chapters).valid, false);
});

for (const [name, change] of [
  [
    'only five choices',
    (item: Awaited<ReturnType<typeof illustratedSource>>['item']) => item.choices.pop(),
  ],
  [
    'duplicate words ignoring case',
    (item: Awaited<ReturnType<typeof illustratedSource>>['item']) => {
      item.choices[1] = ' TXAKUR ';
    },
  ],
  [
    'missing target',
    (item: Awaited<ReturnType<typeof illustratedSource>>['item']) => {
      item.choices[0] = 'sagu';
    },
  ],
  [
    'an insecure image URL',
    (item: Awaited<ReturnType<typeof illustratedSource>>['item']) => {
      item.image.url = 'http://example.test/dog.png';
    },
  ],
  [
    'an invalid image digest',
    (item: Awaited<ReturnType<typeof illustratedSource>>['item']) => {
      item.image.sha256 = 'not-a-digest';
    },
  ],
] as const) {
  test(`illustrated vocabulary rejects ${name}`, async () => {
    const { book, chapters, item } = await illustratedSource();
    change(item);
    assert.equal(validateCurriculum(book, chapters).valid, false);
  });
}
