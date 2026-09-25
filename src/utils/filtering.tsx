import { useContext, useMemo, useSyncExternalStore } from "react";
import { useLocation, useParams } from "react-router";
import { SearchContext } from "../components/search/SearchContext";
import { schemaPath } from "../components/schema/DeclarationsContext";
import { allDeclarations, type EntityLookups } from "../data/derived";
import * as api from "../data/types";
import { metadataValueText } from "./format";

type EntitySearchLookups = Pick<
  EntityLookups,
  "entities" | "entitiesByDeclaration" | "designNamesByDeclaration"
>;

const subscribeNever = () => () => {};

/**
 * False while prerendering and hydrating, true after. Components mounted later by client-side
 * navigation get true right away and skip the hydration-safe first render, like rendering
 * every prerendered row before virtualizing
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function useHashParam(key: string): string | null {
  const { hash } = useLocation();
  const hydrated = useHydrated();
  return useMemo(
    () => (hydrated ? new URLSearchParams(hash.slice(1)).get(key) : null),
    [hash, hydrated, key],
  );
}

/** Builds a location hash from params, skipping empty ones */
export function buildHash(params: Record<string, string | null | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
}

export function searchLink(game: string, query: string) {
  return {
    pathname: schemaPath(game),
    hash: `search=${encodeURIComponent(query)}`,
  };
}

interface ParsedSearch {
  nameWords: string[];
  moduleWords: string[];
  offsets: Set<number>;
  enumValues: Set<number>;
  metadataKeys: string[];
  metadataValues: string[];
  entityWords: string[];
  inputWords: string[];
  outputWords: string[];
}

export const EMPTY_PARSED: ParsedSearch = {
  nameWords: [],
  moduleWords: [],
  offsets: new Set(),
  enumValues: new Set(),
  metadataKeys: [],
  metadataValues: [],
  entityWords: [],
  inputWords: [],
  outputWords: [],
};

const FILTER_TAGS = [
  "module:",
  "offset:",
  "enumvalue:",
  "metadata:",
  "metadatavalue:",
  "entity:",
  "input:",
  "output:",
];

export function isFilterPrefix(word: string): boolean {
  return FILTER_TAGS.some((tag) => word.startsWith(tag));
}

export function parseIntValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = trimmed.startsWith("0x") ? parseInt(trimmed, 16) : parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

export function parseSearch(search: string): ParsedSearch {
  const words = search.toLowerCase().split(" ").filter(Boolean);
  const nameWords = words.filter((x) => !isFilterPrefix(x));
  const tagValues = (prefix: string) =>
    words
      .filter((x) => x.startsWith(prefix))
      .map((x) => x.slice(prefix.length))
      .filter(Boolean);
  const numbers = (prefix: string) =>
    new Set(
      tagValues(prefix)
        .map(parseIntValue)
        .filter((x) => x !== null),
    );
  return {
    nameWords,
    moduleWords: tagValues("module:"),
    offsets: numbers("offset:"),
    enumValues: numbers("enumvalue:"),
    // metadata: is a prefix of metadatavalue:, so its values can't start with "value:"
    metadataKeys: tagValues("metadata:").filter((x) => !x.startsWith("value:")),
    metadataValues: tagValues("metadatavalue:"),
    entityWords: tagValues("entity:"),
    inputWords: tagValues("input:"),
    outputWords: tagValues("output:"),
  };
}

export function useParsedSearch(): ParsedSearch {
  const { search } = useContext(SearchContext);
  return useMemo(() => (search ? parseSearch(search) : EMPTY_PARSED), [search]);
}

export function useFilteredData(
  context: EntitySearchLookups & {
    declarations: Map<string, Map<string, api.Declaration>>;
  },
) {
  const { declarations } = context;
  const { search } = useContext(SearchContext);
  const parsed = useParsedSearch();
  const { module = "", scope = "" } = useParams();

  return useMemo(() => {
    if (search) {
      return {
        data: searchDeclarations(allDeclarations(declarations), parsed, context),
        isSearching: true,
      };
    }

    if (module && scope) {
      const found = declarations.get(module)?.get(scope);
      return {
        data: found ? [found] : [],
        isSearching: false,
      };
    }

    return { data: [] as api.Declaration[], isSearching: false };
  }, [declarations, context, search, parsed, module, scope]);
}

export function useFieldParam(): string | null {
  return useHashParam("field");
}

/** @internal Exported for testing */
export function matchesWords(name: string, words: string[]): boolean {
  const lower = name.toLowerCase();
  return words.every((w) => lower.includes(w));
}

const FUZZY_MIN_PATTERN_LEN = 3;

