import {
  allDeclarations,
  declarationKey,
  inheritedBases,
  pushTo,
  serverClassName,
  type GameContext,
} from "../data/derived";
import { compareNames } from "../data/schemas";
import { matchesNetworkWords } from "../data/network";
import {
  countShowFilters,
  SHOW_FILTERS,
  type ShowFilter,
  type ShowLookups,
} from "../data/show-filters";
import type {
  Declaration,
  EnumValue,
  EntityInput,
  EntityOutput,
  SchemaClass,
  SchemaEnum,
  SchemaEnumMember,
  SchemaField,
  SchemaMetadataEntry,
} from "../data/types";
import { compareModuleNames } from "../data/modules";
import {
  matchesMetadataKeys,
  matchesMetadataValues,
  matchesModule,
  namesMatching,
  type ParsedSearch,
} from "./filtering";
import { formatFieldType, metadataValueText } from "./format";
import {
  combineMatches,
  isBetterMatch,
  joinedWordForms,
  longestWordLength,
  matchTypoWords,
  PATTERN_CACHE_SIZE,
  scoreName,
  shortestTypoTarget,
  TIER_EXACT,
  TIER_FUZZY,
  TIER_PREFIX,
  TIER_WORD_START,
  TYPO_MAX_RESULTS,
  typoMatch,
  type MatchRating,
  type NameMatch,
} from "./match-score";

/** The weight of an entity design name when classes are ranked by how many subclasses they have */
const ENTITY_IMPORTANCE = 10;
/** A word of a class name has to be this long to look for the fields of its bases */
const INHERITED_MIN_WORD_LEN = 3;

export type SearchContext = Pick<
  GameContext,
  "declarations" | "entitiesByDeclaration" | "designNamesByDeclaration" | "crossModuleLookup"
>;

// -- Hit records --

/** Where a matched name comes from */
export type MatchSource = "name" | "designName" | "field" | "member";

/** One name word matched against one name. The ranges index into `text` */
export interface WordMatch extends NameMatch {
  word: string;
  source: MatchSource;
  /** The matched name as shown: the declaration, an entity design name, a field or a member */
  text: string;
  /** For an entity design name that won: the tier the declaration name matched with, if it did */
  nameTier?: number;
}

/** Why a declaration, field or member matched besides its name */
export type TagMatch =
  | { kind: "entity"; designNames: string[] }
  | { kind: "io"; inputs: EntityInput[]; outputs: EntityOutput[] }
  | { kind: "metadata"; entries: SchemaMetadataEntry[] }
  | { kind: "network"; words: string[] }
  | { kind: "offset"; offset: number }
  | { kind: "enumValue"; value: EnumValue };

interface HitBase {
  declaration: Declaration;
  /** The worst tier of the name words, TIER_EXACT without any */
  tier: number;
  /** The sum of the scores of the name words */
  score: number;
  /** Name words that matched the declaration name or an entity design name */
  nameWords: readonly WordMatch[];
  tags: readonly TagMatch[];
}

/** A class or enum, found by its name, an entity design name, or only by tags */
export interface NameHit extends HitBase {
  kind: "name";
}

export interface FieldHit extends HitBase {
  kind: "field";
  declaration: SchemaClass;
  field: SchemaField;
  /** Name words that matched the field name, the rest are in nameWords */
  fieldWords: readonly WordMatch[];
}

export interface MemberHit extends HitBase {
  kind: "member";
  declaration: SchemaEnum;
  member: SchemaEnumMember;
  /** Name words that matched the member name, the rest are in nameWords */
  fieldWords: readonly WordMatch[];
}

/** A class or enum whose name only matches in order, not next to each other. Not a result */
export interface FuzzyHit extends HitBase {
  kind: "fuzzy";
}

/**
 * A field the classes of a split query have from a base: the class side words match the classes
 * and the other words match the field. One per declaring field
 */
export interface InheritedSide {
  /** The base class that declares the field */
  declaration: SchemaClass;
  field: SchemaField;
  /** Name words that matched the field name */
  fieldWords: readonly WordMatch[];
  /** The classes whose name matches the class side of the query and that have the field */
  classes: SchemaClass[];
  /** The worst tier of the field and the best class, set when the hits are ordered */
  tier: number;
  /** The summed score of the field words and the best class */
  score: number;
}

export type PairableHit = NameHit | FieldHit | MemberHit;

/**
 * A name that is only close to a query: a class or enum matching in order or by a typo, or a
 * field or member matching by a typo. They have the tier TIER_FUZZY
 */
export type SimilarHit = FuzzyHit | FieldHit | MemberHit;

/**
 * A hit, or two in one when the client and server class (see crossModuleLookup) hit the same
 * way. `hit` is the side whose name matched better, the server on a tie. For inherited fields it
 * is the server side
 */
export interface SearchRow<T extends { declaration: Declaration }> {
  hit: T;
  paired?: T;
}

export type SimilarRow = SearchRow<FuzzyHit> | SearchRow<FieldHit | MemberHit>;

export function isFuzzyRow(row: SimilarRow): row is SearchRow<FuzzyHit> {
  return row.hit.kind === "fuzzy";
}

export interface SearchResult {
  /** Classes and enums, sorted */
  names: SearchRow<NameHit>[];
  /** Fields and enum members, sorted */
  fields: SearchRow<FieldHit | MemberHit>[];
  /** Fields of base classes, by declaring class with the bases first, then by declaration order */
  inherited: SearchRow<InheritedSide>[];
  /** Fuzzy and typo hits of declarations without any other hit, typos first, sorted */
  similar: SimilarRow[];
  /** Declarations with at least one hit besides fuzzy ones, each once, the inherited classes too */
  declarations: Set<Declaration>;
}

const NO_TAGS: readonly TagMatch[] = [];
const NO_WORDS: readonly WordMatch[] = [];

/** The field or member name of a hit */
export function itemName(hit: FieldHit | MemberHit): string {
  return hit.kind === "field" ? hit.field.name : hit.member.name;
}

/** The hit of a row, and the paired one when it has one */
export function rowSides<T extends { declaration: Declaration }>(row: SearchRow<T>): T[] {
  return row.paired ? [row.hit, row.paired] : [row.hit];
}

function hasSearchFilters(parsed: ParsedSearch): boolean {
  return (
    parsed.nameWords.length > 0 ||
    parsed.moduleWords.length > 0 ||
    parsed.offsets.size > 0 ||
    parsed.enumValues.size > 0 ||
    parsed.metadataKeys.length > 0 ||
    parsed.metadataValues.length > 0 ||
    parsed.networkWords.length > 0 ||
    parsed.entityWords.length > 0 ||
    parsed.inputWords.length > 0 ||
    parsed.outputWords.length > 0
  );
}

// -- Precomputed names --

/**
 * Hungarian prefixes of field names, from the dumps: fl float, b bool, n integer, h handle,
 * v vector, vec vector, str string, i integer, f float, s string, p pointer, e enum, isz string
 * token, un and u unsigned, ul 64-bit unsigned, ui unsigned, us 16-bit unsigned, sz and psz
 * C strings, t time, ang angles, q quaternion or angles, col, clr and c colors
 */
const TYPE_PREFIXES = new Set([
  "fl",
  "b",
  "n",
  "h",
  "v",
  "vec",
  "str",
  "i",
  "f",
  "s",
  "p",
  "e",
  "isz",
  "un",
  "u",
  "ul",
  "ui",
  "us",
  "sz",
  "psz",
  "t",
  "ang",
  "q",
  "col",
  "clr",
  "c",
]);

