import type { Firestore } from 'firebase/firestore';
import { loadFirebaseApp } from './firebase-app';

export interface FirestoreConnection {
  db: Firestore;
  sdk: typeof import('firebase/firestore');
}

let connection: Promise<FirestoreConnection> | undefined;

/**
 * Initialises the single Firestore instance shared by all services. Its persistent cache keeps
 * consulted curriculum readable offline and queues the learner's writes until reconnection.
 */
export function loadFirestore(): Promise<FirestoreConnection> {
  connection ??= (async () => {
    const [{ app, config }, sdk] = await Promise.all([
      loadFirebaseApp(),
      import('firebase/firestore'),
    ]);
    const db = sdk.initializeFirestore(app, {
      localCache: sdk.persistentLocalCache({
        tabManager: sdk.persistentMultipleTabManager(),
      }),
    });
    if (config.useEmulators) sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return { db, sdk };
  })();
  connection.catch(() => (connection = undefined));
  return connection;
}
