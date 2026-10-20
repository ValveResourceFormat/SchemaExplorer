const FUZZY_MIN_PATTERN_LEN = 3;
/** Letters of a fuzzy match may span this many times the pattern length, plus the slack */
const FUZZY_SPAN_FACTOR = 2;
const FUZZY_SPAN_SLACK = 2;
/** The search checks only words of this length or longer for typos */
export const TYPO_MIN_PATTERN_LEN = 4;
/** The search checks for typos only when it has fewer results than this */
export const TYPO_MAX_RESULTS = 10;
const UNDERSCORE = 95;

/** Added to the score of a match that cuts into the next word, so whole words sort first */
export const WHOLE_WORD_PENALTY = 1 << 20;
/** Typo matches score below zero, so they list before the fuzzy ones in a similar names list */
export const TYPO_SCORE_BASE = -(1 << 20);

/** How a name matched a pattern, best first. Tiers are comparable between schemas and convars */
export const TIER_EXACT = 0;
export const TIER_PREFIX = 1;
/** A substring that starts a word, like "pawn" in CCSPlayerPawn */
export const TIER_WORD_START = 2;
/** A substring inside a word, like "pawn" in SPAWNGROUP_HEADER */
export const TIER_SUBSTRING = 3;
/** The letters in order, not next to each other */
export const TIER_FUZZY = 4;
const TIER_NONE = 5;

export interface NameMatch {
  tier: number;
  /** Lower is better within a tier: earlier and shorter names first, fuzzy ones by their quality */
  score: number;
  /** Matched parts of the name as start and end indexes, in pairs: [start0, end0, start1, end1] */
  ranges: number[];
}

/** Whether a word starts at a character, from the character codes around it */
function isBoundaryAt(prev: number, curr: number, next: number): boolean {
  // After _, - or :, like the second part of Foo::Bar
  if (prev === 95 || prev === 45 || prev === 58) return true;
  // Uppercase after lowercase (camelCase)
  if (curr >= 65 && curr <= 90 && prev >= 97 && prev <= 122) return true;
  // Acronym end: uppercase before lowercase, preceded by uppercase (e.g. the W in CCSWeapon)
  if (curr >= 65 && curr <= 90 && prev >= 65 && prev <= 90 && next >= 97 && next <= 122)
    return true;
  // Digit/letter transitions
  const prevDigit = prev >= 48 && prev <= 57;
  const currDigit = curr >= 48 && curr <= 57;
  if (prevDigit !== currDigit) {
    const prevLetter = (prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122);
    const currLetter = (curr >= 65 && curr <= 90) || (curr >= 97 && curr <= 122);
    if ((prevDigit && currLetter) || (prevLetter && currDigit)) return true;
  }
  return false;
}

function isWordStart(name: string, index: number): boolean {
  if (index === 0) return true;
  const next = index + 1 < name.length ? name.charCodeAt(index + 1) : 0;
  return isBoundaryAt(name.charCodeAt(index - 1), name.charCodeAt(index), next);
}

