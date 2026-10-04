import type {
  ClassNetwork,
  Declaration,
  EntityClass,
  FieldNetwork,
  SchemaClass,
  SchemaField,
} from "./types.ts";
import {
  allDeclarations,
  entityChain,
  findDeclarationByName,
  type EntityLookups,
} from "./derived.ts";

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
 * A lowercased network: word: text anywhere in a name or value, `=text` a whole name or value, or
 * `key=text` the whole value of a property, like usergroups=player
 */
type NetworkWord = { text: string } | { exact: string } | { key: string; value: string };

function parseNetworkWord(word: string): NetworkWord {
  const eq = word.indexOf("=");
  if (eq < 0) return { text: word };
  if (eq === 0) return { exact: word.slice(1) };
  return { key: word.slice(0, eq), value: word.slice(eq + 1) };
}

/** Whether a lowercased name or value has a word that isn't key=value */
function termHas(term: string, word: NetworkWord) {
  if ("text" in word) return term.includes(word.text);
  return "exact" in word && term === word.exact;
}

/** Whether a part of the network data, under the property names in keys, has the word */
function partHas(value: unknown, keys: string[], word: NetworkWord): boolean {
  if (Array.isArray(value)) return value.some((v) => partHas(v, keys, word));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([k, v]) => {
      const name = k.toLowerCase();
      return termHas(name, word) || partHas(v, [...keys, name], word);
    });
  }
  const text = String(value).toLowerCase();
  if ("key" in word) return text === word.value && keys.includes(word.key);
  return termHas(text, word);
}

/** Whether a field's or class's network data has every lowercased network: word */
export function matchesNetworkWords(network: FieldNetwork | ClassNetwork, words: string[]) {
  return words.every((w) => {
    const word = parseNetworkWord(w);
    // Only key=value needs to know where a value is, the cached terms answer the rest
    if ("key" in word) return partHas(network, [], word);
    return networkTerms(network).some((t) => termHas(t, word));
  });
}

/**
 * The parts of a class's network data with any of the lowercased network: words, to show why a
 * class matched. A property whose name has a word is kept whole, otherwise only its entries with one
 */
export function matchingNetworkParts(network: ClassNetwork, words: string[]): ClassNetwork {
  const parsed = words.map(parseNetworkWord);
  const parts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(network)) {
    const keys = [key.toLowerCase()];
    const has = (v: unknown) => parsed.some((w) => partHas(v, keys, w));
    if (parsed.some((w) => termHas(keys[0], w))) {
      parts[key] = value;
    } else if (Array.isArray(value)) {
      const kept = value.filter(has);
      if (kept.length > 0) parts[key] = kept;
    } else if (typeof value === "object" && value !== null) {
      // Like varTypeOverrides, keyed by field
      const kept = Object.entries(value).filter(([k, v]) => has({ [k]: v }));
      if (kept.length > 0) parts[key] = Object.fromEntries(kept);
    } else if (has(value)) {
      parts[key] = value;
    }
  }
  return parts as ClassNetwork;
}

// -- Sending --
//
// A model of how the game's networksystem.dll builds the serializer of a class (CFlattenedSerializer)
// and picks the fields it sends, so field rows can say whether their class sends them:
//
// 1. The serializer has the networked fields of the class and its bases. A field whose type is a
//    networked class, like an embedded struct, a pointer or a component, gets a serializer of that
//    class nested under it, unless it has its own serializer
// 2. Every field starts included. Then each serializer, the nested ones first, goes over its class
//    and bases from the farthest base, each class marking fields with its lists in this order: the
//    nearest class with MNetworkNoBase excludes the fields of its bases, then user groups are
//    excluded and included, then fields by name. A mark overwrites the one before it. Marking a
//    field marks everything nested under it, and lists reach nested fields at any depth
// 3. A field with an included field nested under it is included again, then excluded fields are
//    left out of the serializer, the nested ones before their parent's lists ever run
// 4. Overrides, like a field's user group, apply after this, so they don't change what's sent

/** Why a class sends a networked field or leaves it out, when anything besides the default decides */
export interface FieldSending {
  sent: boolean;
  /** The class whose list marked it last */
  by?: string;
  /** The user group it was marked with, otherwise it was by name */
  group?: string;
  /** Left out with every field of the bases of a class with MNetworkNoBase */
  noBase?: boolean;
  /** Included again for a field nested under it, like m_skeletonInstance.m_hParent */
  via?: string;
}

interface SendNode {
  /** The class and its bases, the class first, then each base followed by its own bases */
  hierarchy: SchemaClass[];
  fields: SendField[];
}

