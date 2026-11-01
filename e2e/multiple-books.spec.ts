import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { expect, test, type Page } from '@playwright/test';
import type {
  ChapterSource,
  PublishedBook,
  PublishedChapter,
} from '../src/app/curriculum/curriculum.model.ts';
import {
  answerCurrentText,
  attemptSummary,
  learnerId,
  signInWithGoogle,
  startCourse,
  startPractice,
  storedAttempts,
  waitForOfflineShell,
} from './support.ts';

async function sampleChapter(bookId: string): Promise<PublishedChapter> {
  const source = JSON.parse(
    await readFile('tests/fixtures/curriculum.sample/chapters/chapter-1.json', 'utf8'),
  ) as ChapterSource;
  const { $schema: _schema, schemaVersion: _version, ...chapter } = source;
  return { ...chapter, bookId, number: 1 };
}

async function publishBook(
  db: Firestore,
  bookId: string,
  chapterId: string,
  title: { eu: string; fr: string },
): Promise<void> {
  const chapter = await sampleChapter(bookId);
  const book: PublishedBook = {
    title,
    chapters: [{ id: chapterId, number: 1, title: chapter.title }],
  };
  await Promise.all([
    db.doc(`books/${bookId}`).set(book),
    db.doc(`books/${bookId}/chapters/${chapterId}`).set(chapter),
  ]);
}

function legacyProgress(chapterId: string) {
  return {
    schemaVersion: 1,
    chapterId,
    sequenceId: 'greetings',
    visitedStepIds: ['content:greetings-note', 'item:greetings-gap-1'],
    successfulItemIds: ['greetings-gap-1'],
    incorrectItemIds: [],
    skippedStepIds: [],
  };
}

function legacyProgressId(chapterId: string): string {
  return `${chapterId.length}:${chapterId}greetings`;
}

async function navigateWithoutReload(page: Page, url: string): Promise<void> {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, url);
}

async function holdFirestoreRead(page: Page, documentPath: string) {
  let release!: () => void;
  let markRequested!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (markRequested = resolve));
  await page.route('**/google.firestore.v1.Firestore/Listen/channel**', async (route) => {
    const body = decodeURIComponent(route.request().postData() ?? '');
    if (body.includes(`/documents/${documentPath}`)) {
      markRequested();
      await held;
    }
    await route.continue();
  });
  return { requested, release };
}

