import { useContext, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { SearchContext } from "../../Search/SearchContext";
import * as api from "../api";

export function useFilteredData(declarations: api.Declaration[]) {
  const { search } = useContext(SearchContext);
  const { module = "", scope = "" } = useParams();

  return useMemo(() => {
    if (search) {
      return {
        data: doSearch(declarations, search.toLowerCase().split(" ").filter(Boolean)),
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
  }, [declarations, search, module, scope]);
}

function isFilterPrefix(word: string): boolean {
  return word.startsWith("module:") || word.startsWith("offset:") || word.startsWith("metadata:");
}

export function useSearchWords(): string[] {
  const { search } = useContext(SearchContext);
  return useMemo(
    () =>
      search
        ? search
            .toLowerCase()
            .split(" ")
            .filter((x) => x && !isFilterPrefix(x))
        : [],
    [search],
  );
}

export function useSearchOffsets(): Set<number> {
  const { search } = useContext(SearchContext);
  return useMemo(() => {
    if (!search) return new Set<number>();
    const values = search
      .toLowerCase()
      .split(" ")
      .filter((x): x is string => x !== "" && x.startsWith("offset:"))
      .map((x) => parseOffset(x.replace(/^offset:/, "")))
      .filter((x): x is number => x !== null);
    return new Set(values);
  }, [search]);
}

export function useFieldParam(): string | null {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search).get("field"), [location.search]);
}

export function useSearchMetadata(): string[] {
  const { search } = useContext(SearchContext);
  return useMemo(
    () =>
      search
        ? search
            .toLowerCase()
            .split(" ")
            .filter((x) => x.startsWith("metadata:"))
            .map((x) => x.replace(/^metadata:/, ""))
            .filter(Boolean)
        : [],
    [search],
  );
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

function doSearch(declarations: api.Declaration[], words: string[]): api.Declaration[] {
  const moduleWords = words
    .filter((x) => x.startsWith("module:"))
    .map((x) => x.replace(/^module:/, ""));
  const offsetValues = words
    .filter((x) => x.startsWith("offset:"))
    .map((x) => parseOffset(x.replace(/^offset:/, "")));
  const offsetSet = new Set(offsetValues.filter((x): x is number => x !== null));
  const metadataKeys = words
    .filter((x) => x.startsWith("metadata:"))
    .map((x) => x.replace(/^metadata:/, ""))
    .filter(Boolean);
  const nameWords = words.filter((x) => !isFilterPrefix(x));

  function filterModule(declaration: api.Declaration): boolean {
    if (moduleWords.length === 0) return true;
    const module = declaration.module.toLowerCase();
    return moduleWords.some((w) => module.includes(w));
  }

  function matchesName(name: string): boolean {
    const lower = name.toLowerCase();
    return nameWords.every((word) => lower.includes(word));
  }

  function matchesOffset(declaration: api.Declaration): boolean {
    if (declaration.kind !== "class") return false;
    return declaration.fields.some((f) => offsetSet.has(f.offset));
  }

  function matchesMetadata(declaration: api.Declaration): boolean {
    if (matchesMetadataKeys(declaration.metadata, metadataKeys)) return true;
    if (declaration.kind === "class") {
      return declaration.fields.some((f) => matchesMetadataKeys(f.metadata, metadataKeys));
    }
    if (declaration.kind === "enum") {
      return declaration.members.some((m) => matchesMetadataKeys(m.metadata, metadataKeys));
    }
    return false;
  }

  const hasNameFilter = nameWords.length > 0;
  const hasOffsetFilter = offsetSet.size > 0;
  const hasMetadataFilter = metadataKeys.length > 0;

  return declarations.filter((declaration) => {
    if (!filterModule(declaration)) return false;

    let nameMatch = false;
    if (hasNameFilter) {
      nameMatch =
        matchesName(declaration.name) ||
        (declaration.kind === "class" && declaration.fields.some((f) => matchesName(f.name))) ||
        (declaration.kind === "enum" && declaration.members.some((m) => matchesName(m.name)));
    }

    const offsetMatch = hasOffsetFilter && matchesOffset(declaration);
    const metadataMatch = hasMetadataFilter && matchesMetadata(declaration);

    // AND all active filters together
    const filters: boolean[] = [];
    if (hasNameFilter) filters.push(nameMatch);
    if (hasOffsetFilter) filters.push(offsetMatch);
    if (hasMetadataFilter) filters.push(metadataMatch);

    if (filters.length > 0) return filters.every(Boolean);
    // Module-only filter: already passed filterModule() above
    return moduleWords.length > 0;
  });
}
