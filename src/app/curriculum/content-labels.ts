import type { BilingualText, SequenceContent } from './curriculum.model';
import { CurriculumUnavailableOfflineError } from './curriculum-unavailable-offline';

export const contentKindLabels: Record<SequenceContent['kind'], BilingualText> = {
  note: { eu: 'Oharra', fr: 'Note' },
  dialogue: { eu: 'Elkarrizketa', fr: 'Dialogue' },
  'external-link': { eu: 'Kanpoko baliabidea', fr: 'Ressource externe' },
  'gap-fill': { eu: 'Hutsuneak betetzea', fr: 'Texte à trous' },
  translation: { eu: 'Itzulpena', fr: 'Traduction' },
  'multiple-choice': { eu: 'Aukera anitzeko galdera', fr: 'QCM' },
  'word-order': { eu: 'Hitzen ordena', fr: 'Remise en ordre' },
  matching: { eu: 'Lotu', fr: 'Associer' },
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

export const bookNotPublishedMessage: BilingualText = {
  eu: 'Liburu hau ez dago argitaratuta.',
  fr: 'Ce livre n’est pas publié.',
};

export const externalLinkNeedsNetworkMessage: BilingualText = {
  eu: 'Interneteko konexioa behar da; ez dago gailu honetan gordeta.',
  fr: 'Nécessite une connexion Internet ; non enregistré sur cet appareil.',
};

export const externalLinkOfflineMessage: BilingualText = {
  eu: 'Ez dago erabilgarri konexiorik gabe: kanpoko orri honek Internet behar du.',
  fr: 'Indisponible hors ligne : cette page externe nécessite Internet.',
};

export const unavailableOfflineMessage: BilingualText = {
  eu: 'Eduki hau ez da oraindik gailu honetan kontsultatu, eta ez dago erabilgarri konexiorik gabe. Konektatu Internetera ikusteko.',
  fr: 'Ce contenu n’a pas encore été consulté sur cet appareil et n’est pas disponible hors ligne. Connectez-vous à Internet pour l’afficher.',
};

/** Chooses the learner-facing message for a failed curriculum read. */
export function loadErrorMessage(error: unknown): BilingualText {
  return error instanceof CurriculumUnavailableOfflineError
    ? unavailableOfflineMessage
    : loadFailedMessage;
}
