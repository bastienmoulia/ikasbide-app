import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { Auth, User } from 'firebase/auth';
import { loadFirebaseApp } from './firebase-app';

interface AuthMessage {
  eu: string;
  fr: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly status = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly user = signal<User | null>(null);
  readonly pending = signal(false);
  readonly error = signal<AuthMessage | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  private connection?: { auth: Auth; sdk: typeof import('firebase/auth') };

  constructor() {
    void this.initialize();
  }

  async signIn(): Promise<void> {
    await this.perform(
      async ({ auth, sdk }) => {
        const provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await sdk.signInWithPopup(auth, provider);
      },
      {
        eu: 'Ezin izan da saioa hasi. Saiatu berriz.',
        fr: 'La connexion a échoué. Veuillez réessayer.',
      },
    );
  }

  async signOut(): Promise<void> {
    await this.perform(({ auth, sdk }) => sdk.signOut(auth), {
      eu: 'Ezin izan da saioa amaitu. Saioak aktibo jarraitzen du. Saiatu berriz.',
      fr: 'La déconnexion a échoué. Votre session est toujours active. Veuillez réessayer.',
    });
  }

  private async initialize(): Promise<void> {
    try {
      const [{ app, config }, sdk] = await Promise.all([
        loadFirebaseApp(),
        import('firebase/auth'),
      ]);
      const auth = sdk.getAuth(app);
      if (config.useEmulators) {
        sdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099');
      }
      this.connection = { auth, sdk };
      const unsubscribe = sdk.onAuthStateChanged(
        auth,
        (user) => {
          this.user.set(user);
          this.status.set('ready');
        },
        (error) => {
          console.error('Firebase authentication state failed.', error);
          this.status.set('unavailable');
        },
      );
      this.destroyRef.onDestroy(unsubscribe);
    } catch (error) {
      console.error('Firebase authentication initialization failed.', error);
      this.status.set('unavailable');
    }
  }

  private async perform(
    action: (connection: NonNullable<AuthService['connection']>) => Promise<unknown>,
    failureMessage: AuthMessage,
  ): Promise<void> {
    if (this.pending()) return;
    this.error.set(null);
    if (!this.connection || this.status() !== 'ready') {
      this.error.set({
        eu: 'Ezin da saioa hasi. Kargatu berriz orria berriz saiatzeko.',
        fr: 'La connexion est indisponible. Rechargez la page pour réessayer.',
      });
      return;
    }
    this.pending.set(true);
    try {
      await action(this.connection);
    } catch (error) {
      console.error('Firebase authentication operation failed.', error);
      const code = error instanceof Error && 'code' in error ? error.code : null;
      this.error.set(
        code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
          ? {
              eu: 'Saioa hasteko prozesua bertan behera utzi da. Berriz saia zaitezke.',
              fr: 'Connexion annulée. Vous pouvez réessayer.',
            }
          : code === 'auth/popup-blocked'
            ? {
                eu: 'Baimendu saioa hasteko leihoak zure nabigatzailean, eta saiatu berriz.',
                fr: 'Autorisez les fenêtres de connexion dans votre navigateur, puis réessayez.',
              }
            : code === 'auth/network-request-failed'
              ? {
                  eu: 'Ez dago sareko konexiorik. Egiaztatu Interneteko konexioa, eta saiatu berriz.',
                  fr: 'Connexion réseau indisponible. Vérifiez votre accès à Internet, puis réessayez.',
                }
              : failureMessage,
      );
    } finally {
      this.pending.set(false);
    }
  }
}
