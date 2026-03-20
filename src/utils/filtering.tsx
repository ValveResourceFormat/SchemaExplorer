import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { SearchContext } from "../components/search/SearchContext";
import { schemaPath } from "../components/schema/DeclarationsContext";
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

export function useFilteredData(declarations: api.Declaration[]) {
  const { search } = useContext(SearchContext);
  const parsed = useParsedSearch();
  const { module = "", scope = "" } = useParams();

  return useMemo(() => {
    if (search) {
      return {
        data: searchDeclarations(declarations, parsed),
        isSearching: true,
      };
    }

    if (module && scope) {
      return {
        data: declarations.filter((x) => x.module === module && x.name === scope),
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

export function matchesMetadataKeys(
  metadata: api.SchemaMetadataEntry[] | undefined,
  keys: string[],
): boolean {
  if (!metadata || metadata.length === 0 || keys.length === 0) return false;
  return keys.every((key) => metadata.some((m) => m.name.toLowerCase().includes(key)));
}

export function matchesMetadataValues(
  metadata: api.SchemaMetadataEntry[] | undefined,
  values: string[],
): boolean {
  if (!metadata || metadata.length === 0 || values.length === 0) return false;
  return values.every((val) =>
    metadata.some((m) => m.value != null && m.value.toLowerCase().includes(val)),
  );
}

export function searchDeclarations(
  declarations: api.Declaration[],
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

  const results: api.Declaration[] = [];

  for (const declaration of declarations) {
    // Module filter (OR across module words)
    if (moduleWords.length > 0) {
      const mod = declaration.module.toLowerCase();
      if (!moduleWords.some((w) => mod.includes(w))) continue;
    }

    const declLower = declaration.name.toLowerCase();
    const remainingWords = nameWords.filter((w) => !declLower.includes(w));

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
        if (declaration.kind === "class") {
          results.push({ ...declaration, fields: [] });
        } else {
          results.push({ ...declaration, members: [] });
        }
      }
      continue;
    }

    // Offset filter excludes enums entirely
    if (hasOffsetFilter && declaration.kind !== "class") continue;

    // Enum value filter excludes classes entirely
    if (hasEnumValueFilter && declaration.kind !== "enum") continue;

    // Filter fields/members: each item must pass ALL criteria.
    // numericValue is the field offset (for classes) or member value (for enums).
    function isFieldMatch(
      item: { name: string; metadata?: api.SchemaMetadataEntry[] },
      numericValue?: number,
    ): boolean {
      if (remainingWords.length > 0) {
        // Each remaining word must match the field name OR a metadata key name individually
        const itemLower = item.name.toLowerCase();
        const wordMatches = remainingWords.every(
          (w) =>
            itemLower.includes(w) ||
            (item.metadata?.some((m) => m.name.toLowerCase().includes(w)) ?? false),
        );
        if (!wordMatches) return false;
      }
      return (
        // Skip field-level metadata check if declaration metadata already satisfied it
        (metadataKeys.length === 0 ||
          declMetaSatisfied ||
          matchesMetadataKeys(item.metadata, metadataKeys)) &&
        (metadataValues.length === 0 ||
          declMetaSatisfied ||
          matchesMetadataValues(item.metadata, metadataValues)) &&
        (offsetSet.size === 0 || (numericValue != null && offsetSet.has(numericValue))) &&
        (enumValueSet.size === 0 || (numericValue != null && enumValueSet.has(numericValue)))
      );
    }

    if (declaration.kind === "class") {
      const fields = declaration.fields.filter((f) => isFieldMatch(f, f.offset));
      if (fields.length > 0) {
        results.push({ ...declaration, fields });
      }
    } else {
      const members = declaration.members.filter((m) => isFieldMatch(m, m.value));
      if (members.length > 0) {
        results.push({ ...declaration, members });
      }
    }
  }

  return results;
}
