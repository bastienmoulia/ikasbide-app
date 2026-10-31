import { runCurriculumCli } from '../tests/firestore/run-curriculum-cli.ts';

/** Publishes the original synthetic sample curriculum to the Firestore emulator. */
export default async function globalSetup(): Promise<void> {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('Run the tests through `npm test` so the Firebase emulators are available.');
  }
  const result = await runCurriculumCli(
    'import',
    'tests/fixtures/curriculum.sample',
    '--project',
    'demo-ikasbide',
  );
  if (result.code !== 0) throw new Error(`Sample curriculum import failed:\n${result.stderr}`);
}
