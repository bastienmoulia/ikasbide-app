import { Injectable, computed, signal } from '@angular/core';
import { loadFirestore } from './firestore';

type SavedFields = Record<string, string | number | string[]>;
export interface LearnerSaveEvidence {
  path: string[];
  fields: SavedFields;
}

interface OutstandingSave {
  key: string;
  id: number;
  storageKey: string | null;
  evidence?: LearnerSaveEvidence;
  status: 'pending' | 'failed';
}

const prefix = 'ikasbide:unconfirmed-save:';
export const learnerSaveLock = 'ikasbide:learner-save-confirmation';

/** Confirmation evidence only: Firestore remains the sole offline write queue. */
@Injectable({ providedIn: 'root' })
export class LearnerSaves {
  private readonly writes = new Map<number, OutstandingSave>();
  private nextId = 0;
  private readonly changed = signal(0);
  private readonly storageUnavailable = signal(false);
  readonly pending = computed(() => {
    this.changed();
    return [...this.writes.values()].some((save) => save.status === 'pending');
  });
  readonly unconfirmed = computed(() => {
    this.changed();
    return this.writes.size > 0 || this.storageUnavailable();
  });

  begin(
    key: string,
    evidence?: LearnerSaveEvidence,
  ): { persist: () => Promise<void>; confirmed: () => void; failed: () => void } {
    const id = ++this.nextId;
    const save: OutstandingSave = {
      key,
      id,
      status: 'pending',
      evidence,
      storageKey: evidence ? prefix + crypto.randomUUID() : null,
    };
    this.writes.set(id, save);
    this.changed.update((value) => value + 1);
    return {
      persist: async () => {
        const store = () => {
          if (!save.storageKey) return;
          try {
            localStorage.setItem(save.storageKey, JSON.stringify(evidence));
          } catch (error) {
            console.error('Learner save confirmation evidence could not be stored.', error);
            this.storageUnavailable.set(true);
          }
        };
        // Hold this only while recording evidence, never throughout an offline server wait.
        if (navigator.locks)
          await navigator.locks.request(learnerSaveLock, { mode: 'shared' }, store);
        else store();
      },
      confirmed: () => {
        for (const previous of this.writes.values()) {
          if (
            previous.id === id ||
            (previous.key === key &&
              previous.id < id &&
              previous.status === 'failed' &&
              (!previous.evidence ||
                (evidence && covers(evidence.fields, previous.evidence.fields))))
          )
            this.forget(previous);
        }
        this.changed.update((value) => value + 1);
      },
      failed: () => {
        save.status = 'failed';
        this.changed.update((value) => value + 1);
      },
    };
  }

  hasUnconfirmedEvidence(): boolean {
    return this.restored().size > 0 || this.unconfirmed();
  }

  /** Queue drainage also resolves on rejection, so independently verify the saved documents. */
  async confirmRestored(learnerId: string): Promise<boolean> {
    if (this.storageUnavailable()) {
      throw new Error('Learner save confirmation storage is unavailable.');
    }
    const outstanding = new Map(
      [...this.restored()].filter(([, evidence]) => evidence.path[1] === learnerId),
    );
    for (const save of this.writes.values()) {
      if (save.evidence?.path[1] === learnerId && save.storageKey)
        outstanding.set(save.storageKey, save.evidence);
    }
    if (!outstanding.size) return !this.unconfirmed();
    const { db, sdk } = await loadFirestore();
    let confirmed = true;
    for (const [storageKey, evidence] of outstanding) {
      const [collection, ...segments] = evidence.path;
      const snapshot = await sdk.getDocFromServer(sdk.doc(db, collection, ...segments));
      const fields: SavedFields = {};
      for (const key of Object.keys(evidence.fields)) {
        const value: unknown = snapshot.get(key);
        if (value instanceof sdk.Timestamp) fields[key] = value.toMillis();
        else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          (Array.isArray(value) && value.every((item) => typeof item === 'string'))
        )
          fields[key] = value;
      }
      if (!snapshot.exists() || !covers(fields, evidence.fields)) {
        confirmed = false;
        continue;
      }
      localStorage.removeItem(storageKey);
      for (const save of this.writes.values()) {
        if (save.storageKey === storageKey) this.writes.delete(save.id);
      }
    }
    this.changed.update((value) => value + 1);
    return confirmed && !this.unconfirmed();
  }

  private restored(): Map<string, LearnerSaveEvidence> {
    if (this.storageUnavailable()) {
      throw new Error('Learner save confirmation storage is unavailable.');
    }
    const outstanding = new Map<string, LearnerSaveEvidence>();
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      const evidence: unknown = JSON.parse(value);
      if (!isEvidence(evidence)) throw new Error('Invalid learner save confirmation evidence.');
      outstanding.set(key, evidence);
    }
    return outstanding;
  }

  private forget(save: OutstandingSave): void {
    this.writes.delete(save.id);
    if (!save.storageKey) return;
    try {
      localStorage.removeItem(save.storageKey);
    } catch (error) {
      console.error('Learner save confirmation evidence could not be removed.', error);
      this.storageUnavailable.set(true);
    }
  }
}

function covers(actual: SavedFields, expected: SavedFields): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const saved = actual[key];
    return Array.isArray(value)
      ? Array.isArray(saved) && value.every((item) => saved.includes(item))
      : saved === value;
  });
}

function isEvidence(value: unknown): value is LearnerSaveEvidence {
  if (!value || typeof value !== 'object' || !('path' in value) || !('fields' in value))
    return false;
  return (
    Array.isArray(value.path) &&
    value.path.length >= 4 &&
    value.path.length % 2 === 0 &&
    value.path[0] === 'learners' &&
    value.path.every(
      (segment) => typeof segment === 'string' && segment && !segment.includes('/'),
    ) &&
    !!value.fields &&
    typeof value.fields === 'object' &&
    !Array.isArray(value.fields) &&
    Object.keys(value.fields).length > 0 &&
    Object.values(value.fields).every(
      (field) =>
        typeof field === 'string' ||
        (typeof field === 'number' && Number.isFinite(field)) ||
        (Array.isArray(field) && field.every((item) => typeof item === 'string')),
    )
  );
}
