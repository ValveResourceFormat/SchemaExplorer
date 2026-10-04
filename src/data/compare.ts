import type {
  Declaration,
  SchemaClass,
  SchemaEnum,
  SchemaFieldType,
  SchemaMetadataEntry,
} from "./types.ts";
import { deepEqual } from "./schemas.ts";

export type DiffStatus = "identical" | "offsets_only" | "differs";

function typesEqual(a: SchemaFieldType, b: SchemaFieldType): boolean {
  if (a.category !== b.category) return false;
  switch (a.category) {
    case "builtin":
      return a.name === (b as typeof a).name;
    case "declared_class":
    case "declared_enum":
      return a.name === (b as typeof a).name && a.module === (b as typeof a).module;
    case "ptr":
      return typesEqual(a.inner, (b as typeof a).inner);
    case "fixed_array":
      return a.count === (b as typeof a).count && typesEqual(a.inner, (b as typeof a).inner);
    case "atomic": {
      const ba = b as typeof a;
      if (a.name !== ba.name || a.count !== ba.count) return false;
      if ((a.inner == null) !== (ba.inner == null)) return false;
      if (a.inner && ba.inner && !typesEqual(a.inner, ba.inner)) return false;
      if ((a.inner2 == null) !== (ba.inner2 == null)) return false;
      if (a.inner2 && ba.inner2 && !typesEqual(a.inner2, ba.inner2)) return false;
      return true;
    }
    case "bitfield":
      return a.count === (b as typeof a).count;
  }
}

function metadataEqual(a: SchemaMetadataEntry[], b: SchemaMetadataEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (!deepEqual(a[i].value, b[i].value)) return false;
  }
  return true;
}

/** Network data is only compared when both games have it, Deadlock's dump doesn't */
function compareClasses(a: SchemaClass, b: SchemaClass, compareNetwork: boolean): DiffStatus {
  if (a.parents.length !== b.parents.length) return "differs";
  // Size, alignment and base offsets are layout, like field offsets. Dumps that are not kept up
  // to date have no layout, there is nothing to compare then
  const hasLayout = a.size != null && b.size != null;
  let offsetsDiffer = hasLayout && (a.size !== b.size || a.alignment !== b.alignment);
  for (let i = 0; i < a.parents.length; i++) {
    if (a.parents[i].name !== b.parents[i].name || a.parents[i].module !== b.parents[i].module)
      return "differs";
    if (hasLayout && a.parents[i].offset !== b.parents[i].offset) offsetsDiffer = true;
  }
  if (a.flags.join() !== b.flags.join()) return "differs";
  if (a.fields.length !== b.fields.length) return "differs";
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i].name !== b.fields[i].name) return "differs";
    if (!typesEqual(a.fields[i].type, b.fields[i].type)) return "differs";
    if (!metadataEqual(a.fields[i].metadata, b.fields[i].metadata)) return "differs";
    if (compareNetwork && !deepEqual(a.fields[i].network, b.fields[i].network)) return "differs";
    if (a.fields[i].defaultValue !== b.fields[i].defaultValue) return "differs";
    if (hasLayout && a.fields[i].offset !== b.fields[i].offset) offsetsDiffer = true;
  }
  if (!metadataEqual(a.metadata, b.metadata)) return "differs";
  if (compareNetwork && !deepEqual(a.network, b.network)) return "differs";
  return offsetsDiffer ? "offsets_only" : "identical";
}

function areEnumsEqual(a: SchemaEnum, b: SchemaEnum): boolean {
  if (a.alignment !== b.alignment) return false;
  if (a.members.length !== b.members.length) return false;
  for (let i = 0; i < a.members.length; i++) {
    if (a.members[i].name !== b.members[i].name || a.members[i].value !== b.members[i].value)
      return false;
    if (!metadataEqual(a.members[i].metadata, b.members[i].metadata)) return false;
  }
  if (!metadataEqual(a.metadata, b.metadata)) return false;
  return true;
}

/** How a declaration differs from the same one in another game */
export function compareDeclarations(
  a: Declaration,
  b: Declaration,
  compareNetwork: boolean,
): DiffStatus {
  if (a.kind !== b.kind) return "differs";
  if (a.kind === "class" && b.kind === "class") return compareClasses(a, b, compareNetwork);
  if (a.kind === "enum" && b.kind === "enum") return areEnumsEqual(a, b) ? "identical" : "differs";
  return "differs";
}
