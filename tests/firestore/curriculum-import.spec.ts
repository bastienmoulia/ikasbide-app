import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { runCurriculumCli } from './run-curriculum-cli.ts';

const sample = 'tests/fixtures/curriculum.sample';
const bookSchema = pathToFileURL(resolve('tools/curriculum/book.schema.json')).href;
const chapterSchema = pathToFileURL(resolve('tools/curriculum/chapter.schema.json')).href;
let environment: RulesTestEnvironment;

test.beforeAll(async () => {
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-ikasbide',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});

test.afterAll(async () => {
  await environment?.cleanup();
});

function learner() {
  return environment
    .authenticatedContext('import-reader', { firebase: { sign_in_provider: 'google.com' } })
    .firestore();
}

test('the maintainer import publishes a book and ordered chapters', async () => {
  const result = await runCurriculumCli('import', sample, '--project', 'demo-ikasbide');
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('Published book a1, 2 chapters');

  const book = (await getDoc(doc(learner(), 'books/a1'))).data();
  expect(book).toMatchObject({
    title: { eu: 'Lehen urratsak' },
    chapters: [
      { id: 'chapter-1', number: 1, title: { eu: 'Aurkezpenak', fr: 'Les présentations' } },
      { id: 'chapter-2', number: 2, title: { eu: 'Familia', fr: 'La famille' } },
    ],
  });

  const chapter = (await getDoc(doc(learner(), 'chapters/chapter-1'))).data();
  expect(chapter?.['bookId']).toBe('a1');
  expect(chapter?.['number']).toBe(1);
  expect(chapter?.['sequences'].map((sequence: { letter: string }) => sequence.letter)).toEqual([
    'A',
    'B',
  ]);
  expect(chapter?.['sequences'][1].contents.map((content: { id: string }) => content.id)).toEqual([
    'origin-note',
    'origin-audio',
    'origin-translation',
    'origin-word-order',
    'origin-pair-talk',
  ]);
  expect(chapter?.['sequences'][1].contents[2].items[0].acceptedAnswers).toEqual([
    'Baionakoa naiz.',
    'Ni Baionakoa naiz.',
  ]);
  expect(chapter?.['sequences'][0].contents[2].items[3].warningAnswers).toEqual(['Egun on']);
  expect(chapter?.['sequences'][1].contents[2].items[1].warningAnswers).toEqual([
    'Je réside à Bilbao.',
  ]);
  expect(chapter?.['sequences'][1].contents[3].items[1].warningAnswers).toEqual([
    'Bizi naiz Bilbon.',
  ]);
});

test('a complete import removes stale chapters and legacy units atomically', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'chapters', 'chapter-stale'), { bookId: 'a1' }),
      setDoc(doc(firestore, 'chapters', 'chapter-legacy'), { number: 9 }),
      setDoc(doc(firestore, 'units', 'unit-1'), { number: 1 }),
    ]);
  });

  const result = await runCurriculumCli('import', sample, '--project', 'demo-ikasbide');
  expect(result.code).toBe(0);
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    expect((await getDoc(doc(firestore, 'chapters', 'chapter-stale'))).exists()).toBe(false);
    expect((await getDoc(doc(firestore, 'chapters', 'chapter-legacy'))).exists()).toBe(false);
    expect((await getDoc(doc(firestore, 'units', 'unit-1'))).exists()).toBe(false);
  });
});

interface CurriculumSources {
  book: any;
  chapters: Record<string, any>;
}

async function readSample(): Promise<CurriculumSources> {
  const book = JSON.parse(await readFile(`${sample}/book.json`, 'utf8'));
  const chapters = Object.fromEntries(
    await Promise.all(
      book.chapters.map(async (id: string) => [
        id,
        JSON.parse(await readFile(`${sample}/chapters/${id}.json`, 'utf8')),
      ]),
    ),
  );
  return { book, chapters };
}

