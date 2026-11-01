import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Firestore } from '@google-cloud/firestore';
import { expect, test } from '@playwright/test';
import { runCurriculumCli } from './run-curriculum-cli.ts';

const execute = promisify(execFile);

async function repository(directory: string) {
  await cp('tests/fixtures/curriculum.sample', join(directory, 'A1'), { recursive: true });
  await execute('git', ['init', '-b', 'main', directory]);
  await git(directory, 'config', 'user.email', 'test@example.invalid');
  await git(directory, 'config', 'user.name', 'Curriculum test');
  return directory;
}

async function git(directory: string, ...args: string[]): Promise<string> {
  const { stdout } = await execute('git', ['-C', directory, ...args]);
  return stdout.trim();
}

async function commit(directory: string): Promise<string> {
  await git(directory, 'add', '.');
  await git(directory, 'commit', '-m', 'Synthetic curriculum change');
  return git(directory, 'rev-parse', 'HEAD');
}

async function changeTitle(directory: string, chapterId: string, title: string) {
  const path = join(directory, 'A1', 'chapters', `${chapterId}.json`);
  const chapter = JSON.parse(await readFile(path, 'utf8'));
  chapter.title.eu = title;
  await writeFile(path, JSON.stringify(chapter));
}

async function secondBook(directory: string) {
  const destination = join(directory, 'library', 'B1');
  await cp(join(directory, 'A1'), destination, { recursive: true });
  const path = join(destination, 'book.json');
  const book = JSON.parse(await readFile(path, 'utf8'));
  book.id = 'b1';
  book.chapters = ['b1-chapter-1', 'b1-chapter-2'];
  for (const id of ['chapter-1', 'chapter-2']) {
    await rename(
      join(destination, 'chapters', `${id}.json`),
      join(destination, 'chapters', `b1-${id}.json`),
    );
  }
  await writeFile(path, JSON.stringify(book));
  return destination;
}

test('sync bootstraps a Git source then publishes cumulative chapters without rewriting untouched documents', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    const bootstrap = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(bootstrap.stderr).toBe('');
    expect(bootstrap.code).toBe(0);
    expect((await db.doc('books/a1').get()).data()?.['chapters']).toHaveLength(2);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      initial,
    );

    await db.doc('chapters/chapter-2').update({ marker: 'preserved' });
    const untouched = await db.doc('chapters/chapter-2').get();
    await changeTitle(directory, 'chapter-1', 'Berria');
    await commit(directory);
    await changeTitle(directory, 'chapter-1', 'Azkena');
    const latest = await commit(directory);
    const partial = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(partial.stderr).toBe('');
    expect(partial.code).toBe(0);
    expect(partial.stdout).toContain('chapter-1');
    expect((await db.doc('chapters/chapter-1').get()).data()?.['title']).toMatchObject({
      eu: 'Azkena',
    });

    expect(
      (await db.doc('chapters/chapter-2').get()).updateTime?.isEqual(untouched.updateTime!),
    ).toBe(true);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      latest,
    );
  } finally {
    await db.terminate();
  }
});

test('a reordered old event cannot restore obsolete content or advance the successful checkpoint', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const old = await commit(directory);
    await changeTitle(directory, 'chapter-1', 'Azken bertsioa');
    const latest = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const published = await db.doc('chapters/chapter-1').get();
    const checkpoint = await db.doc('curriculumPublications/ikasbide-content').get();
    await git(directory, 'checkout', '--detach', old);
    const stale = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(stale.stderr).toBe('');
    expect(stale.code).toBe(0);
    expect(stale.stdout).toContain('obsolete');
    expect(
      (await db.doc('chapters/chapter-1').get()).updateTime?.isEqual(published.updateTime!),
    ).toBe(true);
    const after = await db.doc('curriculumPublications/ikasbide-content').get();
    expect(after.data()?.['sha']).toBe(latest);
    expect(after.updateTime?.isEqual(checkpoint.updateTime!)).toBe(true);
  } finally {
    await db.terminate();
  }
});

