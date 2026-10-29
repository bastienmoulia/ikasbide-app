import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { runCurriculumCli } from './run-curriculum-cli.ts';

const sample = 'tests/fixtures/curriculum.sample.json';
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

test('the maintainer import publishes a curriculum learners can browse in book order', async () => {
  const result = await runCurriculumCli('import', sample, '--project', 'demo-ikasbide');
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('1 unit, 2 chapters');

  const unit = (await getDoc(doc(learner(), 'units/unit-1'))).data();
  expect(unit).toMatchObject({
    number: 1,
    title: { eu: 'Lehen urratsak', fr: 'Premiers pas' },
    chapters: [
      { id: 'chapter-1', number: 1, title: { eu: 'Aurkezpenak', fr: 'Les présentations' } },
      { id: 'chapter-2', number: 2, title: { eu: 'Familia', fr: 'La famille' } },
    ],
  });

  const chapter = (await getDoc(doc(learner(), 'chapters/chapter-1'))).data();
  expect(chapter?.['unitId']).toBe('unit-1');
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
});

async function writeVariant(
  name: string,
  change: (curriculum: any) => void,
  testInfo: { outputPath(name: string): string },
): Promise<string> {
  const curriculum = JSON.parse(await readFile(sample, 'utf8'));
  change(curriculum);
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(curriculum));
  return path;
}

test('invalid source data fails explicitly and publishes nothing', async ({}, testInfo) => {
  const file = await writeVariant(
    'missing-translation',
    (curriculum) => {
      curriculum.units.push({
        id: 'unit-2',
        number: 2,
        title: { eu: 'Bigarren unitatea', fr: 'Deuxième unité' },
        chapters: [
          { ...structuredClone(curriculum.units[0].chapters[1]), id: 'chapter-6', number: 6 },
        ],
      });
      curriculum.units[0].chapters[0].title = { eu: 'Aldatutako izenburua' };
    },
    testInfo,
  );

  const result = await runCurriculumCli('import', file, '--project', 'demo-ikasbide');

  expect(result.code).toBe(1);
  expect(result.stderr).toContain('units[0].chapters[0].title.fr');
  expect(result.stdout).not.toContain('Published');
  expect((await getDoc(doc(learner(), 'units/unit-2'))).exists()).toBe(false);
  expect((await getDoc(doc(learner(), 'chapters/chapter-6'))).exists()).toBe(false);
  expect((await getDoc(doc(learner(), 'chapters/chapter-1'))).data()?.['title']).toEqual({
    eu: 'Aurkezpenak',
    fr: 'Les présentations',
  });
});