/**
 * Where the name of a field starts after m_ and its type prefix, 0 when there's nothing to strip.
 * Only a whole known prefix followed by an uppercase letter counts: m_iHealth and unLastHits are
 * Health and LastHits, but m_agentRadius and m_isRescued are words
 */
function strippedNameStart(name: string): number {
  const prefixStart = name.startsWith("m_") ? 2 : 0;
  let end = prefixStart;
  while (end < name.length) {
    const code = name.charCodeAt(end);
    if (code < 97 || code > 122) break;
    end++;
  }
  if (end === name.length) return 0;

  if (end === prefixStart) {
    const first = name.charCodeAt(end);
    const isUppercase = first >= 65 && first <= 90;
    return prefixStart > 0 && isUppercase ? prefixStart : 0;
  }

  const next = name.charCodeAt(end);
  if (next < 65 || next > 90) return 0;
  return TYPE_PREFIXES.has(name.slice(prefixStart, end)) ? end : 0;
}

/** A field name without m_ and its type prefix, null when it has none */
export function strippedFieldName(name: string): string | null {
  const start = strippedNameStart(name);
  return start > 0 ? name.slice(start) : null;
}

/** A field or enum member name, lowercased once, with the name without its prefix for fields */
interface ItemName<T> {
  item: T;
  name: string;
  lower: string;
  /** The name without m_ and its type prefix, null when it has none */
  stripped: string | null;
  strippedLower: string;
  /** Where the stripped name starts in the name */
  strippedStart: number;
  /** The length of the longest word of the name, which a typo of a word has to fit in */
  longestWord: number;
}

function indexItem<T>(item: T, name: string, strip: boolean): ItemName<T> {
  const stripped = strip ? strippedFieldName(name) : null;
  return {
    item,
    name,
    lower: name.toLowerCase(),
    stripped,
    strippedLower: stripped?.toLowerCase() ?? "",
    strippedStart: stripped === null ? 0 : name.length - stripped.length,
    longestWord: longestWordLength(name),
  };
}

interface DesignName {
  name: string;
  lower: string;
}

const NO_DESIGN_NAMES: DesignName[] = [];

interface ClassEntry {
  declaration: SchemaClass;
  lower: string;
  /** The length of the longest word of the name, which a typo of a word has to fit in */
  longestWord: number;
  /** The name without the C or C_ every class has, null when it has none */
  unprefixed: DesignName | null;
  /** The name of a client class as its server class is named, C_Foo as CFoo, else null */
  paired: DesignName | null;
  designNames: DesignName[];
  fields: ItemName<SchemaField>[];
  /** The classes it inherits from, the farthest first */
  bases: SchemaClass[];
}

interface EnumEntry {
  declaration: SchemaEnum;
  lower: string;
  longestWord: number;
  unprefixed: DesignName | null;
  paired: DesignName | null;
  designNames: DesignName[];
  members: ItemName<SchemaEnumMember>[];
}

type SearchEntry = ClassEntry | EnumEntry;

interface SearchIndex {
  /** Every declaration, in declaration order */
  entries: SearchEntry[];
  classes: Map<SchemaClass, ClassEntry>;
  /** How important a class is to list first: its subclasses, and more with an entity design name */
  importance: Map<SchemaClass, number>;
  /** The types of fields as text, filled in when a pair of classes is compared */
  pairedTypes: Map<SchemaField, string>;
}

type DeclarationsMap = Map<string, Map<string, Declaration>>;

const searchIndexCache = new WeakMap<SearchContext["designNamesByDeclaration"], SearchIndex>();

/**
 * Lowercased names of every declaration, field, member and design name of a game, in declaration
 * order. They only change per game, so they are cached on the game's design names like the
 * metadata keys are on its declarations
 */
function getSearchIndex(context: SearchContext): SearchIndex {
  const { declarations, designNamesByDeclaration } = context;
  let index = searchIndexCache.get(designNamesByDeclaration);
  if (index) return index;

  index = {
    entries: [],
    classes: new Map(),
    importance: new Map(),
    pairedTypes: new Map(),
  };
  for (const declaration of allDeclarations(declarations)) {
    const lower = declaration.name.toLowerCase();
    const paired = pairedDeclarationName(declaration.name);
    let designNames = NO_DESIGN_NAMES;
    const designNameList = designNamesByDeclaration.get(declaration);
    if (designNameList) {
      designNames = designNameList.map((name) => ({ name, lower: name.toLowerCase() }));
    }

    const longestWord = longestWordLength(declaration.name);
    if (declaration.kind === "class") {
      const fields = declaration.fields.map((f) => indexItem(f, f.name, true));
      const unprefixed = unprefixedClassName(declaration.name);
      const bases = baseClasses(declarations, declaration);
      const entry: ClassEntry = {
        declaration,
        lower,
        longestWord,
        unprefixed,
        paired,
        designNames,
        fields,
        bases,
      };
      index.entries.push(entry);
      index.classes.set(declaration, entry);
    } else {
      const members = declaration.members.map((m) => indexItem(m, m.name, false));
      const entry: EnumEntry = {
        declaration,
        lower,
        longestWord,
        unprefixed: null,
        paired,
        designNames,
        members,
      };
      index.entries.push(entry);
    }
  }
  fillImportance(index);
  searchIndexCache.set(designNamesByDeclaration, index);
  return index;
}

/**
 * A class name without its C or C_ prefix, so CGameRules is the name GameRules to look for.
 * Null for a name that doesn't start with a C before an uppercase letter or an underscore
 */
function unprefixedClassName(name: string): DesignName | null {
  if (name.length < 2 || name[0] !== "C") return null;

  const second = name.charCodeAt(1);
  const isUppercase = second >= 65 && second <= 90;
  let start = 0;
  if (name[1] === "_") start = 2;
  else if (isUppercase) start = 1;
  if (start === 0 || start >= name.length) return null;

  const rest = name.slice(start);
  return { name: rest, lower: rest.toLowerCase() };
}

/** The name of a client class the way its server class is named, null for any other name */
function pairedDeclarationName(name: string): DesignName | null {
  if (!name.startsWith("C_")) return null;
  const paired = serverClassName(name);
  if (paired !== "C" + name.slice(2)) return null;
  return { name: paired, lower: paired.toLowerCase() };
}

/** Counts the subclasses of every class once, and adds the weight of entity design names */
function fillImportance(index: SearchIndex) {
  const subclasses = new Map<SchemaClass, number>();
  for (const entry of index.classes.values()) {
    for (const base of entry.bases) {
      subclasses.set(base, (subclasses.get(base) ?? 0) + 1);
    }
  }
  for (const entry of index.classes.values()) {
    let importance = subclasses.get(entry.declaration) ?? 0;
    if (entry.designNames.length > 0) importance += ENTITY_IMPORTANCE;
    index.importance.set(entry.declaration, importance);
  }
}

/** The classes a class inherits from, the farthest first */
function baseClasses(declarations: DeclarationsMap, declaration: SchemaClass): SchemaClass[] {
  const bases: SchemaClass[] = [];
  for (const { parent } of inheritedBases(declarations, declaration.parents)) {
    const base = declarations.get(parent.module)?.get(parent.name);
    if (base?.kind === "class") bases.push(base);
  }
  return bases;
}

// -- Matching --