test('chapter IDs claimed by two affected books fail before the first production write', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const duplicate = join(directory, 'B1');
  await cp(join(directory, 'A1'), duplicate, { recursive: true });
  const path = join(duplicate, 'book.json');
  const book = JSON.parse(await readFile(path, 'utf8'));
  book.id = 'b1';
  await writeFile(path, JSON.stringify(book));
  await commit(directory);
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('chapter-1');
    expect((await db.collection('books').get()).empty).toBe(true);
    expect((await db.collection('chapters').get()).empty).toBe(true);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).exists).toBe(false);
  } finally {
    await db.terminate();
  }
});

test('all affected books are validated before any write and a repaired push recovers the failed changes', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const other = await secondBook(directory);
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const before = await db.doc('chapters/chapter-1').get();
    await changeTitle(directory, 'chapter-1', 'Argitaratu beharrekoa');
    const invalidPath = join(other, 'chapters', 'b1-chapter-2.json');
    const validContents = await readFile(invalidPath, 'utf8');
    await writeFile(invalidPath, '{"schemaVersion":2}');
    await commit(directory);
    const failed = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain('b1-chapter-2');
    expect(failed.stdout).not.toContain('Published book');
    expect((await db.doc('chapters/chapter-1').get()).updateTime?.isEqual(before.updateTime!)).toBe(
      true,
    );
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      initial,
    );
    await writeFile(invalidPath, validContents);
    const repaired = await commit(directory);
    const retried = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(retried.stderr).toBe('');
    expect(retried.code).toBe(0);
    expect((await db.doc('chapters/chapter-1').get()).data()?.['title']).toMatchObject({
      eu: 'Argitaratu beharrekoa',
    });
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      repaired,
    );
  } finally {
    await db.terminate();
  }
});

test('multiple changed chapters share an atomic partial publication and other books stay untouched', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  await secondBook(directory);
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const other = await db.doc('chapters/b1-chapter-1').get();
    await db.doc('chapters/orphan').set({ bookId: 'a1', marker: 'keep' });
    await changeTitle(directory, 'chapter-1', 'Bat berria');
    await commit(directory);
    await changeTitle(directory, 'chapter-2', 'Bi berria');
    await commit(directory);
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const first = await db.doc('chapters/chapter-1').get();
    const second = await db.doc('chapters/chapter-2').get();
    const book = await db.doc('books/a1').get();
    expect(first.data()?.['title']).toMatchObject({ eu: 'Bat berria' });
    expect(second.data()?.['title']).toMatchObject({ eu: 'Bi berria' });
    expect(first.updateTime?.isEqual(second.updateTime!)).toBe(true);
    expect(first.updateTime?.isEqual(book.updateTime!)).toBe(true);
    expect((await db.doc('chapters/orphan').get()).data()).toEqual({
      bookId: 'a1',
      marker: 'keep',
    });
    expect(
      (await db.doc('chapters/b1-chapter-1').get()).updateTime?.isEqual(other.updateTime!),
    ).toBe(true);
  } finally {
    await db.terminate();
  }
});

test('manifest updates add and remove chapters in a complete book publication', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    await rename(
      join(directory, 'A1', 'chapters', 'chapter-1.json'),
      join(directory, 'A1', 'chapters', 'chapter-new.json'),
    );
    const path = join(directory, 'A1', 'book.json');
    const book = JSON.parse(await readFile(path, 'utf8'));
    book.chapters = ['chapter-2', 'chapter-new'];
    book.title.eu = 'Beste ordena';
    await writeFile(path, JSON.stringify(book));
    await commit(directory);
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('complete book');
    expect((await db.doc('chapters/chapter-1').get()).exists).toBe(false);
    expect((await db.doc('chapters/chapter-2').get()).data()?.['number']).toBe(1);
    expect((await db.doc('chapters/chapter-new').get()).data()?.['number']).toBe(2);
    expect((await db.doc('books/a1').get()).data()?.['title']).toEqual({ eu: 'Beste ordena' });
  } finally {
    await db.terminate();
  }
});

