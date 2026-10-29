export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  useEmulators: boolean;
}

const storageKey = 'ikasbide.firebase-config';

/**
 * Fetches the deployed configuration. When the network is unreachable, falls back to the
 * last configuration validated on this device so a signed-in learner can work offline.
 */
export async function loadFirebaseConfig(): Promise<FirebaseConfig> {
  let response: Response;
  try {
    response = await fetch('/firebase-config.json', { cache: 'no-store' });
  } catch (error) {
    return storedConfig(error);
  }
  if (!response.ok) {
    // Offline, a gateway or server error stands for an unreachable network, not a bad deploy.
    if (!navigator.onLine || response.status >= 500) return storedConfig(response.status);
    throw new Error(`Firebase configuration unavailable (${response.status}).`);
  }
  const config = parseConfig(await response.json());
  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    // Storage may be unavailable (private browsing); offline start-up is then unsupported.
  }
  return config;
}

function storedConfig(cause: unknown): FirebaseConfig {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(storageKey);
  } catch {
    // Treated as no stored configuration.
  }
  if (!stored) throw new Error('Firebase configuration unavailable offline.', { cause });
  return parseConfig(JSON.parse(stored));
}

function parseConfig(value: unknown): FirebaseConfig {
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
