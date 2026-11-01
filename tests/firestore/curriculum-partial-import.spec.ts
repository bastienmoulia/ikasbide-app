import { randomUUID } from 'node:crypto';
import { cp, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { runCurriculumCli } from './run-curriculum-cli.ts';

const sample = 'tests/fixtures/curriculum.sample';
const projectId = 'demo-ikasbide-partial';
let environment: RulesTestEnvironment;

test.beforeAll(async () => {
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});

test.afterAll(async () => {
  await environment?.cleanup();
});

function learner() {
  return environment
    .authenticatedContext('partial-import-reader', {
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
}

async function copySample(
  prefix: string,
  testInfo: { outputPath(name: string): string },
): Promise<{ directory: string; bookId: string; chapterIds: string[] }> {
  const directory = testInfo.outputPath(`${prefix}-curriculum`);
  await cp(sample, directory, { recursive: true });

  const bookPath = join(directory, 'book.json');
  const book = JSON.parse(await readFile(bookPath, 'utf8')) as {
    id: string;
    chapters: string[];
  };
  const chapterIds = book.chapters.map((chapterId) => `${prefix}-${chapterId}`);
  for (const [index, chapterId] of book.chapters.entries()) {
    await rename(
      join(directory, 'chapters', `${chapterId}.json`),
      join(directory, 'chapters', `${chapterIds[index]}.json`),
    );
  }
  const bookId = `${prefix}-book`;
  book.id = bookId;
  book.chapters = chapterIds;
  await writeFile(bookPath, JSON.stringify(book));

  return { directory, bookId, chapterIds };
}

test('partial publication updates the book and selected chapter without deleting anything', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample('partial', testInfo);
  const [selectedId, unselectedId] = chapterIds;
  const bookPath = join(directory, 'book.json');
  const book = JSON.parse(await readFile(bookPath, 'utf8'));
  book.title.eu = 'Liburu eguneratua';
  await writeFile(bookPath, JSON.stringify(book));

  const selectedPath = join(directory, 'chapters', `${selectedId}.json`);
  const selected = JSON.parse(await readFile(selectedPath, 'utf8'));
  selected.title.eu = 'Kapitulua eguneratua';
  await writeFile(selectedPath, JSON.stringify(selected));

  const unselectedPath = join(directory, 'chapters', `${unselectedId}.json`);
  const unselected = JSON.parse(await readFile(unselectedPath, 'utf8'));
  const publishedUnselected = {
    bookId,
    number: 2,
    title: unselected.title,
    marker: 'unselected',
  };
  const orphanId = 'partial-orphan';
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), {
      title: { eu: 'Titulu zaharkitua' },
      chapters: [],
    });
    await setDoc(doc(context.firestore(), 'books', 'other-book'), { marker: 'other-book' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'old-selected',
    });
    await setDoc(
      doc(context.firestore(), 'books', bookId, 'chapters', unselectedId),
      publishedUnselected,
    );
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', orphanId), {
      marker: 'orphan',
    });
    await setDoc(doc(context.firestore(), 'units', 'legacy-unit'), { marker: 'legacy-unit' });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toMatchObject({
    title: { eu: 'Liburu eguneratua' },
    chapters: [
      { id: selectedId, number: 1, title: { eu: 'Kapitulua eguneratua' } },
      { id: unselectedId, number: 2 },
    ],
  });
  expect(
    (await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data(),
  ).toMatchObject({
    bookId,
    title: { eu: 'Kapitulua eguneratua' },
  });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', unselectedId))).data()).toEqual(
    publishedUnselected,
  );
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', orphanId))).data()).toEqual({
    marker: 'orphan',
  });
  expect((await getDoc(doc(learner(), 'books', 'other-book'))).data()).toEqual({
    marker: 'other-book',
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    expect((await getDoc(doc(context.firestore(), 'units', 'legacy-unit'))).data()).toEqual({
      marker: 'legacy-unit',
    });
  });
});

test('an invalid unselected chapter prevents all partial publication writes', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample('invalid', testInfo);
  const [selectedId, unselectedId] = chapterIds;
  const unselectedPath = join(directory, 'chapters', `${unselectedId}.json`);
  const unselected = JSON.parse(await readFile(unselectedPath, 'utf8'));
  delete unselected.sequences;
  await writeFile(unselectedPath, JSON.stringify(unselected));

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'unchanged',
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(unselectedId);
  expect(result.stdout).not.toContain('Published');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data()).toEqual({
    marker: 'unchanged',
  });
});

