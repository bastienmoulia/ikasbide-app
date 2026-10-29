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

test('an attempt keeps only its item, outcome, date and session', async () => {
  const uid = uniqueLearner('owner');
  const learner = googleLearner(uid);
  const fresh = () => doc(learner, `learners/${uid}/attempts/${crypto.randomUUID()}`);

  await assertFails(setDoc(fresh(), { ...attempt(), answer: 'naiz' }));
  await assertFails(setDoc(fresh(), { ...attempt(), outcome: 'perfect' }));
  await assertFails(setDoc(fresh(), { ...attempt(), occurredAt: '2026-10-29' }));
  const { sessionId: _sessionId, ...withoutSession } = attempt();
  await assertFails(setDoc(fresh(), withoutSession));
  await assertFails(setDoc(fresh(), { ...attempt(), itemId: '' }));
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
