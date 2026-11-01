import type {
  Activity,
  Chapter,
  CurriculumSource,
  Resource,
} from '../../src/app/curriculum/curriculum.model.ts';
import { idPattern } from './identifiers.ts';

export type ValidationResult =
  { valid: true; curriculum: CurriculumSource } | { valid: false; errors: string[] };

const gapMarker = '___';
// Below this count an objective could never be acquired (README: three distinct items).
const minCorrectedItemsPerObjective = 3;
const resourceKinds: readonly Resource['kind'][] = ['note', 'dialogue', 'external-link'];
const activityKinds: readonly Activity['kind'][] = [
  'gap-fill',
  'translation',
  'multiple-choice',
  'word-order',
  'matching',
  'oral-prompt',
];
const minMatchingPairs = 2;
const maxMatchingPairs = 8;
type JsonObject = Record<string, unknown>;

/** Validates the book manifest and every chapter file before returning normalized data. */
export function validateCurriculum(
  value: unknown,
  chapterFiles: ReadonlyMap<string, unknown>,
  fileErrors: string[] = [],
): ValidationResult {
  const errors = [...fileErrors];
  const fail = (path: string, message: string) => errors.push(`${path}: ${message}`);

  function object(value: unknown, path: string, required: string[], optional: string[] = []) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(path, 'must be an object');
      return null;
    }
    const record = value as JsonObject;
    for (const key of required) {
      if (!(key in record)) fail(`${path}.${key}`, 'is required');
    }
    for (const key of Object.keys(record)) {
      if (!required.includes(key) && !optional.includes(key))
        fail(`${path}.${key}`, 'is not allowed');
    }
    return record;
  }

  function text(value: unknown, path: string): value is string {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(path, 'must be a non-empty string');
      return false;
    }
    return true;
  }

  function bilingual(value: unknown, path: string): void {
    const record = object(value, path, ['eu', 'fr']);
    if (!record) return;
    if ('eu' in record) text(record['eu'], `${path}.eu`);
    if ('fr' in record) text(record['fr'], `${path}.fr`);
  }

  function bookTitle(value: unknown, path: string): void {
    const record = object(value, path, ['eu'], ['fr']);
    if (!record) return;
    if ('eu' in record) text(record['eu'], `${path}.eu`);
    if ('fr' in record) text(record['fr'], `${path}.fr`);
  }

  function list(value: unknown, path: string, minimum = 1): unknown[] {
    if (!Array.isArray(value)) {
      if (value !== undefined) fail(path, 'must be an array');
      return [];
    }
    if (value.length < minimum) fail(path, `must contain at least ${minimum} element(s)`);
    return value;
  }

  function texts(value: unknown, path: string): string[] {
    return list(value, path).filter((entry, index): entry is string =>
      text(entry, `${path}[${index}]`),
    );
  }

  function id(value: unknown, path: string, seen: Set<string>): void {
    if (typeof value !== 'string' || !idPattern.test(value)) {
      if (value !== undefined) fail(path, 'must be a lowercase kebab-case identifier');
      return;
    }
    if (seen.has(value)) fail(path, `duplicates identifier "${value}"`);
    seen.add(value);
  }

  function httpsUrl(value: unknown, path: string): void {
    if (!text(value, path)) return;
    try {
      if (new URL(value).protocol !== 'https:') fail(path, 'must be an https URL');
    } catch {
      fail(path, 'must be an https URL');
    }
  }

  // `$schema` points editors at the separate book or chapter schema and is never published.
  const book = object(
    value,
    'book.json',
    ['schemaVersion', 'id', 'title', 'chapters'],
    ['$schema'],
  );
  if (!book) return { valid: false, errors };
  if ('$schema' in book) text(book['$schema'], 'book.json.$schema');
  if ('schemaVersion' in book && book['schemaVersion'] !== 2) {
    fail('book.json.schemaVersion', 'must be 2');
  }
  const bookIds = new Set<string>();
  id(book['id'], 'book.json.id', bookIds);
  if ('title' in book) bookTitle(book['title'], 'book.json.title');

  const chapterIds = new Set<string>();
  const chapters: Chapter[] = [];
  list(book['chapters'], 'book.json.chapters').forEach((chapterIdValue, chapterIndex) => {
    const chapterRefPath = `book.json.chapters[${chapterIndex}]`;
    id(chapterIdValue, chapterRefPath, chapterIds);
    if (typeof chapterIdValue !== 'string' || !idPattern.test(chapterIdValue)) return;
    const chapterPath = `chapters/${chapterIdValue}.json`;
    const chapterValue = chapterFiles.get(chapterIdValue);
    if (!chapterFiles.has(chapterIdValue)) {
      fail(chapterPath, 'is listed in book.json but the file is missing');
      return;
    }
    const chapter = object(
      chapterValue,
      chapterPath,
      ['schemaVersion', 'title', 'objectives', 'sequences'],
      ['$schema'],
    );
    if (!chapter) return;
    if ('$schema' in chapter) text(chapter['$schema'], `${chapterPath}.$schema`);
    if ('schemaVersion' in chapter && chapter['schemaVersion'] !== 2) {
      fail(`${chapterPath}.schemaVersion`, 'must be 2');
    }
    if ('title' in chapter) bilingual(chapter['title'], `${chapterPath}.title`);
    chapters.push({
      id: chapterIdValue,
      number: chapterIndex + 1,
      title: chapter['title'] as Chapter['title'],
      objectives: chapter['objectives'] as Chapter['objectives'],
      sequences: chapter['sequences'] as Chapter['sequences'],
    });

    const objectiveIds = new Set<string>();
    list(chapter['objectives'], `${chapterPath}.objectives`).forEach((objective, index) => {
      const path = `${chapterPath}.objectives[${index}]`;
      const record = object(objective, path, ['id', 'label']);
      if (!record) return;
      id(record['id'], `${path}.id`, objectiveIds);
      if ('label' in record) bilingual(record['label'], `${path}.label`);
    });

    const assessedItems = new Map<string, number>([...objectiveIds].map((id) => [id, 0]));
    const sequenceIds = new Set<string>();
    const sequenceLetters = new Set<string>();
    const contentIds = new Set<string>();
    const itemIds = new Set<string>();

    function objectiveReferences(value: unknown, path: string): void {
      new Set(texts(value, path)).forEach((objectiveId) => {
        const count = assessedItems.get(objectiveId);
        if (count === undefined) fail(path, `references unknown objective "${objectiveId}"`);
        else assessedItems.set(objectiveId, count + 1);
      });
    }

    function item(
      value: unknown,
      path: string,
      fields: string[],
      check: (item: JsonObject) => void,
    ): void {
      const record = object(
        value,
        path,
        ['id', 'objectiveIds', ...fields],
        fields.includes('acceptedAnswers') ? ['warningAnswers', 'hint'] : ['hint'],
      );
      if (!record) return;
      id(record['id'], `${path}.id`, itemIds);
      objectiveReferences(record['objectiveIds'], `${path}.objectiveIds`);
      check(record);
      if ('warningAnswers' in record) texts(record['warningAnswers'], `${path}.warningAnswers`);
      if ('hint' in record) {
        list(record['hint'], `${path}.hint`).forEach((line, index) =>
          bilingual(line, `${path}.hint[${index}]`),
        );
      }
    }

    function activityItems(activity: JsonObject, path: string): void {
      const items = list(activity['items'], `${path}.items`);
      items.forEach((value, index) => {
        const itemPath = `${path}.items[${index}]`;
        switch (activity['kind']) {
          case 'gap-fill':
            item(value, itemPath, ['prompt', 'acceptedAnswers'], (record) => {
              bilingual(record['prompt'], `${itemPath}.prompt`);
              const prompt = (record['prompt'] as JsonObject | undefined)?.['eu'];
              if (typeof prompt === 'string' && prompt.split(gapMarker).length !== 2) {
                fail(`${itemPath}.prompt.eu`, `must contain exactly one "${gapMarker}" gap`);
              }
              texts(record['acceptedAnswers'], `${itemPath}.acceptedAnswers`);
            });
            break;
          case 'translation':
            item(value, itemPath, ['direction', 'source', 'acceptedAnswers'], (record) => {
              if (record['direction'] !== 'eu-fr' && record['direction'] !== 'fr-eu') {
                fail(`${itemPath}.direction`, 'must be "eu-fr" or "fr-eu"');
              }
              text(record['source'], `${itemPath}.source`);
              texts(record['acceptedAnswers'], `${itemPath}.acceptedAnswers`);
            });
            break;
          case 'multiple-choice':
            item(value, itemPath, ['prompt', 'choices', 'correctChoiceIds'], (record) => {
              bilingual(record['prompt'], `${itemPath}.prompt`);
              const choiceIds = new Set<string>();
              list(record['choices'], `${itemPath}.choices`, 2).forEach((choice, choiceIndex) => {
                const choicePath = `${itemPath}.choices[${choiceIndex}]`;
                const entry = object(choice, choicePath, ['id', 'lang', 'text']);
                if (!entry) return;
                id(entry['id'], `${choicePath}.id`, choiceIds);
                if (entry['lang'] !== 'eu' && entry['lang'] !== 'fr') {
                  fail(`${choicePath}.lang`, 'must be "eu" or "fr"');
                }
                text(entry['text'], `${choicePath}.text`);
              });
              texts(record['correctChoiceIds'], `${itemPath}.correctChoiceIds`).forEach(
                (choiceId) => {
                  if (!choiceIds.has(choiceId)) {
                    fail(`${itemPath}.correctChoiceIds`, `references unknown choice "${choiceId}"`);
                  }
                },
              );
            });
            break;
          case 'word-order':
            item(value, itemPath, ['prompt', 'words', 'acceptedAnswers'], (record) => {
              bilingual(record['prompt'], `${itemPath}.prompt`);
              const words = list(record['words'], `${itemPath}.words`, 2);
              const expected = wordBag(
                words.filter((word, index): word is string =>
                  text(word, `${itemPath}.words[${index}]`),
                ),
              );
              texts(record['acceptedAnswers'], `${itemPath}.acceptedAnswers`).forEach(
                (answer, index) => {
                  if (wordBag(answer.split(/\s+/)) !== expected) {
                    fail(
                      `${itemPath}.acceptedAnswers[${index}]`,
                      'must use exactly the listed words',
                    );
                  }
                },
              );
              if (Array.isArray(record['warningAnswers'])) {
                record['warningAnswers'].forEach((answer, index) => {
                  if (typeof answer === 'string' && wordBag(answer.split(/\s+/)) !== expected) {
                    fail(
                      `${itemPath}.warningAnswers[${index}]`,
                      'must use exactly the listed words',
                    );
                  }
                });
              }
            });
            break;
          case 'matching':
            item(value, itemPath, ['pairs'], (record) => {
              const pairs = list(record['pairs'], `${itemPath}.pairs`, minMatchingPairs);
              if (pairs.length > maxMatchingPairs) {
                fail(`${itemPath}.pairs`, `must contain at most ${maxMatchingPairs} pairs`);
              }
              const seen = { eu: new Set<string>(), fr: new Set<string>() };
              pairs.forEach((pair, pairIndex) => {
                const pairPath = `${itemPath}.pairs[${pairIndex}]`;
                bilingual(pair, pairPath);
                for (const lang of ['eu', 'fr'] as const) {
                  const value = (pair as JsonObject | null)?.[lang];
                  if (typeof value !== 'string') continue;
                  const key = value.trim().normalize('NFC').toLocaleLowerCase(lang);
                  if (seen[lang].has(key)) {
                    fail(`${pairPath}.${lang}`, `duplicates "${value}" in this item`);
                  }
                  seen[lang].add(key);
                }
              });
            });
            break;
        }
      });
    }

    list(chapter['sequences'], `${chapterPath}.sequences`).forEach((sequenceValue, index) => {
      const sequencePath = `${chapterPath}.sequences[${index}]`;
      const sequence = object(sequenceValue, sequencePath, ['id', 'letter', 'title', 'contents']);
      if (!sequence) return;
      id(sequence['id'], `${sequencePath}.id`, sequenceIds);
      const letter = sequence['letter'];
      if (typeof letter !== 'string' || !/^[A-Z]$/.test(letter)) {
        if (letter !== undefined) fail(`${sequencePath}.letter`, 'must be one capital letter');
      } else if (sequenceLetters.has(letter)) {
        fail(`${sequencePath}.letter`, `duplicates letter "${letter}"`);
      } else {
        if (sequenceLetters.size && letter <= [...sequenceLetters].at(-1)!) {
          fail(`${sequencePath}.letter`, 'sequences must be listed in alphabetical order');
        }
        sequenceLetters.add(letter);
      }
      if ('title' in sequence) bilingual(sequence['title'], `${sequencePath}.title`);

      list(sequence['contents'], `${sequencePath}.contents`).forEach((contentValue, index) => {
        const contentPath = `${sequencePath}.contents[${index}]`;
        const content = object(
          contentValue,
          contentPath,
          ['type', 'kind', 'id', 'title'],
          ['body', 'markdown', 'lines', 'description', 'url', 'instructions', 'items'],
        );
        if (!content) return;
        id(content['id'], `${contentPath}.id`, contentIds);
        if ('title' in content) bilingual(content['title'], `${contentPath}.title`);
        const kind = content['kind'];
        const allowOnly = (fields: string[]) => {
          for (const field of [
            'body',
            'markdown',
            'lines',
            'description',
            'url',
            'instructions',
            'items',
          ]) {
            const present = field in content;
            if (fields.includes(field) && !present) fail(`${contentPath}.${field}`, 'is required');
            if (!fields.includes(field) && present) {
              fail(`${contentPath}.${field}`, `is not allowed for "${String(kind)}"`);
            }
          }
        };

        if (content['type'] === 'resource') {
          if (!(resourceKinds as readonly unknown[]).includes(kind)) {
            fail(`${contentPath}.kind`, `must be one of ${resourceKinds.join(', ')}`);
          } else if (kind === 'note') {
            // A note is either two parallel paragraphs or a single free Markdown text.
            if ('markdown' in content && !('body' in content)) {
              allowOnly(['markdown']);
              text(content['markdown'], `${contentPath}.markdown`);
            } else {
              allowOnly(['body']);
              if ('body' in content) bilingual(content['body'], `${contentPath}.body`);
            }
          } else if (kind === 'dialogue') {
            allowOnly(['lines']);
            list(content['lines'], `${contentPath}.lines`).forEach((line, lineIndex) => {
              const linePath = `${contentPath}.lines[${lineIndex}]`;
              const record = object(line, linePath, ['speaker', 'text']);
              if (!record) return;
              text(record['speaker'], `${linePath}.speaker`);
              bilingual(record['text'], `${linePath}.text`);
            });
          } else {
            allowOnly(['description', 'url']);
            if ('description' in content) {
              bilingual(content['description'], `${contentPath}.description`);
            }
            if ('url' in content) httpsUrl(content['url'], `${contentPath}.url`);
          }
        } else if (content['type'] === 'activity') {
          if (!(activityKinds as readonly unknown[]).includes(kind)) {
            fail(`${contentPath}.kind`, `must be one of ${activityKinds.join(', ')}`);
            return;
          }
          allowOnly(kind === 'oral-prompt' ? ['instructions'] : ['instructions', 'items']);
          if ('instructions' in content) {
            bilingual(content['instructions'], `${contentPath}.instructions`);
          }
          if (kind !== 'oral-prompt') activityItems(content, contentPath);
        } else {
          fail(`${contentPath}.type`, 'must be "resource" or "activity"');
        }
      });
    });

    for (const [objectiveId, count] of assessedItems) {
      if (count < minCorrectedItemsPerObjective) {
        fail(
          `${chapterPath}.objectives`,
          `objective "${objectiveId}" needs at least ${minCorrectedItemsPerObjective} corrected items (found ${count})`,
        );
      }
    }
  });

  return errors.length
    ? { valid: false, errors }
    : {
        valid: true,
        curriculum: {
          schemaVersion: 2,
          id: book['id'] as string,
          title: book['title'] as CurriculumSource['title'],
          chapters,
        },
      };
}

function wordBag(words: string[]): string {
  return words
    .map((word) =>
      word
        .normalize('NFC')
        .toLocaleLowerCase('eu')
        .replace(/[.!?…]+$/u, ''),
    )
    .filter(Boolean)
    .sort()
    .join(' ');
}