function wordMatch(
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
 * The pattern against a name. A match that doesn't start the name is tried again against the name
 * without its class prefix, so "gamerules" starts CGameRules. The better one wins, with ranges in
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
function scoreDeclarationName(
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
 * weapon_c4, so a word that starts it says no more than one that starts a word of a class name.
 * Only a word written like a design name keeps its prefix match
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
function scoreItem<T>(word: string, name: ItemName<T>): NameMatch | null {
  const raw = scoreName(word, name.name, name.lower, false);
  if (name.stripped === null) return raw;

  return betterWithoutStart(word, raw, name.stripped, name.strippedLower, name.strippedStart);
}

interface ItemWords {
  classSide: readonly WordMatch[];
  itemSide: readonly WordMatch[];
  tier: number;
  score: number;
}

const itemScratch: (NameMatch | null)[] = [];
const matchedScratch: WordMatch[] = [];

/**
 * Splits the name words between a field or member and its declaration. Every word the item
 * matches is the item's, the rest have to match the declaration. Null when a word matches
 * neither, or when no word matches the item and `needItemWord` is set.
 *
 * When the declaration's name has every word, the item has all of them or none: a mix would
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
function matchItemWords<T>(
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

function hasMetadataFilter(parsed: ParsedSearch): boolean {
  return parsed.metadataKeys.length > 0 || parsed.metadataValues.length > 0;
}

function metadataSatisfied(metadata: SchemaMetadataEntry[], parsed: ParsedSearch): boolean {
  if (!hasMetadataFilter(parsed)) return true;
  const { metadataKeys, metadataValues } = parsed;
  if (metadataKeys.length > 0 && !matchesMetadataKeys(metadata, metadataKeys)) return false;
  if (metadataValues.length > 0 && !matchesMetadataValues(metadata, metadataValues)) return false;
  return true;
}

/** The entries with a metadata: key or a metadatavalue: value in them */
function matchingMetadata(
  metadata: SchemaMetadataEntry[],
  keys: string[],
  values: string[],
): SchemaMetadataEntry[] {
  return metadata.filter((entry) => {
    const name = entry.name.toLowerCase();
    if (keys.some((key) => name.includes(key))) return true;
    const text = metadataValueText(entry.value)?.toLowerCase();
    return text !== undefined && values.some((value) => text.includes(value));
  });
}

/**
 * Adds the tag of the metadata: and metadatavalue: filters for metadata that has what they ask
 * for, nothing without such filters. False when the metadata misses one
 */
function addMetadataTag(
  tags: TagMatch[],
  metadata: SchemaMetadataEntry[],
  parsed: ParsedSearch,
): boolean {
  if (!metadataSatisfied(metadata, parsed)) return false;
  if (!hasMetadataFilter(parsed)) return true;

  const { metadataKeys, metadataValues } = parsed;
  const entries = matchingMetadata(metadata, metadataKeys, metadataValues);
  tags.push({ kind: "metadata", entries });
  return true;
}

function hasEntityFilter(parsed: ParsedSearch): boolean {
  return (
    parsed.entityWords.length > 0 || parsed.inputWords.length > 0 || parsed.outputWords.length > 0
  );
}

/** The entity: and input:/output: filters of a declaration, null when it doesn't pass them */
function entityTags(
  context: SearchContext,
  entry: SearchEntry,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  if (!hasEntityFilter(parsed)) return NO_TAGS;

  const { entityWords, inputWords, outputWords } = parsed;
  const tags: TagMatch[] = [];

  // OR across entity: words, like module:
  if (entityWords.length > 0) {
    const matching: string[] = [];
    for (const designName of entry.designNames) {
      if (entityWords.some((w) => designName.lower.includes(w))) matching.push(designName.name);
    }
    if (matching.length === 0) return null;
    tags.push({ kind: "entity", designNames: matching });
  }

  if (inputWords.length > 0 || outputWords.length > 0) {
    const entities = context.entitiesByDeclaration.get(entry.declaration);
    if (!entities) return null;
    // Only the entity's own inputs/outputs, inherited ones would match every entity
    const inputs = namesMatching(
      entities.map((e) => e.inputs),
      inputWords,
    );
    const outputs = namesMatching(
      entities.map((e) => e.outputs),
      outputWords,
    );
    if (inputWords.length > 0 && inputs.length === 0) return null;
    if (outputWords.length > 0 && outputs.length === 0) return null;
    tags.push({ kind: "io", inputs, outputs });
  }
  return tags;
}

/**
 * The metadata: and network: filters a declaration satisfies itself, as tags. Null when it
 * misses one. Enums have no network data
 */
function declarationTags(
  declaration: Declaration,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  const { networkWords } = parsed;
  if (!hasMetadataFilter(parsed) && networkWords.length === 0) return NO_TAGS;
  const tags: TagMatch[] = [];

  if (!addMetadataTag(tags, declaration.metadata, parsed)) return null;

  if (networkWords.length > 0) {
    const network = declaration.kind === "class" ? declaration.network : undefined;
    if (!network || !matchesNetworkWords(network, networkWords)) return null;
    tags.push({ kind: "network", words: networkWords });
  }
  return tags;
}

/**
 * The offset:, metadata: and network: filters of a field, null when it misses one. A field has no
 * enum value
 */
function fieldTags(field: SchemaField, parsed: ParsedSearch): readonly TagMatch[] | null {
  const { offsets, enumValues, networkWords } = parsed;
  if (enumValues.size > 0) return null;
  if (offsets.size === 0 && !hasMetadataFilter(parsed) && networkWords.length === 0) {
    return NO_TAGS;
  }
  const tags: TagMatch[] = [];

  if (offsets.size > 0) {
    if (field.offset === undefined || !offsets.has(field.offset)) return null;
    tags.push({ kind: "offset", offset: field.offset });
  }

  if (!addMetadataTag(tags, field.metadata, parsed)) return null;

  if (networkWords.length > 0) {
    if (!field.network || !matchesNetworkWords(field.network, networkWords)) return null;
    tags.push({ kind: "network", words: networkWords });
  }
  return tags;
}

/** The enumvalue: and metadata: filters of a member, null when it misses one. It has no offset */
function memberTags(member: SchemaEnumMember, parsed: ParsedSearch): readonly TagMatch[] | null {
  const { offsets, enumValues, networkWords } = parsed;
  if (offsets.size > 0 || networkWords.length > 0) return null;
  if (enumValues.size === 0 && !hasMetadataFilter(parsed)) return NO_TAGS;
  const tags: TagMatch[] = [];

  if (enumValues.size > 0) {
    if (!enumValues.has(member.value)) return null;
    tags.push({ kind: "enumValue", value: member.value });
  }

  if (!addMetadataTag(tags, member.metadata, parsed)) return null;
  return tags;
}

/**
 * The metadata: and network: tags a declaration satisfies itself, for its fields and members to
 * list by name words alone. Null without name words, without such filters, or when it misses one
 */
function sharedItemTags(
  own: readonly TagMatch[] | null,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  if (parsed.nameWords.length === 0) return null;
  if (!hasMetadataFilter(parsed) && parsed.networkWords.length === 0) return null;
  return own;
}

/** The tags of a field that has the declaration's metadata and network tags, the offset: its own */
function fieldTagsWithShared(
  field: SchemaField,
  parsed: ParsedSearch,
  shared: readonly TagMatch[],
): readonly TagMatch[] | null {
  const { offsets, enumValues } = parsed;
  if (enumValues.size > 0) return null;
  if (offsets.size === 0) return shared;
  if (field.offset === undefined || !offsets.has(field.offset)) return null;
  return [{ kind: "offset", offset: field.offset }, ...shared];
}

/** The tags of a member that has the declaration's metadata tags, the enumvalue: its own */
function memberTagsWithShared(
  member: SchemaEnumMember,
  parsed: ParsedSearch,
  shared: readonly TagMatch[],
): readonly TagMatch[] | null {
  const { offsets, enumValues } = parsed;
  if (offsets.size > 0) return null;
  if (enumValues.size === 0) return shared;
  if (!enumValues.has(member.value)) return null;
  return [{ kind: "enumValue", value: member.value }, ...shared];
}

// -- Pairing --

/** The type of a field as text with C_Foo and CFoo the same, also inside template arguments */
function pairedTypeText(index: SearchIndex, field: SchemaField): string {
  let text = index.pairedTypes.get(field);
  if (text === undefined) {
    text = serverClassName(formatFieldType(field.type));
    index.pairedTypes.set(field, text);
  }
  return text;
}

/** The client class of a server class and the other way around, if it has one */
function partnerOf(
  crossModuleLookup: Map<string, Declaration>,
  declaration: Declaration,
): Declaration | undefined {
  return crossModuleLookup.get(declarationKey(declaration.module, declaration.name));
}

/** Whether two lists of words are the same words, matched in the same way when `bySource` is set */
function sameWords(a: readonly WordMatch[], b: readonly WordMatch[], bySource: boolean): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].word !== b[i].word) return false;
    if (bySource && a[i].source !== b[i].source) return false;
  }
  return true;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Whether two tags are the same reason for a hit: the same kind, with the same content */