const chapter1 = 'units[0].chapters[0]';
const greetings = `${chapter1}.sequences[0].contents`;
const origin = `${chapter1}.sequences[1].contents`;
const invalidSources: [string, (curriculum: any) => void, string][] = [
  [
    'a learning objective without its French label',
    (c) => delete c.units[0].chapters[0].objectives[0].label.fr,
    `${chapter1}.objectives[0].label.fr: is required`,
  ],
  [
    'a bilingual text with an empty Basque translation',
    (c) => (c.units[0].chapters[0].sequences[0].contents[0].body.eu = '  '),
    `${greetings}[0].body.eu: must be a non-empty string`,
  ],
  [
    'an item assigned to an unknown objective',
    (c) => (c.units[0].chapters[0].sequences[0].contents[2].items[0].objectiveIds = ['sing']),
    `${greetings}[2].items[0].objectiveIds: references unknown objective "sing"`,
  ],
  [
    'a multiple-choice answer that is not one of the choices',
    (c) => (c.units[0].chapters[0].sequences[0].contents[3].items[0].correctChoiceIds = ['agur!']),
    `${greetings}[3].items[0].correctChoiceIds: references unknown choice "agur!"`,
  ],
  [
    'an item without accepted answers',
    (c) => (c.units[0].chapters[0].sequences[1].contents[2].items[0].acceptedAnswers = []),
    `${origin}[2].items[0].acceptedAnswers: must contain at least 1 element(s)`,
  ],
  [
    'a gap-fill prompt without a gap',
    (c) =>
      (c.units[0].chapters[0].sequences[0].contents[2].items[0].prompt.eu = 'Kaixo, Jon naiz.'),
    `${greetings}[2].items[0].prompt.eu: must contain exactly one "___" gap`,
  ],
  [
    'a word-order answer that uses other words',
    (c) =>
      c.units[0].chapters[0].sequences[1].contents[3].items[1].acceptedAnswers.push(
        'Bilbon bizi zara.',
      ),
    `${origin}[3].items[1].acceptedAnswers[1]: must use exactly the listed words`,
  ],
  [
    'an optional oral prompt presented as corrected items',
    (c) => (c.units[0].chapters[0].sequences[1].contents[4].items = []),
    `${origin}[4].items: is not allowed for "oral-prompt"`,
  ],
  [
    'an unknown activity format',
    (c) => (c.units[0].chapters[0].sequences[0].contents[3].kind = 'matching'),
    `${greetings}[3].kind: must be one of gap-fill, translation, multiple-choice, word-order, oral-prompt`,
  ],
  [
    'a non-HTTPS external resource',
    (c) => (c.units[0].chapters[0].sequences[1].contents[1].url = 'http://example.org/audio.mp3'),
    `${origin}[1].url: must be an https URL`,
  ],
  [
    'a misspelt field',
    (c) => (c.units[0].chapters[0].titel = c.units[0].chapters[0].title),
    `${chapter1}.titel: is not allowed`,
  ],
  [
    'a duplicated item identifier',
    (c) => (c.units[0].chapters[0].sequences[1].contents[2].items[1].id = 'greetings-gap-1'),
    `${origin}[2].items[1].id: duplicates identifier "greetings-gap-1"`,
  ],
  [
    'sequences out of book order',
    (c) => c.units[0].chapters[0].sequences.reverse(),
    `${chapter1}.sequences[1].letter: sequences must be listed in alphabetical order`,
  ],
  [
    'chapters out of book order',
    (c) => (c.units[0].chapters[1].number = 1),
    'units: chapters must be listed in increasing order',
  ],
  [
    'an objective without enough corrected items to be acquired',
    (c) => (c.units[0].chapters[1].sequences[0].contents[0].items.length = 2),
    'units[0].chapters[1].objectives: objective "name-family-members" needs at least 3 corrected items (found 2)',
  ],
];

for (const [name, change, error] of invalidSources) {
  test(`validation rejects ${name}`, async ({}, testInfo) => {
    const file = await writeVariant(name.replaceAll(' ', '-'), change, testInfo);
    const result = await runCurriculumCli('validate', file);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('nothing was published');
    expect(result.stderr).toContain(`  - ${error}\n`);
  });
}

test('validation rejects a file that is not JSON', async ({}, testInfo) => {
  const file = testInfo.outputPath('broken.json');
  await writeFile(file, '{ "schemaVersion": 1,');
  const result = await runCurriculumCli('validate', file);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain(`Cannot read ${file} as JSON`);
});

test('validation accepts the synthetic sample without touching Firestore', async () => {
  const result = await runCurriculumCli('validate', sample);
  expect(result).toEqual({
    code: 0,
    stdout: 'Valid curriculum: 1 unit, 2 chapters.\n',
    stderr: '',
  });
});

test('validation takes unit membership from the nesting, not from chapter numbers', async ({}, testInfo) => {
  const file = await writeVariant(
    'six-chapters-in-unit',
    (c) => (c.units[0].chapters[1].number = 6),
    testInfo,
  );
  const result = await runCurriculumCli('validate', file);
  expect(result).toEqual({
    code: 0,
    stdout: 'Valid curriculum: 1 unit, 2 chapters.\n',
    stderr: '',
  });
});
