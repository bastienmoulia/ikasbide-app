// Curriculum contract shared by the maintainer import (tools/curriculum) and the app.
// See docs/curriculum.md. Keys are English; learner-facing text is bilingual.

export interface BilingualText {
  eu: string;
  fr: string;
}

export interface BookTitle {
  eu: string;
  fr?: string;
}

export interface CurriculumSource {
  $schema?: string;
  schemaVersion: 2;
  id: string;
  title: BookTitle;
  chapters: Chapter[];
}

export interface ChapterSource {
  $schema?: string;
  schemaVersion: 2;
  title: BilingualText;
  objectives: LearningObjective[];
  sequences: Sequence[];
}

export interface Chapter extends Omit<ChapterSource, '$schema' | 'schemaVersion'> {
  id: string;
  number: number;
}

export interface LearningObjective {
  id: string;
  label: BilingualText;
}

export interface Sequence {
  id: string;
  letter: string;
  title: BilingualText;
  contents: SequenceContent[];
}

export type SequenceContent = Resource | Activity;

export type Resource = NoteResource | DialogueResource | ExternalLinkResource;

interface ResourceBase {
  type: 'resource';
  id: string;
  title: BilingualText;
}

/** A note is either two parallel paragraphs, or one free Markdown text (tables, images…). */
export type NoteResource = BilingualNoteResource | MarkdownNoteResource;

export interface BilingualNoteResource extends ResourceBase {
  kind: 'note';
  body: BilingualText;
}

export interface MarkdownNoteResource extends ResourceBase {
  kind: 'note';
  markdown: string;
}

export interface DialogueResource extends ResourceBase {
  kind: 'dialogue';
  lines: { speaker: string; text: BilingualText }[];
}

export interface ExternalLinkResource extends ResourceBase {
  kind: 'external-link';
  description: BilingualText;
  url: string;
}

export type Activity =
  | GapFillActivity
  | TranslationActivity
  | MultipleChoiceActivity
  | WordOrderActivity
  | MatchingActivity
  | OralPromptActivity;

export type ActivityKind = Activity['kind'];

interface ActivityBase {
  type: 'activity';
  id: string;
  title: BilingualText;
  instructions: BilingualText;
}

interface ItemBase {
  id: string;
  objectiveIds: string[];
  /** Optional authored help (vocabulary, example phrasing) shown on demand; never the answer. */
  hint?: BilingualText[];
}

export interface GapFillItem extends ItemBase {
  prompt: BilingualText;
  acceptedAnswers: string[];
  warningAnswers?: string[];
}

export interface TranslationItem extends ItemBase {
  direction: 'eu-fr' | 'fr-eu';
  source: string;
  acceptedAnswers: string[];
  warningAnswers?: string[];
}

export interface MultipleChoiceItem extends ItemBase {
  prompt: BilingualText;
  choices: { id: string; lang: 'eu' | 'fr'; text: string }[];
  correctChoiceIds: string[];
}

export interface WordOrderItem extends ItemBase {
  prompt: BilingualText;
  words: string[];
  acceptedAnswers: string[];
  warningAnswers?: string[];
}

/** Every Basque expression must be linked to its French equivalent. */
export interface MatchingItem extends ItemBase {
  pairs: BilingualText[];
}

export interface GapFillActivity extends ActivityBase {
  kind: 'gap-fill';
  items: GapFillItem[];
}

export interface TranslationActivity extends ActivityBase {
  kind: 'translation';
  items: TranslationItem[];
}

export interface MultipleChoiceActivity extends ActivityBase {
  kind: 'multiple-choice';
  items: MultipleChoiceItem[];
}

export interface WordOrderActivity extends ActivityBase {
  kind: 'word-order';
  items: WordOrderItem[];
}

export interface MatchingActivity extends ActivityBase {
  kind: 'matching';
  items: MatchingItem[];
}

/** Optional oral or group task: shown as instructions only, never auto-corrected. */
export interface OralPromptActivity extends ActivityBase {
  kind: 'oral-prompt';
}

export interface ChapterSummary {
  id: string;
  number: number;
  title: BilingualText;
}

/** Firestore `books/{bookId}`. */
export interface PublishedBook {
  title: BookTitle;
  chapters: ChapterSummary[];
}

export interface PublishedChapter extends Omit<Chapter, 'id'> {
  bookId: string;
}
