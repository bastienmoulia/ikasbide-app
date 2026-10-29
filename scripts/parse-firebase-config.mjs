export function parseFirebaseConfig(value) {
  let source = value.trim();
  source = source.replace(/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*/, '');
  source = source.replace(/;\s*$/, '');

  if (!source.startsWith('{')) {
    source = `{${source}}`;
  }

  let normalized = '';
  let quote = null;
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quote) {
      normalized += character;
      if (character === '\\') {
        normalized += source[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      index++;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      normalized += character;
      index++;
      continue;
    }

    if (character === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(source[nextIndex] ?? '')) {
        nextIndex++;
      }
      if (source[nextIndex] === '}') {
        normalized += source.slice(index + 1, nextIndex);
        index = nextIndex;
        continue;
      }
    }

    normalized += character;
    index++;
    if (character !== '{' && character !== ',') {
      continue;
    }

    while (/\s/.test(source[index] ?? '')) {
      normalized += source[index++];
    }
    const key = /^[A-Za-z_$][\w$]*/.exec(source.slice(index))?.[0];
    if (key && /^\s*:/.test(source.slice(index + key.length))) {
      normalized += `"${key}"`;
      index += key.length;
    }
  }

  const config = JSON.parse(normalized);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Firebase configuration must be an object.');
  }
  return config;
}