test('a missing unmodified chapter and a deleted manifest both prevent publication', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const original = await db.doc('books/a1').get();
    await changeTitle(directory, 'chapter-1', 'Aldaketa');
    // An unchanged, referenced chapter is missing from the checkout.
    await rm(join(directory, 'A1', 'chapters', 'chapter-2.json'));
    await commit(directory);
    const missing = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('chapter-2');
    await rm(join(directory, 'A1', 'book.json'));
    await commit(directory);
    const removed = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain('book.json');
    expect((await db.doc('books/a1').get()).updateTime?.isEqual(original.updateTime!)).toBe(true);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      initial,
    );
  } finally {
    await db.terminate();
  }
});

test('documentation-only pushes and already published revisions perform zero writes', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const before = await db.doc('books/a1').get();
    const checkpoint = await db.doc('curriculumPublications/ikasbide-content').get();
    await writeFile(join(directory, 'README.md'), 'Synthetic documentation');
    await commit(directory);
    const noContent = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(noContent.code).toBe(0);
    expect(noContent.stdout).toContain('No curriculum changes');
    await git(directory, 'checkout', '--detach', initial);
    const duplicate = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(duplicate.code).toBe(0);
    expect((await db.doc('books/a1').get()).updateTime?.isEqual(before.updateTime!)).toBe(true);
    expect(
      (await db.doc('curriculumPublications/ikasbide-content').get()).updateTime?.isEqual(
        checkpoint.updateTime!,
      ),
    ).toBe(true);
  } finally {
    await db.terminate();
  }
});

for (const base of ['missing', 'malformed', 'diverged']) {
  test(`a ${base} publication base safely republishes complete books`, async ({}, testInfo) => {
    const directory = await repository(testInfo.outputPath('source'));
    const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
    const db = new Firestore({ projectId });
    try {
      const initial = await commit(directory);
      expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
      let checkpoint = base === 'missing' ? 'f'.repeat(40) : 'invalid-sha';
      if (base === 'diverged') {
        await git(directory, 'checkout', '-b', 'abandoned');
        await changeTitle(directory, 'chapter-1', 'Beste adarra');
        checkpoint = await commit(directory);
        await git(directory, 'checkout', 'main');
      }
      await db.doc('curriculumPublications/ikasbide-content').set({ sha: checkpoint });
      await db.doc('chapters/orphan').set({ bookId: 'a1' });
      await changeTitle(directory, 'chapter-1', 'Main berria');
      const latest = await commit(directory);
      expect(latest).not.toBe(initial);
      const result = await runCurriculumCli('sync', directory, '--project', projectId);
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('complete book');
      expect((await db.doc('chapters/orphan').get()).exists).toBe(false);
      expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
        latest,
      );
    } finally {
      await db.terminate();
    }
  });
}

test('sync validates an unchanged chapter of an affected book before publishing selected chapters', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    await writeFile(join(directory, 'A1', 'chapters', 'chapter-2.json'), '{}');
    const base = await commit(directory);
    await db.doc('curriculumPublications/ikasbide-content').set({ sha: base });
    await db.doc('books/a1').set({ marker: 'unchanged' });
    await changeTitle(directory, 'chapter-1', 'Aldatua');
    await commit(directory);
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('chapter-2');
    expect((await db.doc('books/a1').get()).data()).toEqual({ marker: 'unchanged' });
    expect((await db.doc('chapters/chapter-1').get()).exists).toBe(false);
  } finally {
    await db.terminate();
  }
});

