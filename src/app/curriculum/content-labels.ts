import type { BilingualText, SequenceContent } from './curriculum.model';

export const contentKindLabels: Record<SequenceContent['kind'], BilingualText> = {
  note: { eu: 'Oharra', fr: 'Note' },
  dialogue: { eu: 'Elkarrizketa', fr: 'Dialogue' },
  'external-link': { eu: 'Kanpoko baliabidea', fr: 'Ressource externe' },
  'gap-fill': { eu: 'Hutsuneak betetzea', fr: 'Texte à trous' },
  translation: { eu: 'Itzulpena', fr: 'Traduction' },
  'multiple-choice': { eu: 'Aukera anitzeko galdera', fr: 'QCM' },
  'word-order': { eu: 'Hitzen ordena', fr: 'Remise en ordre' },
  'oral-prompt': { eu: 'Ahozko jarduera, aukerakoa', fr: 'Activité orale facultative' },
};

export const loadingMessage: BilingualText = {
  eu: 'Ibilbidea kargatzen…',
  fr: 'Chargement du parcours…',
};

export const loadFailedMessage: BilingualText = {
  eu: 'Ezin izan da ibilbidea kargatu. Egiaztatu Interneteko konexioa eta kargatu berriz orria.',
  fr: 'Impossible de charger le parcours. Vérifiez votre accès à Internet puis rechargez la page.',
};

export const chapterNotPublishedMessage: BilingualText = {
  eu: 'Kapitulu hau ez dago argitaratuta.',
  fr: 'Ce chapitre n’est pas publié.',
};
