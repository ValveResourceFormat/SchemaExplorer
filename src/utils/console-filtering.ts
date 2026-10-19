import type { ConsoleItem } from "../data/types";
import { countBy } from "./collections";
import { mergeRanges } from "./highlight";
import {
  combineMatches,
  isBetterMatch,
  joinedWordForms,
  matchTypoWords,
  scoreName,
  TIER_EXACT,
  TIER_FUZZY,
  TYPO_MAX_RESULTS,
  TYPO_SCORE_BASE,
  typoMatch,
  type NameMatch,
} from "./match-score";
import { joinLoneTags, trimNameWord } from "./search-words";

export type ConsoleKind = "all" | "convars" | "commands";

/** Tags that have filter chips */
export type FilterTag = "module:" | "flag:";

export type TagState = "off" | "include" | "exclude";

export interface ParsedConsoleSearch {
  nameWords: string[];
  modules: string[];
  notModules: string[];
  types: string[];
  notTypes: string[];
  flags: string[];
  notFlags: string[];
}

const CONSOLE_TAGS = ["module:", "type:", "flag:"] as const;

export function isConsoleFilterWord(word: string): boolean {
  const w = word.startsWith("-") ? word.slice(1) : word;
  return CONSOLE_TAGS.some((t) => w.startsWith(t));
}

/** Whether a word is a tag with no value, like "flag:" or "-flag:" */
export function isLoneConsoleTag(word: string): boolean {
  const w = word.startsWith("-") ? word.slice(1) : word;
  return (CONSOLE_TAGS as readonly string[]).includes(w);
}

/** A name word without the punctuation around it, a leading + or - of a command name kept */
function trimConsoleNameWord(word: string): string {
  const sign = word.startsWith("+") || word.startsWith("-") ? word[0] : "";
  const trimmed = trimNameWord(word.slice(sign.length));
  return trimmed === "" ? "" : sign + trimmed;
}

export function parseConsoleSearch(search: string): ParsedConsoleSearch {
  const parsed: ParsedConsoleSearch = {
    nameWords: [],
    modules: [],
    notModules: [],
    types: [],
    notTypes: [],
    flags: [],
    notFlags: [],
  };

  const split = search.toLowerCase().split(/\s+/);
  for (const word of joinLoneTags(split, isLoneConsoleTag, isConsoleFilterWord)) {
    if (!word) continue;
    const negated = word.startsWith("-") && isConsoleFilterWord(word);
    const w = negated ? word.slice(1) : word;
    const colon = w.indexOf(":");
    const tag = colon >= 0 ? w.slice(0, colon + 1) : "";
    const value = w.slice(colon + 1);

    if (tag === "module:") {
      if (value) (negated ? parsed.notModules : parsed.modules).push(value);
    } else if (tag === "flag:") {
      if (value) (negated ? parsed.notFlags : parsed.flags).push(value);
    } else if (tag === "type:") {
      if (value) (negated ? parsed.notTypes : parsed.types).push(value);
    } else {
      const nameWord = trimConsoleNameWord(word);
      if (nameWord) parsed.nameWords.push(nameWord);
    }
  }

  return parsed;
}

/** Keys most used first, then by name */
function keysByCount(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : 1));
}

/** Every module, flag and value type with its item count, and the keys most used first */
export interface ConsoleStats {
  modules: Map<string, number>;
  flags: Map<string, number>;
  types: Map<string, number>;
  sorted: { modules: string[]; flags: string[]; types: string[] };
  convars: number;
  commands: number;
}

const statsCache = new WeakMap<ConsoleItem[], ConsoleStats>();

/** Cached per game, the item list is built once when the schemas are loaded */
export function getConsoleStats(items: ConsoleItem[]): ConsoleStats {
  let stats = statsCache.get(items);
  if (stats) return stats;
  const convars = items.filter((i) => i.kind === "convar").length;
  const modules = countBy(items, (i) => i.modules);
  const flags = countBy(items, (i) => i.flags);
  const types = countBy(items, (i) => (i.kind === "convar" ? [i.type] : []));
  stats = {
    modules,
    flags,
    types,
    sorted: { modules: keysByCount(modules), flags: keysByCount(flags), types: keysByCount(types) },
    convars,
    commands: items.length - convars,
  };
  statsCache.set(items, stats);
  return stats;
}