interface SendField {
  field: SchemaField;
  /** Index of the declaring class in the hierarchy */
  depth: number;
  included: boolean;
  removed: boolean;
  reason?: FieldSending;
  child?: SendNode;
}

/** Names in the lists by name: a field, a path ending in a field, or a field of some classes */
export interface NameMatch {
  field: string;
  /** a.b matches b nested under a field named a */
  parent?: string;
  /** A::b matches b in a serializer of A or a class deriving from it */
  classes?: string[];
}

const MAX_NESTING = 16;

function isNoBase(declaration: SchemaClass) {
  return declaration.metadata.some((m) => m.name === "MNetworkNoBase");
}

/** Lists by name and the hash lookups of fields go by a field's network alias */
export function networkName(field: SchemaField) {
  return field.network?.alias ?? field.name;
}

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function parseName(text: string): NameMatch {
  const dot = text.indexOf(".");
  if (dot >= 0) return { field: text.slice(dot + 1), parent: text.slice(0, dot) };
  const colons = text.indexOf("::");
  if (colons >= 0)
    return { field: text.slice(colons + 2), classes: text.slice(0, colons).split("||") };
  return { field: text };
}

/**
 * Builds and runs the serializer of a class, returning what decided its own and inherited fields.
 * Fields the default decides, included with nothing marking them, are left out
 */
export function fieldSending(
  declarations: Map<string, Map<string, Declaration>>,
  declaration: SchemaClass,
  /** Component classes the entity of the class uses for its components, by the component's class */
  componentOverrides?: Map<string, string>,
): Map<SchemaField, FieldSending> {
  const findClass = (name: string) => {
    const d = findDeclarationByName(declarations, name, "class", declaration.module);
    return d?.kind === "class" ? d : undefined;
  };

  const hierarchyOf = (cls: SchemaClass): SchemaClass[] => {
    const list = [cls];
    for (const p of cls.parents) {
      const parent = declarations.get(p.module)?.get(p.name);
      if (parent?.kind === "class") list.push(...hierarchyOf(parent));
    }
    return list;
  };

  const build = (cls: SchemaClass, path: SchemaClass[]): SendNode => {
    const hierarchy = hierarchyOf(cls);
    const node: SendNode = { hierarchy, fields: [] };
    // The farthest base's fields first
    for (let depth = hierarchy.length - 1; depth >= 0; depth--) {
      for (const field of hierarchy[depth].fields) {
        const network = field.network;
        if (!network) continue;
        const entry: SendField = { field, depth, included: true, removed: false };
        // A field with its own serializer is sent as one value, and a class missing from the
        // database gets nothing nested either, which findClass returning nothing covers
        if (!network.serializer && path.length < MAX_NESTING) {
          const childName = childClassName(hierarchy, field, componentOverrides);
          const child = childName ? findClass(childName) : undefined;
          if (child && !path.includes(child)) entry.child = build(child, [...path, child]);
        }
        node.fields.push(entry);
      }
    }
    return node;
  };

  const root = build(declaration, [declaration]);
  run(root);

  const sending = new Map<SchemaField, FieldSending>();
  for (const f of root.fields) {
    if (f.reason) sending.set(f.field, f.reason);
  }
  return sending;
}

/**
 * Component classes the entity of a class, or of its nearest base that is one, uses in place of a
 * component's class, like CBodyComponentBaseModelEntity for CBodyComponent. The game nests the
 * entity's own component class under a component field
 */
export function componentOverrides(
  lookups: Pick<EntityLookups, "entitiesByDeclaration" | "entityByModuleClass">,
  declarations: Map<string, Map<string, Declaration>>,
  declaration: SchemaClass,
): Map<string, string> {
  const overrides = new Map<string, string>();
  const queue: Declaration[] = [declaration];
  let entity: EntityClass | undefined;
  while (!entity && queue.length > 0) {
    const cls = queue.shift()!;
    const entities = lookups.entitiesByDeclaration.get(cls);
    entity = entities?.find((e) => e.module === cls.module) ?? entities?.[0];
    if (cls.kind !== "class") continue;
    for (const p of cls.parents) {
      const parent = declarations.get(p.module)?.get(p.name);
      if (parent) queue.push(parent);
    }
  }
  if (!entity) return overrides;
  // The nearest entity's replacement wins, and replacements don't chain: a base's override of the
  // override isn't applied
  for (const e of [entity, ...entityChain(lookups, entity)]) {
    for (const c of e.components) {
      if ("base" in c && !overrides.has(c.base)) overrides.set(c.base, c.override);
    }
  }
  return overrides;
}