test('uncommitted referenced chapter files cannot be published as part of a committed revision', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const chapter = join(directory, 'A1', 'chapters', 'chapter-2.json');
  const contents = await readFile(chapter, 'utf8');
  await rm(chapter);
  await commit(directory);
  // The manifest still references this file, but it is not part of Git HEAD.
  await writeFile(chapter, contents);
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('chapter-2');
    expect((await db.collection('books').get()).empty).toBe(true);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).exists).toBe(false);
  } finally {
    await db.terminate();
  }
});

test('retry reconciles a reverted chapter that was already written by a failed multi-book publication', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const other = await secondBook(directory);
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const chapterPath = join(directory, 'A1', 'chapters', 'chapter-1.json');
    const original = await readFile(chapterPath, 'utf8');
    await changeTitle(directory, 'chapter-1', 'Aldi baterakoa');
    const otherPath = join(other, 'chapters', 'b1-chapter-1.json');
    const otherChapter = JSON.parse(await readFile(otherPath, 'utf8'));
    otherChapter.title.eu = 'Beste liburua eguneratua';
    await writeFile(otherPath, JSON.stringify(otherChapter));
    await commit(directory);
    // A runtime ownership conflict fails the second import after the first succeeds.
    await db.doc('chapters/b1-chapter-1').update({ bookId: 'conflicting-book' });
    const failed = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(failed.code).toBe(1);
    expect((await db.doc('chapters/chapter-1').get()).data()?.['title']).toMatchObject({
      eu: 'Aldi baterakoa',
    });
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      initial,
    );
    await db.doc('chapters/b1-chapter-1').update({ bookId: 'b1' });
    await writeFile(chapterPath, original);
    const repaired = await commit(directory);
    const retry = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(retry.stderr).toBe('');
    expect(retry.code).toBe(0);
    expect((await db.doc('chapters/chapter-1').get()).data()?.['title']).toEqual({
      eu: 'Aurkezpenak',
      fr: 'Les présentations',
    });
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      repaired,
    );
  } finally {
    await db.terminate();
  }
});

test('adding a book cannot reuse an unaffected book identity or delete its chapters', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    const initial = await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const before = await db.doc('books/a1').get();
    const other = await secondBook(directory);
    const path = join(other, 'book.json');
    const book = JSON.parse(await readFile(path, 'utf8'));
    book.id = 'a1';
    await writeFile(path, JSON.stringify(book));
    await commit(directory);
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Duplicate book ID');
    expect((await db.doc('books/a1').get()).updateTime?.isEqual(before.updateTime!)).toBe(true);
    expect((await db.doc('chapters/chapter-1').get()).exists).toBe(true);
    expect((await db.doc('chapters/b1-chapter-1').get()).exists).toBe(false);
    expect((await db.doc('curriculumPublications/ikasbide-content').get()).data()?.['sha']).toBe(
      initial,
    );
  } finally {
    await db.terminate();
  }
});

test('a chapter identity collision with an unaffected book blocks every affected book', async ({}, testInfo) => {
  const directory = await repository(testInfo.outputPath('source'));
  const projectId = `demo-sync-${randomUUID().slice(0, 8)}`;
  const db = new Firestore({ projectId });
  try {
    await commit(directory);
    expect((await runCurriculumCli('sync', directory, '--project', projectId)).code).toBe(0);
    const before = await db.doc('books/a1').get();
    const other = await secondBook(directory);
    const path = join(other, 'book.json');
    const book = JSON.parse(await readFile(path, 'utf8'));
    book.chapters[0] = 'chapter-1';
    await rename(
      join(other, 'chapters', 'b1-chapter-1.json'),
      join(other, 'chapters', 'chapter-1.json'),
    );
    await writeFile(path, JSON.stringify(book));
    await commit(directory);
    const result = await runCurriculumCli('sync', directory, '--project', projectId);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Chapter "chapter-1" is claimed');
    expect(result.stdout).not.toContain('Published book');
    expect((await db.doc('books/a1').get()).updateTime?.isEqual(before.updateTime!)).toBe(true);
    expect((await db.doc('books/b1').get()).exists).toBe(false);
  } finally {
    await db.terminate();
  }
});