type Predicate = (value: string) => boolean;

/**
 * A tag value matches exactly when it is a known name, so module:client does not also
 * match panoramauiclient, otherwise as a substring while it's still being typed.
 */
function valuePredicates(values: string[], known: Map<string, number>): Predicate[] {
  return values.map((v): Predicate => (known.has(v) ? (x) => x === v : (x) => x.includes(v)));
}

/** module: (any of) and -module: (none of), or null without module filters */
export function moduleFilter(
  parsed: ParsedConsoleSearch,
  stats: ConsoleStats,
): ((item: ConsoleItem) => boolean) | null {
  const include = valuePredicates(parsed.modules, stats.modules);
  const exclude = valuePredicates(parsed.notModules, stats.modules);
  if (include.length === 0 && exclude.length === 0) return null;
  return (item) =>
    (include.length === 0 || item.modules.some((m) => include.some((p) => p(m)))) &&
    !item.modules.some((m) => exclude.some((p) => p(m)));
}

/** An item a search found, the item itself kept as it is */
export interface ConsoleMatch {
  item: ConsoleItem;
  /** How well the name matches the search, a TIER_ constant. TIER_EXACT without name words */
  tier: number;
  /** The matched parts of the name, to highlight. Missing without name words */
  nameRanges?: readonly number[];
}

/** The matches of the words of a name as one: their worst tier, summed score and merged ranges */
function combinedMatch(matches: readonly NameMatch[]): NameMatch {
  const { tier, score } = combineMatches(matches);
  return { tier, score, ranges: mergeRanges(matches.map((m) => m.ranges)) };
}

/**
 * The best of `best` and the words joined the ways a space can stand for. A space often stands
 * for an underscore or nothing, so "cl color" is also an exact cl_color
 */
function betterJoined(
  words: readonly string[],
  name: string,
  lower: string,
  best: NameMatch | null,
  fuzzy: boolean,
): NameMatch | null {
  let better = best;
  for (const form of joinedWordForms(words)) {
    const joined = scoreName(form, name, lower, fuzzy);
    if (joined !== null && isBetterMatch(joined, better)) better = joined;
  }
  return better;
}

/**
 * How a name matches every word of the search, or null when a word is missing from it. The tier
 * is the worst of the words'
 */
function matchWords(words: readonly string[], name: string): NameMatch | null {
  const lower = name.toLowerCase();
  const matches: NameMatch[] = [];
  for (const word of words) {
    const match = scoreName(word, name, lower, true);
    if (match === null) return null;
    matches.push(match);
  }

  const best = combinedMatch(matches);
  if (words.length === 1 || best.tier === TIER_EXACT) return best;
  return betterJoined(words, name, lower, best, true);
}

/**
 * The match of a name when some word doesn't match as it is: only the words joined can still
 * make it a result, and only when every word at least matches fuzzily
 */
function matchJoinedWords(words: readonly string[], name: string, lower: string): NameMatch | null {
  const joined = betterJoined(words, name, lower, null, false);
  if (joined === null) return null;

  for (const word of words) {
    if (scoreName(word, name, lower, true) === null) return null;
  }
  return joined;
}

/**
 * The match of a name that is a result, or null. The same as matchWords unless that is a fuzzy
 * match, without looking for fuzzy matches of the words that match as they are
 */
function matchResultWords(words: readonly string[], name: string): NameMatch | null {
  const lower = name.toLowerCase();
  const matches: NameMatch[] = [];
  for (const word of words) {
    const match = scoreName(word, name, lower, false);
    if (match === null) {
      if (words.length === 1) return null;
      return matchJoinedWords(words, name, lower);
    }
    matches.push(match);
  }

  const best = combinedMatch(matches);
  if (words.length === 1 || best.tier === TIER_EXACT) return best;
  return betterJoined(words, name, lower, best, false);
}

/** A name and the name in lowercase, which a word is scored against */
interface NameTarget {
  name: string;
  lower: string;
}

