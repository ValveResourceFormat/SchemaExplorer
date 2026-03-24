import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { SearchContext } from "../components/search/SearchContext";
import { schemaPath } from "../components/schema/DeclarationsContext";
import { allDeclarations } from "../data/derived";
import * as api from "../data/types";

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export function useHashParam(key: string): string | null {
  const { hash } = useLocation();
  const hydrated = useHydrated();
  return useMemo(
    () => (hydrated ? new URLSearchParams(hash.slice(1)).get(key) : null),
    [hash, hydrated, key],
  );
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
}

export const EMPTY_PARSED: ParsedSearch = {
  nameWords: [],
  moduleWords: [],
  offsets: new Set(),
  enumValues: new Set(),
  metadataKeys: [],
  metadataValues: [],
};

export function isFilterPrefix(word: string): boolean {
  return (
    word.startsWith("module:") ||
    word.startsWith("offset:") ||
    word.startsWith("enumvalue:") ||
    word.startsWith("metadata:") ||
    word.startsWith("metadatavalue:")
  );
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
  const moduleWords = words
    .filter((x) => x.startsWith("module:"))
    .map((x) => x.slice(7))
    .filter(Boolean);
  const offsetValues = words
    .filter((x) => x.startsWith("offset:"))
    .map((x) => parseIntValue(x.slice(7)))
    .filter((x): x is number => x !== null);
  const enumValueValues = words
    .filter((x) => x.startsWith("enumvalue:"))
    .map((x) => parseIntValue(x.slice(10)))
    .filter((x): x is number => x !== null);
  const metadataKeys = words
    .filter((x) => x.startsWith("metadata:") && !x.startsWith("metadatavalue:"))
    .map((x) => x.slice(9))
    .filter(Boolean);
  const metadataValues = words
    .filter((x) => x.startsWith("metadatavalue:"))
    .map((x) => x.slice(14))
    .filter(Boolean);
  return {
    nameWords,
    moduleWords,
    offsets: new Set(offsetValues),
    enumValues: new Set(enumValueValues),
    metadataKeys,
    metadataValues,
  };
}

export function useParsedSearch(): ParsedSearch {
  const { search } = useContext(SearchContext);
  return useMemo(() => (search ? parseSearch(search) : EMPTY_PARSED), [search]);
}

export function useFilteredData(declarations: Map<string, Map<string, api.Declaration>>) {
  const { search } = useContext(SearchContext);
  const parsed = useParsedSearch();
  const { module = "", scope = "" } = useParams();

  return useMemo(() => {
    if (search) {
      return {
        data: searchDeclarations(allDeclarations(declarations), parsed),
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
  }, [declarations, search, parsed, module, scope]);
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
  return metadata.map((m) => m.value?.toLowerCase());
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

const MAX_SEARCH_RESULTS = 500;
const emptyFields: api.SchemaField[] = [];
const emptyMembers: api.SchemaEnumMember[] = [];

export function searchDeclarations(
  declarations: Iterable<api.Declaration>,
  parsed: ParsedSearch,
): api.Declaration[] {
  const {
    nameWords,
    moduleWords,
    offsets: offsetSet,
    enumValues: enumValueSet,
    metadataKeys,
    metadataValues,
  } = parsed;

  const hasNameFilter = nameWords.length > 0;
  const hasOffsetFilter = offsetSet.size > 0;
  const hasEnumValueFilter = enumValueSet.size > 0;
  const hasMetadataFilter = metadataKeys.length > 0 || metadataValues.length > 0;

  if (
    !hasNameFilter &&
    !hasOffsetFilter &&
    !hasEnumValueFilter &&
    !hasMetadataFilter &&
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

    // Fuzzy-score each name word against the declaration name
    let nameFuzzyScore = 0;
    const remainingWords: string[] = [];
    for (const w of nameWords) {
      const s = fuzzyScore(w, declaration.name);
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
      if (hasNameFilter || moduleWords.length > 0 || declMetaSatisfied) {
        const stripped =
          declaration.kind === "class"
            ? { ...declaration, fields: emptyFields }
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
        results.push({ declaration: { ...declaration, fields }, score });
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
