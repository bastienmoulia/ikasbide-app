import { parseArgs } from 'node:util';
import { publishCurriculum } from './publish.ts';
import { readCurriculumDirectory } from './source.ts';
import { validateCurriculum } from './validate.ts';

const usage = `Usage:
  npm run curriculum:validate -- <book-directory>
  npm run curriculum:import -- <book-directory> --project <firebase-project-id> [--chapter <id> ...]`;

async function main(): Promise<void> {
  const { positionals, values, tokens } = parseArgs({
    allowPositionals: true,
    options: { project: { type: 'string' }, chapter: { type: 'string', multiple: true } },
    tokens: true,
  });
  const chapterIds = values.chapter ? [...values.chapter] : undefined;
  let positionalCount = 0;
  let collectingChapters = false;
  for (const token of tokens) {
    if (token.kind === 'option') {
      collectingChapters = token.name === 'chapter';
    } else if (token.kind === 'positional') {
      if (positionalCount++ < 2) {
        collectingChapters = false;
      } else if (collectingChapters && chapterIds) {
        chapterIds.push(token.value);
      } else {
        throw new UsageError(usage);
      }
    } else {
      collectingChapters = false;
    }
  }
  const [command, directory] = positionals;
  if (
    positionals.length < 2 ||
    !directory ||
    (command === 'validate' && chapterIds) ||
    !(command === 'validate' || (command === 'import' && values.project))
  ) {
    throw new UsageError(usage);
  }

  const source = await readCurriculumDirectory(directory);
  const result = validateCurriculum(source.book, source.chapterFiles, source.errors);
  if (!result.valid) {
    throw new UsageError(
      `Invalid book in ${directory}; nothing was published.\n` +
        result.errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
  const { curriculum } = result;
  const chapterCount = curriculum.chapters.length;
  if (command === 'validate') {
    console.log(`Valid book ${curriculum.id}: ${plural(chapterCount, 'chapter')}.`);
    return;
  }
  if (!values.project) throw new UsageError(usage);
  const [{ initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ]);
  const emulator = process.env['FIRESTORE_EMULATOR_HOST'];
  if (Boolean(emulator) !== values.project.startsWith('demo-')) {
    throw new UsageError(
      emulator
        ? `Refusing to import into ${values.project} through the emulator: use a demo- project.`
        : `Refusing to import into ${values.project} without FIRESTORE_EMULATOR_HOST.`,
    );
  }
  // Production imports use Application Default Credentials kept outside the repository.
  if (emulator) process.env['METADATA_SERVER_DETECTION'] = 'none';
  const app = initializeApp(
    emulator
      ? { projectId: values.project }
      : { projectId: values.project, credential: applicationDefault() },
  );
  const summary = await publishCurriculum(getFirestore(app), curriculum, chapterIds);
  console.log(
    `Published book ${summary.bookId}, ${plural(summary.chapters, 'chapter')} ` +
      `to ${values.project} (${summary.removed} removed).`,
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

class UsageError extends Error {}

main().catch((error: unknown) => {
  console.error(error instanceof UsageError ? error.message : error);
  process.exitCode = 1;
});
