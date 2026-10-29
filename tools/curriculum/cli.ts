import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { publishCurriculum } from './publish.ts';
import { validateCurriculum } from './validate.ts';

const usage = `Usage:
  npm run curriculum:validate -- <curriculum.json>
  npm run curriculum:import -- <curriculum.json> --project <firebase-project-id>`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { project: { type: 'string' } },
  });
  const [command, file] = positionals;
  if (!file || !(command === 'validate' || (command === 'import' && values.project))) {
    throw new UsageError(usage);
  }

  let source: unknown;
  try {
    source = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new UsageError(`Cannot read ${file} as JSON: ${(error as Error).message}`);
  }
  const result = validateCurriculum(source);
  if (!result.valid) {
    throw new UsageError(
      `Invalid curriculum in ${file}; nothing was published.\n` +
        result.errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
  const { curriculum } = result;
  const chapterCount = curriculum.units.reduce((total, unit) => total + unit.chapters.length, 0);
  if (command === 'validate') {
    console.log(
      `Valid curriculum: ${plural(curriculum.units.length, 'unit')}, ${plural(chapterCount, 'chapter')}.`,
    );
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
  const summary = await publishCurriculum(getFirestore(app), curriculum);
  console.log(
    `Published ${plural(summary.units, 'unit')}, ${plural(summary.chapters, 'chapter')} ` +
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
