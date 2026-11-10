export function normalizeVocabularyAnswer(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[’]/gu, "'")
    .replace(/[‐‑]/gu, '-')
    .replace(/\p{P}/gu, (punctuation) =>
      punctuation === "'" || punctuation === '-' ? punctuation : ' ',
    )
    .replace(/\s+/gu, ' ')
    .trim();
}

export function canReconstructAnswer(answer: string, words: readonly string[]): boolean {
  const available = new Map<string, number>();
  for (const word of words.map(normalizeAnswer)) {
    if (!word) continue;
    available.set(word, (available.get(word) ?? 0) + 1);
  }
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  const labels = [...available.keys()];
  const counts = [...available.values()];
  const failed = new Set<string>();

  function reconstruct(offset: number): boolean {
    if (offset === normalized.length) return true;
    const state = `${offset}:${counts.join(',')}`;
    if (failed.has(state)) return false;
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      if (!counts[index] || !normalized.startsWith(label, offset)) continue;
      const end = offset + label.length;
      if (end < normalized.length && normalized[end] !== ' ') continue;
      counts[index] -= 1;
      const matched = reconstruct(end === normalized.length ? end : end + 1);
      counts[index] += 1;
      if (matched) return true;
    }
    failed.add(state);
    return false;
  }

  return reconstruct(0);
}
