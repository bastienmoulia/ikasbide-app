import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from './auth.service';

@Component({
  imports: [MatButtonModule, MatCardModule, MatProgressBarModule],
  selector: 'app-root',
  styleUrl: './app.scss',
  template: `
    <a class="skip-link" href="#main">Aller au contenu</a>
    <header>
      <a class="brand" href="/" aria-label="Ikasbide, accueil">
        <span class="brand-mark" aria-hidden="true">i</span>
        Ikasbide
      </a>
      <span class="tagline">Votre compagnon de basque</span>
    </header>
    <main id="main">
      @if (auth.error(); as error) {
        <p role="alert">{{ error }}</p>
      }
      @if (auth.status() === 'loading') {
        <p role="status">Chargement de votre session…</p>
        <mat-progress-bar mode="indeterminate" aria-label="Chargement de votre session" />
      } @else if (auth.status() === 'unavailable') {
        <h1>Connexion indisponible</h1>
        <p role="alert">
          Impossible de préparer la connexion. Vérifiez votre accès à Internet. Si le problème
          persiste, la configuration Firebase doit être vérifiée par le responsable de
          l’application.
        </p>
        <a mat-stroked-button href="/">Réessayer</a>
      } @else if (auth.user(); as user) {
        <div class="account">
          <span>{{ user.displayName || user.email || 'Compte Google connecté' }}</span>
          <button
            mat-stroked-button
            type="button"
            [disabled]="auth.pending()"
            (click)="auth.signOut()"
          >
            Se déconnecter
          </button>
        </div>
        <p class="eyebrow">Votre espace d’apprentissage</p>
        <h1>Votre parcours</h1>
        <p class="lead">Retrouvez ici les unités, chapitres et séquences de votre parcours.</p>
        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>Le parcours se prépare</h2>
            <p>Aucun chapitre publié pour le moment.</p>
            <p class="muted">
              Les premiers contenus seront ajoutés prochainement. Vous pouvez déjà installer
              l’application pour la retrouver facilement.
            </p>
          </mat-card-content>
        </mat-card>
      } @else {
        <section class="intro">
          <p class="eyebrow">Ongi etorri · Bienvenue</p>
          <h1>Le basque, à votre rythme.</h1>
          <p class="lead">
            Un espace personnel pour apprendre et pratiquer, en suivant la progression d’Ikasbide
            metodoa.
          </p>
        </section>
        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>Un petit pas, chaque fois.</h2>
            <p>Connectez-vous pour accéder à votre parcours d’apprentissage.</p>
            <button
              mat-flat-button
              type="button"
              [disabled]="auth.pending()"
              (click)="auth.signIn()"
            >
              Se connecter avec Google
            </button>
            @if (auth.pending()) {
              <p role="status">Connexion en cours…</p>
            }
            <p class="muted">L’accès est ouvert à toute personne disposant d’un compte Google.</p>
          </mat-card-content>
        </mat-card>
      }
    </main>
    <footer>Apprendre, pratiquer, prendre confiance.</footer>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
