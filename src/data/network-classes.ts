import type { Declaration, SchemaClass, SchemaField } from "./types.ts";
import { allDeclarations, declarationKey, type ReferenceEntry } from "./derived.ts";

function lowerAscii(code: number) {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/**
 * The game's caseless order of class names, V_stricmp_fast: ASCII letters lowercased, then
 * compared bytewise. It puts _ before letters, unlike localeCompare
 */
export function compareCaseless(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = lowerAscii(a.charCodeAt(i)) - lowerAscii(b.charCodeAt(i));
    if (diff !== 0) return diff;
  }

  return a.length - b.length;
}

/**
 * Whether the schema system can construct the class. A class with an alignment always can, the
 * others need construct_allowed without abstract or construct_disallowed
 */
export function isConstructible(cls: SchemaClass): boolean {
  if (cls.alignment != null) return true;
  if (cls.flags.includes("abstract") || cls.flags.includes("construct_disallowed")) return false;
  return cls.flags.includes("construct_allowed");
}

/** Whether the class is CBaseEntity or derives from it through any of its bases */
export function isEntityClass(
  declarations: Map<string, Map<string, Declaration>>,
  cls: SchemaClass,
): boolean {
  const visited = new Set<SchemaClass>();
  const stack = [cls];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.name === "CBaseEntity") return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const p of current.parents) {
      const parent = declarations.get(p.module)?.get(p.name);
      if (parent?.kind === "class") stack.push(parent);
    }
  }

  return false;
}

export interface NetworkClassIds {
  /** The id of each class the server sends in the class info of demos */
  ids: Map<SchemaClass, number>;
  /** Bits a class id is sent in */
  bits: number;
}

const idsCache = new WeakMap<Map<string, Map<string, Declaration>>, NetworkClassIds>();

/**
 * The class ids the server gives its network classes. It sends a class in the class info when it
 * has a DECLARE_NETWORKCLASS registration, is constructible, and is an entity class. The ids are
 * the classes' indices in the caseless order of their names, so they change when a game update
 * adds or removes a class. Cached like the network keys
 */
export function networkClassIds(
  declarations: Map<string, Map<string, Declaration>>,
): NetworkClassIds {
  let result = idsCache.get(declarations);
  if (result) return result;

  const classes: SchemaClass[] = [];
  for (const d of allDeclarations(declarations)) {
    if (d.kind !== "class" || !d.network?.networkClass) continue;
    if (isConstructible(d) && isEntityClass(declarations, d)) classes.push(d);
  }

  classes.sort((a, b) => compareCaseless(a.name, b.name));

  const ids = new Map<SchemaClass, number>();
  for (const [index, cls] of classes.entries()) ids.set(cls, index);

  const bits = classes.length > 0 ? Math.floor(Math.log2(classes.length)) + 1 : 0;
  result = { ids, bits };
  idsCache.set(declarations, result);

  return result;
}

export interface PolymorphicType {
  name: string;
  module: string;
  /** The id the type is sent as */
  id: number;
}

/**
 * The types a polymorphic pointer field can hold, with the ids they are sent as. The field's own
 * class is 0, then its direct schema children in the same module follow in caseless order
 */
export function polymorphicTypes(
  references: Map<string, ReferenceEntry[]>,
  field: SchemaField,
): PolymorphicType[] {
  if (!field.network?.polymorphic || field.type.category !== "ptr") return [];

  const inner = field.type.inner;
  if (inner.category !== "declared_class" || !inner.module) return [];

  const children: string[] = [];
  for (const ref of references.get(declarationKey(inner.module, inner.name)) ?? []) {
    if (ref.relation === "class" && ref.declarationModule === inner.module) {
      children.push(ref.declarationName);
    }
  }

  children.sort(compareCaseless);

  const types: PolymorphicType[] = [{ name: inner.name, module: inner.module, id: 0 }];
  for (const [index, name] of children.entries()) {
    types.push({ name, module: inner.module, id: index + 1 });
  }

  return types;
}
