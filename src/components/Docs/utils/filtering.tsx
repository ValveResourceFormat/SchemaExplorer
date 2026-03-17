import { useContext, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { SearchContext } from "../../Search/SearchContext";
import * as api from "../api";

interface ParsedSearch {
  nameWords: string[];
  moduleWords: string[];
  offsets: Set<number>;
  metadataKeys: string[];
  metadataValues: string[];
}

const EMPTY_PARSED: ParsedSearch = {
  nameWords: [],
  moduleWords: [],
  offsets: new Set(),
  metadataKeys: [],
  metadataValues: [],
};

function isFilterPrefix(word: string): boolean {
  return (
    word.startsWith("module:") ||
    word.startsWith("offset:") ||
    word.startsWith("metadata:") ||
    word.startsWith("metadatavalue:")
  );
}

function parseSearch(search: string): ParsedSearch {
  const words = search.toLowerCase().split(" ").filter(Boolean);
  const nameWords = words.filter((x) => !isFilterPrefix(x));
  const moduleWords = words.filter((x) => x.startsWith("module:")).map((x) => x.slice(7));
  const offsetValues = words
    .filter((x) => x.startsWith("offset:"))
    .map((x) => parseOffset(x.slice(7)))
    .filter((x): x is number => x !== null);
  const metadataKeys = words
    .filter((x) => x.startsWith("metadata:") && !x.startsWith("metadatavalue:"))
    .map((x) => x.slice(9))
    .filter(Boolean);
  const metadataValues = words
    .filter((x) => x.startsWith("metadatavalue:"))
    .map((x) => x.slice(14))
    .filter(Boolean);
  return { nameWords, moduleWords, offsets: new Set(offsetValues), metadataKeys, metadataValues };
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
        data: doSearch(declarations, parsed),
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
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search).get("field"), [location.search]);
}

function parseOffset(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = trimmed.startsWith("0x") ? parseInt(trimmed, 16) : parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

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

interface HasNameAndMetadata {
  name: string;
  metadata?: api.SchemaMetadataEntry[];
}

export function filterItems<T extends HasNameAndMetadata>(
  items: T[],
  parsed: ParsedSearch,
  declarationName: string,
  collapseNonMatching: boolean,
  extraMatch?: (item: T) => boolean,
): { visible: T[]; highlighted: Set<T>; hiddenCount: number } {
  const { nameWords, metadataKeys, metadataValues } = parsed;
  // Words not already matched by the declaration name must match at the field level
  const declLower = declarationName.toLowerCase();
  const remainingWords = nameWords.filter((w) => !declLower.includes(w));

  function isMatch(item: T): boolean {
    return (
      (remainingWords.length === 0 ||
        matchesWords(item.name, remainingWords) ||
        matchesMetadataKeys(item.metadata, remainingWords)) &&
      (metadataKeys.length === 0 || matchesMetadataKeys(item.metadata, metadataKeys)) &&
      (metadataValues.length === 0 || matchesMetadataValues(item.metadata, metadataValues)) &&
      (extraMatch == null || extraMatch(item))
    );
  }

  const hasFieldFilter =
    remainingWords.length > 0 ||
    metadataKeys.length > 0 ||
    metadataValues.length > 0 ||
    parsed.offsets.size > 0;

  if (!collapseNonMatching) {
    return {
      visible: items,
      highlighted: hasFieldFilter ? new Set(items.filter(isMatch)) : new Set(),
      hiddenCount: 0,
    };
  }
  const matching = items.filter(isMatch);
  return {
    visible: matching,
    highlighted: hasFieldFilter ? new Set(matching) : new Set(),
    hiddenCount: items.length - matching.length,
  };
}

function doSearch(declarations: api.Declaration[], parsed: ParsedSearch): api.Declaration[] {
  const { nameWords, moduleWords, offsets: offsetSet, metadataKeys, metadataValues } = parsed;

  function filterModule(declaration: api.Declaration): boolean {
    if (moduleWords.length === 0) return true;
    const module = declaration.module.toLowerCase();
    return moduleWords.some((w) => module.includes(w));
  }

  function matchesNameWords(declaration: api.Declaration): boolean {
    function wordMatchesScope(
      word: string,
      name: string,
      metadata?: api.SchemaMetadataEntry[],
    ): boolean {
      return (
        name.includes(word) || (metadata?.some((m) => m.name.toLowerCase().includes(word)) ?? false)
      );
    }

    const declLower = declaration.name.toLowerCase();
    let items: { name: string; metadata?: api.SchemaMetadataEntry[] }[] = [];
    if (declaration.kind === "class") items = declaration.fields;
    else if (declaration.kind === "enum") items = declaration.members;

    return nameWords.every(
      (word) =>
        wordMatchesScope(word, declLower, declaration.metadata) ||
        items.some((item) => wordMatchesScope(word, item.name.toLowerCase(), item.metadata)),
    );
  }

  function matchesMetadata(declaration: api.Declaration): boolean {
    const allMetadata: (api.SchemaMetadataEntry[] | undefined)[] = [declaration.metadata];
    if (declaration.kind === "class")
      declaration.fields.forEach((f) => allMetadata.push(f.metadata));
    else if (declaration.kind === "enum")
      declaration.members.forEach((m) => allMetadata.push(m.metadata));

    const keysMatch =
      metadataKeys.length === 0 || allMetadata.some((md) => matchesMetadataKeys(md, metadataKeys));
    const valuesMatch =
      metadataValues.length === 0 ||
      allMetadata.some((md) => matchesMetadataValues(md, metadataValues));
    return keysMatch && valuesMatch;
  }

  function matchesOffset(declaration: api.Declaration): boolean {
    if (declaration.kind !== "class") return false;
    return declaration.fields.some((f) => offsetSet.has(f.offset));
  }

  const hasNameFilter = nameWords.length > 0;
  const hasOffsetFilter = offsetSet.size > 0;
  const hasMetadataFilter = metadataKeys.length > 0 || metadataValues.length > 0;

  return declarations.filter((declaration) => {
    if (!filterModule(declaration)) return false;

    const nameMatch = !hasNameFilter || matchesNameWords(declaration);
    const metadataMatch = !hasMetadataFilter || matchesMetadata(declaration);
    const offsetMatch = !hasOffsetFilter || matchesOffset(declaration);

    if (!hasNameFilter && !hasOffsetFilter && !hasMetadataFilter) return moduleWords.length > 0;
    return nameMatch && metadataMatch && offsetMatch;
  });
}
