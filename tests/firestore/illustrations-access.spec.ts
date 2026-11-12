import { readFile } from 'node:fs/promises';
import { test } from '@playwright/test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage';
import { dogImage, imageReference } from '../fixtures/illustrated-curriculum.ts';

test.skip(!process.env['FIREBASE_STORAGE_EMULATOR_HOST'], 'Run with the Storage emulator.');
let environment: RulesTestEnvironment;
const path = `illustrations/${imageReference(dogImage).sha256}.png`;

test.beforeAll(async () => {
  const [host, port] = (process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ?? '127.0.0.1:9199').split(
    ':',
  );
  environment = await initializeTestEnvironment({
    projectId: 'demo-ikasbide-images',
    storage: { host, port: Number(port), rules: await readFile('storage.rules', 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async (admin) => {
    await uploadBytes(ref(admin.storage(), path), dogImage, { contentType: 'image/png' });
  });
});
test.afterAll(async () => {
  await environment?.cleanup();
});

test('only Google-authenticated learners read illustrations and clients cannot list, write or delete them', async () => {
  const learner = environment
    .authenticatedContext('image-learner', { firebase: { sign_in_provider: 'google.com' } })
    .storage();
  await assertSucceeds(getBytes(ref(learner, path)));
  await assertFails(getBytes(ref(environment.unauthenticatedContext().storage(), path)));
  const anonymous = environment
    .authenticatedContext('anonymous-image', { firebase: { sign_in_provider: 'anonymous' } })
    .storage();
  await assertFails(getBytes(ref(anonymous, path)));
  await assertFails(listAll(ref(learner, 'illustrations')));
  await assertFails(uploadBytes(ref(learner, path), dogImage));
  await assertFails(deleteObject(ref(learner, path)));
});