test('partial publication refuses an unpublished unselected chapter', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `missing-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [selectedId, unselectedId] = chapterIds;
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'unchanged',
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(unselectedId);
  expect(result.stderr).toContain('select');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data()).toEqual({
    marker: 'unchanged',
  });
});

test('partial publication can retain an unselected legacy chapter without changing its owner', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `legacy-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [selectedId, unselectedId] = chapterIds;
  const unselected = JSON.parse(
    await readFile(join(directory, 'chapters', `${unselectedId}.json`), 'utf8'),
  );
  const legacy = { bookId, number: 2, title: unselected.title };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'chapters', unselectedId), legacy);
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code, result.stderr).toBe(0);
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).exists()).toBe(
    true,
  );
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', unselectedId))).exists()).toBe(
    false,
  );
  expect((await getDoc(doc(learner(), 'chapters', unselectedId))).data()).toEqual(legacy);
});

test('partial publication cannot borrow a legacy chapter owned by another book', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `legacy-other-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [selectedId, unselectedId] = chapterIds;
  const unselected = JSON.parse(
    await readFile(join(directory, 'chapters', `${unselectedId}.json`), 'utf8'),
  );
  const legacy = { bookId: 'another-book', number: 2, title: unselected.title };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'chapters', unselectedId), legacy);
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(`chapter "${unselectedId}" is not published for this book`);
  expect((await getDoc(doc(learner(), 'books', bookId))).exists()).toBe(false);
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).exists()).toBe(
    false,
  );
  expect((await getDoc(doc(learner(), 'chapters', unselectedId))).data()).toEqual(legacy);
});

test('partial publication refuses a changed unselected chapter title', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `title-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [selectedId, unselectedId] = chapterIds;
  const unselectedPath = join(directory, 'chapters', `${unselectedId}.json`);
  const unselected = JSON.parse(await readFile(unselectedPath, 'utf8'));
  const publishedTitle = structuredClone(unselected.title);
  unselected.title.eu = 'Izenburu berria';
  await writeFile(unselectedPath, JSON.stringify(unselected));

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'unchanged',
    });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', unselectedId), {
      bookId,
      number: 2,
      title: publishedTitle,
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(unselectedId);
  expect(result.stderr).toContain('select');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data()).toEqual({
    marker: 'unchanged',
  });
});