function sameTag(a: TagMatch, b: TagMatch): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "entity" && b.kind === "entity") {
    return sameStrings(a.designNames, b.designNames);
  }
  if (a.kind === "io" && b.kind === "io") {
    return a.inputs.length === b.inputs.length && a.outputs.length === b.outputs.length;
  }
  if (a.kind === "metadata" && b.kind === "metadata") {
    return sameStrings(
      a.entries.map((e) => e.name),
      b.entries.map((e) => e.name),
    );
  }
  if (a.kind === "enumValue" && b.kind === "enumValue") return a.value === b.value;
  return true;
}

/**
 * Whether two hits were made by the same words and tags, apart from the names that differ between
 * the client and the server class. A word on the class side counts the same whichever of the
 * class's names it matched
 */
function sameReason(a: PairableHit, b: PairableHit): boolean {
  if (!sameWords(a.nameWords, b.nameWords, false)) return false;
  if (a.kind !== "name" && b.kind !== "name") {
    if (!sameWords(a.fieldWords, b.fieldWords, true)) return false;
  }
  if (a.tags.length !== b.tags.length) return false;
  for (let i = 0; i < a.tags.length; i++) {
    if (!sameTag(a.tags[i], b.tags[i])) return false;
  }
  return true;
}

/** The name that pairs a hit with the other side's: the field or member name, none for classes */
function pairedItemName(hit: PairableHit): string {
  return hit.kind === "name" ? "" : itemName(hit);
}

function canPair(index: SearchIndex, a: PairableHit, b: PairableHit): boolean {
  if (a.kind !== b.kind) return false;
  if (!sameReason(a, b)) return false;
  if (a.kind === "field" && b.kind === "field") {
    return pairedTypeText(index, a.field) === pairedTypeText(index, b.field);
  }
  if (a.kind === "member" && b.kind === "member") return a.member.value === b.member.value;
  return true;
}

/** The side whose name matched better, the server on a tie */
function betterSide<T extends { declaration: Declaration; tier: number; score: number }>(
  a: T,
  b: T,
): T {
  if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
  if (a.score !== b.score) return a.score < b.score ? a : b;
  return b.declaration.module === "server" ? b : a;
}

/**
 * Puts the hits of a client class and its server class in one row each time both hit the same
 * way, a class's hits are matched to the other's by field or member name. The rest stay alone
 */
function pairHits<T extends PairableHit>(
  index: SearchIndex,
  groups: Map<Declaration, T[]>,
  crossModuleLookup: Map<string, Declaration>,
): SearchRow<T>[] {
  const rows: SearchRow<T>[] = [];
  const handled = new Set<Declaration>();

  for (const [declaration, hits] of groups) {
    if (handled.has(declaration)) continue;
    handled.add(declaration);

    const partner = partnerOf(crossModuleLookup, declaration);
    const partnerHits = partner && !handled.has(partner) ? groups.get(partner) : undefined;
    if (!partner || !partnerHits) {
      for (const hit of hits) rows.push({ hit });
      continue;
    }
    handled.add(partner);

    const partnerByName = new Map<string, T>();
    for (const hit of partnerHits) partnerByName.set(pairedItemName(hit), hit);

    const paired = new Set<T>();
    for (const hit of hits) {
      const other = partnerByName.get(pairedItemName(hit));
      if (!other || !canPair(index, hit, other)) {
        rows.push({ hit });
        continue;
      }
      paired.add(other);
      const better = betterSide(hit, other);
      rows.push({ hit: better, paired: better === hit ? other : hit });
    }
    for (const hit of partnerHits) {
      if (!paired.has(hit)) rows.push({ hit });
    }
  }
  return rows;
}

// -- Sorting --

/** The field, member or declaration a hit is named by */
function namedBy(hit: PairableHit): { name: string } {
  if (hit.kind === "name") return hit.declaration;
  if (hit.kind === "field") return hit.field;
  return hit.member;
}

/** Whether some name words matched the declaration and the others the field or member */
function isSplit(hit: PairableHit): boolean {
  return hit.kind !== "name" && hit.nameWords.length > 0 && hit.fieldWords.length > 0;
}

/**
 * Whether the class side of a hit matched an entity design name only: every word matched it, and
 * the class name matches no word as well
 */
function viaDesignNameOnly(hit: PairableHit): boolean {
  if (hit.nameWords.length === 0) return false;

  for (const w of hit.nameWords) {
    if (w.source !== "designName") return false;
    if (w.nameTier !== undefined && w.nameTier <= w.tier) return false;
  }
  return true;
}

const NUMBERED_NAME = /_\d+$/;

function isNetworkedHit(hit: PairableHit): boolean {
  return hit.kind === "field" && hit.field.network != null;
}

function isMemberField(hit: PairableHit): boolean {
  return hit.kind === "field" && hit.field.name.startsWith("m_");
}

/** Compares two flags, the one that has it first */
function compareFlags(a: boolean, b: boolean): number {
  if (a === b) return 0;
  return a ? -1 : 1;
}

/** What a row sorts by before its names, worked out once per row */
interface RowRank<T extends PairableHit> {
  row: SearchRow<T>;
  split: boolean;
  designNameOnly: boolean;
  numbered: boolean;
  paired: boolean;
  networked: boolean;
  importance: number;
  memberField: boolean;
}

function rankRow<T extends PairableHit>(index: SearchIndex, row: SearchRow<T>): RowRank<T> {
  const { hit } = row;
  return {
    row,
    split: isSplit(hit),
    designNameOnly: viaDesignNameOnly(hit),
    numbered: NUMBERED_NAME.test(hit.declaration.name),
    paired: row.paired !== undefined,
    networked: isNetworkedHit(hit),
    importance: importanceOf(index, hit.declaration),
    memberField: isMemberField(hit),
  };
}

/**
 * Split hits after the ones with every word in one name, then tier, a class name match before
 * an entity name only one, a numbered class name (like Foo_2) after the others, score, then
 * what makes a hit more relevant: both client and server, a networked field, a class with many
 * subclasses or an entity name, a field with the m_ prefix, and last the name and module
 */
