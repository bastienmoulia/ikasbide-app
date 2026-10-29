import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { BilingualText } from '../bilingual-text';
import { NetworkStatus } from '../network-status';
import { ActivityPlayer, type ItemAttempt } from './activity-player';
import { AttemptService, type AttemptSummary } from './attempt.service';
import { chapterColor } from './chapter-color';
import {
  contentKindLabels,
  chapterNotPublishedMessage,
  externalLinkNeedsNetworkMessage,
  externalLinkOfflineMessage,
  loadErrorMessage,
  loadingMessage,
} from './content-labels';
import { CurriculumService } from './curriculum.service';

@Component({
  selector: 'app-sequence-page',
  imports: [ActivityPlayer, BilingualText, MatProgressBarModule, RouterLink],
  styleUrls: ['./curriculum.css', './sequence-page.css'],
  host: { '[style.--chapter-accent]': 'accent()' },
  template: `
    <a class="back" [routerLink]="['/chapitres', chapterId()]">
      <app-bilingual-text eu="Kapitulura itzuli" fr="Retour au chapitre" />
    </a>
    @if (chapter.isLoading()) {
      <p id="sequence-loading" role="status">
        <app-bilingual-text [eu]="loading.eu" [fr]="loading.fr" />
      </p>
      <mat-progress-bar mode="indeterminate" aria-labelledby="sequence-loading" />
    } @else if (chapter.error(); as error) {
      @let message = errorMessage(error);
      <p role="alert">
        <app-bilingual-text [eu]="message.eu" [fr]="message.fr" />
      </p>
    } @else if (!chapter.value()) {
      <p role="alert">
        <app-bilingual-text [eu]="notPublished.eu" [fr]="notPublished.fr" />
      </p>
    } @else if (position(); as position) {
      @let chapter = position.chapter;
      @let sequence = position.sequence;
      <p class="eyebrow">
        <span class="chapter-marker" aria-hidden="true">{{ chapter.number }}</span>
        <app-bilingual-text
          [eu]="chapter.number + '. kapitulua · ' + sequence.letter + ' sekuentzia'"
          [fr]="'Chapitre ' + chapter.number + ' · Séquence ' + sequence.letter"
        />
      </p>
      <h1>
        <app-bilingual-text [eu]="sequence.title.eu" [fr]="sequence.title.fr" />
      </h1>
      @if (attemptSummary(); as summary) {
        <p class="attempt-summary muted" role="status">
          <app-bilingual-text
            [eu]="'Saiakera sinkronizatuak: ' + summary.synced + ' · zain: ' + summary.pending"
            [fr]="
              'Tentatives synchronisées : ' + summary.synced + ' · en attente : ' + summary.pending
            "
          />
        </p>
      }
      @if (attempts.error(); as error) {
        <p role="alert">
          <app-bilingual-text [eu]="error.eu" [fr]="error.fr" />
        </p>
      }
      <ol class="contents">
        @for (content of sequence.contents; track content.id) {
          <li>
            <article [attr.aria-labelledby]="'content-' + content.id">
              <p class="kind">
                <app-bilingual-text
                  [eu]="kindLabels[content.kind].eu"
                  [fr]="kindLabels[content.kind].fr"
                />
              </p>
              <h2 [id]="'content-' + content.id">
                <app-bilingual-text [eu]="content.title.eu" [fr]="content.title.fr" />
              </h2>
              @switch (content.kind) {
                @case ('note') {
                  <p><app-bilingual-text [eu]="content.body.eu" [fr]="content.body.fr" /></p>
                }
                @case ('dialogue') {
                  <dl class="dialogue">
                    @for (line of content.lines; track $index) {
                      <dt>{{ line.speaker }}</dt>
                      <dd><app-bilingual-text [eu]="line.text.eu" [fr]="line.text.fr" /></dd>
                    }
                  </dl>
                }
                @case ('external-link') {
                  <p>
                    <app-bilingual-text
                      [eu]="content.description.eu"
                      [fr]="content.description.fr"
                    />
                  </p>
                  <a [href]="content.url" target="_blank" rel="noopener noreferrer">
                    <app-bilingual-text
                      [eu]="content.title.eu + ' (kanpoko orria)'"
                      [fr]="content.title.fr + ' (page externe)'"
                    />
                  </a>
                  <p class="muted">
                    @let availability = network.online() ? needsNetwork : offlineLink;
                    <app-bilingual-text [eu]="availability.eu" [fr]="availability.fr" />
                  </p>
                }
                @case ('oral-prompt') {
                  <p>
                    <app-bilingual-text
                      [eu]="content.instructions.eu"
                      [fr]="content.instructions.fr"
                    />
                  </p>
                  <p class="muted">
                    <app-bilingual-text
                      eu="Nahi baduzu egiteko jarduera; ez da automatikoki zuzentzen."
                      fr="Activité à faire si vous le souhaitez ; elle n’est pas corrigée automatiquement."
                    />
                  </p>
                }
                @default {
                  <p>
                    <app-bilingual-text
                      [eu]="content.instructions.eu"
                      [fr]="content.instructions.fr"
                    />
                  </p>
                  <app-activity-player
                    [activity]="content"
                    (attempted)="recordAttempt(chapter.id, $event)"
                  />
                }
              }
            </article>
          </li>
        }
      </ol>
      <nav class="pager">
        @if (position.previous; as previous) {
          <a [routerLink]="['/chapitres', chapter.id, 'sequences', previous.id]">
            <app-bilingual-text
              [eu]="'Aurreko sekuentzia: ' + previous.letter"
              [fr]="'Séquence précédente : ' + previous.letter"
            />
          </a>
        }
        @if (position.next; as next) {
          <a class="next" [routerLink]="['/chapitres', chapter.id, 'sequences', next.id]">
            <app-bilingual-text
              [eu]="'Hurrengo sekuentzia: ' + next.letter"
              [fr]="'Séquence suivante : ' + next.letter"
            />
          </a>
        }
      </nav>
    } @else {
      <p role="alert">
        <app-bilingual-text
          eu="Sekuentzia hau ez dago kapitulu honetan."
          fr="Cette séquence n’existe pas dans ce chapitre."
        />
      </p>
    }
  `,
})
export class SequencePage {
  readonly chapterId = input.required<string>();
  readonly sequenceId = input.required<string>();
  private readonly curriculum = inject(CurriculumService);
  private readonly auth = inject(AuthService);
  protected readonly attempts = inject(AttemptService);
  protected readonly network = inject(NetworkStatus);
  protected readonly chapter = resource({
    params: () => this.chapterId(),
    loader: ({ params }) => this.curriculum.chapter(params),
  });
  protected readonly position = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    const index = chapter?.sequences.findIndex(({ id }) => id === this.sequenceId()) ?? -1;
    if (!chapter || index < 0) return null;
    return {
      chapter,
      sequence: chapter.sequences[index],
      previous: chapter.sequences[index - 1],
      next: chapter.sequences[index + 1],
    };
  });
  protected readonly accent = computed(() => {
    const chapter = this.chapter.hasValue() ? this.chapter.value() : null;
    return chapter ? chapterColor(chapter.number) : null;
  });
  /** A practice session lasts one visit to a sequence: opening, reloading or changing it starts a new one. */
  private readonly practiceSession = computed(() => {
    this.chapterId();
    this.sequenceId();
    return crypto.randomUUID();
  });
  protected readonly attemptSummary = signal<AttemptSummary | null>(null);
  protected readonly kindLabels = contentKindLabels;
  protected readonly loading = loadingMessage;
  protected readonly notPublished = chapterNotPublishedMessage;
  protected readonly errorMessage = loadErrorMessage;
  protected readonly needsNetwork = externalLinkNeedsNetworkMessage;
  protected readonly offlineLink = externalLinkOfflineMessage;

  constructor() {
    effect((onCleanup) => {
      const learner = this.auth.user();
      const position = this.position();
      this.attemptSummary.set(null);
      if (!learner || !position) return;
      const itemIds = new Set(
        position.sequence.contents.flatMap((content) =>
          content.type === 'activity' && 'items' in content
            ? content.items.map(({ id }) => id)
            : [],
        ),
      );
      if (!itemIds.size) return;
      onCleanup(
        this.attempts.watch(learner.uid, position.chapter.id, itemIds, (summary) =>
          this.attemptSummary.set(summary),
        ),
      );
    });
  }

  protected recordAttempt(chapterId: string, { itemId, outcome }: ItemAttempt): void {
    const learner = this.auth.user();
    if (!learner) return;
    void this.attempts.record(learner.uid, {
      chapterId,
      itemId,
      outcome,
      sessionId: this.practiceSession(),
    });
  }
}
