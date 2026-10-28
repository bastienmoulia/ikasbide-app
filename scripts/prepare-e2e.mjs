import { writeFile } from 'node:fs/promises';

// Override only the disposable build, never the maintainer's local configuration.
await writeFile(
  'dist/ikasbide/browser/firebase-config.json',
  JSON.stringify({
    apiKey: 'demo-api-key',
    authDomain: 'demo-ikasbide.firebaseapp.com',
    projectId: 'demo-ikasbide',
    appId: '1:123456789:web:demo',
    useEmulators: true,
  }),
);
