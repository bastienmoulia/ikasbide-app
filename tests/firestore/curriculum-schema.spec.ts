import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { Ajv2020 } from 'ajv/dist/2020.js';

// The JSON Schema gives editors structural feedback; tools/curriculum/validate.ts stays the
// authority for cross-reference rules. These checks keep both contracts aligned.
const sample = 'tests/fixtures/curriculum.sample.json';

async function schemaValidator() {
  const schema = JSON.parse(await readFile('tools/curriculum/curriculum.schema.json', 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true, strictTypes: false }).compile(schema);
}

async function sampleCurriculum() {
  return JSON.parse(await readFile(sample, 'utf8'));
}

test('the JSON Schema accepts the synthetic sample and a $schema reference', async () => {
  const validate = await schemaValidator();
  const curriculum = await sampleCurriculum();
  curriculum.$schema = './curriculum.schema.json';
  expect(validate(curriculum), JSON.stringify(validate.errors)).toBe(true);
});

const structuralErrors: [string, (curriculum: any) => void][] = [
  ['a missing French translation', (c) => delete c.units[0].chapters[0].objectives[0].label.fr],
  [
    'an empty Basque translation',
    (c) => (c.units[0].chapters[0].sequences[0].contents[0].body.eu = '  '),
  ],
  ['a misspelt field', (c) => (c.units[0].chapters[0].titel = c.units[0].chapters[0].title)],
  ['an unknown schema version', (c) => (c.schemaVersion = 2)],
  ['a non-kebab-case identifier', (c) => (c.units[0].id = 'Unit 1')],
  ['a lowercase sequence letter', (c) => (c.units[0].chapters[0].sequences[0].letter = 'a')],
  [
    'an unknown activity format',
    (c) => (c.units[0].chapters[0].sequences[0].contents[3].kind = 'matching'),
  ],
  [
    'an activity kind used as a resource',
    (c) => (c.units[0].chapters[0].sequences[0].contents[3].type = 'resource'),
  ],
  [
    'a gap-fill prompt without a gap',
    (c) =>
      (c.units[0].chapters[0].sequences[0].contents[2].items[0].prompt.eu = 'Kaixo, Jon naiz.'),
  ],
  [
    'a gap-fill prompt with two gaps',
    (c) => (c.units[0].chapters[0].sequences[0].contents[2].items[0].prompt.eu = '___ eta ___'),
  ],
  [
    'an item without accepted answers',
    (c) => (c.units[0].chapters[0].sequences[1].contents[2].items[0].acceptedAnswers = []),
  ],
  [
    'an empty warning answer list',
    (c) => (c.units[0].chapters[0].sequences[0].contents[2].items[0].warningAnswers = []),
  ],
  [
    'a blank warning answer',
    (c) => (c.units[0].chapters[0].sequences[1].contents[2].items[0].warningAnswers = [' ']),
  ],
  [
    'a warning answer list that is not an array',
    (c) => (c.units[0].chapters[0].sequences[1].contents[3].items[0].warningAnswers = 'zara'),
  ],
  [
    'warning answers on a multiple-choice item',
    (c) => (c.units[0].chapters[0].sequences[0].contents[3].items[0].warningAnswers = ['Agur']),
  ],
  [
    'an item field from another activity format',
    (c) => (c.units[0].chapters[0].sequences[1].contents[2].items[0].words = ['a', 'b']),
  ],
  [
    'an oral prompt with corrected items',
    (c) => (c.units[0].chapters[0].sequences[1].contents[4].items = []),
  ],
  [
    'a non-HTTPS external resource',
    (c) => (c.units[0].chapters[0].sequences[1].contents[1].url = 'http://example.org/audio.mp3'),
  ],
];

for (const [name, change] of structuralErrors) {
  test(`the JSON Schema rejects ${name}`, async () => {
    const validate = await schemaValidator();
    const curriculum = await sampleCurriculum();
    change(curriculum);
    expect(validate(curriculum)).toBe(false);
  });
}
