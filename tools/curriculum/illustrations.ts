import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type {
  BilingualText,
  ChapterSource,
  ImageChoiceActivity,
  ImageWriteActivity,
} from '../../src/app/curriculum/curriculum.model.ts';
import { readCurriculumDirectory } from './source.ts';
import { validateCurriculum } from './validate.ts';
import { idPattern } from './identifiers.ts';

interface LibraryEntry {
  word: BilingualText;
  acceptedAnswers: string[];
  sha256: string;
}
interface IllustrationDraft {
  sequenceId: string;
  objectiveIds: string[];
  words: {
    senseId: string;
    word?: BilingualText;
    acceptedAnswers?: string[];
    imageFile?: string;
    regenerate?: true;
    distractors: string[];
  }[];
}

export async function withinRepository(root: string, path: string): Promise<string> {
  if (isAbsolute(path)) throw new Error('Expected a repository-relative path.');
  const resolvedRoot = await realpath(root);
  const target = await realpath(resolve(root, path));
  if (!target.startsWith(resolvedRoot + sep))
    throw new Error('Path leaves the content repository.');
  return target;
}

export function illustrationUrl(bucket: string, sha256: string): string {
  if (!/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('Invalid Storage bucket or image digest.');
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(`illustrations/${sha256}.png`)}?alt=media`;
}

export function validatePng(bytes: Buffer): string {
  if (
    bytes.length > 1024 * 1024 ||
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20) ||
    bytes.readUInt32BE(16) > 2048 ||
    bytes.readUInt32BE(20) > 2048 ||
    bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND'
  ) {
    throw new Error('Expected a PNG no larger than 1 MiB and 2048 × 2048 pixels.');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/** Applies an agent-authored draft locally. Only a reviewed merge may publish it. */
export async function prepareIllustrations(
  root: string,
  bookDirectory: string,
  chapterId: string,
  input: unknown,
  bucket: string,
): Promise<{ preview: string }> {
  root = await realpath(root);
  const schema = JSON.parse(
    await readFile(new URL('./illustrations-draft.schema.json', import.meta.url), 'utf8'),
  );
  const ajv = new Ajv2020({ allErrors: true });
  const draftValid = ajv.compile<IllustrationDraft>(schema);
  if (!draftValid(input))
    throw new Error(`Invalid illustration draft: ${ajv.errorsText(draftValid.errors)}`);
  const draft = input;
  if (!idPattern.test(chapterId)) throw new Error('Invalid chapter ID.');
  const directory = await withinRepository(root, bookDirectory);
  const source = await readCurriculumDirectory(directory);
  const original = validateCurriculum(source.book, source.chapterFiles, source.errors);
  if (!original.valid) throw new Error(original.errors.join('\n'));
  const chapter = original.curriculum.chapters.find(({ id }) => id === chapterId);
  const sequence = chapter?.sequences.find(({ id }) => id === draft.sequenceId);
  if (!chapter || !sequence) throw new Error('Unknown chapter or sequence.');
  let library: Record<string, LibraryEntry> = {};
  try {
    const stored: unknown = JSON.parse(
      await readFile(await withinRepository(root, 'illustrations/library.json'), 'utf8'),
    );
    const libraryValid = ajv.compile<Record<string, LibraryEntry>>({
      $ref: 'illustrations-draft.schema.json#/$defs/library',
    });
    if (!libraryValid(stored))
      throw new Error(`Invalid illustration library: ${ajv.errorsText(libraryValid.errors)}`);
    library = stored;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const choice: ImageChoiceActivity = {
    id: `${sequence.id}-image-choice`,
    type: 'activity',
    kind: 'image-choice',
    title: { eu: 'Irudia eta hitza', fr: 'Reconnaître le mot illustré' },
    instructions: {
      eu: 'Begiratu irudiari eta aukeratu hitz egokia.',
      fr: 'Regardez l’image et choisissez le mot basque.',
    },
    items: [],
  };
  const written: ImageWriteActivity = {
    id: `${sequence.id}-image-write`,
    type: 'activity',
    kind: 'image-write',
    title: { eu: 'Idatzi hitza', fr: 'Écrire le mot illustré' },
    instructions: {
      eu: 'Begiratu irudiari eta idatzi hitza euskaraz.',
      fr: 'Regardez l’image et écrivez le mot basque.',
    },
    items: [],
  };
  const files = new Map<string, Buffer>();
  const preview = [
    '# Illustrations à valider',
    '',
    'Vérifier : nom concret, sens unique, illustration simple sur fond neutre sans texte, forme de dictionnaire et cinq distracteurs incontestablement faux.',
    '',
  ];
  for (const word of draft.words) {
    const existing = library[word.senseId];
    if (
      existing &&
      word.word &&
      (existing.word.eu !== word.word.eu || existing.word.fr !== word.word.fr)
    ) {
      throw new Error(`Sense "${word.senseId}" already has another word. Use a distinct sense ID.`);
    }
    let entry = existing;
    if (!existing || word.regenerate) {
      if (!word.imageFile || (!existing && !word.word))
        throw new Error(`New sense "${word.senseId}" requires word and imageFile.`);
      const bytes = await readFile(await withinRepository(root, word.imageFile));
      entry = {
        word: word.word ?? existing.word,
        acceptedAnswers: word.acceptedAnswers ?? existing?.acceptedAnswers ?? [word.word!.eu],
        sha256: validatePng(bytes),
      };
      files.set(entry.sha256, bytes);
    } else {
      if (word.imageFile)
        throw new Error(
          `Sense "${word.senseId}" already exists. Omit imageFile or explicitly set regenerate: true.`,
        );
      const path = await withinRepository(root, `illustrations/${existing.sha256}.png`);
      if (validatePng(await readFile(path)) !== existing.sha256)
        throw new Error(`Corrupt illustration for "${word.senseId}".`);
      if (word.acceptedAnswers) entry = { ...existing, acceptedAnswers: word.acceptedAnswers };
    }
    if (!entry) throw new Error(`Missing illustration for "${word.senseId}".`);
    library[word.senseId] = entry;
    const image = { url: illustrationUrl(bucket, entry.sha256), sha256: entry.sha256 };
    const common = { image, word: entry.word, objectiveIds: draft.objectiveIds };
    choice.items.push({
      ...common,
      id: `${sequence.id}-choose-${word.senseId}`,
      choices: [entry.word.eu, ...word.distractors],
    });
    written.items.push({
      ...common,
      id: `${sequence.id}-write-${word.senseId}`,
      acceptedAnswers: entry.acceptedAnswers,
    });
    const safeText = (text: string) =>
      text.replace(/[\\`*_{}[\]<>|]/g, '\\$&').replace(/[\r\n]/g, ' ');
    const file = `illustrations/${entry.sha256}.png`;
    const relativeImage = relative(directory, join(root, file)).split(sep).join('/');
    preview.push(
      `## ${safeText(entry.word.eu)} — ${safeText(entry.word.fr)}`,
      '',
      `![Illustration à valider](${relativeImage})`,
      '',
      `Choix : ${choice.items.at(-1)!.choices.map(safeText).join(' · ')}`,
      `Réponses écrites : ${entry.acceptedAnswers.map(safeText).join(' · ')}`,
      '',
    );
  }
  sequence.contents = [
    ...sequence.contents.filter(({ id }) => id !== choice.id && id !== written.id),
    choice,
    written,
  ];
  const { id: _id, number: _number, ...body } = chapter;
  const updated: ChapterSource = { schemaVersion: 2, ...body };
  source.chapterFiles.set(chapterId, updated);
  const validation = validateCurriculum(source.book, source.chapterFiles, source.errors);
  if (!validation.valid) throw new Error(`Nothing was prepared:\n${validation.errors.join('\n')}`);
  await mkdir(join(root, 'illustrations'), { recursive: true });
  for (const [hash, bytes] of files)
    await writeRepositoryFile(root, `illustrations/${hash}.png`, bytes);
  await writeRepositoryFile(
    root,
    'illustrations/library.json',
    JSON.stringify(library, null, 2) + '\n',
  );
  await writeRepositoryFile(
    root,
    relative(root, join(directory, `chapters/${chapterId}.json`)),
    JSON.stringify(updated, null, 2) + '\n',
  );
  return { preview: preview.join('\n') };
}

async function writeRepositoryFile(
  root: string,
  path: string,
  contents: string | Buffer,
): Promise<void> {
  const parent = await withinRepository(root, dirname(path));
  const temporary = join(parent, `.illustrations-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, join(root, path));
  } finally {
    await rm(temporary, { force: true });
  }
}
