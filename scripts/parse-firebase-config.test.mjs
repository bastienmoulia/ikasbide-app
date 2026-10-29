import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFirebaseConfig } from './parse-firebase-config.mjs';

test('parses JSON Firebase configuration', () => {
  assert.deepEqual(parseFirebaseConfig('{"projectId":"ikasbide-app"}'), {
    projectId: 'ikasbide-app',
  });
});

test('parses Firebase SDK object configuration without evaluating code', () => {
  assert.deepEqual(
    parseFirebaseConfig(`const firebaseConfig = {
      apiKey: "key",
      projectId: "ikasbide-app",
      note: "contains, projectId: text",
    };`),
    {
      apiKey: 'key',
      projectId: 'ikasbide-app',
      note: 'contains, projectId: text',
    },
  );
});

test('rejects executable values and non-object JSON', () => {
  assert.throws(() => parseFirebaseConfig('{ projectId: process.env.PROJECT_ID }'));
  assert.throws(() => parseFirebaseConfig('["ikasbide-app"]'));
});
