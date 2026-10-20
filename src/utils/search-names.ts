import { serverClassName } from "../data/derived";
import {
  combineMatches,
  isBetterMatch,
  PATTERN_CACHE_SIZE,
  scoreName,
  TIER_FUZZY,
  TIER_PREFIX,
  TIER_WORD_START,
  type NameMatch,
} from "./match-score";
import type { DesignName, ItemName, SearchEntry } from "./search-index";
import { NO_WORDS, type MatchSource, type WordMatch } from "./search-types";

export function wordMatch(
  word: string,
  source: MatchSource,
  text: string,
  match: NameMatch,
  nameTier?: number,
): WordMatch {
  return {
    word,
    source,
    text,
    nameTier,
    tier: match.tier,
    score: match.score,
    ranges: match.ranges,
  };
}

const pairedPatterns = new Map<string, string>();

/** A lowercase pattern as the server class is named: c_foo is cfoo */
function pairedPattern(pattern: string): string {
  let paired = pairedPatterns.get(pattern);
  if (paired === undefined) {
    if (pairedPatterns.size >= PATTERN_CACHE_SIZE) pairedPatterns.clear();
    paired = serverClassName(pattern.replace(/\bc_/g, "C_")).toLowerCase();
    pairedPatterns.set(pattern, paired);
  }
  return paired;
}

/** Ranges in a client class name made from ranges in its server class name, C_Foo from CFoo */
function clientRanges(ranges: number[]): number[] {
  return ranges.map((index, i) => {
    const isEnd = i % 2 === 1;
    if (isEnd) return index >= 2 ? index + 1 : index;
    return index >= 1 ? index + 1 : index;
  });
}

/**
 * The better of a match of the whole name and a match of the name without its start, which is
 * `skipped` letters shorter. The ranges are in the whole name
 */
function betterWithoutStart(
  pattern: string,
  whole: NameMatch | null,
  rest: string,
  restLower: string,
  skipped: number,
): NameMatch | null {
  const match = scoreName(pattern, rest, restLower, false);
  if (match === null || !isBetterMatch(match, whole)) return whole;

  const ranges = match.ranges.map((index) => index + skipped);
  return { tier: match.tier, score: match.score, ranges };
}

/**
 * The pattern against a name. A match that doesn't start the name is scored again against the name
 * without its class prefix, so "gamerules" starts CGameRules. The better match wins, with ranges in
 * the name. `unprefixed` is the name without its prefix, null when it has none
 */
function scoreClassName(
  pattern: string,
  name: string,
  lower: string,
  unprefixed: DesignName | null,
  fuzzy: boolean,
): NameMatch | null {
  const whole = scoreName(pattern, name, lower, fuzzy);
  if (unprefixed === null || whole === null) return whole;
  if (whole.tier < TIER_WORD_START || whole.tier >= TIER_FUZZY) return whole;

  const prefixLength = name.length - unprefixed.name.length;
  return betterWithoutStart(pattern, whole, unprefixed.name, unprefixed.lower, prefixLength);
}

/**
 * The pattern against a declaration name, and against the pattern and name as the server class
 * is named, so CFoo and C_Foo hit the same way. The better one wins, with ranges in the name
 */
export function scoreDeclarationName(
  pattern: string,
  entry: SearchEntry,
  fuzzy: boolean,
): NameMatch | null {
  const { name } = entry.declaration;
  const { unprefixed } = entry;
  const direct = scoreClassName(pattern, name, entry.lower, unprefixed, fuzzy);
  const pairedText = pairedPattern(pattern);
  const { paired } = entry;
  if (paired === null && pairedText === pattern) return direct;

  const target = paired ?? { name, lower: entry.lower };
  const match = scoreClassName(pairedText, target.name, target.lower, unprefixed, fuzzy);
  if (match === null || !isBetterMatch(match, direct)) return direct;
  if (paired === null) return match;
  return { tier: match.tier, score: match.score, ranges: clientRanges(match.ranges) };
}

/** Whether a word is written like an entity design name, with an underscore */
function isDesignNameWord(word: string): boolean {
  return word.includes("_");
}

/**
 * The word against an entity design name. A design name is a category and a noun, like
 * weapon_c4. A word that starts a design name says no more than a word that starts a word of a
 * class name. Only a word written like a design name keeps its prefix match
 */
