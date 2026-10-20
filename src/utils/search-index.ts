import { allDeclarations, inheritedBases, serverClassName } from "../data/derived";
import type {
  Declaration,
  SchemaClass,
  SchemaEnum,
  SchemaEnumMember,
  SchemaField,
} from "../data/types";
import { longestWordLength } from "./match-score";
import type { SearchContext } from "./search-types";

/** The weight of an entity design name when classes are ranked by how many subclasses they have */
const ENTITY_IMPORTANCE = 10;

/**
 * Hungarian prefixes of field names, from the dumps: fl float, b bool, n integer, h handle,
 * v vector, vec vector, str string, i integer, f float, s string, p pointer, e enum, isz string
 * token, un and u unsigned, ul 64-bit unsigned, ui unsigned, us 16-bit unsigned, sz and psz
 * C strings, t time, ang angles, q quaternion or angles, col, clr and c colors
 */
const TYPE_PREFIXES = new Set([
  "fl",
  "b",
  "n",
  "h",
  "v",
  "vec",
  "str",
  "i",
  "f",
  "s",
  "p",
  "e",
  "isz",
  "un",
  "u",
  "ul",
  "ui",
  "us",
  "sz",
  "psz",
  "t",
  "ang",
  "q",
  "col",
  "clr",
  "c",
]);

/**
 * Where the name of a field starts after m_ and its type prefix, 0 when there's nothing to strip.
 * Only a whole known prefix followed by an uppercase letter counts. m_iHealth and unLastHits
 * become Health and LastHits, but m_agentRadius and m_isRescued are words
 */
function strippedNameStart(name: string): number {
  const prefixStart = name.startsWith("m_") ? 2 : 0;
  let end = prefixStart;
  while (end < name.length) {
    const code = name.charCodeAt(end);
    if (code < 97 || code > 122) break;
    end++;
  }

  if (end === name.length) return 0;

  if (end === prefixStart) {
    const first = name.charCodeAt(end);
    const isUppercase = first >= 65 && first <= 90;
    return prefixStart > 0 && isUppercase ? prefixStart : 0;
  }

  const next = name.charCodeAt(end);
  if (next < 65 || next > 90) return 0;
  return TYPE_PREFIXES.has(name.slice(prefixStart, end)) ? end : 0;
}

/** A field name without m_ and its type prefix, null when it has none */
export function strippedFieldName(name: string): string | null {
  const start = strippedNameStart(name);
  return start > 0 ? name.slice(start) : null;
}

/** A field or enum member name, lowercased once, with the name without its prefix for fields */
export interface ItemName<T> {
  item: T;
  name: string;
  lower: string;
  /** The name without m_ and its type prefix, null when it has none */
  stripped: string | null;
  strippedLower: string;
  /** Where the stripped name starts in the name */
  strippedStart: number;
  /** The length of the longest word of the name, which a typo of a word has to fit in */
  longestWord: number;
}

function indexItem<T>(item: T, name: string, strip: boolean): ItemName<T> {
  const stripped = strip ? strippedFieldName(name) : null;
  return {
    item,
    name,
    lower: name.toLowerCase(),
    stripped,
    strippedLower: stripped?.toLowerCase() ?? "",
    strippedStart: stripped === null ? 0 : name.length - stripped.length,
    longestWord: longestWordLength(name),
  };
}

export interface DesignName {
  name: string;
  lower: string;
}

const NO_DESIGN_NAMES: DesignName[] = [];

export interface ClassEntry {
  declaration: SchemaClass;
  lower: string;
  /** The length of the longest word of the name, which a typo of a word has to fit in */
  longestWord: number;
  /** The name without the C or C_ every class has, null when it has none */
  unprefixed: DesignName | null;
  /** The name of a client class as its server class is named, C_Foo as CFoo, else null */
  paired: DesignName | null;
  designNames: DesignName[];
  fields: ItemName<SchemaField>[];
  /** The classes it inherits from, the farthest first */
  bases: SchemaClass[];
}

interface EnumEntry {
  declaration: SchemaEnum;
  lower: string;
  longestWord: number;
  unprefixed: DesignName | null;
  paired: DesignName | null;
  designNames: DesignName[];
  members: ItemName<SchemaEnumMember>[];
}

export type SearchEntry = ClassEntry | EnumEntry;