function scoreTargetWord(word: string, target: NameTarget): NameMatch | null {
  return scoreName(word, target.name, target.lower, false);
}

function typoTargetWord(word: string, target: NameTarget): NameMatch | null {
  return typoMatch(word, target.name, target.lower);
}

/**
 * Whether every word is in the name, at least one of them as a typo of a word of the name. Null
 * without a typo, such a name is found or not found by its words already
 */
function matchTypoName(words: readonly string[], name: string): NameMatch | null {
  const target = { name, lower: name.toLowerCase() };
  const matches = matchTypoWords(words, target, scoreTargetWord, typoTargetWord);
  if (matches === null) return null;
  return {
    tier: TIER_FUZZY,
    score: TYPO_SCORE_BASE + name.length,
    ranges: mergeRanges(matches.map((m) => m.ranges)),
  };
}

export interface ConsoleFilterOptions {
  kind?: ConsoleKind;
  /** Skip module:/-module: filters, for per-module chip counts */
  ignoreModules?: boolean;
}

/** The items that pass every filter of the search but its name words, in item order */
function filterByTags(
  items: ConsoleItem[],
  parsed: ParsedConsoleSearch,
  { kind = "all", ignoreModules = false }: ConsoleFilterOptions,
): ConsoleItem[] {
  const stats = getConsoleStats(items);
  const types = valuePredicates(parsed.types, stats.types);
  const notTypes = valuePredicates(parsed.notTypes, stats.types);
  const flags = valuePredicates(parsed.flags, stats.flags);
  const notFlags = valuePredicates(parsed.notFlags, stats.flags);
  const matchesModules = ignoreModules ? null : moduleFilter(parsed, stats);

  const tagged: ConsoleItem[] = [];
  for (const item of items) {
    if (kind === "convars" && item.kind !== "convar") continue;
    if (kind === "commands" && item.kind !== "command") continue;

    if (types.length > 0 && (item.kind !== "convar" || !types.some((p) => p(item.type)))) continue;
    // Commands have no type, -type: only hides convars
    if (item.kind === "convar" && notTypes.some((p) => p(item.type))) continue;
    if (matchesModules && !matchesModules(item)) continue;
    // Every flag: must be on the item, no -flag: may be
    if (flags.length > 0 && !flags.every((p) => item.flags.some(p))) continue;
    if (notFlags.length > 0 && item.flags.some((x) => notFlags.some((p) => p(x)))) continue;

    tagged.push(item);
  }
  return tagged;
}

/**
 * The items a search lists as results, in item order. Items that only match by name fuzzily are
 * not results. Nothing is ranked or highlighted, for counting
 */
export function filterConsoleItems(
  items: ConsoleItem[],
  parsed: ParsedConsoleSearch,
  options: ConsoleFilterOptions = {},
): ConsoleItem[] {
  const tagged = filterByTags(items, parsed, options);
  const { nameWords } = parsed;
  if (nameWords.length === 0) return tagged;

  const found: ConsoleItem[] = [];
  for (const item of tagged) {
    if (matchResultWords(nameWords, item.name) !== null) found.push(item);
  }
  return found;
}

export interface ConsoleSearchResults {
  /** The items that match the search, best name first */
  results: ConsoleMatch[];
  /** The items that only match by name fuzzily, which are not results. None without name words */
  similar: ConsoleMatch[];
}

interface ScoredItem {
  item: ConsoleItem;
  match: NameMatch;
}

function rankMatches(scored: ScoredItem[]): ConsoleMatch[] {
  // Items are already sorted by name, and the sort is stable
  scored.sort((a, b) => a.match.tier - b.match.tier || a.match.score - b.match.score);
  return scored.map(({ item, match }) => ({ item, tier: match.tier, nameRanges: match.ranges }));
}

/**
 * The results of a search, best name first: the same as the results of searchConsoleItems, without
 * looking for similar names
 */
