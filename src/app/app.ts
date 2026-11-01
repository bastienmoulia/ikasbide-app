import { Component, computed, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { AboutDialog } from './about-dialog';
import { BilingualText } from './bilingual-text';
import { DisplayModeService } from './display-mode.service';
import { DisplayModeControl } from './display-mode-control';
import { NetworkStatus } from './network-status';
import { PracticeLayout } from './practice-layout';
import { BookContext } from './curriculum/book-context';

@Component({
  imports: [
    A11yModule,
    MatButtonModule,
    MatDialogModule,
    DisplayModeControl,
    MatCardModule,
    MatProgressBarModule,
    MatTooltipModule,
    RouterLink,
    RouterOutlet,
    BilingualText,
    OverlayModule,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  template: `
    <a class="skip-link" href="#main">
      <app-bilingual-text eu="Edukira joan" fr="Aller au contenu" />
    </a>
    @if (!practiceLayout.active()) {
      <header>
        <a class="brand" routerLink="/" [state]="{ bookId: bookContext.bookId() }">
          <span class="brand-mark" aria-hidden="true">i</span>
          Ikasbide
        </a>
        @if (auth.status() === 'ready' && auth.user()) {
          <div class="account">
            <button
              #accountMenuOrigin="cdkOverlayOrigin"
              cdkOverlayOrigin
              class="account-trigger"
              type="button"
              aria-haspopup="dialog"
              [attr.aria-controls]="accountMenuOpen ? 'account-menu' : null"
              [attr.aria-expanded]="accountMenuOpen"
              (click)="toggleAccountMenu()"
            >
              <span class="account-name">
                @if (firstName(); as name) {
                  {{ name }}
                } @else {
                  <app-bilingual-text eu="Kontua" fr="Compte" />
                }
              </span>
              <svg class="account-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5z" />
              </svg>
            </button>
          </div>
          <ng-template
            cdkConnectedOverlay
            [cdkConnectedOverlayOrigin]="accountMenuOrigin"
            [cdkConnectedOverlayOpen]="accountMenuOpen"
            [cdkConnectedOverlayPositions]="accountMenuPositions"
            [cdkConnectedOverlayPush]="true"
            (overlayOutsideClick)="closeAccountMenu()"
            (overlayKeydown)="onAccountMenuKeydown($event)"
          >
            <section
              id="account-menu"
              class="account-menu"
              role="dialog"
              aria-modal="false"
              aria-label="Kontua / Compte"
              [cdkTrapFocus]="false"
              [cdkTrapFocusAutoCapture]="true"
            >
              <div class="account-menu-display-mode">
                <app-display-mode-control />
              </div>
              <button class="account-menu-about" mat-button type="button" (click)="openAbout()">
                <app-bilingual-text eu="Honi buruz" fr="À propos" />
              </button>
              <hr role="separator" />
              <button
                class="account-menu-sign-out"
                mat-button
                type="button"
                [disabled]="auth.pending()"
                (click)="signOut()"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zm-5 4h8a2 2 0 0 0 2-2v-3h-2v3H5V5h8v3h2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"
                  />
                </svg>
                <app-bilingual-text eu="Amaitu saioa" fr="Se déconnecter" />
              </button>
            </section>
          </ng-template>
        } @else {
          <app-display-mode-control />
        }
      </header>
    }
    <main id="main" [class.practice-mode]="practiceLayout.active()">
      @if (displayMode.persistenceUnavailable()) {
        <p class="persistence-warning" role="alert">
          <app-bilingual-text
            eu="Ezin izan da aukera gorde gailu honetan. Uneko saioan aktibo dago, baina hurrengoan berriro aukeratu beharko duzu."
            fr="Le choix n’a pas pu être enregistré sur cet appareil. Il reste actif pour cette session, mais vous devrez le choisir à nouveau la prochaine fois."
          />
        </p>
      }
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
      } @else if (auth.user()) {
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
    @if (!practiceLayout.active()) {
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
    }
  `,
})
export class App {
  protected accountMenuOpen = false;
  protected readonly accountMenuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];
  protected readonly auth = inject(AuthService);
  protected readonly displayMode = inject(DisplayModeService);
  protected readonly practiceLayout = inject(PracticeLayout);
  protected readonly network = inject(NetworkStatus);
  protected readonly bookContext = inject(BookContext);
  private readonly dialog = inject(MatDialog);
  protected readonly firstName = computed(
    () => this.auth.user()?.displayName?.trim().split(/\s+/)[0] ?? '',
  );

  protected toggleAccountMenu(): void {
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen = false;
  }

  protected onAccountMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAccountMenu();
    }
  }

  protected signOut(): void {
    void this.auth.signOut();
  }

  protected openAbout(): void {
    this.closeAccountMenu();
    this.dialog.open(AboutDialog);
  }
}
