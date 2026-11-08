import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

// Override only the disposable build, never the maintainer's local configuration.
const firebaseConfig = JSON.stringify({
  apiKey: 'demo-api-key',
  authDomain: 'demo-ikasbide.firebaseapp.com',
  projectId: 'demo-ikasbide',
  appId: '1:123456789:web:demo',
  useEmulators: true,
});
await writeFile('dist/ikasbide/browser/firebase-config.json', firebaseConfig);

// A second real build lets PWA tests verify that new application code, not only HTML, runs.
const project = await mkdtemp(resolve('dist/pwa-build-'));
try {
  for (const path of [
    'src',
    'public',
    'angular.json',
    'ngsw-config.json',
    'tsconfig.json',
    'tsconfig.app.json',
  ]) {
    await cp(path, join(project, path), { recursive: true });
  }
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ ...packageJson, version: '99.0.0-pwa-update-test' }),
  );
  await symlink(resolve('node_modules'), join(project, 'node_modules'), 'dir');
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/@angular/cli/bin/ng.js'),
      'build',
      '--output-path=' + resolve('dist/pwa-release'),
    ],
    { cwd: project, stdio: 'inherit' },
  );
  await writeFile('dist/pwa-release/browser/firebase-config.json', firebaseConfig);
} finally {
  await rm(project, { recursive: true, force: true });
}
