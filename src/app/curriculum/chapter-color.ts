/** The book's accent cycle within each unit: chapters 1 and 6 are red, 2 and 7 purple, etc. */
const cycle = ['#b3261e', '#6b3fa0', '#1f5fa8', '#2e7d32', '#b45309'];

export function chapterColor(chapterNumber: number): string {
  return cycle[(chapterNumber - 1) % cycle.length];
}