async function writeVariant(
  name: string,
  change: (source: CurriculumSources) => void,
  testInfo: { outputPath(name: string): string },
): Promise<string> {
  const source = structuredClone(await readSample());
  change(source);
  const directory = testInfo.outputPath(name);
  await mkdir(`${directory}/chapters`, { recursive: true });
  await writeFile(
    `${directory}/book.json`,
    JSON.stringify({ ...source.book, $schema: bookSchema }),
  );
  for (const [id, chapter] of Object.entries(source.chapters)) {
    await writeFile(
      `${directory}/chapters/${id}.json`,
      JSON.stringify({ ...chapter, $schema: chapterSchema }),
    );
  }
  return directory;
}

test('an invalid chapter blocks the entire import', async ({}, testInfo) => {
  const directory = await writeVariant(
    'missing-translation',
    ({ book, chapters }) => {
      book.chapters.push('chapter-6');
      chapters['chapter-6'] = structuredClone(chapters['chapter-2']);
      chapters['chapter-1'].title = { eu: 'Aldatutako izenburua' };
    },
    testInfo,
  );

  const result = await runCurriculumCli('import', directory, '--project', 'demo-ikasbide');
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('chapters/chapter-1.json.title.fr');
  expect(result.stdout).not.toContain('Published');
  expect((await getDoc(doc(learner(), 'chapters/chapter-6'))).exists()).toBe(false);
  expect((await getDoc(doc(learner(), 'chapters/chapter-1'))).data()?.['title']).toEqual({
    eu: 'Aurkezpenak',
    fr: 'Les présentations',
  });
});

const chapter1 = 'chapters/chapter-1.json';
const greetings = `${chapter1}.sequences[0].contents`;
const origin = `${chapter1}.sequences[1].contents`;
const invalidSources: [string, (source: CurriculumSources) => void, string][] = [
  [
    'a learning objective without its French label',
    ({ chapters }) => delete chapters['chapter-1'].objectives[0].label.fr,
    `${chapter1}.objectives[0].label.fr: is required`,
  ],
  [
    'a v1 chapter source',
    ({ chapters }) => (chapters['chapter-1'].schemaVersion = 1),
    `${chapter1}.schemaVersion: must be 2`,
  ],
  [
    'a bilingual text with an empty Basque translation',
    ({ chapters }) => (chapters['chapter-1'].sequences[0].contents[0].body.eu = '  '),
    `${greetings}[0].body.eu: must be a non-empty string`,
  ],
  [
    'an item assigned to an unknown objective',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[0].contents[2].items[0].objectiveIds = ['sing']),
    `${greetings}[2].items[0].objectiveIds: references unknown objective "sing"`,
  ],
  [
    'a multiple-choice answer that is not one of the choices',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[0].contents[3].items[0].correctChoiceIds = ['agur!']),
    `${greetings}[3].items[0].correctChoiceIds: references unknown choice "agur!"`,
  ],
  [
    'an item without accepted answers',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[0].acceptedAnswers = []),
    `${origin}[2].items[0].acceptedAnswers: must contain at least 1 element(s)`,
  ],
  [
    'an empty warning answer list',
    ({ chapters }) => (chapters['chapter-1'].sequences[0].contents[2].items[0].warningAnswers = []),
    `${greetings}[2].items[0].warningAnswers: must contain at least 1 element(s)`,
  ],
  [
    'a blank warning answer',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[0].warningAnswers = [' ']),
    `${origin}[2].items[0].warningAnswers[0]: must be a non-empty string`,
  ],
  [
    'a warning answer list that is not an array',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[3].items[0].warningAnswers = 'zara'),
    `${origin}[3].items[0].warningAnswers: must be an array`,
  ],
  [
    'warning answers on a multiple-choice item',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[0].contents[3].items[0].warningAnswers = ['Agur']),
    `${greetings}[3].items[0].warningAnswers: is not allowed`,
  ],
  [
    'a word-order warning answer that uses other words',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[3].items[0].warningAnswers = ['Zira']),
    `${origin}[3].items[0].warningAnswers[0]: must use exactly the listed words`,
  ],
  [
    'a gap-fill prompt without a gap',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[0].contents[2].items[0].prompt.eu = 'Kaixo, Jon naiz.'),
    `${greetings}[2].items[0].prompt.eu: must contain exactly one "___" gap`,
  ],
  [
    'a word-order answer that uses other words',
    ({ chapters }) =>
      chapters['chapter-1'].sequences[1].contents[3].items[1].acceptedAnswers.push(
        'Bilbon bizi zara.',
      ),
    `${origin}[3].items[1].acceptedAnswers[1]: must use exactly the listed words`,
  ],
  [
    'an optional oral prompt presented as corrected items',
    ({ chapters }) => (chapters['chapter-1'].sequences[1].contents[4].items = []),
    `${origin}[4].items: is not allowed for "oral-prompt"`,
  ],
  [
    'an unknown activity format',
    ({ chapters }) => (chapters['chapter-1'].sequences[0].contents[3].kind = 'matching'),
    `${greetings}[3].kind: must be one of gap-fill, translation, multiple-choice, word-order, oral-prompt`,
  ],
  [
    'a non-HTTPS external resource',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[1].url = 'http://example.org/audio.mp3'),
    `${origin}[1].url: must be an https URL`,
  ],
  [
    'a misspelt field',
    ({ chapters }) => (chapters['chapter-1'].titel = chapters['chapter-1'].title),
    `${chapter1}.titel: is not allowed`,
  ],
  [
    'a duplicated item identifier',
    ({ chapters }) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[1].id = 'greetings-gap-1'),
    `${origin}[2].items[1].id: duplicates identifier "greetings-gap-1"`,
  ],
  [
    'sequences out of book order',
    ({ chapters }) => chapters['chapter-1'].sequences.reverse(),
    `${chapter1}.sequences[1].letter: sequences must be listed in alphabetical order`,
  ],
  [
    'a duplicate chapter reference',
    ({ book }) => (book.chapters[1] = 'chapter-1'),
    'book.json.chapters[1]: duplicates identifier "chapter-1"',
  ],
  [
    'an objective without enough corrected items to be acquired',
    ({ chapters }) => (chapters['chapter-2'].sequences[0].contents[0].items.length = 2),
    'chapters/chapter-2.json.objectives: objective "name-family-members" needs at least 3 corrected items (found 2)',
  ],
];

