import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('dist/ikasbide/browser/firebase-config.json', 'utf8'));
for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
  if (typeof config[key] !== 'string' || !config[key].trim() || config[key].includes('YOUR_')) {
    throw new Error(`Configure ${key} in public/firebase-config.json before deploying.`);
  }
}
if (config.useEmulators !== false || config.projectId.startsWith('demo-')) {
  throw new Error('Refusing to deploy an emulator configuration. See docs/firebase-setup.md.');
}
const aliases = JSON.parse(await readFile('.firebaserc', 'utf8'));
if (aliases.projects?.default !== config.projectId) {
  throw new Error('The default Firebase CLI project must match firebase-config.json.');
}
console.log(`Hosting configuration ready for ${config.projectId}.`);