/** The class nested under a field: its own, one a class overrides it with, or the entity's component */
function childClassName(
  hierarchy: SchemaClass[],
  field: SchemaField,
  componentOverrides: Map<string, string> | undefined,
): string | undefined {
  const network = field.network!;
  let name = network.class ?? network.type.replace(/[*\s]/g, "");
  // MNetworkVarTypeOverride of the nearest class first, then the game's build filter answers with
  // the entity's component class, which wins over it. The filter goes by the class, not the field
  for (const cls of hierarchy) {
    const override = cls.network?.varTypeOverrides?.[field.name];
    if (override) {
      name = override;
      break;
    }
  }
  return componentOverrides?.get(name) ?? name;
}

const live = (node: SendNode) => node.fields.filter((f) => !f.removed);

/** Marks a field included or not by the reason, returns whether that changed it */
function mark(f: SendField, reason: FieldSending) {
  f.reason = reason;
  if (f.included === reason.sent) return false;
  f.included = reason.sent;
  return true;
}

/** Marks every field, and everything nested under them */
function markAll(node: SendNode, reason: FieldSending) {
  for (const f of live(node)) {
    mark(f, reason);
    if (f.child) markAll(f.child, reason);
  }
}

/** Marks a field, and everything nested under it when that changed it */
function markTree(f: SendField, reason: FieldSending) {
  if (mark(f, reason) && f.child) markAll(f.child, reason);
}

function markGroup(node: SendNode, group: string, reason: FieldSending) {
  for (const f of live(node)) {
    if (f.field.network!.userGroups?.some((g) => sameText(g, group))) markTree(f, reason);
    if (f.child) markGroup(f.child, group, reason);
  }
}

function markName(node: SendNode, name: NameMatch, reason: FieldSending, path: string[]) {
  // Only the first field with the name, like the serializer's lookup table of lowercase hashes
  const target = node.fields.find((f) => sameText(networkName(f.field), name.field));
  for (const f of live(node)) {
    if (f === target) {
      // A::b also matches serializers of classes deriving from A. Paths use real field names, not
      // aliases, and like names ignore case
      const classOk =
        !name.classes || node.hierarchy.some((c) => name.classes!.some((n) => sameText(n, c.name)));
      const pathOk =
        !name.parent || path.join(".").toLowerCase().endsWith(name.parent.toLowerCase());
      // The game doesn't look under it either
      if (!classOk || !pathOk) continue;
      markTree(f, reason);
    }
    if (f.child) markName(f.child, name, reason, [...path, f.field.name]);
  }
}

function run(node: SendNode) {
  for (const f of node.fields) if (f.child) run(f.child);

  const { hierarchy } = node;
  // Only the nearest class with MNetworkNoBase counts, and its pass marks everything nested under
  // its bases' fields whether the mark changed them or not
  const noBase = hierarchy.findIndex(isNoBase);
  for (let depth = hierarchy.length - 1; depth >= 0; depth--) {
    const { name: by, network } = hierarchy[depth];
    if (depth === noBase) {
      for (const f of live(node)) {
        if (f.depth <= depth) continue;
        const reason = { sent: false, by, noBase: true };
        mark(f, reason);
        if (f.child) markAll(f.child, reason);
      }
    }
    if (!network) continue;
    for (const group of network.excludeByUserGroup ?? []) {
      markGroup(node, group, { sent: false, by, group });
    }
    for (const group of network.includeByUserGroup ?? []) {
      markGroup(node, group, { sent: true, by, group });
    }
    for (const text of network.excludeByName ?? []) {
      markName(node, parseName(text), { sent: false, by }, []);
    }
    for (const text of network.includeByName ?? []) {
      markName(node, parseName(text), { sent: true, by }, []);
    }
  }

  includeChains(node);
  cull(node);
}

/**
 * Includes fields with an included field nested under them, returns the first included path. The
 * game logs this as "including X to ensure entire chain to field". It never excludes: a field whose
 * nested fields are all excluded stays included
 */
function includeChains(node: SendNode): string | undefined {
  let first: string | undefined;
  for (const f of live(node)) {
    const via = f.child ? includeChains(f.child) : undefined;
    if (via !== undefined && !f.included) {
      f.included = true;
      f.reason = { sent: true, via };
    }
    if (f.included && first === undefined) first = via ? `${f.field.name}.${via}` : f.field.name;
  }
  return first;
}

function cull(node: SendNode) {
  for (const f of live(node)) {
    if (f.child) cull(f.child);
    if (!f.included) f.removed = true;
  }
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