function isLetterOrDigit(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** Whether a word ends before this index: at the end of the name, a separator or a new word */
function endsWord(name: string, end: number): boolean {
  if (end >= name.length) return true;
  if (!isLetterOrDigit(name.charCodeAt(end))) return true;
  return isWordStart(name, end);
}

function computeFuzzyQuality(
  m: number,
  n: number,
  firstPos: number,
  boundaryHits: number,
  consecutiveRuns: number,
  totalGap: number,
  caseMatches: number,
): number {
  const boundaryRatio = boundaryHits / m;
  const consecutiveRatio = m > 1 ? consecutiveRuns / (m - 1) : 0;
  const caseRatio = caseMatches / m;
  const positionPenalty = firstPos / n;
  const gapPenalty = Math.min(totalGap / n, 1);

  const quality =
    1.0 -
    boundaryRatio * 0.4 -
    consecutiveRatio * 0.25 -
    caseRatio * 0.05 +
    positionPenalty * 0.15 +
    gapPenalty * 0.15;

  return Math.round(Math.max(0, Math.min(1, quality)) * 3999);
}

/** Merges the indexes of matched letters into start and end pairs */
function indexesToRanges(indexes: number[], count: number): number[] {
  const ranges: number[] = [];
  let start = indexes[0];
  let end = start + 1;
  for (let i = 1; i < count; i++) {
    const index = indexes[i];
    if (index === end) {
      end++;
      continue;
    }
    ranges.push(start, end);
    start = index;
    end = index + 1;
  }
  ranges.push(start, end);
  return ranges;
}

// Scratch space for the two scans, so a failed match allocates nothing
const greedyIndexes: number[] = [];
const boundaryIndexes: number[] = [];

/**
 * The letters of the pattern in order from a word start, within `limit`. Two scans compete. One
 * takes the first letter it finds. The other takes only letters that start a word. The better
 * scan gives the match
 */
function fuzzyFrom(
  pattern: string,
  name: string,
  lower: string,
  start: number,
  limit: number,
): NameMatch | null {
  const m = pattern.length;
  const n = name.length;

  let gPi = 0;
  let gPrevPos = -1;
  let gBoundaryHits = 0;
  let gConsecutive = 0;
  let gGap = 0;
  let gCase = 0;

  let bPi = 0;
  let bPrevPos = -1;
  let bConsecutive = 0;
  let bGap = 0;
  let bCase = 0;

  for (let ti = start; ti < limit; ti++) {
    const low = lower.charCodeAt(ti);
    const raw = name.charCodeAt(ti);
    const boundary = isWordStart(name, ti);

    if (gPi < m && low === pattern.charCodeAt(gPi)) {
      if (boundary) gBoundaryHits++;
      if (raw === pattern.charCodeAt(gPi)) gCase++;
      if (gPrevPos >= 0) {
        if (ti === gPrevPos + 1) gConsecutive++;
        else gGap += ti - gPrevPos - 1;
      }
      greedyIndexes[gPi] = ti;
      gPrevPos = ti;
      gPi++;
    }

    if (bPi < m && boundary && low === pattern.charCodeAt(bPi)) {
      if (raw === pattern.charCodeAt(bPi)) bCase++;
      if (bPrevPos >= 0) {
        if (ti === bPrevPos + 1) bConsecutive++;
        else bGap += ti - bPrevPos - 1;
      }
      boundaryIndexes[bPi] = ti;
      bPrevPos = ti;
      bPi++;
    }

    if (gPi === m && bPi === m) break;
  }

  // The first-letter scan matches whenever any scan can
  if (gPi < m) return null;

  let score = computeFuzzyQuality(m, n, start, gBoundaryHits, gConsecutive, gGap, gCase);
  let indexes = greedyIndexes;
  if (bPi === m) {
    const boundaryScore = computeFuzzyQuality(m, n, start, m, bConsecutive, bGap, bCase);
    if (boundaryScore < score) {
      score = boundaryScore;
      indexes = boundaryIndexes;
    }
  }
  return { tier: TIER_FUZZY, score, ranges: indexesToRanges(indexes, m) };
}

/**
 * The letters of the pattern in order. The first letter has to start a word. The letters have to
 * fit in a few times the pattern's length, so a name with the letters scattered along it isn't a
 * match. The best start gives the match
 */
function fuzzyMatch(pattern: string, name: string, lower: string): NameMatch | null {
  const m = pattern.length;
  const n = name.length;
  if (m > n) return null;

  const maxSpan = m * FUZZY_SPAN_FACTOR + FUZZY_SPAN_SLACK;
  const firstCode = pattern.charCodeAt(0);
  let best: NameMatch | null = null;
  for (
    let start = lower.indexOf(pattern[0]);
    start !== -1;
    start = lower.indexOf(pattern[0], start + 1)
  ) {
    if (lower.charCodeAt(start) !== firstCode || !isWordStart(name, start)) continue;
    const limit = Math.min(n, start + maxSpan);
    const match = fuzzyFrom(pattern, name, lower, start, limit);
    if (match !== null && (best === null || match.score < best.score)) best = match;
  }
  return best;
}

/** The start and end pairs of the pattern's letters in the name, skipping its underscores */
function collapsedRanges(pattern: string, lower: string, start: number): number[] | null {
  const n = lower.length;
  const ranges: number[] = [];
  let rangeStart = start;
  let index = start;
  for (let p = 0; p < pattern.length; p++) {
    if (p > 0 && index < n && lower.charCodeAt(index) === UNDERSCORE) {
      ranges.push(rangeStart, index);
      while (index < n && lower.charCodeAt(index) === UNDERSCORE) index++;
      rangeStart = index;
    }
    if (index >= n || lower.charCodeAt(index) !== pattern.charCodeAt(p)) return null;
    index++;
  }
  ranges.push(rangeStart, index);
  return ranges;
}

/** How many patterns a cache of derived patterns holds before it starts over */
export const PATTERN_CACHE_SIZE = 64;

const collapsedPatterns = new Map<string, string>();

/** The pattern without its underscores. A search scores each of its words against every name */
function collapsePattern(pattern: string): string {
  let collapsed = collapsedPatterns.get(pattern);
  if (collapsed === undefined) {
    if (collapsedPatterns.size >= PATTERN_CACHE_SIZE) collapsedPatterns.clear();
    collapsed = pattern.replaceAll("_", "");
    collapsedPatterns.set(pattern, collapsed);
  }
  return collapsed;
}

/**
 * A pattern with an underscore inside it against a name without its underscores: mana_regen is
 * m_flManaRegen. Only matches that start a word count. The ranges are the parts between the
 * underscores of the name
 */
function scoreCollapsed(pattern: string, name: string, lower: string): NameMatch | null {
  const collapsed = collapsePattern(pattern);
  const m = collapsed.length;
  const n = name.length;

  for (
    let start = lower.indexOf(collapsed[0]);
    start !== -1;
    start = lower.indexOf(collapsed[0], start + 1)
  ) {
    if (!isWordStart(name, start)) continue;
    const ranges = collapsedRanges(collapsed, lower, start);
    if (ranges === null) continue;

    let underscoresBefore = 0;
    let underscores = 0;
    for (let i = 0; i < n; i++) {
      if (lower.charCodeAt(i) !== UNDERSCORE) continue;
      underscores++;
      if (i < start) underscoresBefore++;
    }
    const compactLength = n - underscores;
    const compactStart = start - underscoresBefore;
    const end = ranges[ranges.length - 1];
    if (compactStart === 0 && m === compactLength) return { tier: TIER_EXACT, score: 0, ranges };

    const tier = compactStart === 0 ? TIER_PREFIX : TIER_WORD_START;
    let score = (compactLength - m) * 256 + start;
    if (!endsWord(name, end)) score += WHOLE_WORD_PENALTY;
    return { tier, score, ranges };
  }
  return null;
}

function hasInnerUnderscore(pattern: string): boolean {
  const last = pattern.length - 1;
  if (pattern.charCodeAt(0) === UNDERSCORE || pattern.charCodeAt(last) === UNDERSCORE) return false;
  return pattern.includes("_");
}

/**
 * How a name matches a lowercased pattern, or null. `lower` is the lowercased name. An occurrence
 * that starts a word wins over an earlier one inside a word. An occurrence that ends a word wins
 * over one that cuts into the next. Patterns shorter than FUZZY_MIN_PATTERN_LEN, and any when `fuzzy` is
 * false, only match as a substring. Patterns of two letters or fewer, and ones ending in an
 * underscore, don't match inside a word. A pattern with an underscore inside it also matches the
 * name without its underscores.
 */
export function scoreName(
  pattern: string,
  name: string,
  lower: string,
  fuzzy: boolean,
): NameMatch | null {
  const m = pattern.length;
  const n = name.length;
  if (m === 0) return null;

  const endsWithUnderscore = pattern.charCodeAt(m - 1) === UNDERSCORE;
  const insideWord = m > 2 && !endsWithUnderscore;

  const first = lower.indexOf(pattern);
  if (first !== -1) {
    if (m === n) return { tier: TIER_EXACT, score: 0, ranges: [0, n] };

    let index = -1;
    let startsWord = false;
    let wholeWord = false;
    for (let at = first; at !== -1; at = lower.indexOf(pattern, at + 1)) {
      const starts = isWordStart(name, at);
      const whole = endsWord(name, at + m);
      if (starts && whole) {
        index = at;
        startsWord = true;
        wholeWord = true;
        break;
      }
      if (starts && !startsWord) {
        index = at;
        startsWord = true;
        wholeWord = false;
      } else if (index === -1) {
        index = at;
        wholeWord = whole;
      }
    }

    if (startsWord || insideWord) {
      let tier = TIER_SUBSTRING;
      if (index === 0) tier = TIER_PREFIX;
      else if (startsWord) tier = TIER_WORD_START;
      let score = (n - m) * 256 + index;
      if (!wholeWord) score += WHOLE_WORD_PENALTY;
      return { tier, score, ranges: [index, index + m] };
    }
  }

  if (hasInnerUnderscore(pattern) && pattern.length >= 4) {
    const collapsed = scoreCollapsed(pattern, name, lower);
    if (collapsed !== null) return collapsed;
  }

  if (!fuzzy || m < FUZZY_MIN_PATTERN_LEN || endsWithUnderscore) return null;
  return fuzzyMatch(pattern, name, lower);
}

/** The tier and score of a match, or of several words together */
export interface MatchRating {
  tier: number;
  score: number;
}

/** Whether the first match is better than the second, which may be missing */
export function isBetterMatch(a: MatchRating, b: MatchRating | null): boolean {
  if (b === null) return true;
  if (a.tier !== b.tier) return a.tier < b.tier;
  return a.score < b.score;
}

/** The worst tier and the summed score of matched words, TIER_EXACT and 0 without any */
export function combineMatches(matches: readonly MatchRating[]): MatchRating {
  let tier = TIER_EXACT;
  let score = 0;
  for (const match of matches) {
    tier = Math.max(tier, match.tier);
    score += match.score;
  }
  return { tier, score };
}

function sameLetters(
  pattern: string,
  patternFrom: number,
  text: string,
  textFrom: number,
  count: number,
): boolean {
  for (let i = 0; i < count; i++) {
    if (pattern.charCodeAt(patternFrom + i) !== text.charCodeAt(textFrom + i)) return false;
  }
  return true;
}

/**
 * Whether the pattern equals the text at `start` with `length` letters, within one edit. An edit
 * is a letter added, removed, or changed, or two adjacent letters swapped
 */
function withinOneEdit(pattern: string, text: string, start: number, length: number): boolean {
  const m = pattern.length;
  if (Math.abs(m - length) > 1) return false;

  let common = 0;
  while (
    common < m &&
    common < length &&
    pattern.charCodeAt(common) === text.charCodeAt(start + common)
  ) {
    common++;
  }
  if (common === m && common === length) return true;

  if (m === length) {
    const rest = m - common - 1;
    if (sameLetters(pattern, common + 1, text, start + common + 1, rest)) return true;
    if (rest < 1) return false;
    const swapped =
      pattern.charCodeAt(common) === text.charCodeAt(start + common + 1) &&
      pattern.charCodeAt(common + 1) === text.charCodeAt(start + common);
    return swapped && sameLetters(pattern, common + 2, text, start + common + 2, rest - 1);
  }
  if (m === length + 1) {
    return sameLetters(pattern, common + 1, text, start + common, length - common);
  }
  return sameLetters(pattern, common, text, start + common + 1, m - common);
}

/** How many more or fewer letters than the pattern a typo can have, the same count first */
const TYPO_LENGTH_DELTAS = [0, -1, 1];

/** Where the word that starts at a letter or digit of a name ends, split where the scorer does */
function wordEnd(name: string, start: number): number {
  let end = start + 1;
  while (end < name.length && isLetterOrDigit(name.charCodeAt(end)) && !isWordStart(name, end)) {
    end++;
  }
  return end;
}

/** The length of the longest word of a name, split the way typoMatch splits it */
export function longestWordLength(name: string): number {
  const n = name.length;
  let longest = 0;
  let start = 0;
  while (start < n) {
    if (!isLetterOrDigit(name.charCodeAt(start))) {
      start++;
      continue;
    }
    const end = wordEnd(name, start);
    longest = Math.max(longest, end - start);
    start = end;
  }
  return longest;
}

/**
 * The length a word of a name needs to be a typo target of one of the words: one less than the
 * shortest word that the search checks for typos. 0 when no word is long enough for that
 */
export function shortestTypoTarget(words: readonly string[]): number {
  let shortest = 0;
  for (const word of words) {
    if (word.length < TYPO_MIN_PATTERN_LEN) continue;
    const target = word.length - 1;
    if (shortest === 0 || target < shortest) shortest = target;
  }
  return shortest;
}

/**
 * A word of the name that the pattern is a typo of, or null: one edit from the word, or from the
 * start of a longer one. Words start where the scorer starts them. Patterns shorter than
 * TYPO_MIN_PATTERN_LEN never match. The ranges are the word's matched part
 */
export function typoMatch(pattern: string, name: string, lower: string): NameMatch | null {
  const m = pattern.length;
  if (m < TYPO_MIN_PATTERN_LEN) return null;

  const n = name.length;
  let start = 0;
  while (start < n) {
    if (!isLetterOrDigit(name.charCodeAt(start))) {
      start++;
      continue;
    }
    const end = wordEnd(name, start);

    const wordLength = end - start;
    for (const delta of TYPO_LENGTH_DELTAS) {
      const length = m + delta;
      if (length > wordLength) continue;
      if (!withinOneEdit(pattern, lower, start, length)) continue;
      return { tier: TIER_FUZZY, score: TYPO_SCORE_BASE + n, ranges: [start, start + length] };
    }
    start = end;
  }
  return null;
}

/**
 * One match per word, from `scoreWord` or else, as a typo, from `typoWord`. Both are given the
 * target that the words are matched against. Null when a word has neither, and when no word needed
 * a typo. The words already find or miss such a name
 */
export function matchTypoWords<T>(
  words: readonly string[],
  target: T,
  scoreWord: (word: string, target: T) => NameMatch | null,
  typoWord: (word: string, target: T) => NameMatch | null,
): NameMatch[] | null {
  const matches: NameMatch[] = [];
  let hasTypo = false;
  for (const word of words) {
    let match = scoreWord(word, target);
    if (match === null) {
      match = typoWord(word, target);
      hasTypo = true;
    }
    if (match === null) return null;
    matches.push(match);
  }
  return hasTypo ? matches : null;
}

/**
 * The words joined the two ways a space can stand for in a name: an underscore or nothing, so
 * "cl color" is also cl_color and clcolor
 */
export function joinedWordForms(words: readonly string[]): string[] {
  return [words.join("_"), words.join("")];
}

/**
 * How well the best of `names` matches the worst-matching word: a TIER_ constant, TIER_NONE for a
 * word that isn't in any name (like a class found through its field names). Comparable between
 * schemas and convars. With `wholeWords`, a match that cuts into the next word of the name
 * counts as no match
 */
export function nameMatchTier(
  names: readonly string[],
  words: readonly string[],
  wholeWords = false,
): number {
  const bestTier = (pattern: string) => {
    let best = TIER_NONE;
    for (const name of names) {
      const match = scoreName(pattern, name, name.toLowerCase(), true);
      if (match === null || match.tier >= best) continue;
      if (wholeWords && match.score >= WHOLE_WORD_PENALTY && match.tier !== TIER_FUZZY) continue;
      best = match.tier;
    }
    return best;
  };

  let tier = TIER_EXACT;
  for (const w of words) tier = Math.max(tier, bestTier(w));
  // A space often stands for an underscore or nothing. "cl color" is an exact cl_color
  if (words.length > 1 && tier > TIER_EXACT) {
    for (const form of joinedWordForms(words)) tier = Math.min(tier, bestTier(form));
  }
  return tier;
}
