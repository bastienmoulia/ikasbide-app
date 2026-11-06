import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { WordOrderActivity } from '../../src/app/curriculum/curriculum.model.ts';
import { validateCurriculum } from '../../tools/curriculum/validate.ts';

const sample = 'tests/fixtures/curriculum.sample';

async function sourceSchemas() {
  const [bookSchema, chapterSchema] = await Promise.all([
    readFile('tools/curriculum/book.schema.json', 'utf8').then(JSON.parse),
    readFile('tools/curriculum/chapter.schema.json', 'utf8').then(JSON.parse),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
  ajv.addSchema(bookSchema);
  ajv.addSchema(chapterSchema);
  return {
    book: ajv.compile(bookSchema),
    chapter: ajv.compile(chapterSchema),
  };
}

async function sampleSource() {
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

test('the book and chapter JSON Schemas accept the converted sample', async () => {
  const schemas = await sourceSchemas();
  const { book, chapters } = await sampleSource();
  expect(schemas.book(book), JSON.stringify(schemas.book.errors)).toBe(true);
  book.title.fr = 'Premiers pas';
  expect(schemas.book(book), JSON.stringify(schemas.book.errors)).toBe(true);
  for (const chapter of Object.values(chapters)) {
    expect(schemas.chapter(chapter), JSON.stringify(schemas.chapter.errors)).toBe(true);
  }
});

test('a standalone schema consumer can resolve the chapter schema and its references', async () => {
  const chapterPath = resolve(`${sample}/chapters/chapter-1.json`);
  const chapter = JSON.parse(await readFile(chapterPath, 'utf8'));
  const schemaUrl = new URL(chapter.$schema, pathToFileURL(chapterPath));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    loadSchema: async (uri) => JSON.parse(await readFile(new URL(uri), 'utf8')),
  });

  const validate = await ajv.compileAsync({ $ref: schemaUrl.href });

  expect(validate(chapter), JSON.stringify(validate.errors)).toBe(true);
});

const structuralErrors: [string, (book: any, chapters: Record<string, any>) => void, boolean][] = [
  [
    'a missing French translation',
    (_book, chapters) => delete chapters['chapter-1'].objectives[0].label.fr,
    false,
  ],
  [
    'an empty Basque translation',
    (_book, chapters) => (chapters['chapter-1'].sequences[0].contents[0].body.eu = '  '),
    false,
  ],
  [
    'a misspelt field',
    (_book, chapters) => (chapters['chapter-1'].titel = chapters['chapter-1'].title),
    false,
  ],
  ['an unsupported book schema version', (book) => (book.schemaVersion = 1), true],
  ['a non-kebab-case book identifier', (book) => (book.id = 'Book 1'), true],
  ['a book title without Basque', (book) => (book.title = { fr: 'Titre' }), true],
  [
    'a lowercase sequence letter',
    (_book, chapters) => (chapters['chapter-1'].sequences[0].letter = 'a'),
    false,
  ],
  [
    'an unknown activity format',
    (_book, chapters) => (chapters['chapter-1'].sequences[0].contents[3].kind = 'pairing'),
    false,
  ],
  [
    'an activity kind used as a resource',
    (_book, chapters) => (chapters['chapter-1'].sequences[0].contents[3].type = 'resource'),
    false,
  ],
  [
    'a gap-fill prompt without a gap',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[0].contents[2].items[0].prompt.eu = 'Kaixo, Jon naiz.'),
    false,
  ],
  [
    'a gap-fill prompt with two gaps',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[0].contents[2].items[0].prompt.eu = '___ eta ___'),
    false,
  ],
  [
    'an item without accepted answers',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[0].acceptedAnswers = []),
    false,
  ],
  [
    'an empty warning answer list',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[0].contents[2].items[0].warningAnswers = []),
    false,
  ],
  [
    'an empty hint',
    (_book, chapters) => (chapters['chapter-1'].sequences[1].contents[2].items[0].hint = []),
    false,
  ],
  [
    'a hint line without French',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[0].hint = [{ eu: 'Baiona' }]),
    false,
  ],
  [
    'warning answers on a multiple-choice item',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[0].contents[3].items[0].warningAnswers = ['Agur']),
    false,
  ],
  [
    'an item field from another activity format',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[1].contents[2].items[0].words = ['a', 'b']),
    false,
  ],
  [
    'an oral prompt with corrected items',
    (_book, chapters) => (chapters['chapter-1'].sequences[1].contents[5].items = []),
    false,
  ],
  [
    'a matching item with a single pair',
    (_book, chapters) =>
      chapters['chapter-1'].sequences[1].contents.push({
        type: 'activity',
        kind: 'matching',
        id: 'single-pair',
        title: { eu: 'Lotu', fr: 'Associer' },
        instructions: { eu: 'Lotu.', fr: 'Associez.' },
        items: [{ id: 'single-pair-1', objectiveIds: ['x'], pairs: [{ eu: 'ama', fr: 'mère' }] }],
      }),
    false,
  ],
  [
    'a note with both a bilingual body and Markdown',
    (_book, chapters) => (chapters['chapter-1'].sequences[0].contents[0].markdown = '**Kaixo**'),
    false,
  ],
  [
    'a non-HTTPS external resource',
    (_book, chapters) =>
      (chapters['chapter-1'].sequences[1].contents[1].url = 'http://example.org/audio.mp3'),
    false,
  ],
];