test('books with matching chapter IDs keep navigation and synchronized progress separate', async ({
  page,
  context,
}) => {
  await page.clock.install();
  const suffix = randomUUID().slice(0, 8);
  const firstBook = `source-${suffix}`;
  const secondBook = `destination-${suffix}`;
  const chapterId = `shared-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await Promise.all([
      publishBook(db, firstBook, chapterId, { eu: 'Lehen liburua', fr: 'Premier livre' }),
      publishBook(db, secondBook, chapterId, { eu: 'Bigarren liburua', fr: 'Deuxième livre' }),
      db.doc(`chapters/${chapterId}`).set(await sampleChapter(firstBook)),
    ]);

    await page.goto(`/${firstBook}/${chapterId}/greetings`);
    const email = await signInWithGoogle(page);
    const uid = await learnerId(email);
    const oldAttempt = db.doc(`learners/${uid}/attempts/legacy-attempt`);
    const oldProgress = db.doc(`learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`);
    await Promise.all([
      oldAttempt.set({
        chapterId,
        itemId: 'greetings-gap-1',
        outcome: 'correct',
        occurredAt: Timestamp.now(),
        sessionId: 'legacy-session',
      }),
      oldProgress.set(legacyProgress(chapterId)),
    ]);

    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
    await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');

    await navigateWithoutReload(page, `/${secondBook}/${chapterId}/greetings`);
    await expect(page).toHaveURL(new RegExp(`/${secondBook}/${chapterId}/greetings$`));
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
    await expect(page.locator('.journey-progress')).toContainText('8 étapes à découvrir');
    await startPractice(page);
    await answerCurrentText(page, 'naiz');
    await answerCurrentText(page, 'koa');
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 2');

    const newProgress = db.doc(
      `learners/${uid}/books/${secondBook}/chapters/${chapterId}/sequenceProgress/greetings`,
    );
    await expect
      .poll(async () => (await newProgress.get()).data()?.['successfulItemIds'])
      .toEqual(expect.arrayContaining(['greetings-gap-1', 'greetings-gap-2']));
    expect((await oldProgress.get()).data()).toEqual(legacyProgress(chapterId));
    expect(
      (await storedAttempts(uid)).filter(({ fields }) => fields['bookId'] === secondBook),
    ).toHaveLength(2);

    await navigateWithoutReload(page, `/${firstBook}/${chapterId}/greetings`);
    await expect(page).toHaveURL(new RegExp(`/${firstBook}/${chapterId}/greetings$`));
    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
    await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');

    await page.goto(`/${secondBook}/${chapterId}`);
    await page.getByRole('link', { name: /Retour au parcours/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();

    const freshTab = await context.newPage();
    try {
      await freshTab.goto('/');
      await expect(freshTab.getByRole('heading', { name: 'Lehen urratsak' })).toBeVisible();
    } finally {
      await freshTab.close();
    }

    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => window.open('/', '_blank'));
    const openedTab = await popupPromise;
    try {
      await expect(openedTab.getByRole('heading', { name: 'Lehen urratsak' })).toBeVisible();
      await openedTab.goto(`/${secondBook}/${chapterId}`);
      await expect(openedTab.getByRole('heading', { level: 1 })).toBeVisible();
      await openedTab.locator('header .brand').click();
      await expect(openedTab.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();
      await openedTab.reload();
      await expect(openedTab.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();
    } finally {
      await openedTab.close();
    }

    await page.goto(`/${secondBook}/${chapterId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.locator('header .brand').click();
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();
    await page.goto(`/${secondBook}/${chapterId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();

    await page.goto(`/a1/${chapterId}`);
    await expect(page.getByRole('alert')).toContainText('Ce chapitre n’est pas publié.');
    await page.goto(`/${secondBook}/${chapterId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(`/${firstBook}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /Deuxième livre/ })).toBeVisible();

    await page.goto(`/missing-${suffix}/${chapterId}`);
    await expect(page.getByRole('alert')).toContainText('Ce chapitre n’est pas publié.');
    await page.locator('header .brand').click();
    await expect(page.getByRole('alert')).toContainText('Ce livre n’est pas publié.');
  } finally {
    await db.terminate();
  }
});

test('practice waits for historical progress before starting', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const bookId = `slow-book-${suffix}`;
  const chapterId = `slow-chapter-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  let release = () => {};
  try {
    await Promise.all([
      publishBook(db, bookId, chapterId, { eu: 'Liburua', fr: 'Livre' }),
      db.doc(`chapters/${chapterId}`).set(await sampleChapter(bookId)),
    ]);
    await page.goto('/');
    const uid = await learnerId(await signInWithGoogle(page));
    const legacyPath = `learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`;
    await db.doc(legacyPath).set(legacyProgress(chapterId));

    const heldRead = await holdFirestoreRead(page, legacyPath);
    release = heldRead.release;
    await page.goto(`/${bookId}/${chapterId}/greetings`);
    await heldRead.requested;
    const overview = page.getByRole('region', { name: /Résumé du parcours/ });
    await expect(overview.getByRole('button', { name: /parcours|bilan/ })).toBeDisabled();
    await expect(overview.getByRole('status')).toContainText('Chargement de la progression');

    heldRead.release();
    await expect(overview).toContainText('1 exercices réussis');
    await startPractice(page);
    await expect(page.locator('app-activity-player')).toContainText('Je suis de Bayonne.');
  } finally {
    release();
    await db.terminate();
  }
});

for (const source of ['legacy', 'scoped'] as const) {
  test(`practice waits for server-confirmed ${source} progress when its cache is stale`, async ({
    page,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const bookId = `stale-book-${suffix}`;
    const chapterId = `stale-chapter-${suffix}`;
    const db = new Firestore({ projectId: 'demo-ikasbide' });
    let release = () => {};
    try {
      await Promise.all([
        publishBook(db, bookId, chapterId, { eu: 'Liburua', fr: 'Livre' }),
        db.doc(`chapters/${chapterId}`).set(await sampleChapter(bookId)),
      ]);
      await page.goto('/');
      const uid = await learnerId(await signInWithGoogle(page));
      const legacyPath = `learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`;
      const scopedPath = `learners/${uid}/books/${bookId}/chapters/${chapterId}/sequenceProgress/greetings`;
      const initial = legacyProgress(chapterId);
      const scoped = {
        ...initial,
        schemaVersion: 2,
        bookId,
        visitedStepIds: [],
        successfulItemIds: [],
      };
      await Promise.all([db.doc(legacyPath).set(initial), db.doc(scopedPath).set(scoped)]);
      await page.goto(`/${bookId}/${chapterId}/greetings`);
      await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Zure ibilbidea/ })).toBeVisible();
      const target = source === 'legacy' ? legacyPath : scopedPath;
      const previous = source === 'legacy' ? initial : scoped;
      await db.doc(target).set({
        ...previous,
        visitedStepIds: [...previous.visitedStepIds, 'item:greetings-gap-2'],
        successfulItemIds: [...previous.successfulItemIds, 'greetings-gap-2'],
      });

      const heldRead = await holdFirestoreRead(page, target);
      release = heldRead.release;
      await page.goto(`/${bookId}/${chapterId}/greetings`);
      await heldRead.requested;
      const overview = page.getByRole('region', { name: /Résumé du parcours/ });
      await expect(overview.getByRole('button', { name: /parcours|bilan/ })).toBeDisabled();
      await expect(overview.getByRole('status')).toContainText('Chargement de la progression');

      heldRead.release();
      await expect(overview).toContainText('2 exercices réussis');
      await startPractice(page);
      await expect(page.locator('app-activity-player')).toContainText('Bonjour ! (le matin)');
    } finally {
      release();
      await db.terminate();
    }
  });
}

test('chapter objectives wait for historical attempts', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const bookId = `slow-attempts-${suffix}`;
  const chapterId = `slow-chapter-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  let release = () => {};
  try {
    await Promise.all([
      publishBook(db, bookId, chapterId, { eu: 'Liburua', fr: 'Livre' }),
      db.doc(`chapters/${chapterId}`).set(await sampleChapter(bookId)),
    ]);
    await page.goto('/');
    const uid = await learnerId(await signInWithGoogle(page));
    await db.doc(`learners/${uid}/attempts/legacy-attempt`).set({
      chapterId,
      itemId: 'greetings-gap-1',
      outcome: 'correct',
      occurredAt: Timestamp.now(),
      sessionId: 'legacy-session',
    });

    const heldRead = await holdFirestoreRead(page, `chapters/${chapterId}`);
    release = heldRead.release;
    await page.goto(`/${bookId}/${chapterId}`);
    await heldRead.requested;
    const objectives = page.getByRole('region', { name: /Carte de progression/ });
    await expect(objectives.getByRole('status')).toContainText('Chargement de l’historique');
    await expect(objectives.locator('.objective-map')).toHaveCount(0);

    heldRead.release();
    await expect(objectives.getByRole('listitem').filter({ hasText: /Saluer/ })).toContainText(
      'En cours',
    );
  } finally {
    release();
    await db.terminate();
  }
});

test('invalid legacy progress stays visible as an error while new progress is written', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const bookId = `invalid-book-${suffix}`;
  const chapterId = `invalid-chapter-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await publishBook(db, bookId, chapterId, { eu: 'Liburua', fr: 'Livre' });
    await db.doc(`chapters/${chapterId}`).set(await sampleChapter(bookId));
    await page.goto(`/${bookId}/${chapterId}/greetings`);
    const uid = await learnerId(await signInWithGoogle(page));
    const oldProgress = db.doc(`learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`);
    await oldProgress.set({ ...legacyProgress(chapterId), successfulItemIds: ['unknown-item'] });
    await expect(page.getByRole('alert')).toContainText(
      'La progression synchronisée n’a pas pu être lue.',
    );

    await startCourse(page);
    await page.getByRole('button', { name: /Hurrengoa Suivant/ }).click();
    await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();
    await expect(page.getByRole('alert')).toContainText(
      'La progression synchronisée n’a pas pu être lue.',
    );
    const newProgress = db.doc(
      `learners/${uid}/books/${bookId}/chapters/${chapterId}/sequenceProgress/greetings`,
    );
    await expect.poll(async () => (await newProgress.get()).exists).toBe(true);
    await expect(page.getByRole('alert')).toContainText(
      'La progression synchronisée n’a pas pu être lue.',
    );

    await oldProgress.set(legacyProgress(chapterId));
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');
  } finally {
    await db.terminate();
  }
});

