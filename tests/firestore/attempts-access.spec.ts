import { readFile } from 'node:fs/promises';
import { test } from '@playwright/test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

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

function googleLearner(uid: string) {
  return environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } })
    .firestore();
}

function uniqueLearner(name: string): string {
  return `${name}-${crypto.randomUUID()}`;
}

const attempt = () => ({
  bookId: 'a1',
  chapterId: 'chapter-1',
  itemId: 'greetings-gap-1',
  outcome: 'correct',
  occurredAt: Timestamp.now(),
  sessionId: crypto.randomUUID(),
});

test('a learner records and reads their own attempts', async () => {
  const uid = uniqueLearner('owner');
  const learner = googleLearner(uid);
  const ref = doc(learner, `learners/${uid}/attempts/${crypto.randomUUID()}`);
  await assertSucceeds(setDoc(ref, attempt()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(learner, `learners/${uid}/attempts`)));
});

test('a learner can record an accepted answer with a warning', async () => {
  const uid = uniqueLearner('warning');
  const ref = doc(googleLearner(uid), `learners/${uid}/attempts/${crypto.randomUUID()}`);
  const recorded = { ...attempt(), outcome: 'correct-with-warning' };
  await assertSucceeds(setDoc(ref, recorded));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, recorded));
  await assertFails(updateDoc(ref, { outcome: 'correct' }));
});

test('another account cannot read or change a learner’s attempts', async () => {
  const owner = uniqueLearner('owner');
  const attemptPath = `learners/${owner}/attempts/${crypto.randomUUID()}`;
  await assertSucceeds(setDoc(doc(googleLearner(owner), attemptPath), attempt()));

  const other = googleLearner(uniqueLearner('other'));
  await assertFails(getDoc(doc(other, attemptPath)));
  await assertFails(getDocs(collection(other, `learners/${owner}/attempts`)));
  await assertFails(setDoc(doc(other, attemptPath), attempt()));
  await assertFails(
    setDoc(doc(other, `learners/${owner}/attempts/${crypto.randomUUID()}`), attempt()),
  );
  await assertFails(deleteDoc(doc(other, attemptPath)));

  const visitor = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(visitor, attemptPath)));
  await assertFails(
    setDoc(doc(visitor, `learners/${owner}/attempts/${crypto.randomUUID()}`), attempt()),
  );
});

test('accounts signed in without Google cannot keep attempts', async () => {
  const uid = uniqueLearner('anonymous');
  const anonymous = environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
  await assertFails(setDoc(doc(anonymous, `learners/${uid}/attempts/a`), attempt()));
});

test('an attempt keeps only its book, item, outcome, date and session', async () => {
  const uid = uniqueLearner('owner');
  const learner = googleLearner(uid);
  const fresh = () => doc(learner, `learners/${uid}/attempts/${crypto.randomUUID()}`);

  await assertFails(setDoc(fresh(), { ...attempt(), answer: 'naiz' }));
  await assertFails(setDoc(fresh(), { ...attempt(), outcome: 'perfect' }));
  await assertFails(setDoc(fresh(), { ...attempt(), occurredAt: '2026-10-29' }));
  const { sessionId: _sessionId, ...withoutSession } = attempt();
  await assertFails(setDoc(fresh(), withoutSession));
  const { bookId: _bookId, ...withoutBook } = attempt();
  await assertFails(setDoc(fresh(), withoutBook));
  await assertFails(setDoc(fresh(), { ...attempt(), bookId: '' }));
  await assertFails(setDoc(fresh(), { ...attempt(), itemId: '' }));
});

