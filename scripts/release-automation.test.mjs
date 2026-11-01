import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isConventionalPullRequestTitle } from './validate-pr-title.mjs';
import { requireSuccessfulCi } from './check-release-ci.mjs';

const releaseSha = 'a'.repeat(40);

test('accepts standard, scoped, breaking, and Release Please pull request titles', () => {
  for (const title of [
    'feat: add account menu',
    'fix(display-mode): persist system choice',
    'feat(auth)!: change the session contract',
    'chore(main): release 0.1.0',
  ]) {
    assert.equal(isConventionalPullRequestTitle(title), true, title);
  }
});

test('rejects titles that do not follow Conventional Commits', () => {
  for (const title of [
    '',
    'Add account menu',
    'feature: add account menu',
    'feat(): empty scope',
    'feat: ',
    'feat: first line\nsecond line',
  ]) {
    assert.equal(isConventionalPullRequestTitle(title), false, JSON.stringify(title));
  }
});

test('allows release deployment only after CI succeeds for the exact main commit', async () => {
  const expectedRun = {
    name: 'CI',
    event: 'push',
    head_branch: 'main',
    head_sha: releaseSha,
    status: 'completed',
    conclusion: 'success',
    run_number: 14,
    run_attempt: 1,
  };
  let request;
  const result = await requireSuccessfulCi({
    repository: 'bastienmoulia/ikasbide-app',
    releaseSha,
    defaultBranch: 'main',
    token: 'test-token',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return Response.json({ workflow_runs: [expectedRun] });
    },
  });

  assert.deepEqual(result, expectedRun);
  assert.match(request.url, new RegExp(`head_sha=${releaseSha}`));
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
});

test('does not accept PR checks, another branch, another SHA, or an older passing run', async () => {
  const fetchImpl = async () =>
    Response.json({
      workflow_runs: [
        {
          name: 'CI',
          event: 'pull_request',
          head_branch: 'main',
          head_sha: releaseSha,
          status: 'completed',
          conclusion: 'success',
          run_number: 13,
          run_attempt: 1,
        },
        {
          name: 'CI',
          event: 'push',
          head_branch: 'feature',
          head_sha: releaseSha,
          status: 'completed',
          conclusion: 'success',
          run_number: 14,
          run_attempt: 1,
        },
        {
          name: 'CI',
          event: 'push',
          head_branch: 'main',
          head_sha: 'b'.repeat(40),
          status: 'completed',
          conclusion: 'success',
          run_number: 15,
          run_attempt: 1,
        },
      ],
    });

  await assert.rejects(
    requireSuccessfulCi({
      repository: 'bastienmoulia/ikasbide-app',
      releaseSha,
      defaultBranch: 'main',
      token: 'test-token',
      fetchImpl,
      timeoutMs: 0,
    }),
    /No successful CI run for release commit/,
  );
});

test('rejects failed and cancelled latest runs even when an older run passed', async () => {
  for (const conclusion of ['failure', 'cancelled']) {
    const fetchImpl = async () =>
      Response.json({
        workflow_runs: [
          {
            name: 'CI',
            event: 'push',
            head_branch: 'main',
            head_sha: releaseSha,
            status: 'completed',
            conclusion: 'success',
            run_number: 20,
            run_attempt: 1,
          },
          {
            name: 'CI',
            event: 'push',
            head_branch: 'main',
            head_sha: releaseSha,
            status: 'completed',
            conclusion,
            run_number: 20,
            run_attempt: 2,
          },
        ],
      });

    await assert.rejects(
      requireSuccessfulCi({
        repository: 'bastienmoulia/ikasbide-app',
        releaseSha,
        defaultBranch: 'main',
        token: 'test-token',
        fetchImpl,
      }),
      new RegExp(`CI for release commit .* ended with ${conclusion}`),
    );
  }
});

test('waits for pending CI and rejects missing credentials or malformed commits', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({
      workflow_runs: [
        {
          name: 'CI',
          event: 'push',
          head_branch: 'main',
          head_sha: releaseSha,
          status: calls === 1 ? 'in_progress' : 'completed',
          conclusion: calls === 1 ? null : 'success',
          run_number: 21,
          run_attempt: 1,
        },
      ],
    });
  };
  let time = 0;
  await requireSuccessfulCi({
    repository: 'bastienmoulia/ikasbide-app',
    releaseSha,
    defaultBranch: 'main',
    token: 'test-token',
    fetchImpl,
    timeoutMs: 10,
    pollIntervalMs: 5,
    now: () => time,
    sleep: async (milliseconds) => {
      time += milliseconds;
    },
  });
  assert.equal(calls, 2);

  await assert.rejects(
    requireSuccessfulCi({
      repository: 'bastienmoulia/ikasbide-app',
      releaseSha,
      defaultBranch: 'main',
      token: '',
    }),
    /GitHub repository, release SHA, default branch, and token are required/,
  );
  await assert.rejects(
    requireSuccessfulCi({
      repository: 'bastienmoulia/ikasbide-app',
      releaseSha: 'not-a-commit',
      defaultBranch: 'main',
      token: 'test-token',
    }),
    /release SHA must be a full 40-character commit hash/,
  );
});

test('release and deployment workflows retain the gated immutable-release path', async () => {
  const [releaseWorkflow, deployWorkflow, ciWorkflow] = await Promise.all([
    readFile('.github/workflows/release-please.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8'),
  ]);
  assert.match(releaseWorkflow, /googleapis\/release-please-action@v4/);
  assert.match(releaseWorkflow, /RELEASE_PLEASE_TOKEN/);
  assert.match(deployWorkflow, /types:\s*\[published\]/);
  assert.match(deployWorkflow, /check-release-ci\.mjs/);
  assert.match(deployWorkflow, /git checkout --detach "\$release_sha"/);
  assert.match(deployWorkflow, /github\.event\.release\.tag_name/);
  assert.match(deployWorkflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deployWorkflow, /npm run deploy -- --non-interactive/);
  assert.match(ciWorkflow, /validate-pr-title\.mjs/);
  assert.match(ciWorkflow, /types:\s*\[opened, synchronize, reopened, edited\]/);
  assert.match(deployWorkflow, /cancel-in-progress: false/);
  assert.ok(
    deployWorkflow.indexOf('check-release-ci.mjs') <
      deployWorkflow.indexOf('name: Build and deploy Hosting'),
  );
});

test('Release Please bootstraps at 0.1.0 without changing the current build version', async () => {
  const [config, manifest, packageJson, packageLock] = await Promise.all([
    readFile('release-please-config.json', 'utf8').then(JSON.parse),
    readFile('.release-please-manifest.json', 'utf8').then(JSON.parse),
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse),
  ]);
  assert.equal(config.packages['.']['initial-version'], '0.1.0');
  assert.equal(config.packages['.']['bump-minor-pre-major'], true);
  assert.equal(config.packages['.']['bump-patch-for-minor-pre-major'], undefined);
  assert.equal(config['include-component-in-tag'], false);
  assert.equal(config['include-v-in-tag'], true);
  assert.equal(manifest['.'], '0.0.0');
  assert.equal(packageJson.version, '0.0.0');
  assert.equal(packageLock.version, packageJson.version);
});
