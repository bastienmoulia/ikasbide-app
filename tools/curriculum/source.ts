import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CurriculumDirectory {
  book: unknown;
  chapterFiles: Map<string, unknown>;
  errors: string[];
}

export async function readCurriculumDirectory(directory: string): Promise<CurriculumDirectory> {
  const errors: string[] = [];
  const chapterFiles = new Map<string, unknown>();
  const book = await readJson(join(directory, 'book.json'), 'book.json', errors);

  let entries;
  try {
    entries = await readdir(join(directory, 'chapters'), { withFileTypes: true });
  } catch (error) {
    errors.push(`chapters: cannot read directory: ${errorMessage(error)}`);
    return { book, chapterFiles, errors };
  }

  const listedIds =
    typeof book === 'object' &&
    book !== null &&
    !Array.isArray(book) &&
    Array.isArray((book as Record<string, unknown>)['chapters'])
      ? ((book as Record<string, unknown>)['chapters'] as unknown[])
      : [];
  const referenced = new Set(
    listedIds.filter((id): id is string => typeof id === 'string' && idPattern.test(id)),
  );
  const jsonEntries = entries.filter((entry) => entry.name.endsWith('.json'));

  for (const entry of jsonEntries) {
    const fileName = entry.name;
    const chapterId = fileName.slice(0, -'.json'.length);
    if (!entry.isFile()) {
      errors.push(`chapters/${fileName}: must be a regular file`);
    } else if (!referenced.has(chapterId)) {
      errors.push(`chapters/${fileName}: is not listed in book.json`);
    }
  }

  for (const chapterId of referenced) {
    chapterFiles.set(
      chapterId,
      await readJson(
        join(directory, 'chapters', `${chapterId}.json`),
        `chapters/${chapterId}.json`,
        errors,
      ),
    );
  }

  return { book, chapterFiles, errors };
}

async function readJson(path: string, label: string, errors: string[]): Promise<unknown> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    errors.push(`${label}: cannot read file: ${errorMessage(error)}`);
    return undefined;
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    errors.push(`${label}: cannot parse JSON: ${errorMessage(error)}`);
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