function compareRanks(a: RowRank<PairableHit>, b: RowRank<PairableHit>): number {
  const aHit = a.row.hit;
  const bHit = b.row.hit;
  const bySplit = compareFlags(!a.split, !b.split);
  if (bySplit !== 0) return bySplit;
  if (aHit.tier !== bHit.tier) return aHit.tier - bHit.tier;
  const byDesign = compareFlags(!a.designNameOnly, !b.designNameOnly);
  if (byDesign !== 0) return byDesign;
  const byNumbered = compareFlags(!a.numbered, !b.numbered);
  if (byNumbered !== 0) return byNumbered;
  if (aHit.score !== bHit.score) return aHit.score - bHit.score;

  const byPair = compareFlags(a.paired, b.paired);
  if (byPair !== 0) return byPair;
  const byNetwork = compareFlags(a.networked, b.networked);
  if (byNetwork !== 0) return byNetwork;
  if (a.importance !== b.importance) return b.importance - a.importance;
  const byPrefix = compareFlags(a.memberField, b.memberField);
  if (byPrefix !== 0) return byPrefix;

  const byName = compareNames(namedBy(aHit), namedBy(bHit));
  if (byName !== 0) return byName;
  const byDeclaration = compareNames(aHit.declaration, bHit.declaration);
  if (byDeclaration !== 0) return byDeclaration;
  return compareModuleNames(aHit.declaration.module, bHit.declaration.module);
}

/** The rows in compareRanks order */
function sortRows<T extends PairableHit>(index: SearchIndex, rows: SearchRow<T>[]): SearchRow<T>[] {
  const ranks = rows.map((row) => rankRow(index, row));
  ranks.sort(compareRanks);
  return ranks.map((rank) => rank.row);
}

function importanceOf(index: SearchIndex, declaration: Declaration): number {
  if (declaration.kind !== "class") return 0;
  return index.importance.get(declaration) ?? 0;
}

function compareSimilarRows(aRow: SimilarRow, bRow: SimilarRow): number {
  const a = aRow.hit;
  const b = bRow.hit;
  if (a.score !== b.score) return a.score - b.score;
  const byName = compareNames(a.declaration, b.declaration);
  if (byName !== 0) return byName;
  const byModule = compareModuleNames(a.declaration.module, b.declaration.module);
  if (byModule !== 0) return byModule;
  if (a.kind === "fuzzy" || b.kind === "fuzzy") return 0;
  return compareNames(namedBy(a), namedBy(b));
}

// -- Inherited fields --

/** A field of a base class that every field side word of a query matches */
interface BaseFieldMatch {
  field: SchemaField;
  /** Where the field is in its class */
  index: number;
  words: WordMatch[];
}

interface InheritedSearch {
  /** The matching fields of the classes for the field side words, joined, of a split */
  matches: Map<string, Map<SchemaClass, BaseFieldMatch[]>>;
  hits: Map<SchemaClass, Map<SchemaField, InheritedSide>>;
  /** Where the field of each side is in its class, to list the sides of a class by declaration */
  fieldIndexes: Map<InheritedSide, number>;
  /** How well the best of the classes of each side matches the class side words */
  bestClasses: Map<InheritedSide, MatchRating>;
}

/** The fields of a class that every word matches, at the start of a word or better */
function matchFields(entry: ClassEntry, words: string[]): BaseFieldMatch[] {
  const matches: BaseFieldMatch[] = [];
  for (let index = 0; index < entry.fields.length; index++) {
    const name = entry.fields[index];
    const matched: WordMatch[] = [];
    for (const word of words) {
      const match = scoreItem(word, name);
      if (match === null || match.tier > TIER_WORD_START) break;
      matched.push(wordMatch(word, "field", name.name, match));
    }
    if (matched.length === words.length) matches.push({ field: name.item, index, words: matched });
  }
  return matches;
}

function addNewWords(words: readonly WordMatch[], more: readonly WordMatch[]): WordMatch[] {
  const merged = words.slice();
  for (const match of more) {
    if (!merged.some((w) => w.word === match.word)) merged.push(match);
  }
  return merged;
}

function addInherited(
  search: InheritedSearch,
  base: SchemaClass,
  match: BaseFieldMatch,
  inheriting: SchemaClass,
  rating: MatchRating,
) {
  let perField = search.hits.get(base);
  if (!perField) {
    perField = new Map();
    search.hits.set(base, perField);
  }

  const existing = perField.get(match.field);
  if (!existing) {
    const side: InheritedSide = {
      declaration: base,
      field: match.field,
      fieldWords: match.words,
      classes: [inheriting],
      tier: TIER_EXACT,
      score: 0,
    };
    perField.set(match.field, side);
    search.fieldIndexes.set(side, match.index);
    search.bestClasses.set(side, rating);
    return;
  }

  existing.classes.push(inheriting);
  if (isBetterMatch(rating, search.bestClasses.get(existing)!)) {
    search.bestClasses.set(existing, rating);
  }
  // Classes that match other words of the query find the field by the words they left over
  if (existing.fieldWords !== match.words) {
    existing.fieldWords = addNewWords(existing.fieldWords, match.words);
  }
}

/**
 * Adds the fields a class has from its bases for a split query: the words its name matches at
 * the start of a word, and that have a few letters, are its own, and a base's field has to match
 * all the others at the start of a word too. A base is matched once for each set of words
 */
function collectInherited(
  index: SearchIndex,
  search: InheritedSearch,
  entry: ClassEntry,
  words: string[],
  classWords: (WordMatch | null)[],
) {
  const nameWords: WordMatch[] = [];
  const fieldSide: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const match = classWords[i];
    const isClassWord =
      match !== null && match.tier <= TIER_WORD_START && words[i].length >= INHERITED_MIN_WORD_LEN;
    if (isClassWord) nameWords.push(match);
    else fieldSide.push(words[i]);
  }
  if (nameWords.length === 0 || fieldSide.length === 0) return;

  const { bases } = entry;
  if (bases.length === 0) return;

  const key = fieldSide.join(" ");
  let byClass = search.matches.get(key);
  if (!byClass) {
    byClass = new Map();
    search.matches.set(key, byClass);
  }

  const rating = combineMatches(nameWords);
  for (const base of bases) {
    let matches = byClass.get(base);
    if (!matches) {
      const baseEntry = index.classes.get(base);
      matches = baseEntry ? matchFields(baseEntry, fieldSide) : [];
      byClass.set(base, matches);
    }
    for (const match of matches) addInherited(search, base, match, entry.declaration, rating);
  }
}

/**
 * Puts the hits of the field of a client class and its server class in one row when the field
 * has the same name and type. The server side leads
 */
function pairInherited(
  index: SearchIndex,
  sides: InheritedSide[],
  crossModuleLookup: Map<string, Declaration>,
): SearchRow<InheritedSide>[] {
  const fieldKey = (declaration: Declaration, name: string) =>
    `${declarationKey(declaration.module, declaration.name)}/${name}`;
  const byField = new Map<string, InheritedSide>();
  for (const side of sides) byField.set(fieldKey(side.declaration, side.field.name), side);

  const rows: SearchRow<InheritedSide>[] = [];
  const handled = new Set<InheritedSide>();
  for (const side of sides) {
    if (handled.has(side)) continue;
    handled.add(side);

    const { declaration, field } = side;
    const partner = partnerOf(crossModuleLookup, declaration);
    const other = partner && byField.get(fieldKey(partner, field.name));
    if (!other || handled.has(other) || !samePairedType(index, field, other.field)) {
      rows.push({ hit: side });
      continue;
    }
    handled.add(other);

    const [server, client] = declaration.module === "server" ? [side, other] : [other, side];
    rows.push({ hit: server, paired: client });
  }
  return rows;
}