function scoreDesignName(word: string, designName: DesignName, fuzzy: boolean): NameMatch | null {
  const match = scoreName(word, designName.name, designName.lower, fuzzy);
  if (match === null || match.tier !== TIER_PREFIX || isDesignNameWord(word)) return match;
  return { tier: TIER_WORD_START, score: match.score, ranges: match.ranges };
}

/** Whether a design name's match of a word takes over from the best match so far */
function designNameWins(
  word: string,
  match: NameMatch,
  best: NameMatch | null,
  bestSource: MatchSource,
): boolean {
  if (best === null) return true;
  if (bestSource === "designName") return isBetterMatch(match, best);
  // Written like a design name, the word goes to one that matches as well as the declaration name
  if (isDesignNameWord(word)) return !isBetterMatch(best, match);
  // A plain word goes to the declaration name, unless a design name matches it in a better tier
  return match.tier < best.tier;
}

/**
 * The word against a declaration name and its entity design names, the best one. The declaration
 * name is credited when a design name matches the word in the same tier. A word that a design
 * name won keeps the tier the declaration name matched with
 */
function matchClassWord(word: string, entry: SearchEntry, fuzzy: boolean): WordMatch | null {
  if (word.startsWith("m_")) return null;
  const { name } = entry.declaration;
  let best = scoreDeclarationName(word, entry, fuzzy);
  const nameTier = best?.tier;
  let source: MatchSource = "name";
  let text = name;

  for (const designName of entry.designNames) {
    const match = scoreDesignName(word, designName, fuzzy);
    if (match === null) continue;

    if (designNameWins(word, match, best, source)) {
      best = match;
      source = "designName";
      text = designName.name;
    }
  }

  if (best === null) return null;
  return wordMatch(word, source, text, best, source === "designName" ? nameTier : undefined);
}

/**
 * The word against a field or member name. Fields are scored by their name without the prefix
 * too, and the better one wins with its ranges moved back to the full name
 */
export function scoreItem<T>(word: string, name: ItemName<T>): NameMatch | null {
  const raw = scoreName(word, name.name, name.lower, false);
  if (name.stripped === null) return raw;

  return betterWithoutStart(word, raw, name.stripped, name.strippedLower, name.strippedStart);
}

export interface ItemWords {
  classSide: readonly WordMatch[];
  itemSide: readonly WordMatch[];
  tier: number;
  score: number;
}

const itemScratch: (NameMatch | null)[] = [];
const matchedScratch: WordMatch[] = [];

/**
 * Splits the name words between a field or member and its declaration. Every word the item
 * matches is the item's. The other words have to match the declaration. Null when a word matches
 * neither, or when no word matches the item and `needItemWord` is set.
 *
 * When the declaration's name has every word, the item has all of them or none. A mix would
 * only list the item for words its declaration already explains
 */
function matchSplitWords<T>(
  words: string[],
  classWords: (WordMatch | null)[],
  classMatchesAll: boolean,
  name: ItemName<T>,
  source: MatchSource,
  needItemWord: boolean,
): ItemWords | null {
  let itemCount = 0;
  for (let i = 0; i < words.length; i++) {
    const match = scoreItem(words[i], name);
    if (match === null && classWords[i] === null) return null;
    if (match !== null) itemCount++;
    itemScratch[i] = match;
  }
  if (needItemWord && itemCount === 0) return null;
  if (classMatchesAll && itemCount > 0 && itemCount < words.length) return null;

  // Most hits have words on one side only, which gets no list of its own
  let itemSide: WordMatch[] | null = null;
  let classSide: WordMatch[] | null = null;
  matchedScratch.length = 0;
  for (let i = 0; i < words.length; i++) {
    const itemMatch = itemScratch[i];
    let matched: WordMatch;
    if (itemMatch) {
      matched = wordMatch(words[i], source, name.name, itemMatch);
      itemSide ??= [];
      itemSide.push(matched);
    } else {
      matched = classWords[i]!;
      classSide ??= [];
      classSide.push(matched);
    }
    matchedScratch.push(matched);
  }

  const { tier, score } = combineMatches(matchedScratch);
  return { classSide: classSide ?? NO_WORDS, itemSide: itemSide ?? NO_WORDS, tier, score };
}

