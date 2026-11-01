import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

test('deploys main pushes at their exact commit after successful CI', async () => {
  const deployWorkflow = await readFile('.github/workflows/deploy.yml', 'utf8');

  assert.match(deployWorkflow, /^on:\n  push:\n    branches: \[main\]\n  release:/m);
  assert.match(
    deployWorkflow,
    /deploy:\n    if: >-\n      \(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\|/,
  );
  assert.match(
    deployWorkflow,
    /ref: >-\n\s+\$\{\{ \(github\.event_name == 'release' && github\.event\.release\.tag_name\) \|\|\n\s+\(github\.event_name == 'push' && github\.sha\) \|\| 'main' \}\}/,
  );
  assert.match(
    deployWorkflow,
    /name: Require CI for the exact deployment commit\n\s+if: github\.event_name == 'release' \|\| github\.event_name == 'push'/,
  );
  assert.match(
    deployWorkflow,
    /concurrency:\n  group: firebase-hosting-production\n  cancel-in-progress: false\n  queue: max/,
  );
});

test('release metadata checks allow version changes and reject inconsistencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ikasbide-release-'));
  const environment = { ...process.env };
  // The nested test runner must not inherit the parent worker's context.
  delete environment.NODE_TEST_CONTEXT;
  const checkMetadata = () =>
    spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=tap',
        '--test-name-pattern=^Release Please configuration and package versions remain consistent$',
        fileURLToPath(import.meta.url),
      ],
      { cwd: directory, encoding: 'utf8', env: environment },
    );
  const writeVersions = async ({ manifest, packageVersion, lock, lockRoot }) => {
    await Promise.all([
      writeFile(
        join(directory, '.release-please-manifest.json'),
        JSON.stringify({ '.': manifest }),
      ),
      writeFile(join(directory, 'package.json'), JSON.stringify({ version: packageVersion })),
      writeFile(
        join(directory, 'package-lock.json'),
        JSON.stringify({ version: lock, packages: { '': { version: lockRoot } } }),
      ),
    ]);
  };

  try {
    await writeFile(
      join(directory, 'release-please-config.json'),
      await readFile('release-please-config.json', 'utf8'),
    );

    for (const version of ['0.0.0', '0.1.0', '0.1.1', '0.2.0', '1.0.0']) {
      await writeVersions({
        manifest: version,
        packageVersion: version,
        lock: version,
        lockRoot: version,
      });
      const result = checkMetadata();
      assert.ifError(result.error);
      assert.match(result.stdout, /^# tests 1$/m, result.stderr);
      assert.equal(result.status, 0, `Version ${version}:\n${result.stdout}\n${result.stderr}`);
    }

    for (const versions of [
      { manifest: '0.0.0', packageVersion: '0.1.0', lock: '0.1.0', lockRoot: '0.1.0' },
      { manifest: '0.1.0', packageVersion: '0.1.0', lock: '0.0.0', lockRoot: '0.1.0' },
      { manifest: '0.1.0', packageVersion: '0.1.0', lock: '0.1.0', lockRoot: '0.0.0' },
      { manifest: 'invalid', packageVersion: 'invalid', lock: 'invalid', lockRoot: 'invalid' },
    ]) {
      await writeVersions(versions);
      const result = checkMetadata();
      assert.ifError(result.error);
      assert.match(result.stdout, /^# tests 1$/m, result.stderr);
      assert.notEqual(result.status, 0, `Accepted invalid versions: ${JSON.stringify(versions)}`);
      assert.match(result.stdout, /AssertionError/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Release Please configuration and package versions remain consistent', async () => {
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
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest['.'], packageJson.version);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
});
