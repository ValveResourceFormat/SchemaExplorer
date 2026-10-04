import type { ClassNetwork, Declaration, FieldNetwork } from "./types.ts";
import { allDeclarations } from "./derived.ts";

const termsCache = new WeakMap<object, string[]>();

/** Names and values in a part of the network data, lowercased */
function collectTerms(value: unknown, list: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) collectTerms(v, list);
  } else if (typeof value === "object" && value !== null) {
    // The network data itself, overrides and replay fields name their parts, and
    // varTypeOverrides is keyed by field
    for (const [k, v] of Object.entries(value)) {
      list.push(k.toLowerCase());
      collectTerms(v, list);
    }
  } else {
    list.push(String(value).toLowerCase());
  }
  return list;
}

/**
 * Property names and values of a field's or class's network data, lowercased, for the network:
 * search (cached per object)
 */
export function networkTerms(network: FieldNetwork | ClassNetwork): string[] {
  let terms = termsCache.get(network);
  if (!terms) {
    terms = collectTerms(network);
    termsCache.set(network, terms);
  }
  return terms;
}

/**
 * The parts of a class's network data with any of the lowercased words, to show why a class
 * matched a network: search. A property whose name has a word is kept whole, otherwise only its
 * entries with one
 */
export function matchingNetworkParts(network: ClassNetwork, words: string[]): ClassNetwork {
  const has = (value: unknown) => {
    const terms = collectTerms(value);
    return words.some((w) => terms.some((t) => t.includes(w)));
  };
  const parts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(network)) {
    if (has(key)) {
      parts[key] = value;
    } else if (Array.isArray(value)) {
      const kept = value.filter(has);
      if (kept.length > 0) parts[key] = kept;
    } else if (typeof value === "object" && value !== null) {
      const kept = Object.entries(value).filter(has);
      if (kept.length > 0) parts[key] = Object.fromEntries(kept);
    } else if (has(value)) {
      parts[key] = value;
    }
  }
  return parts as ClassNetwork;
}

const keysCache = new WeakMap<Map<string, Map<string, Declaration>>, string[]>();

/** Every network property a game uses, sorted, for search autocomplete. Cached like metadata keys */
export function getNetworkKeys(declarations: Map<string, Map<string, Declaration>>): string[] {
  let keys = keysCache.get(declarations);
  if (keys) return keys;
  const set = new Set<string>();
  for (const d of allDeclarations(declarations)) {
    if (d.kind !== "class") continue;
    for (const key of Object.keys(d.network ?? {})) set.add(key);
    for (const f of d.fields) if (f.network) for (const key of Object.keys(f.network)) set.add(key);
  }
  keys = [...set].sort();
  keysCache.set(declarations, keys);
  return keys;
}

/** Names the network database uses for types the schemas spell another way */
const NETWORK_TYPE_SPELLINGS: Record<string, string> = {
  int: "int32",
  float: "float32",
  uint: "uint32",
  short: "int16",
  string_t: "CUtlSymbolLarge",
  EHANDLE: "CHandle",
};

/** Network vectors are networked as their elements */
const NETWORK_VECTOR = /^(?:C_?NetworkUtlVectorBase|C_?UtlVectorEmbeddedNetworkVar)<(.*)>$/;

function normalizeType(text: string): string {
  let s = text.replace(/\s/g, "");
  s = NETWORK_VECTOR.exec(s)?.[1] ?? s;
  // A char[128] is networked as a char
  s = s.replace(/\[\d+\]$/, "");
  // Handles are networked as EHANDLE or with the other module's class name
  if (s.startsWith("CHandle<")) s = "CHandle";
  return NETWORK_TYPE_SPELLINGS[s] ?? s;
}

/**
 * Whether the networked type is the field's own type spelled another way, like int for int32 or
 * the element type of a network vector
 */
export function isSameNetworkType(fieldType: string, networkType: string): boolean {
  return normalizeType(fieldType) === normalizeType(networkType);
}