/** Whether every word is in the name, a joined match can't be without them */
function hasAllWords(lower: string, words: readonly string[]): boolean {
  for (const word of words) {
    if (!lower.includes(word)) return false;
  }
  return true;
}

/** The best of the joined forms of the words against an item name, with the form that matched */
function scoreItemJoined<T>(
  words: readonly string[],
  forms: readonly string[],
  name: ItemName<T>,
): { form: string; match: NameMatch } | null {
  if (!hasAllWords(name.lower, words)) return null;

  let best: { form: string; match: NameMatch } | null = null;
  for (const form of forms) {
    const match = scoreItem(form, name);
    if (match !== null && (best === null || isBetterMatch(match, best.match))) {
      best = { form, match };
    }
  }
  return best;
}

/**
 * Splits the words between an item and its declaration, or has the item match all of them joined
 * (see joinedWordForms) as one word. The joined match is a hit on the item alone, so it sorts
 * before a split hit, and before a split of better words when its own match is better
 */
export function matchItemWords<T>(
  words: string[],
  forms: readonly string[],
  classWords: (WordMatch | null)[],
  classMatchesAll: boolean,
  name: ItemName<T>,
  source: MatchSource,
  needItemWord: boolean,
): ItemWords | null {
  const split = matchSplitWords(words, classWords, classMatchesAll, name, source, needItemWord);
  if (forms.length === 0) return split;

  const joined = scoreItemJoined(words, forms, name);
  if (joined === null) return split;

  const { form, match } = joined;
  const joinedWords: ItemWords = {
    classSide: NO_WORDS,
    itemSide: [wordMatch(form, source, name.name, match)],
    tier: match.tier,
    score: match.score,
  };
  if (split === null) return joinedWords;

  const isSplitHit = split.classSide.length > 0 && split.itemSide.length > 0;
  if (isSplitHit) return joinedWords;
  return isBetterMatch(match, split) ? joinedWords : split;
}

/**
 * Matches the words against a declaration name and its entity design names. `classWords` gets the
 * words that match as they are, null for the others. Returns whether every word does.
 *
 * With `fuzzy`, `fuzzyWords` also gets the words that only match fuzzily, in order. It is as long
 * as `words` when every word matches at least fuzzily, shorter after the first that doesn't
 */
export function matchClassWords(
  words: string[],
  entry: SearchEntry,
  fuzzy: boolean,
  classWords: (WordMatch | null)[],
  fuzzyWords: WordMatch[],
): boolean {
  fuzzyWords.length = 0;
  let allMatch = true;
  let fuzzyPossible = fuzzy;
  for (let i = 0; i < words.length; i++) {
    const match = matchClassWord(words[i], entry, fuzzyPossible);
    if (match === null || match.tier === TIER_FUZZY) {
      classWords[i] = null;
      allMatch = false;
    } else {
      classWords[i] = match;
    }

    if (match === null) {
      fuzzyPossible = false;
    } else if (fuzzyPossible) {
      fuzzyWords.push(match);
    }
  }

  return allMatch;
}

/** The best of the joined forms of the words against a declaration name or design name */
export function matchClassJoined(
  words: readonly string[],
  forms: readonly string[],
  entry: SearchEntry,
): WordMatch | null {
  let hasWords = hasAllWords(entry.lower, words);
  if (!hasWords && entry.paired) hasWords = hasAllWords(entry.paired.lower, words);

  for (const designName of entry.designNames) {
    if (!hasWords) hasWords = hasAllWords(designName.lower, words);
  }

  if (!hasWords) return null;

  let best: WordMatch | null = null;
  for (const form of forms) {
    const match = matchClassWord(form, entry, false);
    if (match !== null && isBetterMatch(match, best)) best = match;
  }

  return best;
}

/**
 * The words of a name hit: each word's match, or the joined words' as one match when that is
 * better or the only one. Every word matched or `joined` is set
 */
export function nameHitWords(
  classWords: (WordMatch | null)[],
  joined: WordMatch | null,
): readonly WordMatch[] {
  const perWord: WordMatch[] = [];
  for (const match of classWords) {
    if (match === null) return joined === null ? NO_WORDS : [joined];
    perWord.push(match);
  }

  if (joined === null) return perWord;

  return isBetterMatch(joined, combineMatches(perWord)) ? [joined] : perWord;
}
