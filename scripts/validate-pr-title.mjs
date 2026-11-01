const conventionalTitle =
  /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?: [^\r\n]+$/;

export function isConventionalPullRequestTitle(title) {
  return typeof title === 'string' && conventionalTitle.test(title);
}

if (process.argv[1]?.endsWith('/validate-pr-title.mjs')) {
  const title = process.env['PR_TITLE'] ?? '';
  if (!isConventionalPullRequestTitle(title)) {
    console.error(
      'Pull request titles must use Conventional Commits, for example "feat(scope): add a feature" or "fix!: describe a breaking change".',
    );
    process.exitCode = 1;
  }
}