function isBoundaryAt(prev: number, curr: number, next: number): boolean {
  // After _ or -
  if (prev === 95 || prev === 45) return true;
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

  return 1000 + Math.round(Math.max(0, Math.min(1, quality)) * 3999);
}

/**
 * Fuzzy-match a lowercased pattern against a target (original case).
 * Returns a numeric score (lower = better) or null if no match.
 *
 * Score tiers:
 *   0           = exact match
 *   100-199     = prefix match (shorter targets rank higher)
 *   200-999     = contiguous substring (earlier position = better)
 *   1000-4999   = fuzzy match (boundary/consecutive quality)
 *   null        = no match
 *
 * @internal Exported for testing
 */
export function fuzzyScore(pattern: string, target: string): number | null {
  const m = pattern.length;
  const n = target.length;
  if (m === 0) return 0;
  if (m > n) return null;

  // Fast path: contiguous substring using V8-optimized toLowerCase + indexOf
  const targetLower = target.toLowerCase();
  const substringIdx = targetLower.indexOf(pattern);
  if (substringIdx !== -1) {
    if (m === n) return 0;
    if (substringIdx === 0) return 100 + (n - m);
    return 200 + substringIdx;
  }

  // Short patterns: substring only (too many false positives for fuzzy)
  if (m < FUZZY_MIN_PATTERN_LEN) return null;

  // Single pass: greedy scan + boundary scan simultaneously, with inline boundary detection.
  // Also serves as the pre-check (if greedy fails, no match exists).
  let gPi = 0,
    gPrevPos = -1,
    gFirstPos = 0,
    gBoundaryHits = 0,
    gConsecutive = 0,
    gGap = 0,
    gCase = 0;
  let bPi = 0,
    bPrevPos = -1,
    bFirstPos = 0,
    bConsecutive = 0,
    bGap = 0,
    bCase = 0;

  for (let ti = 0; ti < n; ti++) {
    const low = targetLower.charCodeAt(ti);
    const raw = target.charCodeAt(ti);
    const boundary =
      ti === 0 ||
      isBoundaryAt(target.charCodeAt(ti - 1), raw, ti + 1 < n ? target.charCodeAt(ti + 1) : 0);

    // Greedy scan
    if (gPi < m && low === pattern.charCodeAt(gPi)) {
      if (gPi === 0) gFirstPos = ti;
      if (boundary) gBoundaryHits++;
      if (raw === pattern.charCodeAt(gPi)) gCase++;
      if (gPrevPos >= 0) {
        if (ti === gPrevPos + 1) gConsecutive++;
        else gGap += ti - gPrevPos - 1;
      }
      gPrevPos = ti;
      gPi++;
    }

    // Boundary scan (only match at boundary positions)
    if (bPi < m && boundary && low === pattern.charCodeAt(bPi)) {
      if (bPi === 0) bFirstPos = ti;
      if (raw === pattern.charCodeAt(bPi)) bCase++;
      if (bPrevPos >= 0) {
        if (ti === bPrevPos + 1) bConsecutive++;
        else bGap += ti - bPrevPos - 1;
      }
      bPrevPos = ti;
      bPi++;
    }

    if (gPi === m && bPi === m) break;
  }

  if (gPi < m) return null; // No match at all

  const greedyScore = computeFuzzyQuality(
    m,
    n,
    gFirstPos,
    gBoundaryHits,
    gConsecutive,
    gGap,
    gCase,
  );

  if (bPi < m) return greedyScore; // Boundary scan didn't complete

  const boundaryScore = computeFuzzyQuality(m, n, bFirstPos, m, bConsecutive, bGap, bCase);
  return Math.min(greedyScore, boundaryScore);
}

/** How a score from fuzzyScore matched: 0 exact, 1 prefix, 2 substring, 3 fuzzy */
function scoreTier(score: number): number {
  if (score === 0) return 0;
  if (score < 200) return 1;
  if (score < 1000) return 2;
  return 3;
}

/**
 * How well the best of `names` matches the worst-matching word: 0 exact, 1 prefix,
 * 2 substring, 3 fuzzy, 4 not at all (like a class found through its field names).
 * Comparable between schemas and convars, which are both ranked by fuzzyScore
 */
export function nameMatchTier(names: readonly string[], words: readonly string[]): number {
  const bestTier = (pattern: string) => {
    let best: number | null = null;
    for (const name of names) {
      const s = fuzzyScore(pattern, name);
      if (s !== null && (best === null || s < best)) best = s;
    }
    return best === null ? 4 : scoreTier(best);
  };

  let tier = 0;
  for (const w of words) tier = Math.max(tier, bestTier(w));
  // A space often stands for an underscore or nothing, "cl color" is an exact cl_color
  if (words.length > 1 && tier > 0) {
    tier = Math.min(tier, bestTier(words.join("_")), bestTier(words.join("")));
  }
  return tier;
}

