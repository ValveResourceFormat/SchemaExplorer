import { useMemo, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { schemaPath } from "../components/schema/DeclarationsContext";
import * as api from "../data/types";
import { metadataValueText, toEnumValue } from "./format";
import { joinLoneTags, trimNameWord } from "./search-words";

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

export interface ParsedSearch {
  nameWords: string[];
  moduleWords: string[];
  offsets: Set<number>;
  enumValues: Set<api.EnumValue>;
  metadataKeys: string[];
  metadataValues: string[];
  networkWords: string[];
  entityWords: string[];
  inputWords: string[];
  outputWords: string[];
}

const FILTER_TAGS = [
  "module:",
  "offset:",
  "enumvalue:",
  "metadata:",
  "metadatavalue:",
  "network:",
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

/** Like parseIntValue, but every digit of values past 2^53 kept, in the form members have */
export function parseEnumValue(value: string): api.EnumValue | null {
  const match = /^(-?)(0x[0-9a-f]+|(?!0x)\d+)/.exec(value.trim());
  if (!match) return null;
  const big = BigInt(match[2]);
  return toEnumValue(match[1] ? -big : big);
}

/** Whether a word is a filter tag with no value, like "entity:" */
export function isLoneFilterTag(word: string): boolean {
  return FILTER_TAGS.includes(word);
}

export function parseSearch(search: string): ParsedSearch {
  const split = search.toLowerCase().split(/\s+/).filter(Boolean);
  const words = joinLoneTags(split, isLoneFilterTag, isFilterPrefix);
  const nameWords = words
    .filter((x) => !isFilterPrefix(x))
    .map(trimNameWord)
    .filter(Boolean);
  const tagValues = (prefix: string) =>
    words
      .filter((x) => x.startsWith(prefix))
      .map((x) => x.slice(prefix.length))
      .filter(Boolean);
  const numbers = <T,>(prefix: string, parse: (value: string) => T | null) =>
    new Set(
      tagValues(prefix)
        .map(parse)
        .filter((x) => x !== null),
    );
  return {
    nameWords,
    moduleWords: tagValues("module:"),
    offsets: numbers("offset:", parseIntValue),
    enumValues: numbers("enumvalue:", parseEnumValue),
    // metadata: is a prefix of metadatavalue:, so its values can't start with "value:"
    metadataKeys: tagValues("metadata:").filter((x) => !x.startsWith("value:")),
    metadataValues: tagValues("metadatavalue:"),
    networkWords: tagValues("network:"),
    entityWords: tagValues("entity:"),
    inputWords: tagValues("input:"),
    outputWords: tagValues("output:"),
  };
}

export function useFieldParam(): string | null {
  return useHashParam("field");
}

/** Whether the module matches any of the module: words, or there are none */
export function matchesModule(module: string, moduleWords: string[]): boolean {
  if (moduleWords.length === 0) return true;
  const mod = module.toLowerCase();
  return moduleWords.some((w) => mod.includes(w));
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

/** Items matching any of the words, or none unless every word matched an item (like metadata:) */
export function namesMatching<T extends { name: string }>(lists: T[][], words: string[]): T[] {
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