test('partial publication refuses to renumber an unselected chapter', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `order-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [selectedId, unselectedId] = chapterIds;
  const bookPath = join(directory, 'book.json');
  const book = JSON.parse(await readFile(bookPath, 'utf8'));
  book.chapters.reverse();
  await writeFile(bookPath, JSON.stringify(book));
  const unselected = JSON.parse(
    await readFile(join(directory, 'chapters', `${unselectedId}.json`), 'utf8'),
  );

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'unchanged',
    });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', unselectedId), {
      bookId,
      number: 2,
      title: unselected.title,
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(unselectedId);
  expect(result.stderr).toContain('select');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data()).toEqual({
    marker: 'unchanged',
  });
});

test('one or more chapter flags can select multiple chapters without deleting orphans', async ({}, testInfo) => {
  const prefix = `multiple-${randomUUID().slice(0, 8)}`;
  const { directory, bookId, chapterIds } = await copySample(prefix, testInfo);
  const [firstId, secondId] = chapterIds;
  const orphanId = `${prefix}-orphan`;
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', orphanId), {
      marker: 'orphan',
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    firstId,
    secondId,
    '--chapter',
    firstId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(0);
  expect(result.stdout).toContain('2 chapters');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()?.['chapters']).toMatchObject([
    { id: firstId, number: 1 },
    { id: secondId, number: 2 },
  ]);
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', firstId))).data()).toMatchObject(
    {
      bookId,
      number: 1,
    },
  );
  expect(
    (await getDoc(doc(learner(), 'books', bookId, 'chapters', secondId))).data(),
  ).toMatchObject({
    bookId,
    number: 2,
  });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', orphanId))).data()).toEqual({
    marker: 'orphan',
  });
});

test('an unknown selected chapter prevents every write', async ({}, testInfo) => {
  const prefix = `unknown-${randomUUID().slice(0, 8)}`;
  const { directory, bookId, chapterIds } = await copySample(prefix, testInfo);
  const selectedId = chapterIds[0];
  const unknownId = `${prefix}-not-in-book`;
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', selectedId), {
      marker: 'unchanged',
    });
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    selectedId,
    unknownId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(unknownId);
  expect(result.stderr).toContain('not listed');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', selectedId))).data()).toEqual({
    marker: 'unchanged',
  });
});

test('chapter selection is only accepted for import', async () => {
  const result = await runCurriculumCli('validate', sample, '--chapter', 'chapter-1');
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('Usage:');
});

test('partial publication refuses a mismatched book ID inside the book namespace', async ({}, testInfo) => {
  const { directory, bookId, chapterIds } = await copySample(
    `collision-${randomUUID().slice(0, 8)}`,
    testInfo,
  );
  const [firstId, secondId] = chapterIds;
  const existing = { bookId: 'other-book', marker: 'unchanged' };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'books', bookId), { marker: 'unchanged' });
    await setDoc(doc(context.firestore(), 'books', bookId, 'chapters', firstId), existing);
  });

  const result = await runCurriculumCli(
    'import',
    directory,
    '--chapter',
    firstId,
    secondId,
    '--project',
    projectId,
  );

  expect(result.code).toBe(1);
  expect(result.stderr).toContain(firstId);
  expect(result.stderr).toContain('stored book ID');
  expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual({ marker: 'unchanged' });
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', firstId))).data()).toEqual(
    existing,
  );
  expect((await getDoc(doc(learner(), 'books', bookId, 'chapters', secondId))).exists()).toBe(
    false,
  );
});

test('concurrent partial publications keep chapter summaries consistent', async ({}, testInfo) => {
  const prefix = `concurrent-${randomUUID().slice(0, 8)}`;
  const { directory, bookId, chapterIds } = await copySample(prefix, testInfo);
  const [firstId, secondId] = chapterIds;
  const firstDirectory = testInfo.outputPath(`${prefix}-first`);
  const secondDirectory = testInfo.outputPath(`${prefix}-second`);
  await Promise.all([
    cp(directory, firstDirectory, { recursive: true }),
    cp(directory, secondDirectory, { recursive: true }),
  ]);
  const chapterPaths = chapterIds.map((id) => join(directory, 'chapters', `${id}.json`));
  const chapters = await Promise.all(
    chapterPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
  );
  const book = JSON.parse(await readFile(join(directory, 'book.json'), 'utf8'));

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'books', bookId), {
      title: book.title,
      chapters: chapters.map((chapter, index) => ({
        id: chapterIds[index],
        number: index + 1,
        title: chapter.title,
      })),
    });
    for (const [index, chapter] of chapters.entries()) {
      batch.set(doc(firestore, 'books', bookId, 'chapters', chapterIds[index]), {
        bookId,
        number: index + 1,
        title: chapter.title,
      });
    }
    await batch.commit();
  });

  const first = structuredClone(chapters[0]);
  const second = structuredClone(chapters[1]);
  first.title.eu = 'Lehen kapitulua eguneratua';
  second.title.eu = 'Bigarren kapitulua eguneratua';
  await Promise.all([
    writeFile(join(firstDirectory, 'chapters', `${firstId}.json`), JSON.stringify(first)),
    writeFile(join(secondDirectory, 'chapters', `${secondId}.json`), JSON.stringify(second)),
  ]);

  const results = await Promise.all([
    runCurriculumCli('import', firstDirectory, '--chapter', firstId, '--project', projectId),
    runCurriculumCli('import', secondDirectory, '--chapter', secondId, '--project', projectId),
  ]);
  const publishedBook = (await getDoc(doc(learner(), 'books', bookId))).data();
  const publishedChapters = await Promise.all(
    chapterIds.map(async (id) =>
      (await getDoc(doc(learner(), 'books', bookId, 'chapters', id))).data(),
    ),
  );

  expect(publishedBook?.['chapters'].map((chapter: { title: unknown }) => chapter.title)).toEqual(
    publishedChapters.map((chapter) => chapter?.['title']),
  );
  expect(results.map((result) => result.code).sort()).toEqual([0, 1]);
});

test('concurrent books can publish the same chapter IDs independently', async ({}, testInfo) => {
  const prefix = `ownership-${randomUUID().slice(0, 8)}`;
  const { directory, bookId, chapterIds } = await copySample(prefix, testInfo);
  const otherDirectory = testInfo.outputPath(`${prefix}-other`);
  const otherBookId = `${prefix}-other-book`;
  await cp(directory, otherDirectory, { recursive: true });
  const otherBookPath = join(otherDirectory, 'book.json');
  const otherBook = JSON.parse(await readFile(otherBookPath, 'utf8'));
  otherBook.id = otherBookId;
  await writeFile(otherBookPath, JSON.stringify(otherBook));

  const raceProjectId = `demo-ikasbide-${prefix}`;
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  const raceEnvironment = await initializeTestEnvironment({
    projectId: raceProjectId,
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
  try {
    const results = await Promise.all([
      runCurriculumCli('import', directory, '--project', raceProjectId),
      runCurriculumCli('import', otherDirectory, '--project', raceProjectId),
    ]);
    expect(results.map((result) => result.code).sort(), JSON.stringify(results)).toEqual([0, 0]);

    const firestore = raceEnvironment
      .authenticatedContext('ownership-reader', {
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const books = await Promise.all(
      [bookId, otherBookId].map(async (id) => getDoc(doc(firestore, 'books', id))),
    );
    expect(books.filter((book) => book.exists())).toHaveLength(2);
    for (const owner of [bookId, otherBookId]) {
      for (const id of chapterIds) {
        expect(
          (await getDoc(doc(firestore, 'books', owner, 'chapters', id))).data()?.['bookId'],
        ).toBe(owner);
      }
    }
  } finally {
    await raceEnvironment.cleanup();
  }
});

test('a large book can publish one chapter even when a complete import exceeds the batch limit', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const prefix = `large-${randomUUID().slice(0, 8)}`;
  const { directory, bookId, chapterIds } = await copySample(prefix, testInfo);
  const bookPath = join(directory, 'book.json');
  const book = JSON.parse(await readFile(bookPath, 'utf8'));
  const firstChapter = await readFile(join(directory, 'chapters', `${chapterIds[0]}.json`), 'utf8');
  const secondChapter = JSON.parse(
    await readFile(join(directory, 'chapters', `${chapterIds[1]}.json`), 'utf8'),
  );
  const firstTitle = JSON.parse(firstChapter).title;
  for (let number = 3; number <= 400; number++) {
    const id = `${prefix}-chapter-${number}`;
    chapterIds.push(id);
    await writeFile(join(directory, 'chapters', `${id}.json`), firstChapter);
  }
  book.chapters = chapterIds;
  await writeFile(bookPath, JSON.stringify(book));

  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      for (let index = 1; index < chapterIds.length; index++) {
        batch.set(doc(firestore, 'books', bookId, 'chapters', chapterIds[index]), {
          bookId,
          number: index + 1,
          title: index === 1 ? secondChapter.title : firstTitle,
        });
      }
      await batch.commit();
    });

    const partial = await runCurriculumCli(
      'import',
      directory,
      '--chapter',
      chapterIds[0],
      '--project',
      projectId,
    );
    expect(partial.code, partial.stderr).toBe(0);
    const publishedBook = (await getDoc(doc(learner(), 'books', bookId))).data();
    expect(publishedBook?.['chapters']).toHaveLength(400);
    expect(
      (await getDoc(doc(learner(), 'books', bookId, 'chapters', chapterIds[0]))).data(),
    ).toMatchObject({
      bookId,
      number: 1,
    });

    const boundary = await runCurriculumCli(
      'import',
      directory,
      '--chapter',
      ...chapterIds.slice(0, 399),
      '--project',
      projectId,
    );
    expect(boundary.code, boundary.stderr).toBe(0);
    expect(boundary.stdout).toContain('399 chapters');

    const tooManySelected = await runCurriculumCli(
      'import',
      directory,
      '--chapter',
      ...chapterIds,
      '--project',
      projectId,
    );
    expect(tooManySelected.code).toBe(1);
    expect(tooManySelected.stderr).toContain('exceed the 400-document limit');

    const complete = await runCurriculumCli('import', directory, '--project', projectId);
    expect(complete.code).toBe(1);
    expect(complete.stderr).toContain('exceed the 400-document limit');
    expect((await getDoc(doc(learner(), 'books', bookId))).data()).toEqual(publishedBook);
  } finally {
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      for (const id of chapterIds) batch.delete(doc(firestore, 'books', bookId, 'chapters', id));
      batch.delete(doc(firestore, 'books', bookId));
      await batch.commit();
    });
  }
});