export interface SearchIndex {
  /** Every declaration, in declaration order */
  entries: SearchEntry[];
  classes: Map<SchemaClass, ClassEntry>;
  /** How important a class is to list first: its subclasses, and more with an entity design name */
  importance: Map<SchemaClass, number>;
  /** The types of fields as text, filled in when a pair of classes is compared */
  pairedTypes: Map<SchemaField, string>;
}

type DeclarationsMap = Map<string, Map<string, Declaration>>;

const searchIndexCache = new WeakMap<SearchContext["designNamesByDeclaration"], SearchIndex>();

/**
 * Lowercased names of every declaration, field, member and design name of a game, in declaration
 * order. They only change per game, so the cache is keyed on the game's design names, like the
 * metadata keys are keyed on its declarations
 */
export function getSearchIndex(context: SearchContext): SearchIndex {
  const { declarations, designNamesByDeclaration } = context;
  let index = searchIndexCache.get(designNamesByDeclaration);
  if (index) return index;

  index = {
    entries: [],
    classes: new Map(),
    importance: new Map(),
    pairedTypes: new Map(),
  };
  for (const declaration of allDeclarations(declarations)) {
    const lower = declaration.name.toLowerCase();
    const paired = pairedDeclarationName(declaration.name);
    const longestWord = longestWordLength(declaration.name);

    let designNames = NO_DESIGN_NAMES;
    const designNameList = designNamesByDeclaration.get(declaration);
    if (designNameList) {
      designNames = designNameList.map((name) => ({ name, lower: name.toLowerCase() }));
    }

    if (declaration.kind === "class") {
      const fields = declaration.fields.map((f) => indexItem(f, f.name, true));
      const unprefixed = unprefixedClassName(declaration.name);
      const bases = baseClasses(declarations, declaration);
      const entry: ClassEntry = {
        declaration,
        lower,
        longestWord,
        unprefixed,
        paired,
        designNames,
        fields,
        bases,
      };
      index.entries.push(entry);
      index.classes.set(declaration, entry);
    } else {
      const members = declaration.members.map((m) => indexItem(m, m.name, false));
      const entry: EnumEntry = {
        declaration,
        lower,
        longestWord,
        unprefixed: null,
        paired,
        designNames,
        members,
      };
      index.entries.push(entry);
    }
  }

  fillImportance(index);
  searchIndexCache.set(designNamesByDeclaration, index);
  return index;
}

/**
 * A class name without its C or C_ prefix, so CGameRules is the name GameRules to look for.
 * Null for a name that doesn't start with a C before an uppercase letter or an underscore
 */
function unprefixedClassName(name: string): DesignName | null {
  if (name.length < 2 || name[0] !== "C") return null;

  const second = name.charCodeAt(1);
  const isUppercase = second >= 65 && second <= 90;
  let start = 0;
  if (name[1] === "_") {
    start = 2;
  } else if (isUppercase) {
    start = 1;
  }

  if (start === 0 || start >= name.length) return null;

  const rest = name.slice(start);
  return { name: rest, lower: rest.toLowerCase() };
}

/** The name of a client class the way its server class is named, null for any other name */
function pairedDeclarationName(name: string): DesignName | null {
  if (!name.startsWith("C_")) return null;
  const paired = serverClassName(name);
  if (paired !== "C" + name.slice(2)) return null;
  return { name: paired, lower: paired.toLowerCase() };
}

/** Counts the subclasses of every class once, and adds the weight of entity design names */
function fillImportance(index: SearchIndex) {
  const subclasses = new Map<SchemaClass, number>();
  for (const entry of index.classes.values()) {
    for (const base of entry.bases) {
      subclasses.set(base, (subclasses.get(base) ?? 0) + 1);
    }
  }

  for (const entry of index.classes.values()) {
    let importance = subclasses.get(entry.declaration) ?? 0;
    if (entry.designNames.length > 0) importance += ENTITY_IMPORTANCE;
    index.importance.set(entry.declaration, importance);
  }
}

/** The classes a class inherits from, the farthest first */
function baseClasses(declarations: DeclarationsMap, declaration: SchemaClass): SchemaClass[] {
  const bases: SchemaClass[] = [];
  for (const { parent } of inheritedBases(declarations, declaration.parents)) {
    const base = declarations.get(parent.module)?.get(parent.name);
    if (base?.kind === "class") bases.push(base);
  }
  return bases;
}
