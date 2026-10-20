import { declarationKey } from "../data/derived";
import { compareModuleNames } from "../data/modules";
import { compareNames } from "../data/schemas";
import type { Declaration, SchemaClass, SchemaField } from "../data/types";
import {
  combineMatches,
  isBetterMatch,
  TIER_EXACT,
  TIER_WORD_START,
  type MatchRating,
} from "./match-score";
import type { ClassEntry, SearchIndex } from "./search-index";
import { scoreItem, wordMatch } from "./search-names";
import { pairedTypeText, partnerOf } from "./search-rows";
import type { InheritedSide, SearchContext, SearchRow, WordMatch } from "./search-types";

/** A word of a class name has to be this long to look for the fields of its bases */
const INHERITED_MIN_WORD_LEN = 3;

/** A field of a base class that every field side word of a query matches */
interface BaseFieldMatch {
  field: SchemaField;
  /** Where the field is in its class */
  index: number;
  words: WordMatch[];
}

export interface InheritedSearch {
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
 * Adds the fields a class has from its bases for a split query. The words that its name matches
 * at the start of a word, and that have a few letters, are its own. A base's field has to match
 * all the other words at the start of a word too. Each set of words matches a base once
 */
export function collectInherited(
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
export function finishInherited(
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
