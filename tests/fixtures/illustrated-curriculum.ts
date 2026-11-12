import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import type { CurriculumSource } from '../../src/app/curriculum/curriculum.model.ts';

function png(shade: number): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, shade, shade, shade]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const dogImage = png(255);
export const catImage = png(200);
export const imageReference = (bytes: Buffer) => {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { url: `https://images.example.test/${sha256}.png`, sha256 };
};

export function illustratedCurriculum(bookId: string): CurriculumSource {
  const title = { eu: 'Irudiak', fr: 'Images fictives' };
  const instructions = { eu: 'Aukeratu edo idatzi hitza.', fr: 'Choisissez ou écrivez le mot.' };
  const dog = { image: imageReference(dogImage), word: { eu: 'txakur', fr: 'chien' } };
  const cat = { image: imageReference(catImage), word: { eu: 'katu', fr: 'chat' } };
  return {
    schemaVersion: 2,
    id: bookId,
    title,
    chapters: [
      {
        id: 'objects',
        number: 1,
        title,
        objectives: [{ id: 'name-objects', label: title }],
        sequences: [
          {
            id: 'images',
            letter: 'A',
            title,
            contents: [
              {
                id: 'choose-images',
                type: 'activity',
                kind: 'image-choice',
                title,
                instructions,
                items: [
                  {
                    ...dog,
                    id: 'choose-dog',
                    objectiveIds: ['name-objects'],
                    choices: ['txakur', 'katu', 'zaldi', 'ardi', 'behi', 'txori'],
                  },
                  {
                    ...cat,
                    id: 'choose-cat',
                    objectiveIds: ['name-objects'],
                    choices: ['katu', 'txakur', 'zaldi', 'ardi', 'behi', 'txori'],
                  },
                ],
              },
              {
                id: 'write-images',
                type: 'activity',
                kind: 'image-write',
                title,
                instructions,
                items: [
                  {
                    ...dog,
                    id: 'write-dog',
                    objectiveIds: ['name-objects'],
                    acceptedAnswers: ['txakur'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