export function searchConsoleResults(
  items: ConsoleItem[],
  parsed: ParsedConsoleSearch,
  options: ConsoleFilterOptions = {},
): ConsoleMatch[] {
  const tagged = filterByTags(items, parsed, options);
  const { nameWords } = parsed;
  if (nameWords.length === 0) return tagged.map((item) => ({ item, tier: TIER_EXACT }));

  const found: ScoredItem[] = [];
  for (const item of tagged) {
    const match = matchResultWords(nameWords, item.name);
    if (match !== null) found.push({ item, match });
  }
  return rankMatches(found);
}

/** The results of a search and, apart from them, the similar names, found in one pass */
export function searchConsoleItems(
  items: ConsoleItem[],
  parsed: ParsedConsoleSearch,
  options: ConsoleFilterOptions = {},
): ConsoleSearchResults {
  const tagged = filterByTags(items, parsed, options);
  const { nameWords } = parsed;
  if (nameWords.length === 0) {
    const results = tagged.map((item) => ({ item, tier: TIER_EXACT }));
    return { results, similar: [] };
  }

  const found: ScoredItem[] = [];
  let fuzzy: ScoredItem[] = [];
  const unmatched: ConsoleItem[] = [];
  for (const item of tagged) {
    const match = matchWords(nameWords, item.name);
    if (match === null) {
      unmatched.push(item);
    } else if (match.tier === TIER_FUZZY) {
      fuzzy.push({ item, match });
      unmatched.push(item);
    } else {
      found.push({ item, match });
    }
  }

  if (found.length < TYPO_MAX_RESULTS) {
    const typos: ScoredItem[] = [];
    const typoItems = new Set<ConsoleItem>();
    for (const item of unmatched) {
      const match = matchTypoName(nameWords, item.name);
      if (match === null) continue;
      typos.push({ item, match });
      typoItems.add(item);
    }
    if (typos.length > 0) fuzzy = [...typos, ...fuzzy.filter((x) => !typoItems.has(x.item))];
  }
  return { results: rankMatches(found), similar: rankMatches(fuzzy) };
}

/** Parsed search with one flag's own include/exclude lifted, every other filter untouched */
export function withoutFlag(parsed: ParsedConsoleSearch, flag: string): ParsedConsoleSearch {
  if (!parsed.flags.includes(flag) && !parsed.notFlags.includes(flag)) return parsed;
  return {
    ...parsed,
    flags: parsed.flags.filter((f) => f !== flag),
    notFlags: parsed.notFlags.filter((f) => f !== flag),
  };
}

/** Adds, removes or negates a tag:value word in a search string */
export function setSearchTag(search: string, tag: string, value: string, state: TagState): string {
  const lowerValue = value.toLowerCase();
  const words = joinLoneTags(search.split(/\s+/), isLoneConsoleTag, isConsoleFilterWord)
    .filter((w) => {
      const lower = w.toLowerCase();
      return lower !== `${tag}${lowerValue}` && lower !== `-${tag}${lowerValue}`;
    })
    .filter(Boolean);
  if (state === "include") words.push(`${tag}${value}`);
  else if (state === "exclude") words.push(`-${tag}${value}`);
  return words.join(" ");
}

/** Removes every module:, flag: and type: tag, keeping the name words */
export function stripConsoleFilters(search: string): string {
  const words = joinLoneTags(search.split(/\s+/), isLoneConsoleTag, isConsoleFilterWord);
  return words.filter((w) => w && !isConsoleFilterWord(w.toLowerCase())).join(" ");
}

export function getTagState(parsed: ParsedConsoleSearch, tag: FilterTag, value: string): TagState {
  const lower = value.toLowerCase();
  const [include, exclude] =
    tag === "module:" ? [parsed.modules, parsed.notModules] : [parsed.flags, parsed.notFlags];
  if (include.includes(lower)) return "include";
  if (exclude.includes(lower)) return "exclude";
  return "off";
}

// Flag chips cycle off → include → exclude, module chips only toggle
const NEXT_TAG_STATE: Record<FilterTag, Record<TagState, TagState>> = {
  "flag:": { off: "include", include: "exclude", exclude: "off" },
  "module:": { off: "include", include: "off", exclude: "off" },
};

export function nextTagState(tag: FilterTag, state: TagState): TagState {
  return NEXT_TAG_STATE[tag][state];
}
