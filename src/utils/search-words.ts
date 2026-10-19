const OUTER_PUNCTUATION = /^[^a-z0-9_]+|[^a-z0-9_]+$/g;

/** A lowercased name word without the punctuation around it, like the quotes of "health" */
export function trimNameWord(word: string): string {
  return word.replace(OUTER_PUNCTUATION, "");
}

/**
 * Joins a tag that stands alone, like "flag:", with the word after it. A tag followed by another
 * tag, or by nothing, stays as it is
 */
export function joinLoneTags(
  words: readonly string[],
  isLoneTag: (word: string) => boolean,
  isTag: (word: string) => boolean,
): string[] {
  const joined: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = i + 1 < words.length ? words[i + 1] : undefined;
    if (next !== undefined && isLoneTag(word.toLowerCase()) && !isTag(next.toLowerCase())) {
      joined.push(word + next);
      i++;
    } else {
      joined.push(word);
    }
  }
  return joined;
}