test('book identifiers up to the Firestore document-ID limit can save progress', async () => {
  const uid = uniqueLearner('long-book');
  const owner = googleLearner(uid);
  const bookId = 'b'.repeat(1500);
  const attemptPath = `learners/${uid}/attempts/long-book-attempt`;
  const progressPath = `learners/${uid}/books/${bookId}/chapters/chapter-1/sequenceProgress/greetings`;

  await assertSucceeds(setDoc(doc(owner, attemptPath), { ...attempt(), bookId }));
  await assertSucceeds(
    setDoc(doc(owner, progressPath), {
      schemaVersion: 2,
      bookId,
      chapterId: 'chapter-1',
      sequenceId: 'greetings',
      visitedStepIds: [],
      successfulItemIds: [],
      incorrectItemIds: [],
      skippedStepIds: [],
    }),
  );
  await assertFails(
    setDoc(doc(owner, `learners/${uid}/attempts/too-long`), {
      ...attempt(),
      bookId: 'b'.repeat(1501),
    }),
  );
});

test('recorded attempts are immutable evidence but can be safely resent', async () => {
  const uid = uniqueLearner('owner');
  const learner = googleLearner(uid);
  const ref = doc(learner, `learners/${uid}/attempts/${crypto.randomUUID()}`);
  const recorded = attempt();
  await assertSucceeds(setDoc(ref, recorded));

  // A reconnection may resend a write the server already applied.
  await assertSucceeds(setDoc(ref, recorded));
  await assertFails(updateDoc(ref, { outcome: 'incorrect' }));
  await assertFails(deleteDoc(ref));
});

test('sequence progress sync is private to the owning Google account and excludes answers', async () => {
  const ownerId = uniqueLearner('progress-owner');
  const path = `learners/${ownerId}/books/a1/chapters/chapter-1/sequenceProgress/greetings`;
  const progress = {
    schemaVersion: 2,
    bookId: 'a1',
    chapterId: 'chapter-1',
    sequenceId: 'greetings',
    visitedStepIds: ['content:note', 'item:greetings-gap-1'],
    successfulItemIds: ['greetings-gap-1'],
    incorrectItemIds: [],
    skippedStepIds: [],
  };
  const owner = googleLearner(ownerId);
  await assertSucceeds(setDoc(doc(owner, path), progress));
  await assertSucceeds(getDoc(doc(owner, path)));

  const other = googleLearner(uniqueLearner('progress-other'));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(setDoc(doc(other, path), progress));
  await assertFails(
    setDoc(doc(owner, path), {
      ...progress,
      answer: 'naiz',
    }),
  );
  await assertFails(setDoc(doc(owner, path), { ...progress, bookId: 'other-book' }));
  await assertFails(setDoc(doc(owner, path), { ...progress, chapterId: 'other-chapter' }));
  await assertFails(setDoc(doc(owner, path), { ...progress, sequenceId: 'other-sequence' }));
  await assertFails(setDoc(doc(environment.unauthenticatedContext().firestore(), path), progress));
});

test('legacy learner data remains private and readable but cannot be written again', async () => {
  const uid = uniqueLearner('legacy-owner');
  const attemptPath = `learners/${uid}/attempts/legacy-attempt`;
  const progressPath = `learners/${uid}/sequenceProgress/9:chapter-1greetings`;
  const { bookId: _bookId, ...legacyAttempt } = attempt();
  const legacyProgress = {
    schemaVersion: 1,
    chapterId: 'chapter-1',
    sequenceId: 'greetings',
    visitedStepIds: ['content:greetings-note'],
    successfulItemIds: [],
    incorrectItemIds: [],
    skippedStepIds: [],
  };
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, attemptPath), legacyAttempt);
    await setDoc(doc(firestore, progressPath), legacyProgress);
  });

  const owner = googleLearner(uid);
  await assertSucceeds(getDoc(doc(owner, attemptPath)));
  await assertSucceeds(getDoc(doc(owner, progressPath)));
  await assertFails(setDoc(doc(owner, attemptPath), legacyAttempt));
  await assertFails(setDoc(doc(owner, progressPath), legacyProgress));
  await assertFails(getDoc(doc(googleLearner(uniqueLearner('other')), attemptPath)));
  await assertFails(getDoc(doc(googleLearner(uniqueLearner('other')), progressPath)));
});
