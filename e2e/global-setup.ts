import { Firestore } from '@google-cloud/firestore';
import { runCurriculumCli } from '../tests/firestore/run-curriculum-cli.ts';
import { sampleContentVersion } from './support.ts';

/** Publishes the original synthetic sample curriculum to the Firestore emulator. */
export default async function globalSetup(): Promise<void> {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('Run the tests through `pnpm test` so the Firebase emulators are available.');
  }
  const result = await runCurriculumCli(
    'import',
    'tests/fixtures/curriculum.sample',
    '--project',
    'demo-ikasbide',
  );
  if (result.code !== 0) throw new Error(`Sample curriculum import failed:\n${result.stderr}`);
  // Manual imports do not version content; seed the version written by `sync`.
  const db = new Firestore({ projectId: 'demo-ikasbide' });
  try {
    await db
      .doc('curriculumVersions/ikasbide-content')
      .set({ version: sampleContentVersion, publishedAt: new Date() });
  } finally {
    await db.terminate();
  }
}
