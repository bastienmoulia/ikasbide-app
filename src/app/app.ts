import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { BilingualText } from './bilingual-text';
import { NetworkStatus } from './network-status';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    RouterLink,
    RouterOutlet,
    BilingualText,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  template: `
    <a class="skip-link" href="#main">
      <app-bilingual-text eu="Edukira joan" fr="Aller au contenu" />
    </a>
    <header>
      <a class="brand" routerLink="/">
        <span class="brand-mark" aria-hidden="true">i</span>
        Ikasbide
      </a>
      <span class="tagline">
        <app-bilingual-text eu="Euskara ikasteko laguna" fr="Votre compagnon de basque" />
      </span>
    </header>
    <main id="main">
      @if (!network.online()) {
        <p class="offline-status" role="status">
          <app-bilingual-text
            eu="Konexiorik gabe zaude. Gailu honetan lehendik kontsultatutako edukia bakarrik dago erabilgarri."
            fr="Vous êtes hors ligne. Seul le contenu déjà consulté sur cet appareil est disponible."
          />
        </p>
      }
      @if (auth.error(); as error) {
        <p role="alert">
          <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
        </p>
      }
      @if (auth.status() === 'loading') {
        <p id="session-loading" role="status">
          <app-bilingual-text eu="Saioa kargatzen…" fr="Chargement de votre session…" />
        </p>
        <mat-progress-bar mode="indeterminate" aria-labelledby="session-loading" />
      } @else if (auth.status() === 'unavailable') {
        <h1>
          <app-bilingual-text eu="Ezin da saioa hasi" fr="Connexion indisponible" />
        </h1>
        <p role="alert">
          <app-bilingual-text
            eu="Ezin izan da saioa hasteko konexioa prestatu. Egiaztatu Interneteko konexioa. Arazoak jarraitzen badu, aplikazioaren arduradunak Firebase konfigurazioa egiaztatu behar du."
            fr="Impossible de préparer la connexion. Vérifiez votre accès à Internet. Si le problème persiste, la configuration Firebase doit être vérifiée par le responsable de l’application."
          />
        </p>
        <a mat-stroked-button href="/">
          <app-bilingual-text eu="Berriz saiatu" fr="Réessayer" />
        </a>
      } @else if (auth.user(); as user) {
        <div class="account">
          <span>
            @if (user.displayName || user.email; as identity) {
              {{ identity }}
            } @else {
              <app-bilingual-text eu="Google kontua konektatuta" fr="Compte Google connecté" />
            }
          </span>
          <button
            mat-stroked-button
            type="button"
            [disabled]="auth.pending()"
            (click)="auth.signOut()"
          >
            <app-bilingual-text eu="Amaitu saioa" fr="Se déconnecter" />
          </button>
        </div>
        <router-outlet />
      } @else {
        <section class="intro">
          <p class="eyebrow">
            <app-bilingual-text eu="Ongi etorri" fr="Bienvenue" />
          </p>
          <h1>
            <app-bilingual-text eu="Euskara, zure erritmoan." fr="Le basque, à votre rythme." />
          </h1>
          <p class="lead">
            <app-bilingual-text
              eu="Ikasbide metodoaren urratsei jarraituz ikasteko eta praktikatzeko zure gunea."
              fr="Un espace personnel pour apprendre et pratiquer, en suivant la progression d’Ikasbide metodoa."
            />
          </p>
        </section>
        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>
              <app-bilingual-text
                eu="Pauso txiki bat aldi bakoitzean."
                fr="Un petit pas, chaque fois."
              />
            </h2>
            <p>
              <app-bilingual-text
                eu="Hasi saioa zure ikaskuntza-ibilbidea ikusteko."
                fr="Connectez-vous pour accéder à votre parcours d’apprentissage."
              />
            </p>
            <button
              mat-flat-button
              type="button"
              [disabled]="auth.pending()"
              (click)="auth.signIn()"
            >
              <app-bilingual-text eu="Hasi saioa Google bidez" fr="Se connecter avec Google" />
            </button>
            @if (auth.pending()) {
              <p role="status">
                <app-bilingual-text eu="Saioa hasten…" fr="Connexion en cours…" />
              </p>
            }
            <p class="muted">
              <app-bilingual-text
                eu="Google kontua duen edonor sar daiteke."
                fr="L’accès est ouvert à toute personne disposant d’un compte Google."
              />
            </p>
          </mat-card-content>
        </mat-card>
      }
    </main>
    <footer>
      <app-bilingual-text
        eu="Ikasi, praktikatu, konfiantza hartu."
        fr="Apprendre, pratiquer, prendre confiance."
      />
      <p class="legal-note">
        <app-bilingual-text
          eu="Ikasbide metodoaren liburuaren osagarria da, ez du ordezkatzen; liburua behar da erabiltzeko."
          fr="Cette application complète le livre Ikasbide metodoa, mais ne le remplace pas ; le livre est nécessaire pour l’utiliser."
        />
      </p>
      <nav class="org-links" aria-label="Lotura erabilgarriak / Liens utiles">
        <a href="https://www.aek.eus/" target="_blank" rel="noopener noreferrer">AEK</a>
        <a href="https://ikas.eus/" target="_blank" rel="noopener noreferrer">IKAS</a>
      </nav>
    </footer>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly network = inject(NetworkStatus);
}
