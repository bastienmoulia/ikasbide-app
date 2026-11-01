import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./curriculum/curriculum-home').then((m) => m.CurriculumHome),
  },
  {
    path: ':bookId/:chapterId/:sequenceId',
    loadComponent: () => import('./curriculum/sequence-page').then((m) => m.SequencePage),
  },
  {
    path: ':bookId/:chapterId',
    loadComponent: () => import('./curriculum/chapter-page').then((m) => m.ChapterPage),
  },
  { path: '**', redirectTo: '' },
];
