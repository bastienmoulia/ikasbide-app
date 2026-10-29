import { readFile } from 'node:fs/promises';
import { test } from '@playwright/test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

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

test('signed-out visitors cannot read published curriculum', async () => {
  const visitor = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(visitor, 'units/unit-1')));
  await assertFails(getDoc(doc(visitor, 'chapters/chapter-1')));
  await assertFails(getDocs(collection(visitor, 'units')));
});

test('any Google-authenticated learner can read published curriculum', async () => {
  for (const uid of ['learner-a', 'learner-b']) {
    const learner = googleLearner(uid);
    await assertSucceeds(getDocs(collection(learner, 'units')));
    await assertSucceeds(getDoc(doc(learner, 'chapters/chapter-1')));
  }
});

test('accounts signed in without Google cannot read published curriculum', async () => {
  const anonymous = environment
    .authenticatedContext('anonymous-user', { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
  await assertFails(getDocs(collection(anonymous, 'units')));
  await assertFails(getDoc(doc(anonymous, 'chapters/chapter-1')));
});

test('learner clients cannot write shared curriculum', async () => {
  const learner = googleLearner('learner-writer');
  await assertFails(setDoc(doc(learner, 'units/unit-1'), { number: 1 }));
  await assertFails(setDoc(doc(learner, 'chapters/injected'), { number: 99 }));
  await assertFails(setDoc(doc(learner, 'chapters/chapter-1'), { number: 1 }, { merge: true }));
  await assertFails(deleteDoc(doc(learner, 'chapters/chapter-1')));
});
