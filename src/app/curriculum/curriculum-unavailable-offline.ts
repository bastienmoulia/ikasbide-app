/** Thrown when content was never loaded on this device and the network is unreachable. */
export class CurriculumUnavailableOfflineError extends Error {
  constructor() {
    super('Curriculum content is not cached on this device.');
    this.name = 'CurriculumUnavailableOfflineError';
  }
}