function matchesLoweredKeys(lowerNames: string[] | undefined, keys: string[]): boolean {
  if (!lowerNames || lowerNames.length === 0) return false;
  return keys.every((key) => lowerNames.some((n) => n.includes(key)));
}

function matchesLoweredValues(
  lowerValues: (string | undefined)[] | undefined,
  values: string[],
): boolean {
  if (!lowerValues || lowerValues.length === 0) return false;
  return values.every((val) => lowerValues.some((v) => v != null && v.includes(val)));
}

function lowerMetaNames(metadata: api.SchemaMetadataEntry[] | undefined): string[] | undefined {
  if (!metadata || metadata.length === 0) return undefined;
  return metadata.map((m) => m.name.toLowerCase());
}

function lowerMetaVals(
  metadata: api.SchemaMetadataEntry[] | undefined,
): (string | undefined)[] | undefined {
  if (!metadata || metadata.length === 0) return undefined;
  return metadata.map((m) => metadataValueText(m.value)?.toLowerCase());
}

export function matchesMetadataKeys(
  metadata: api.SchemaMetadataEntry[] | undefined,
  keys: string[],
): boolean {
  if (keys.length === 0) return false;
  return matchesLoweredKeys(lowerMetaNames(metadata), keys);
}

export function matchesMetadataValues(
  metadata: api.SchemaMetadataEntry[] | undefined,
  values: string[],
): boolean {
  if (values.length === 0) return false;
  return matchesLoweredValues(lowerMetaVals(metadata), values);
}

export const MAX_SEARCH_RESULTS = 500;
const emptyFields: api.SchemaField[] = [];
const emptyMembers: api.SchemaEnumMember[] = [];

/** Items matching any of the words, or none unless every word matched an item (like metadata:) */
function namesMatching<T extends { name: string }>(lists: T[][], words: string[]): T[] {
  if (words.length === 0) return [];
  const result: T[] = [];
  const seen = new Set<string>();
  const matchedWords = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.name)) continue;
      const lower = item.name.toLowerCase();
      let matched = false;
      for (const w of words) {
        if (lower.includes(w)) {
          matchedWords.add(w);
          matched = true;
        }
      }
      if (matched) {
        seen.add(item.name);
        result.push(item);
      }
    }
  }
  return words.every((w) => matchedWords.has(w)) ? result : [];
}