test('a legacy chapter is served only to its original book while it remains in its summary', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const firstBook = `legacy-source-${suffix}`;
  const secondBook = `legacy-other-${suffix}`;
  const chapterId = `legacy-chapter-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    const chapter = await sampleChapter(firstBook);
    const summary = [{ id: chapterId, number: 1, title: chapter.title }];
    await Promise.all([
      db.doc(`books/${firstBook}`).set({ title: { eu: 'Lehen liburua' }, chapters: summary }),
      db.doc(`books/${secondBook}`).set({ title: { eu: 'Beste liburua' }, chapters: summary }),
      db.doc(`chapters/${chapterId}`).set(chapter),
    ]);

    await page.goto(`/${secondBook}/${chapterId}`);
    await signInWithGoogle(page);
    await expect(page.getByRole('alert')).toContainText('Ce chapitre n’est pas publié.');
    await page.goto(`/${firstBook}/${chapterId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'Aurkezpenak Les présentations',
    );

    await db.doc(`books/${firstBook}`).update({ chapters: [] });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Ce chapitre n’est pas publié.');
    expect((await db.doc(`chapters/${chapterId}`).get()).data()?.['bookId']).toBe(firstBook);
  } finally {
    await db.terminate();
  }
});

test.describe('offline book isolation', () => {
  test.use({ serviceWorkers: 'allow' });

  test('uncached progress reports an error without blocking offline practice', async ({
    page,
    context,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const bookId = `offline-new-${suffix}`;
    const chapterId = `offline-chapter-${suffix}`;
    const db = new Firestore({ projectId: 'demo-ikasbide' });
    try {
      await Promise.all([
        publishBook(db, bookId, chapterId, { eu: 'Liburua', fr: 'Livre' }),
        db.doc(`chapters/${chapterId}`).set(await sampleChapter(bookId)),
      ]);
      await page.goto(`/${bookId}/${chapterId}`);
      await signInWithGoogle(page);
      await expect(page.locator('.objective-map')).toBeVisible();
      await waitForOfflineShell(page);

      await context.setOffline(true);
      await page.getByRole('link', { name: /Bonjour !/ }).click();
      await expect(page.getByRole('alert')).toContainText(
        'La progression n’a pas pu être synchronisée.',
      );
      await startCourse(page);
      await page.getByRole('button', { name: /Arrêter pour le moment/ }).click();

      await context.setOffline(false);
      await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 30_000 });
    } finally {
      await context.setOffline(false);
      await db.terminate();
    }
  });

  test('a legacy-only chapter is readable offline after an online visit', async ({
    page,
    context,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const bookId = `offline-legacy-${suffix}`;
    const chapterId = `offline-chapter-${suffix}`;
    const db = new Firestore({ projectId: 'demo-ikasbide' });
    try {
      const chapter = await sampleChapter(bookId);
      await Promise.all([
        db.doc(`books/${bookId}`).set({
          title: { eu: 'Liburua' },
          chapters: [{ id: chapterId, number: 1, title: chapter.title }],
        }),
        db.doc(`chapters/${chapterId}`).set(chapter),
      ]);
      await page.goto(`/${bookId}/${chapterId}`);
      await signInWithGoogle(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
        'Aurkezpenak Les présentations',
      );
      await waitForOfflineShell(page);

      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
        'Aurkezpenak Les présentations',
      );
      await page.getByRole('link', { name: /Bonjour !/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
        'Kaixo! Bonjour !',
      );
    } finally {
      await context.setOffline(false);
      await db.terminate();
    }
  });

  test('previously viewed books retain separate legacy progress without a connection', async ({
    page,
    context,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const firstBook = `offline-source-${suffix}`;
    const secondBook = `offline-other-${suffix}`;
    const chapterId = `offline-shared-${suffix}`;
    const db = new Firestore({ projectId: 'demo-ikasbide' });
    try {
      await Promise.all([
        publishBook(db, firstBook, chapterId, { eu: 'Lehen liburua', fr: 'Premier livre' }),
        publishBook(db, secondBook, chapterId, { eu: 'Bigarren liburua', fr: 'Deuxième livre' }),
        db.doc(`chapters/${chapterId}`).set(await sampleChapter(firstBook)),
      ]);
      await page.goto(`/${firstBook}/${chapterId}/greetings`);
      const uid = await learnerId(await signInWithGoogle(page));
      await Promise.all([
        db.doc(`learners/${uid}/attempts/legacy-attempt`).set({
          chapterId,
          itemId: 'greetings-gap-1',
          outcome: 'correct',
          occurredAt: Timestamp.now(),
          sessionId: 'legacy-session',
        }),
        db
          .doc(`learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`)
          .set(legacyProgress(chapterId)),
      ]);
      await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
      await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');
      await page.goto(`/${secondBook}/${chapterId}/greetings`);
      await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
      await waitForOfflineShell(page);

      await context.setOffline(true);
      await page.reload();
      await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
      await expect(page.locator('.journey-progress')).toContainText('8 étapes à découvrir');
      await page.goto(`/${firstBook}/${chapterId}/greetings`);
      await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 1');
      await expect(page.locator('.journey-progress')).toContainText('1 exercices réussis');
    } finally {
      await context.setOffline(false);
      await db.terminate();
    }
  });
});

test('legacy data with no known chapter owner stays separate and untouched', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const bookId = `orphan-book-${suffix}`;
  const chapterId = `orphan-chapter-${suffix}`;
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await publishBook(db, bookId, chapterId, { eu: 'Beste liburua', fr: 'Autre livre' });
    await page.goto(`/${bookId}/${chapterId}/greetings`);
    const email = await signInWithGoogle(page);
    const uid = await learnerId(email);
    const oldAttempt = db.doc(`learners/${uid}/attempts/orphan-attempt`);
    const oldProgress = db.doc(`learners/${uid}/sequenceProgress/${legacyProgressId(chapterId)}`);
    await Promise.all([
      oldAttempt.set({
        chapterId,
        itemId: 'greetings-gap-1',
        outcome: 'correct',
        occurredAt: Timestamp.now(),
        sessionId: 'orphan-session',
      }),
      oldProgress.set(legacyProgress(chapterId)),
    ]);
    await page.reload();

    await expect(attemptSummary(page)).toContainText('Tentatives synchronisées : 0');
    await expect(page.locator('.journey-progress')).toContainText('8 étapes à découvrir');
    expect((await oldAttempt.get()).exists).toBe(true);
    expect((await oldProgress.get()).data()).toEqual(legacyProgress(chapterId));
  } finally {
    await db.terminate();
  }
});
