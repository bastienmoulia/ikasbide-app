const apiVersion = '2022-11-28';

function latestMainPushCiRun(runs, releaseSha, defaultBranch) {
  const matchingRuns = runs.filter(
    (run) =>
      run.name === 'CI' &&
      run.event === 'push' &&
      run.head_branch === defaultBranch &&
      run.head_sha === releaseSha,
  );
  return matchingRuns.reduce(
    (latest, run) =>
      !latest ||
      run.run_number > latest.run_number ||
      (run.run_number === latest.run_number && run.run_attempt > latest.run_attempt)
        ? run
        : latest,
    undefined,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function requireSuccessfulCi({
  repository,
  releaseSha,
  defaultBranch,
  token,
  fetchImpl = fetch,
  timeoutMs = 15 * 60 * 1000,
  pollIntervalMs = 15 * 1000,
  now = Date.now,
  sleep = delay,
}) {
  if (!repository || !releaseSha || !defaultBranch || !token) {
    throw new Error('GitHub repository, release SHA, default branch, and token are required.');
  }
  if (!/^[\da-f]{40}$/i.test(releaseSha)) {
    throw new Error('The release SHA must be a full 40-character commit hash.');
  }

  const startedAt = now();
  const query = new URLSearchParams({ head_sha: releaseSha, per_page: '100' });
  const url = `https://api.github.com/repos/${repository}/actions/runs?${query}`;

  while (true) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': apiVersion,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Could not read CI runs for ${releaseSha}: GitHub returned ${response.status}.`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload.workflow_runs)) {
      throw new Error(`GitHub returned an invalid workflow run list for ${releaseSha}.`);
    }
    const run = latestMainPushCiRun(payload.workflow_runs, releaseSha, defaultBranch);
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`CI for release commit ${releaseSha} ended with ${run.conclusion}.`);
      }
      return run;
    }

    if (now() - startedAt >= timeoutMs) {
      throw new Error(`No successful CI run for release commit ${releaseSha} before the timeout.`);
    }
    await sleep(pollIntervalMs);
  }
}

if (process.argv[1]?.endsWith('/check-release-ci.mjs')) {
  try {
    const run = await requireSuccessfulCi({
      repository: process.env['GITHUB_REPOSITORY'],
      releaseSha: process.env['RELEASE_SHA'],
      defaultBranch: process.env['DEFAULT_BRANCH'],
      token: process.env['GITHUB_TOKEN'],
    });
    console.log(`CI run ${run.run_number} succeeded for release commit ${run.head_sha}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