for (const [name, change, isBook] of structuralErrors) {
  test(`the JSON Schema rejects ${name}`, async () => {
    const schemas = await sourceSchemas();
    const { book, chapters } = await sampleSource();
    change(book, chapters);
    expect((isBook ? schemas.book : schemas.chapter)(isBook ? book : chapters['chapter-1'])).toBe(
      false,
    );
  });
}

const wordOrderCases: {
  name: string;
  words: string[];
  acceptedAnswers: string[];
  warningAnswers?: string[];
  error?: string;
}[] = [
  {
    name: 'distractors, repeated words, alternatives and warning subsets',
    words: ['oso', 'oso', 'ondo', 'dago', 'gaizki', 'dira', 'ez'],
    acceptedAnswers: ['Oso oso ondo dago!', 'Oso ondo dago.'],
    warningAnswers: ['Ondo dago.'],
  },
  {
    name: 'legacy lexical capitals, commas and terminal punctuation',
    words: ['Ane,', 'etorri.', 'hona?!'],
    acceptedAnswers: ['Ane, etorri hona!', 'Etorri hona, Ane!'],
  },
  {
    name: 'Unicode, apostrophes, hyphens and repeated whitespace',
    words: ['Éloïse', 'l’ami', 'va-t-il', 'saluer'],
    acceptedAnswers: ["E\u0301loïse  va‑t‑il saluer l'ami ?"],
  },
  {
    name: 'too few repeated occurrences in an accepted answer',
    words: ['oso', 'ondo', 'dago', 'gaizki'],
    acceptedAnswers: ['Oso oso ondo dago.'],
    error: 'acceptedAnswers[0]',
  },
  {
    name: 'too few repeated occurrences in a warning answer',
    words: ['oso', 'ondo', 'dago', 'gaizki'],
    acceptedAnswers: ['Oso ondo dago.'],
    warningAnswers: ['Oso oso ondo dago!'],
    error: 'warningAnswers[0]',
  },
  {
    name: 'an intact multi-word label',
    words: ['Ane etorri', 'da'],
    acceptedAnswers: ['Ane etorri da.'],
  },
  {
    name: 'repeated intact multi-word labels',
    words: ['oso ondo', 'oso ondo', 'dago'],
    acceptedAnswers: ['Oso ondo oso ondo dago.'],
    warningAnswers: ['Oso ondo dago.'],
  },
  {
    name: 'insufficient occurrences of a multi-word label',
    words: ['oso ondo', 'dago'],
    acceptedAnswers: ['Oso ondo oso ondo dago.'],
    error: 'acceptedAnswers[0]',
  },
  {
    name: 'overlapping labels requiring backtracking',
    words: ['Ane', 'Ane etorri', 'da'],
    acceptedAnswers: ['Ane etorri da.'],
    warningAnswers: ['Ane etorri da!'],
  },
  {
    name: 'backtracking after an occurrence is consumed by the wrong label',
    words: ['oso', 'oso ondo', 'ondo dago'],
    acceptedAnswers: ['Oso ondo oso ondo dago.'],
  },
  {
    name: 'unavailable repeated multi-word occurrences in a warning answer',
    words: ['oso ondo', 'dago'],
    acceptedAnswers: ['Oso ondo dago.'],
    warningAnswers: ['Oso ondo oso ondo dago.'],
    error: 'warningAnswers[0]',
  },
  {
    name: 'a multi-word label that is only a character prefix',
    words: ['Ane etor', 'ri da'],
    acceptedAnswers: ['Ane etorri da.'],
    error: 'acceptedAnswers[0]',
  },
  {
    name: 'a word hidden inside an indivisible label',
    words: ['Ane etorri', 'da'],
    acceptedAnswers: ['Ane da.'],
    error: 'acceptedAnswers[0]',
  },
  {
    name: 'an unavailable word in an alternative answer',
    words: ['Ane', 'etorri', 'da', 'bihar'],
    acceptedAnswers: ['Ane etorri da.', 'Ane joan da.'],
    error: 'acceptedAnswers[1]',
  },
  {
    name: 'an unavailable word in a warning answer',
    words: ['Ane', 'etorri', 'da', 'bihar'],
    acceptedAnswers: ['Ane etorri da.'],
    warningAnswers: ['Ane joan da.'],
    error: 'warningAnswers[0]',
  },
];

for (const { name, error, ...answers } of wordOrderCases) {
  test(`word-order validation handles ${name}`, async () => {
    const { book, chapters } = await sampleSource();
    const activity: WordOrderActivity = {
      id: 'synthetic-order',
      type: 'activity',
      kind: 'word-order',
      title: { eu: 'Ordenatu', fr: 'Ordonner' },
      instructions: { eu: 'Aukeratu hitzak.', fr: 'Choisissez les mots.' },
      items: [
        {
          id: 'synthetic-sentence',
          objectiveIds: ['say-origin-and-residence'],
          prompt: { eu: 'Osatu esaldia.', fr: 'Formez la phrase.' },
          ...answers,
        },
      ],
    };
    chapters['chapter-1'].sequences[1].contents.push(activity);
    const schemas = await sourceSchemas();
    expect(schemas.chapter(chapters['chapter-1']), JSON.stringify(schemas.chapter.errors)).toBe(
      true,
    );
    const result = validateCurriculum(book, new Map(Object.entries(chapters)));
    if (error) {
      expect(result.valid).toBe(false);
      if (result.valid) throw new Error('Unreconstructible answer was accepted.');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        `${error}: must be reconstructible from the listed words (including repeated occurrences)`,
      );
    } else {
      expect(result.valid, result.valid ? '' : result.errors.join('\n')).toBe(true);
    }
  });
}
