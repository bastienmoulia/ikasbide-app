import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { prepareIllustrations } from './illustrations.ts';

const usage =
  'Usage: npm run curriculum:images -- <content-repository> --book A1 --chapter <id> --draft <file.json> --bucket <bucket-name>';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      book: { type: 'string' },
      chapter: { type: 'string' },
      draft: { type: 'string' },
      bucket: { type: 'string' },
    },
  });
  if (
    positionals.length !== 1 ||
    !values.book ||
    !values.chapter ||
    !values.draft ||
    !values.bucket
  )
    throw new Error(usage);
  const input: unknown = JSON.parse(await readFile(values.draft, 'utf8'));
  const { preview } = await prepareIllustrations(
    positionals[0],
    values.book,
    values.chapter,
    input,
    values.bucket,
  );
  console.log(preview);
  console.error(
    'Prepared locally; review images, words and distractors in a content PR before publishing.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
