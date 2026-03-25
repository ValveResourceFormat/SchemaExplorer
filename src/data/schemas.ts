import type {
  Declaration,
  SchemaEnum,
  SchemaClass,
  SchemaField,
  SchemaFieldType,
  SchemaMetadataEntry,
} from "./types.ts";
import { compareModuleNames } from "../games-list.ts";
import { intrinsicDeclarations } from "./intrinsics.ts";

export const HIDDEN_SENTINEL = "__HIDDEN_FOR_DIFF__";

/** @internal Exported for testing */
export function parseKV3Defaults(value: string): Record<string, unknown> | null {
  if (!value || value.startsWith("Could not")) return null;
  let s = value.replace(/<HIDDEN FOR DIFF>/g, `"${HIDDEN_SENTINEL}"`);
  s = s.replace(/:\s*-nan\b/g, ": null");
  s = s.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch {
    /* skip unparseable */
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  for (const key of aKeys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/** @internal Exported for testing */
export function diffObject(
  embedded: Record<string, unknown>,
  ownDefaults: Record<string, unknown>,
): Record<string, unknown> | null {
  const diff: Record<string, unknown> = {};
  let hasDiff = false;
  for (const [k, v] of Object.entries(embedded)) {
    if (k === "_class" || v === HIDDEN_SENTINEL) continue;
    if (!deepEqual(v, ownDefaults[k])) {
      diff[k] = v;
      hasDiff = true;
    }
  }
  return hasDiff ? diff : null;
}

/** @internal Exported for testing */
export function resolveLeafType(type: SchemaFieldType): SchemaFieldType {
  if ("inner2" in type && type.inner2) return resolveLeafType(type.inner2);
  if ("inner" in type && type.inner) return resolveLeafType(type.inner);
  return type;
}

function isAllZeroArray(value: unknown[]): boolean {
  return value.every((v) => v === 0);
}

function stringifyDefault(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function assignDefaults(classes: SchemaClass[]) {
  const classMap = new Map<string, SchemaClass>();
  for (const cls of classes) classMap.set(`${cls.module}/${cls.name}`, cls);

  // Pre-parse all KV3 defaults before the main loop mutates metadata
  const parsedDefaults = new Map<string, Record<string, unknown> | null>();
  for (const cls of classes) {
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults" && m.value);
    parsedDefaults.set(`${cls.module}/${cls.name}`, meta ? parseKV3Defaults(meta.value!) : null);
  }
  function getDefaults(module: string, name: string): Record<string, unknown> | null {
    return parsedDefaults.get(`${module}/${name}`) ?? null;
  }

  // Cache all field names (including inherited) per class
  const allFieldsCache = new Map<string, Set<string>>();
  function getAllFieldNames(cls: SchemaClass): Set<string> {
    const key = `${cls.module}/${cls.name}`;
    const cached = allFieldsCache.get(key);
    if (cached !== undefined) return cached;
    const names = new Set<string>();
    for (const p of cls.parents) {
      const parent = classMap.get(`${p.module}/${p.name}`);
      if (parent) for (const n of getAllFieldNames(parent)) names.add(n);
    }
    for (const f of cls.fields) names.add(f.name);
    allFieldsCache.set(key, names);
    return names;
  }

  for (const cls of classes) {
    const defaults = getDefaults(cls.module, cls.name);
    if (!defaults) continue;

    // Only assign defaults to the class's own fields, not inherited ones
    const ownFields = new Map<string, SchemaField>();
    for (const f of cls.fields) ownFields.set(f.name, f);

    const allFieldNames = getAllFieldNames(cls);
    const unconsumed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(defaults)) {
      if (value === HIDDEN_SENTINEL) continue;

      if (!allFieldNames.has(key)) {
        unconsumed[key] = value;
        continue;
      }

      const field = ownFields.get(key);
      if (!field) {
        // Inherited field — put into unconsumed if child overrides the parent's default
        let parentDefault: unknown;
        for (const p of cls.parents) {
          const pd = getDefaults(p.module, p.name);
          if (pd && key in pd) {
            parentDefault = pd[key];
            break;
          }
        }
        if (parentDefault !== undefined && !deepEqual(value, parentDefault)) {
          unconsumed[key] = value;
        }
        continue;
      }

      if (value === null) continue; // null is always a zero-value (null ptrs, uninitialized handles)

      if (typeof value !== "object") {
        // Skip zero values (0, false, "")
        if (value === 0 || value === "" || value === false) continue;
        field.defaultValue = stringifyDefault(value);
      } else if (Array.isArray(value)) {
        // Skip empty arrays and all-zero arrays (e.g. Vector [0,0,0])
        if (value.length === 0 || isAllZeroArray(value)) continue;
        field.defaultValue = JSON.stringify(value);
      } else {
        // For declared_class fields, diff against target's own defaults to avoid redundancy
        const leaf = resolveLeafType(field.type);
        const targetDefaults =
          leaf.category === "declared_class" ? getDefaults(leaf.module, leaf.name) : null;
        const obj = targetDefaults
          ? diffObject(value as Record<string, unknown>, targetDefaults)
          : (value as Record<string, unknown>);
        if (obj) field.defaultValue = JSON.stringify(obj);
      }
    }

    // Rewrite metadata: replace MGetKV3ClassDefaults with unconsumed remainder, or remove if empty
    cls.metadata = cls.metadata.filter((m) => m.name !== "MGetKV3ClassDefaults");
    if (Object.keys(unconsumed).length > 0) {
      cls.metadata.push({
        name: "MGetKV3ClassDefaults",
        value: JSON.stringify(unconsumed, null, "\t"),
      });
    }
  }
}

interface RawSchemaClass {
  name: string;
  module: string;
  parents?: { name: string; module: string }[];
  fields?: {
    name: string;
    offset: number;
    type: SchemaFieldType;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

interface RawSchemaEnum {
  name: string;
  module: string;
  alignment: string;
  members?: {
    name: string;
    value: number;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

export interface SchemasJson {
  classes: RawSchemaClass[];
  enums: RawSchemaEnum[];
  revision?: number;
  version_date?: string;
  version_time?: string;
}

export interface SchemaMetadata {
  revision: number;
  versionDate: string;
  versionTime: string;
}

export type ParsedSchemas = ReturnType<typeof parseSchemas>;

export function parseSchemas(data: SchemasJson) {
  const classes = data.classes as SchemaClass[];
  for (const c of classes) {
    c.kind = "class";
    c.parents ??= [];
    c.metadata ??= [];
    for (const f of (c.fields ??= [])) {
      f.metadata ??= [];
    }
  }
  const enums = data.enums as SchemaEnum[];
  for (const e of enums) {
    e.kind = "enum";
    e.metadata ??= [];
    for (const m of (e.members ??= [])) {
      m.metadata ??= [];
    }
  }

  assignDefaults(classes);

  // Sort all declarations by module then name, build map in one pass
  const all: Declaration[] = [...classes, ...enums, ...intrinsicDeclarations.values()];
  all.sort((a, b) => {
    const mc = compareModuleNames(a.module, b.module);
    if (mc !== 0) return mc;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  const declarations = new Map<string, Map<string, Declaration>>();
  for (const d of all) {
    let moduleMap = declarations.get(d.module);
    if (!moduleMap) {
      moduleMap = new Map();
      declarations.set(d.module, moduleMap);
    }
    if (!moduleMap.has(d.name)) {
      moduleMap.set(d.name, d);
    }
  }

  return {
    declarations,
    metadata: {
      revision: data.revision ?? 0,
      versionDate: data.version_date ?? "",
      versionTime: data.version_time ?? "",
    } satisfies SchemaMetadata,
  };
}
