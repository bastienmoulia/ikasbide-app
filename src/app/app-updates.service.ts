import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { AuthService } from './auth.service';
import { NetworkStatus } from './network-status';
import { PracticeLayout } from './practice-layout';
import { LearnerSaves, learnerSaveLock } from './learner-saves';
import { loadFirestore } from './firestore';
import type { BilingualText } from './curriculum/curriculum.model';

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  readonly error = signal<BilingualText | null>(null);
  readonly checking = signal(false);
  private readonly retryRequests = signal(0);
  private readonly updates = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkStatus);
  private readonly practice = inject(PracticeLayout);
  private readonly router = inject(Router);
  private readonly saves = inject(LearnerSaves);
  private readonly ready = signal(false);
  private readonly visible = signal(this.document.visibilityState === 'visible');
  private readonly navigating = signal(false);
  private checkRequested = false;
  private reloading = false;
  private stopped = false;

  constructor() {
    if (!this.updates.isEnabled) return;
    const destroy = inject(DestroyRef);
    const versions = this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.error.set(null);
        this.ready.set(true);
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.error('App update installation failed.', event.error);
        this.error.set({
          eu: 'Ezin izan da eguneratzea instalatu. Uneko bertsioa erabil dezakezu. Saiatu berriz.',
          fr: 'La mise à jour n’a pas pu être installée. Vous pouvez continuer avec la version actuelle. Réessayez.',
        });
      }
    });
    const unrecoverable = this.updates.unrecoverable.subscribe((event) => {
      console.error('The cached app version is unrecoverable.', event.reason);
      this.error.set({
        eu: 'Uneko bertsioa ezin da berreskuratu. Utzi ariketa eta sinkronizatu aurrerapena, gero saiatu eguneratzen.',
        fr: 'La version actuelle ne peut pas être récupérée. Quittez l’activité et synchronisez votre progression, puis réessayez la mise à jour.',
      });
    });
    const navigation = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.navigating.set(true);
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      )
        this.navigating.set(false);
    });
    const foreground = () => {
      this.visible.set(this.document.visibilityState === 'visible');
      if (this.visible()) void this.check();
    };
    this.document.addEventListener('visibilitychange', foreground);
    window.addEventListener('pageshow', foreground);
    const savesChanged = () => this.retryRequests.update((value) => value + 1);
    window.addEventListener('storage', savesChanged);
    window.addEventListener('online', savesChanged);
    void this.check();
    const timer = setInterval(() => void this.check(), 30 * 60 * 1000);
    destroy.onDestroy(() => {
      this.stopped = true;
      versions.unsubscribe();
      unrecoverable.unsubscribe();
      navigation.unsubscribe();
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('pageshow', foreground);
      window.removeEventListener('storage', savesChanged);
      window.removeEventListener('online', savesChanged);
    });
    effect((onCleanup) => {
      this.retryRequests();
      if (!this.canReload()) return;
      let cancelled = false;
      const controller = new AbortController();
      onCleanup(() => {
        cancelled = true;
        controller.abort();
      });
      const learnerId = this.auth.user()?.uid;
      const reload = async () => {
        try {
          if (cancelled) return;
          if (!learnerId && this.saves.hasUnconfirmedEvidence()) {
            this.error.set({
              eu: 'Eguneratzea zain dago. Hasi saioa gorde gabeko aurrerapena sinkronizatzeko.',
              fr: 'Mise à jour différée. Connectez-vous pour synchroniser les sauvegardes non confirmées.',
            });
            return;
          }
          if (learnerId) {
            const { db, sdk } = await loadFirestore();
            // Also covers writes restored from IndexedDB or queued by another tab.
            await sdk.waitForPendingWrites(db);
            if (!(await this.saves.confirmRestored(learnerId))) {
              if (!cancelled)
                this.error.set({
                  eu: 'Eguneratzea zain dago: gorde gabeko aurrerapena dago. Sinkronizatu aurrerapena eta saiatu berriz.',
                  fr: 'Mise à jour différée : des sauvegardes ne sont pas confirmées. Synchronisez votre progression puis réessayez.',
                });
              return;
            }
          }
          // Only the final synchronous handoff holds the lock; offline saves must not be stalled.
          await navigator.locks.request(
            learnerSaveLock,
            { mode: 'exclusive', signal: controller.signal },
            () => {
              if (
                cancelled ||
                !this.canReload() ||
                this.saves.hasUnconfirmedEvidence() ||
                this.auth.user()?.uid !== learnerId
              )
                return;
              this.reloading = true;
              // Reloading lets Angular select one complete version, including its lazy chunks.
              this.document.location.reload();
            },
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error('App update could not confirm pending learner saves.', error);
          if (!cancelled)
            this.error.set({
              eu: 'Eguneratzea zain dago: ezin izan da aurrerapena sinkronizatu. Egiaztatu konexioa.',
              fr: 'Mise à jour différée : impossible de confirmer la synchronisation. Vérifiez votre connexion.',
            });
        }
      };
      if (!navigator.locks) {
        this.error.set({
          eu: 'Nabigatzaile honek ezin du eguneratze segurua bermatu. Eguneratu nabigatzailea.',
          fr: 'Ce navigateur ne permet pas de garantir une mise à jour sûre. Mettez votre navigateur à jour.',
        });
        return;
      }
      void reload();
    });
  }

  retry(): void {
    this.retryRequests.update((value) => value + 1);
    void this.check(true);
  }

  private canReload(): boolean {
    return (
      this.ready() &&
      this.visible() &&
      !this.navigating() &&
      !this.practice.sessionActive() &&
      !this.practice.active() &&
      !this.saves.pending() &&
      this.auth.status() === 'ready' &&
      !this.auth.pending() &&
      !this.reloading
    );
  }

  private async check(reportFailure = false): Promise<void> {
    if (this.stopped || !this.visible() || !this.network.online()) return;
    if (this.checking()) {
      this.checkRequested = true;
      return;
    }
    this.checking.set(true);
    try {
      await this.updates.checkForUpdate();
    } catch (error) {
      console.warn('App update check failed; it will be retried.', error);
      if (reportFailure)
        this.error.set({
          eu: 'Ezin izan da eguneratzea egiaztatu. Egiaztatu konexioa eta saiatu berriz.',
          fr: 'Impossible de vérifier la mise à jour. Vérifiez votre connexion puis réessayez.',
        });
    } finally {
      this.checking.set(false);
      if (this.checkRequested) {
        this.checkRequested = false;
        void this.check();
      }
    }
  }
}
