import type { FirebaseApp } from 'firebase/app';
import { loadFirebaseConfig, type FirebaseConfig } from './firebase-config';

export interface FirebaseConnection {
  app: FirebaseApp;
  config: FirebaseConfig;
}

let connection: Promise<FirebaseConnection> | undefined;

/** Loads the configuration and initialises the single Firebase app shared by all services. */
export function loadFirebaseApp(): Promise<FirebaseConnection> {
  connection ??= (async () => {
    const config = await loadFirebaseConfig();
    const { initializeApp } = await import('firebase/app');
    return { app: initializeApp(config), config };
  })();
  connection.catch(() => (connection = undefined));
  return connection;
}