for (const [name, change, error] of invalidSources) {
  test(`validation rejects ${name}`, async ({}, testInfo) => {
    const directory = await writeVariant(name.replaceAll(' ', '-'), change, testInfo);
    const result = await runCurriculumCli('validate', directory);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('nothing was published');
    expect(result.stderr).toContain(`  - ${error}\n`);
  });
}

test('validation rejects malformed book JSON', async ({}, testInfo) => {
  const directory = testInfo.outputPath('broken');
  await mkdir(`${directory}/chapters`, { recursive: true });
  await writeFile(`${directory}/book.json`, '{ "schemaVersion": 2,');
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('book.json: cannot parse JSON');
});

test('validation accepts the converted book without touching Firestore', async () => {
  const result = await runCurriculumCli('validate', sample);
  expect(result).toEqual({
    code: 0,
    stdout: 'Valid book a1: 2 chapters.\n',
    stderr: '',
  });
});

test('validation rejects v1 sources', async ({}, testInfo) => {
  const directory = await writeVariant('v1-book', ({ book }) => (book.schemaVersion = 1), testInfo);
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('book.json.schemaVersion: must be 2');
});

test('validation accepts the optional French book title', async ({}, testInfo) => {
  const directory = await writeVariant(
    'book-with-french-title',
    ({ book }) => (book.title.fr = 'Premiers pas'),
    testInfo,
  );
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(0);
});

test('validation rejects chapter JSON files absent from the book list', async ({}, testInfo) => {
  const directory = await writeVariant('unlisted-chapter', () => {}, testInfo);
  await writeFile(`${directory}/chapters/unlisted.json`, '{}');
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('chapters/unlisted.json: is not listed in book.json');
});

test('validation rejects a missing chapter file', async ({}, testInfo) => {
  const directory = await writeVariant('missing-chapter', () => {}, testInfo);
  await rm(`${directory}/chapters/chapter-2.json`);
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('chapters/chapter-2.json: cannot read file');
});

test('validation accepts schema references in the book and chapter files', async ({}, testInfo) => {
  const directory = await writeVariant('with-schema-references', () => {}, testInfo);
  const result = await runCurriculumCli('validate', directory);
  expect(result.code).toBe(0);
});