function samePairedType(index: SearchIndex, a: SchemaField, b: SchemaField): boolean {
  return pairedTypeText(index, a) === pairedTypeText(index, b);
}

/** Sets the quality of a side: its field words with the best of its classes' words */
function rateInherited(side: InheritedSide, bestClass: MatchRating) {
  const field = combineMatches(side.fieldWords);
  side.tier = Math.max(field.tier, bestClass.tier);
  side.score = field.score + bestClass.score;
}

function compareInherited(
  index: SearchIndex,
  fieldIndexes: Map<InheritedSide, number>,
  a: InheritedSide,
  b: InheritedSide,
): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.score !== b.score) return a.score - b.score;
  const aDepth = index.classes.get(a.declaration)!.bases.length;
  const bDepth = index.classes.get(b.declaration)!.bases.length;
  if (aDepth !== bDepth) return aDepth - bDepth;

  const byName = compareNames(a.declaration, b.declaration);
  if (byName !== 0) return byName;
  const byModule = compareModuleNames(a.declaration.module, b.declaration.module);
  if (byModule !== 0) return byModule;
  return fieldIndexes.get(a)! - fieldIndexes.get(b)!;
}

/** The inherited hits, paired and ordered by declaring class with the bases first */
function finishInherited(
  context: SearchContext,
  index: SearchIndex,
  search: InheritedSearch,
): SearchRow<InheritedSide>[] {
  const sides: InheritedSide[] = [];
  for (const perField of search.hits.values()) sides.push(...perField.values());
  for (const side of sides) rateInherited(side, search.bestClasses.get(side)!);

  const rows = pairInherited(index, sides, context.crossModuleLookup);
  rows.sort((a, b) => compareInherited(index, search.fieldIndexes, a.hit, b.hit));
  return rows;
}

// -- Declarations --

/** The declarations of the rows, each once, with the classes of the inherited fields */
function resultDeclarations(
  names: SearchRow<NameHit>[],
  fields: SearchRow<FieldHit | MemberHit>[],
  inherited: SearchRow<InheritedSide>[],
): Set<Declaration> {
  const declarations = new Set<Declaration>();
  for (const row of names) {
    for (const hit of rowSides(row)) declarations.add(hit.declaration);
  }
  for (const row of fields) {
    for (const hit of rowSides(row)) declarations.add(hit.declaration);
  }
  for (const row of inherited) {
    for (const side of rowSides(row)) {
      for (const inheritedClass of side.classes) declarations.add(inheritedClass);
    }
  }
  return declarations;
}

// -- Search --

/**
 * Matches the words against a declaration name and its entity design names. `classWords` gets the
 * words that match as they are, null for the others. Returns whether every word does.
 *
 * With `fuzzy`, `fuzzyWords` also gets the words that only match fuzzily, in order. It is as long
 * as `words` when every word matches at least fuzzily, shorter after the first that doesn't
 */
function matchClassWords(
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

    if (match === null) fuzzyPossible = false;
    else if (fuzzyPossible) fuzzyWords.push(match);
  }
  return allMatch;
}

