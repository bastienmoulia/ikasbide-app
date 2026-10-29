import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./curriculum/curriculum-home').then((m) => m.CurriculumHome),
  },
  {
    path: 'chapitres/:chapterId',
    loadComponent: () => import('./curriculum/chapter-page').then((m) => m.ChapterPage),
  },
  {
    path: 'chapitres/:chapterId/sequences/:sequenceId',
    loadComponent: () => import('./curriculum/sequence-page').then((m) => m.SequencePage),
  },
  { path: '**', redirectTo: '' },
];