export function searchDeclarations(
  declarations: Iterable<api.Declaration>,
  parsed: ParsedSearch,
  entities?: EntitySearchLookups,
): api.Declaration[] {
  const {
    nameWords,
    moduleWords,
    offsets: offsetSet,
    enumValues: enumValueSet,
    metadataKeys,
    metadataValues,
    entityWords,
    inputWords,
    outputWords,
  } = parsed;
  // Games without entities skip the per-declaration lookups
  const lookups = entities?.entities.length ? entities : undefined;

  const hasNameFilter = nameWords.length > 0;
  const hasOffsetFilter = offsetSet.size > 0;
  const hasEnumValueFilter = enumValueSet.size > 0;
  const hasMetadataFilter = metadataKeys.length > 0 || metadataValues.length > 0;
  const hasIOFilter = inputWords.length > 0 || outputWords.length > 0;
  const hasEntityFilter = entityWords.length > 0 || hasIOFilter;

  if (
    !hasNameFilter &&
    !hasOffsetFilter &&
    !hasEnumValueFilter &&
    !hasMetadataFilter &&
    !hasEntityFilter &&
    moduleWords.length === 0
  ) {
    return [];
  }

  const results: { declaration: api.Declaration; score: number }[] = [];

  function isFieldMatch(
    item: { name: string; metadata?: api.SchemaMetadataEntry[] },
    numericValue: number | undefined,
    remainingWords: string[],
    declMetaSatisfied: boolean,
  ): boolean {
    // Lowercase metadata names once per field (lazy — only when needed)
    let loweredNames: string[] | undefined | null = null; // null = not yet computed
    function getLoweredNames() {
      if (loweredNames === null) loweredNames = lowerMetaNames(item.metadata);
      return loweredNames;
    }

    if (remainingWords.length > 0) {
      const itemLower = item.name.toLowerCase();
      const wordMatches = remainingWords.every(
        (w) => itemLower.includes(w) || (getLoweredNames()?.some((n) => n.includes(w)) ?? false),
      );
      if (!wordMatches) return false;
    }

    if (offsetSet.size > 0 && (numericValue == null || !offsetSet.has(numericValue))) return false;
    if (enumValueSet.size > 0 && (numericValue == null || !enumValueSet.has(numericValue)))
      return false;

    // Skip field-level metadata check if declaration metadata already satisfied it
    if (!declMetaSatisfied) {
      if (metadataKeys.length > 0 && !matchesLoweredKeys(getLoweredNames(), metadataKeys))
        return false;
      if (
        metadataValues.length > 0 &&
        !matchesLoweredValues(lowerMetaVals(item.metadata), metadataValues)
      )
        return false;
    }

    return true;
  }

  for (const declaration of declarations) {
    // Module filter (OR across module words)
    if (moduleWords.length > 0) {
      const mod = declaration.module.toLowerCase();
      if (!moduleWords.some((w) => mod.includes(w))) continue;
    }

    const ents = lookups?.entitiesByDeclaration.get(declaration);
    const designNames = lookups?.designNamesByDeclaration.get(declaration);

    // Entity filters (OR across entity: words, like module:)
    if (entityWords.length > 0) {
      const matches = designNames?.some((n) =>
        entityWords.some((w) => n.toLowerCase().includes(w)),
      );
      if (!matches) continue;
    }

    // Only the entity's own inputs/outputs, inherited ones would match every entity
    let entityMatches: api.SchemaClass["entityMatches"];
    if (hasIOFilter) {
      if (!ents) continue;
      const inputs = namesMatching(
        ents.map((e) => e.inputs),
        inputWords,
      );
      const outputs = namesMatching(
        ents.map((e) => e.outputs),
        outputWords,
      );
      if (inputWords.length > 0 && inputs.length === 0) continue;
      if (outputWords.length > 0 && outputs.length === 0) continue;
      entityMatches = { inputs, outputs };
    }

    // Fuzzy-score each name word against the declaration name and entity design names
    let nameFuzzyScore = 0;
    const remainingWords: string[] = [];
    for (const w of nameWords) {
      let s = fuzzyScore(w, declaration.name);
      for (const n of designNames ?? []) {
        const ds = fuzzyScore(w, n);
        if (ds !== null && (s === null || ds < s)) s = ds;
      }
      if (s === null) {
        remainingWords.push(w);
      } else {
        nameFuzzyScore += s;
      }
    }

    // Check if declaration-level metadata satisfies the metadata filters
    const declMetaSatisfied =
      hasMetadataFilter &&
      (metadataKeys.length === 0 || matchesMetadataKeys(declaration.metadata, metadataKeys)) &&
      (metadataValues.length === 0 || matchesMetadataValues(declaration.metadata, metadataValues));

    // Field-level filtering needed when there are remaining words, offset, enumvalue, or unsatisfied metadata
    const hasFieldFilter =
      remainingWords.length > 0 ||
      hasOffsetFilter ||
      hasEnumValueFilter ||
      (hasMetadataFilter && !declMetaSatisfied);

    if (!hasFieldFilter) {
      // Declaration-level match (name / module / metadata) — include without fields
      if (hasNameFilter || moduleWords.length > 0 || declMetaSatisfied || hasEntityFilter) {
        const stripped =
          declaration.kind === "class"
            ? { ...declaration, fields: emptyFields, entityMatches }
            : { ...declaration, members: emptyMembers };
        const score = hasNameFilter ? nameFuzzyScore : 3000;
        results.push({ declaration: stripped, score });
      }
      continue;
    }

    // Offset filter excludes enums entirely
    if (hasOffsetFilter && declaration.kind !== "class") continue;

    // Enum value filter excludes classes entirely
    if (hasEnumValueFilter && declaration.kind !== "enum") continue;

    const score =
      remainingWords.length > 0 ? 5000 + nameFuzzyScore : hasNameFilter ? nameFuzzyScore : 3000;

    if (declaration.kind === "class") {
      const fields = declaration.fields.filter((f) =>
        isFieldMatch(f, f.offset, remainingWords, declMetaSatisfied),
      );
      if (fields.length > 0) {
        results.push({ declaration: { ...declaration, fields, entityMatches }, score });
      }
    } else {
      const members = declaration.members.filter((m) =>
        isFieldMatch(m, m.value, remainingWords, declMetaSatisfied),
      );
      if (members.length > 0) {
        results.push({ declaration: { ...declaration, members }, score });
      }
    }
  }

  results.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.declaration.name < b.declaration.name) return -1;
    if (a.declaration.name > b.declaration.name) return 1;
    if (a.declaration.module < b.declaration.module) return -1;
    if (a.declaration.module > b.declaration.module) return 1;
    return 0;
  });

  // Cap results to avoid excessive rendering for broad fuzzy queries
  if (results.length > MAX_SEARCH_RESULTS) {
    results.length = MAX_SEARCH_RESULTS;
  }

  return results.map((r) => r.declaration);
}
