import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Firestore } from '@google-cloud/firestore';
import type { CurriculumSource } from '../../src/app/curriculum/curriculum.model.ts';
import { publishCurriculum } from './publish.ts';
import { readCurriculumDirectory } from './source.ts';
import { validateCurriculum } from './validate.ts';
import { idPattern } from './identifiers.ts';

const execute = promisify(execFile);
const shaPattern = /^[a-f0-9]{40}$/;

async function git(directory: string, ...args: string[]): Promise<string> {
  const { stdout } = await execute('git', ['-C', directory, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function ancestor(directory: string, base: string, head: string): Promise<boolean> {
  try {
    await git(directory, 'merge-base', '--is-ancestor', base, head);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 1) {
      return false;
    }
    throw error;
  }
}

function sourcePath(path: string): { directory: string; chapterId?: string } | undefined {
  if (path === 'book.json' || path.endsWith('/book.json')) {
    return { directory: dirname(path) };
  }
  const chapter = /^(?:(.*)\/)?chapters\/([^/]+)\.json$/.exec(path);
  return chapter ? { directory: chapter[1] ?? '.', chapterId: chapter[2] } : undefined;
}

async function identityErrors(directory: string, paths: readonly string[]): Promise<string[]> {
  const errors: string[] = [];
  const bookIds = new Set<string>();
  const chapterOwners = new Map<string, string>();
  for (const path of paths.filter((path) => path === 'book.json' || path.endsWith('/book.json'))) {
    let book: unknown;
    try {
      book = JSON.parse(await readFile(join(directory, path), 'utf8'));
    } catch (error) {
      throw new Error(`Cannot read book identity inventory at ${path}; nothing was published.`, {
        cause: error,
      });
    }
    if (
      typeof book !== 'object' ||
      book === null ||
      !('id' in book) ||
      typeof book.id !== 'string' ||
      !idPattern.test(book.id) ||
      !('chapters' in book) ||
      !Array.isArray(book.chapters) ||
      book.chapters.some((id: unknown) => typeof id !== 'string' || !idPattern.test(id))
    ) {
      errors.push(`${path}: invalid book/chapter identity inventory.`);
      continue;
    }
    if (bookIds.has(book.id)) errors.push(`Duplicate book ID "${book.id}" at ${path}.`);
    bookIds.add(book.id);
    for (const id of book.chapters) {
      const owner = chapterOwners.get(id);
      if (owner) errors.push(`Chapter "${id}" is claimed by "${owner}" and "${book.id}".`);
      chapterOwners.set(id, book.id);
    }
  }
  return errors;
}

/** Publishes cumulative source changes; callers must serialize invocations for this project. */
export async function syncCurriculum(db: Firestore, directory: string): Promise<void> {
  directory = resolve(directory);
  if ((await git(directory, 'rev-parse', '--show-toplevel')).trim() !== directory) {
    throw new Error('Sync requires the content repository root.');
  }
  if ((await git(directory, 'status', '--porcelain', '--untracked-files=no')).trim()) {
    throw new Error('Refusing to sync a dirty content checkout; publish a committed revision.');
  }
  const head = (await git(directory, 'rev-parse', 'HEAD')).trim();
  if (!shaPattern.test(head)) throw new Error('Unsupported content commit SHA.');
  const checkpoint = db.doc('curriculumPublications/ikasbide-content');
  const previous: unknown = (await checkpoint.get()).data()?.['sha'];
  let base: string | undefined;
  if (typeof previous === 'string' && shaPattern.test(previous)) {
    try {
      await git(directory, 'rev-parse', '--verify', '--quiet', `${previous}^{commit}`);
      base = previous;
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 1)) {
        throw error;
      }
    }
  }

  if (base && (await ancestor(directory, head, base))) {
    console.log(`Skipping obsolete or already published revision ${head}; nothing was published.`);
    return;
  }
  if (base && !(await ancestor(directory, base, head))) {
    console.log(`Publication base ${base} diverged from HEAD; publishing complete books.`);
    base = undefined;
  }
  if (!base) console.log('No usable publication base; publishing complete books.');
  const paths = (await git(directory, 'ls-tree', '-r', '--name-only', '-z', head))
    .split('\0')
    .filter(Boolean);
  const committedPaths = new Set(paths);
  const full = !base;
  // A failed run may have written a change that HEAD subsequently reverted.
  // Include every touched path, not just the net difference from the checkpoint.
  const changes = base
    ? (
        await git(
          directory,
          'log',
          '--format=',
          '--name-only',
          '--no-renames',
          '--diff-merges=first-parent',
          '-z',
          `${base}..${head}`,
        )
      )
        .split('\0')
        .filter(Boolean)
    : paths;
  const selected = new Map<string, Set<string> | undefined>();
  for (const path of changes) {
    const source = sourcePath(path);
    if (!source) continue;
    if (full || !source.chapterId) {
      selected.set(source.directory, undefined);
    } else if (!selected.has(source.directory)) {
      selected.set(source.directory, new Set([source.chapterId]));
    } else {
      selected.get(source.directory)?.add(source.chapterId);
    }
  }
  const publications: { curriculum: CurriculumSource; chapterIds?: string[] }[] = [];
  const errors = selected.size ? await identityErrors(directory, paths) : [];
  for (const [bookDirectory, chapterIds] of selected) {
    const source = await readCurriculumDirectory(join(directory, bookDirectory));
    const result = validateCurriculum(source.book, source.chapterFiles, source.errors);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `${bookDirectory}: ${error}`));
    } else {
      const { curriculum } = result;
      for (const path of [
        join(bookDirectory, 'book.json'),
        ...curriculum.chapters.map(({ id }) => join(bookDirectory, 'chapters', `${id}.json`)),
      ]) {
        if (!committedPaths.has(path))
          errors.push(`${path}: is not part of committed revision ${head}.`);
      }
      publications.push({
        curriculum,
        chapterIds: chapterIds ? [...chapterIds] : undefined,
      });
    }
  }
  if (errors.length)
    throw new Error(`Invalid source; nothing was published.\n${errors.join('\n')}`);
  if (!publications.length) {
    console.log(`No curriculum changes at ${head}; nothing was published.`);
    return;
  }
  for (const { curriculum, chapterIds } of publications) {
    console.log(
      `Publishing book ${curriculum.id}: ${chapterIds ? chapterIds.join(', ') : 'complete book'}.`,
    );
    const summary = await publishCurriculum(db, curriculum, chapterIds);
    console.log(
      `Published book ${summary.bookId}: ${summary.chapters} chapters (${summary.removed} removed).`,
    );
  }
  await checkpoint.set({ sha: head });
  console.log(`Curriculum publication complete at ${head}.`);
}
