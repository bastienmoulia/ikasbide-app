export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  useEmulators: boolean;
}

export async function loadFirebaseConfig(): Promise<FirebaseConfig> {
  const response = await fetch('/firebase-config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Firebase configuration unavailable (${response.status}).`);
  }
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['apiKey']) ||
    !isNonEmptyString(value['authDomain']) ||
    !isNonEmptyString(value['projectId']) ||
    !isNonEmptyString(value['appId']) ||
    (value['useEmulators'] !== undefined && typeof value['useEmulators'] !== 'boolean')
  ) {
    throw new Error('Invalid Firebase configuration.');
  }

  const useEmulators = value['useEmulators'] === true;
  if (
    useEmulators &&
    (!['localhost', '127.0.0.1'].includes(location.hostname) ||
      value['projectId'] !== 'demo-ikasbide')
  ) {
    throw new Error('Authentication emulator is restricted to the local demo project.');
  }
  if (!useEmulators && value['projectId'].startsWith('demo-')) {
    throw new Error('A demo project must use the authentication emulator.');
  }

  return {
    apiKey: value['apiKey'],
    authDomain: value['authDomain'],
    projectId: value['projectId'],
    appId: value['appId'],
    useEmulators,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