/** The best of the joined forms of the words against a declaration name or design name */
function matchClassJoined(
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
function nameHitWords(
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

/** What the fields or members of a declaration are matched with. Reused for every declaration */
interface ItemQuery {
  parsed: ParsedSearch;
  /** The words joined into one name, none unless there are two or more words */
  forms: readonly string[];
  /** Words that only the declaration matches are its name hit, not a field or member hit */
  needItemWord: boolean;
  classWords: (WordMatch | null)[];
  classMatchesAll: boolean;
  /** The metadata and network tags of the declaration, which its items list by name words alone */
  shared: readonly TagMatch[] | null;
}

function fieldHit(
  declaration: SchemaClass,
  name: ItemName<SchemaField>,
  matched: ItemWords,
  tags: readonly TagMatch[],
): FieldHit {
  return {
    kind: "field",
    declaration,
    field: name.item,
    tier: matched.tier,
    score: matched.score,
    nameWords: matched.classSide,
    tags,
    fieldWords: matched.itemSide,
  };
}

function memberHit(
  declaration: SchemaEnum,
  name: ItemName<SchemaEnumMember>,
  matched: ItemWords,
  tags: readonly TagMatch[],
): MemberHit {
  return {
    kind: "member",
    declaration,
    member: name.item,
    tier: matched.tier,
    score: matched.score,
    nameWords: matched.classSide,
    tags,
    fieldWords: matched.itemSide,
  };
}

/**
 * Adds the hits of the fields of a class or the members of an enum. An item passes the filters
 * with its own tags, or else with the declaration's when a name word matches it
 */
function collectItemHits<D extends Declaration, I>(
  declaration: D,
  items: ItemName<I>[],
  source: "field" | "member",
  query: ItemQuery,
  ownTags: (item: I, parsed: ParsedSearch) => readonly TagMatch[] | null,
  sharedTags: (
    item: I,
    parsed: ParsedSearch,
    shared: readonly TagMatch[],
  ) => readonly TagMatch[] | null,
  makeHit: (
    declaration: D,
    name: ItemName<I>,
    matched: ItemWords,
    tags: readonly TagMatch[],
  ) => FieldHit | MemberHit,
  groups: Map<Declaration, (FieldHit | MemberHit)[]>,
) {
  const { parsed, forms, classWords, classMatchesAll, shared } = query;

  for (const name of items) {
    let tags = ownTags(name.item, parsed);
    let needWord = query.needItemWord;
    if (tags === null && shared !== null) {
      tags = sharedTags(name.item, parsed, shared);
      needWord = true;
    }
    if (tags === null) continue;

    const words = parsed.nameWords;
    const matched = matchItemWords(
      words,
      forms,
      classWords,
      classMatchesAll,
      name,
      source,
      needWord,
    );
    if (matched === null) continue;

    pushTo(groups, declaration, makeHit(declaration, name, matched, tags));
  }
}

/**
 * Searches a game's classes, enums, fields and enum members. The hits point at the declarations,
 * fields and members themselves.
 *
 * A declaration's name and its fields are matched independently. A word has to be in the
 * field name, or else in the declaration name or an entity design name (a split hit), and
 * every word has to be somewhere. Fields also match by their name without the type prefix.
 * Fields and members only match as a substring, declaration names fuzzily too. Two or more
 * words also match one name joined, a space standing for an underscore or nothing.
 *
 * A word like Class::member or Class.member that finds nothing is searched again as two words,
 * a class and a field.
 */
export function searchSchemas(
  context: SearchContext,
  parsed: ParsedSearch,
  options: SearchOptions = {},
): SearchResult {
  const { similar = true } = options;
  const split = splitMemberWords(parsed.nameWords);
  if (split === null) return searchWords(context, parsed, similar);

  // The similar names are only looked for in the search that is returned
  const result = searchWords(context, parsed, false);
  if (!hasSchemaHits(result)) {
    const retried = searchWords(context, { ...parsed, nameWords: split }, similar);
    if (hasSchemaHits(retried)) return retried;
  }
  return similar ? searchWords(context, parsed, true) : result;
}

export interface SearchOptions {
  /** Whether to look for similar names, which are not results. On unless it's false */
  similar?: boolean;
}

export function hasSchemaHits(result: SearchResult): boolean {
  return result.names.length > 0 || result.fields.length > 0 || result.inherited.length > 0;
}

/** The last :: or . of a word, where Class::member and Class.member are split, null without one */
function memberSeparator(word: string): { at: number; length: number } | null {
  const scope = word.lastIndexOf("::");
  const dot = word.lastIndexOf(".");
  if (scope > dot) return { at: scope, length: 2 };
  if (dot >= 0) return { at: dot, length: 1 };
  return null;
}

/** The words with every Class::member and Class.member split in two, null when none is */
function splitMemberWords(words: string[]): string[] | null {
  const split: string[] = [];
  let changed = false;
  for (const word of words) {
    const separator = memberSeparator(word);
    const left = separator ? word.slice(0, separator.at) : "";
    const right = separator ? word.slice(separator.at + separator.length) : "";
    if (left === "" || right === "") {
      split.push(word);
      continue;
    }
    split.push(left, right);
    changed = true;
  }
  return changed ? split : null;
}

function searchWords(
  context: SearchContext,
  parsed: ParsedSearch,
  withSimilar: boolean,
): SearchResult {
  const result: SearchResult = {
    names: [],
    fields: [],
    inherited: [],
    similar: [],
    declarations: new Set(),
  };
  if (!hasSearchFilters(parsed)) return result;

  const { nameWords: words, moduleWords, offsets, enumValues, networkWords } = parsed;
  const hasFieldTag =
    offsets.size > 0 || enumValues.size > 0 || hasMetadataFilter(parsed) || networkWords.length > 0;
  const hasFieldFilter = words.length > 0 || hasFieldTag;
  // Offsets and enum values are the fields' and members', a declaration has neither
  const declarationsMatch = offsets.size === 0 && enumValues.size === 0;

  const nameGroups = new Map<Declaration, NameHit[]>();
  const fieldGroups = new Map<Declaration, (FieldHit | MemberHit)[]>();
  const similar: SimilarHit[] = [];
  const classWords: (WordMatch | null)[] = [];
  const fuzzyWords: WordMatch[] = [];
  const forms = words.length >= 2 ? joinedWordForms(words) : [];
  const query: ItemQuery = {
    parsed,
    forms,
    needItemWord: words.length > 0 && !hasFieldTag,
    classWords,
    classMatchesAll: false,
    shared: null,
  };

  const index = getSearchIndex(context);
  // Only words split between a class and a field have fields to find in the bases
  const inherited: InheritedSearch | null =
    words.length >= 2 && !hasFieldTag
      ? { matches: new Map(), hits: new Map(), fieldIndexes: new Map(), bestClasses: new Map() }
      : null;

  for (const entry of index.entries) {
    const { declaration } = entry;
    if (!matchesModule(declaration.module, moduleWords)) continue;

    const entity = entityTags(context, entry, parsed);
    if (entity === null) continue;

    const own = declarationTags(declaration, parsed);
    const listsDeclaration = declarationsMatch && own !== null;

    classWords.length = words.length;
    const allWordsMatch = matchClassWords(
      words,
      entry,
      withSimilar && listsDeclaration,
      classWords,
      fuzzyWords,
    );

    const classJoined = forms.length > 0 ? matchClassJoined(words, forms, entry) : null;
    const classMatchesAll = allWordsMatch || classJoined !== null;

    if (listsDeclaration) {
      const tags = entity.length === 0 ? own : [...entity, ...own];
      if (classMatchesAll) {
        const matched = words.length === 0 ? NO_WORDS : nameHitWords(classWords, classJoined);
        const { tier, score } = combineMatches(matched);
        const hit: NameHit = { kind: "name", declaration, tier, score, nameWords: matched, tags };
        pushTo(nameGroups, declaration, hit);
      } else if (fuzzyWords.length === words.length) {
        const fuzzy = fuzzyWords.slice();
        const { tier, score } = combineMatches(fuzzy);
        similar.push({ kind: "fuzzy", declaration, tier, score, nameWords: fuzzy, tags });
      }
    }

    if (!hasFieldFilter) continue;
    query.classMatchesAll = classMatchesAll;
    query.shared = sharedItemTags(own, parsed);
    if ("fields" in entry) {
      const { declaration: cls, fields } = entry;
      collectItemHits(
        cls,
        fields,
        "field",
        query,
        fieldTags,
        fieldTagsWithShared,
        fieldHit,
        fieldGroups,
      );
      if (inherited) collectInherited(index, inherited, entry, words, classWords);
    } else {
      const { declaration: enumeration, members } = entry;
      collectItemHits(
        enumeration,
        members,
        "member",
        query,
        memberTags,
        memberTagsWithShared,
        memberHit,
        fieldGroups,
      );
    }
  }

  result.names = sortRows(index, pairHits(index, nameGroups, context.crossModuleLookup));
  result.fields = sortRows(index, pairHits(index, fieldGroups, context.crossModuleLookup));
  if (inherited) result.inherited = finishInherited(context, index, inherited);
  result.declarations = resultDeclarations(result.names, result.fields, result.inherited);
  if (!withSimilar) return result;

  const resultCount = result.names.length + result.fields.length + result.inherited.length;
  const looksForTypos = !hasFieldTag && !hasEntityFilter(parsed) && resultCount < TYPO_MAX_RESULTS;
  const typos = looksForTypos ? collectTypoHits(index, parsed) : [];
  const typoClasses = new Set<Declaration>();
  for (const hit of typos) {
    if (hit.kind === "fuzzy") typoClasses.add(hit.declaration);
  }

  const kept: SimilarHit[] = [];
  for (const hit of typos) {
    if (!result.declarations.has(hit.declaration)) kept.push(hit);
  }
  for (const hit of similar) {
    const isTypoClass = hit.kind === "fuzzy" && typoClasses.has(hit.declaration);
    if (!isTypoClass && !result.declarations.has(hit.declaration)) kept.push(hit);
  }
  result.similar = pairSimilarHits(index, kept, context.crossModuleLookup);
  result.similar.sort(compareSimilarRows);
  return result;
}

/** Fuzzy hits of a client and a server class are one hit, a field or member's are paired rows */
function pairSimilarHits(
  index: SearchIndex,
  hits: SimilarHit[],
  crossModuleLookup: Map<string, Declaration>,
): SimilarRow[] {
  const fuzzyHits: FuzzyHit[] = [];
  const itemGroups = new Map<Declaration, (FieldHit | MemberHit)[]>();
  for (const hit of hits) {
    if (hit.kind === "fuzzy") fuzzyHits.push(hit);
    else pushTo(itemGroups, hit.declaration, hit);
  }

  const rows: SimilarRow[] = [];
  for (const hit of dropFuzzyTwins(fuzzyHits, crossModuleLookup)) rows.push({ hit });
  for (const row of pairHits(index, itemGroups, crossModuleLookup)) rows.push(row);
  return rows;
}

/** Leaves one of the client and the server hit of a class, the better side */
function dropFuzzyTwins(hits: FuzzyHit[], crossModuleLookup: Map<string, Declaration>): FuzzyHit[] {
  const byKey = new Map<string, FuzzyHit>();
  for (const hit of hits) {
    const { module, name } = hit.declaration;
    byKey.set(declarationKey(module, name), hit);
  }

  const dropped = new Set<FuzzyHit>();
  for (const hit of hits) {
    const partner = partnerOf(crossModuleLookup, hit.declaration);
    if (!partner || dropped.has(hit)) continue;
    const other = byKey.get(declarationKey(partner.module, partner.name));
    if (!other || other === hit || dropped.has(other)) continue;
    dropped.add(betterSide(hit, other) === hit ? other : hit);
  }
  return hits.filter((hit) => !dropped.has(hit));
}

function scoreEntryWord(word: string, entry: SearchEntry): NameMatch | null {
  if (word.startsWith("m_")) return null;
  return scoreDeclarationName(word, entry, false);
}

function typoEntryWord(word: string, entry: SearchEntry): NameMatch | null {
  return typoMatch(word, entry.declaration.name, entry.lower);
}

function typoItemWord<T>(word: string, name: ItemName<T>): NameMatch | null {
  return typoMatch(word, name.name, name.lower);
}

/** The matches of the words as the matches of a name, one per word */
function nameWordMatches(
  words: readonly string[],
  source: MatchSource,
  text: string,
  matches: readonly NameMatch[],
): WordMatch[] {
  const matched: WordMatch[] = [];
  for (let i = 0; i < words.length; i++) {
    matched.push(wordMatch(words[i], source, text, matches[i]));
  }
  return matched;
}

/**
 * Classes, enums, fields and members whose name has every word, one of them as a typo of a word of
 * the name: one letter added, left out, changed or swapped with the next. Fields are compared by
 * their words, which include the name without its type prefix
 */
function collectTypoHits(index: SearchIndex, parsed: ParsedSearch): SimilarHit[] {
  const { nameWords: words, moduleWords } = parsed;
  // A name without a word this long has no typo of any word
  const shortestTarget = shortestTypoTarget(words);
  if (shortestTarget === 0) return [];

  const hits: SimilarHit[] = [];
  for (const entry of index.entries) {
    const { declaration } = entry;
    if (!matchesModule(declaration.module, moduleWords)) continue;

    if (entry.longestWord >= shortestTarget) {
      const matches = matchTypoWords(words, entry, scoreEntryWord, typoEntryWord);
      if (matches !== null) {
        const matched = nameWordMatches(words, "name", declaration.name, matches);
        const { score } = combineMatches(matched);
        hits.push({
          kind: "fuzzy",
          declaration,
          tier: TIER_FUZZY,
          score,
          nameWords: matched,
          tags: NO_TAGS,
        });
      }
    }

    if ("fields" in entry) {
      for (const field of entry.fields) {
        if (field.longestWord < shortestTarget) continue;
        const fieldMatched = matchTypoItem(words, "field", field);
        if (fieldMatched === null) continue;
        hits.push(similarFieldHit(entry.declaration, field, fieldMatched));
      }
    } else {
      for (const member of entry.members) {
        if (member.longestWord < shortestTarget) continue;
        const memberMatched = matchTypoItem(words, "member", member);
        if (memberMatched === null) continue;
        hits.push(similarMemberHit(entry.declaration, member, memberMatched));
      }
    }
  }
  return hits;
}

function matchTypoItem<T>(
  words: string[],
  source: MatchSource,
  name: ItemName<T>,
): WordMatch[] | null {
  const matches = matchTypoWords(words, name, scoreItem, typoItemWord);
  if (matches === null) return null;
  return nameWordMatches(words, source, name.name, matches);
}

function similarWords(matched: WordMatch[]): ItemWords {
  const { score } = combineMatches(matched);
  return { classSide: NO_WORDS, itemSide: matched, tier: TIER_FUZZY, score };
}

function similarFieldHit(
  declaration: SchemaClass,
  name: ItemName<SchemaField>,
  matched: WordMatch[],
): FieldHit {
  return fieldHit(declaration, name, similarWords(matched), NO_TAGS);
}

function similarMemberHit(
  declaration: SchemaEnum,
  name: ItemName<SchemaEnumMember>,
  matched: WordMatch[],
): MemberHit {
  return memberHit(declaration, name, similarWords(matched), NO_TAGS);
}

// -- Show filters --

/**
 * Whether a hit passes a show filter: its declaration does, except for networked, which a field
 * row passes by being networked itself. Enum members never are
 */
function hitPasses(hit: PairableHit | SimilarHit, show: ShowFilter, lookups: ShowLookups): boolean {
  if (show === "networked") {
    if (hit.kind === "field") return hit.field.network != null;
    if (hit.kind === "member") return false;
  }
  return SHOW_FILTERS[show].test(hit.declaration, lookups);
}

/**
 * The classes of an inherited field that pass a show filter. Networked tests the field, which
 * every class that has it passes with
 */
function inheritedClassesPassing(
  side: InheritedSide,
  show: ShowFilter,
  lookups: ShowLookups,
): SchemaClass[] {
  if (show === "networked") return side.field.network != null ? side.classes : [];

  const { test } = SHOW_FILTERS[show];
  return side.classes.filter((c) => test(c, lookups));
}

/** The side with the classes that pass the filter, null when none does */
function filterSide(
  side: InheritedSide,
  show: ShowFilter,
  lookups: ShowLookups,
): InheritedSide | null {
  const classes = inheritedClassesPassing(side, show, lookups);
  if (classes.length === 0) return null;
  if (classes.length === side.classes.length) return side;
  return { ...side, classes };
}

/**
 * The row with the sides that `keep` keeps, null when it keeps neither. A side that is kept alone
 * leads the row
 */
function filterRow<T extends { declaration: Declaration }>(
  row: SearchRow<T>,
  keep: (hit: T) => T | null,
): SearchRow<T> | null {
  const hit = keep(row.hit);
  if (!row.paired) {
    if (hit === null) return null;
    return hit === row.hit ? row : { hit };
  }

  const paired = keep(row.paired);
  if (hit && paired) return hit === row.hit && paired === row.paired ? row : { hit, paired };
  if (hit) return { hit };
  if (paired) return { hit: paired };
  return null;
}

function filterRows<T extends { declaration: Declaration }>(
  rows: SearchRow<T>[],
  keep: (hit: T) => T | null,
): SearchRow<T>[] {
  const kept: SearchRow<T>[] = [];
  for (const row of rows) {
    const filtered = filterRow(row, keep);
    if (filtered) kept.push(filtered);
  }
  return kept;
}

/**
 * The result narrowed to a show filter. A paired row keeps the side that passes, an inherited
 * field the classes that pass, and the declarations are those of the rows left
 */
export function filterSearchResult(
  result: SearchResult,
  show: ShowFilter,
  lookups: ShowLookups,
): SearchResult {
  if (show === "all") return result;

  const keepHit = <T extends PairableHit>(hit: T): T | null => {
    return hitPasses(hit, show, lookups) ? hit : null;
  };
  const names = filterRows(result.names, keepHit);
  const fields = filterRows(result.fields, keepHit);
  const inherited = filterRows(result.inherited, (side) => filterSide(side, show, lookups));
  const similar: SimilarRow[] = [];
  for (const row of result.similar) {
    if (isFuzzyRow(row)) {
      if (hitPasses(row.hit, show, lookups)) similar.push(row);
      continue;
    }
    const filtered = filterRow(row, keepHit);
    if (filtered) similar.push(filtered);
  }

  const declarations = resultDeclarations(names, fields, inherited);
  return { names, fields, inherited, similar, declarations };
}

/**
 * How many declarations each show filter leaves a row of, each counted once. Similar names
 * aren't results and don't count. Same as the size of `filterSearchResult(...).declarations`,
 * for every filter in one pass
 */
export function countSearchShowFilters(
  result: SearchResult,
  lookups: ShowLookups,
): Map<ShowFilter, number> {
  // Every filter but networked passes a row by its declaration, so the declarations tell
  const counts = countShowFilters(result.declarations, lookups, ["networked"]);
  counts.set("networked", filterSearchResult(result, "networked", lookups).declarations.size);
  return counts;
}
