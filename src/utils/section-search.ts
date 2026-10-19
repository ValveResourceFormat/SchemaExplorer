import type { GameContext } from "../data/derived";
import { isFilterPrefix, isLoneFilterTag } from "./filtering";
import { nameMatchTier, TIER_FUZZY, TIER_PREFIX } from "./match-score";
import { isConsoleFilterWord, isLoneConsoleTag, type ConsoleMatch } from "./console-filtering";
import { joinLoneTags } from "./search-words";
import {
  itemName,
  strippedFieldName,
  type FieldHit,
  type MemberHit,
  type NameHit,
  type PairableHit,
  type SearchResult,
  type SearchRow,
} from "./search";

export type SearchMode = "schemas" | "console";

/**
 * The search as a section understands it, the other section's filter tags dropped.
 * `complete` is false when something was dropped, its results aren't for the same search then
 */
export function searchForSection(
  search: string,
  section: SearchMode,
): { search: string; complete: boolean } {
  const isLoneTag = (word: string) => isLoneFilterTag(word) || isLoneConsoleTag(word);
  const isTag = (word: string) => isFilterPrefix(word) || isConsoleFilterWord(word);
  const words = joinLoneTags(search.split(/\s+/).filter(Boolean), isLoneTag, isTag);
  const kept = words.filter((word) => {
    const lower = word.toLowerCase();
    const schemaTag = isFilterPrefix(lower);
    const consoleTag = isConsoleFilterWord(lower);
    if (!schemaTag && !consoleTag) return true;
    return section === "schemas" ? schemaTag : consoleTag;
  });
  return { search: kept.join(" "), complete: kept.length === words.length };
}

type Lookups = Pick<GameContext, "designNamesByDeclaration">;

/**
 * The names a hit matches by: its declaration name, for a class its design names, and for a field
 * or member its own name, a field's also without m_ and its type prefix
 */
function hitNames(lookups: Lookups, hit: PairableHit, withStripped: boolean): string[] {
  const { declaration } = hit;
  const designNames = lookups.designNamesByDeclaration.get(declaration);
  const names = designNames ? [declaration.name, ...designNames] : [declaration.name];
  if (hit.kind === "name") return names;

  names.push(itemName(hit));
  if (hit.kind === "field" && withStripped) {
    const stripped = strippedFieldName(hit.field.name);
    if (stripped !== null) names.push(stripped);
  }
  return names;
}

/** The rows of a schema search */
interface SchemaRows {
  names: SearchRow<NameHit>[];
  fields: SearchRow<FieldHit | MemberHit>[];
}

/** A section's search results */
export type SectionItems =
  | { section: "console"; items: readonly ConsoleMatch[] }
  | { section: "schemas"; result: SearchResult };

/** A section's search results, and the name words they were matched by */
export type SectionResults = SectionItems & { words: string[] };

type BetterMatches =
  | { section: "console"; items: ConsoleMatch[] }
  | ({ section: "schemas" } & SchemaRows);

const MAX_BETTER_MATCHES = 5;
/** This section's first results, the best of which the other section's have to beat */
const OWN_COMPARED = 5;
/** Results are ranked by their summed score, so a better tier can sit a little further down */
const OTHER_SCANNED = 50;

/** The first rows of a schema search, class and enum rows before field rows */
function firstRows(rows: SchemaRows, count: number): SearchRow<PairableHit>[] {
  const first: SearchRow<PairableHit>[] = rows.names.slice(0, count);
  const remaining = count - first.length;
  if (remaining > 0) first.push(...rows.fields.slice(0, remaining));
  return first;
}

/** The best tier of this section's first results, worse than any tier when there are none */
function bestOwnTier(lookups: Lookups, own: SectionItems, words: string[]): number {
  let best = Infinity;
  if (own.section === "console") {
    for (const match of own.items.slice(0, OWN_COMPARED)) best = Math.min(best, match.tier);
    return best;
  }

  for (const row of firstRows(own.result, OWN_COMPARED)) {
    best = Math.min(best, nameMatchTier(hitNames(lookups, row.hit, true), words));
  }
  return best;
}

/**
 * How well a schema row matches, counting whole words only. A field name without its type
 * prefix is as good as a prefix match at best: m_flFPS is not an exact match of fps
 */
function candidateTier(lookups: Lookups, hit: PairableHit, words: string[]): number {
  const own = nameMatchTier(hitNames(lookups, hit, false), words, true);
  const stripped = nameMatchTier(hitNames(lookups, hit, true), words, true);
  return Math.min(own, Math.max(stripped, TIER_PREFIX));
}

function betterRows<T extends PairableHit>(
  lookups: Lookups,
  rows: readonly SearchRow<T>[],
  words: string[],
  ownTier: number,
  limit: number,
): SearchRow<T>[] {
  const better: SearchRow<T>[] = [];
  for (const row of rows.slice(0, OTHER_SCANNED)) {
    if (better.length === limit) break;
    if (candidateTier(lookups, row.hit, words) < ownTier) better.push(row);
  }
  return better;
}

/**
 * The other section's results that match by name better than any of this section's first
 * results, like the sv_cheats convar when searching schemas. Any non-fuzzy result is better than
 * none. A schema result only counts with a whole-word match, and a field name without its type
 * prefix at best as a prefix match
 */
export function betterMatches(
  lookups: Lookups,
  own: SectionItems,
  other: SectionResults,
): BetterMatches {
  const { words } = other;
  if (words.length === 0) {
    if (other.section === "console") return { section: "console", items: [] };
    return { section: "schemas", names: [], fields: [] };
  }
  // A fuzzy match is never a better match, whatever this section has
  const ownTier = Math.min(bestOwnTier(lookups, own, words), TIER_FUZZY);

  if (other.section === "console") {
    const better: ConsoleMatch[] = [];
    for (const match of other.items.slice(0, OTHER_SCANNED)) {
      if (better.length === MAX_BETTER_MATCHES) break;
      if (match.tier < ownTier) better.push(match);
    }
    return { section: "console", items: better };
  }

  const { names, fields } = other.result;
  const betterNames = betterRows(lookups, names, words, ownTier, MAX_BETTER_MATCHES);
  const room = MAX_BETTER_MATCHES - betterNames.length;
  const betterFields = betterRows(lookups, fields, words, ownTier, room);
  return { section: "schemas", names: betterNames, fields: betterFields };
}
