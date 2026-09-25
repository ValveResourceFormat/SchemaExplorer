import type {
  ConCommand,
  ConsoleItem,
  ConVar,
  Declaration,
  EntityClass,
  EntityComponent,
  EntityInput,
  EntityKey,
  EntityOutput,
  EntityParam,
  SchemaEnum,
  SchemaClass,
  SchemaClassFlag,
  SchemaParent,
  SchemaField,
  SchemaFieldType,
  SchemaMetadataEntry,
  SchemaMetadataValue,
} from "./types.ts";
import { compareModuleNames } from "../games-list.ts";
import { intrinsicDeclarations } from "./intrinsics.ts";

/**
 * MGetKV3ClassDefaults as an object. DumpSource2 writes it parsed (hidden fields omitted,
 * NaN and infinity as strings like "-nan"), or the string "Could not parse KV3 Defaults".
 * @internal Exported for testing
 */
export function parseKV3Defaults(
  value: SchemaMetadataValue | undefined,
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
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
    if (k === "_class") continue;
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

const FLOAT_TYPES = new Set(["float32", "float64"]);

/** Floats that are NaN or infinite are written as strings like "-nan" and "inf" */
function isNonFiniteFloat(value: string, type: SchemaFieldType): boolean {
  return (
    type.category === "builtin" && FLOAT_TYPES.has(type.name) && /^[-+]?(nan|inf)/i.test(value)
  );
}

function stringifyDefault(value: unknown, type: SchemaFieldType): string {
  if (typeof value !== "string") return String(value);
  return isNonFiniteFloat(value, type) ? value : JSON.stringify(value);
}

function assignDefaults(classes: SchemaClass[]) {
  const classMap = new Map<string, SchemaClass>();
  for (const cls of classes) classMap.set(`${cls.module}/${cls.name}`, cls);

  // Pre-parse all KV3 defaults before the main loop mutates metadata. Each class only has the
  // keys that differ from its first parent's full defaults
  const ownDefaults = new Map<string, Record<string, unknown> | null>();
  for (const cls of classes) {
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults");
    ownDefaults.set(`${cls.module}/${cls.name}`, parseKV3Defaults(meta?.value));
  }

  // Full defaults: the parents' merged defaults, earlier parents first, then the class's own keys.
  // They are shared between classes, never mutated, and only copied when there is more to merge
  const noDefaults: Record<string, unknown> = {};
  const mergedCache = new Map<string, Record<string, unknown>>();
  function parentDefaults(cls: SchemaClass): Record<string, unknown> {
    const parents = cls.parents
      .map((p) => classMap.get(`${p.module}/${p.name}`))
      .filter((p) => p !== undefined);
    if (parents.length === 0) return noDefaults;
    if (parents.length === 1) return getDefaults(parents[0]);
    return Object.assign({}, ...parents.toReversed().map(getDefaults));
  }
  function getDefaults(cls: SchemaClass): Record<string, unknown> {
    const key = `${cls.module}/${cls.name}`;
    let merged = mergedCache.get(key);
    if (!merged) {
      const own = ownDefaults.get(key);
      merged = own ? { ...parentDefaults(cls), ...own } : parentDefaults(cls);
      mergedCache.set(key, merged);
    }
    return merged;
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
    const defaults = ownDefaults.get(`${cls.module}/${cls.name}`);
    if (!defaults) continue;

    // Only assign defaults to the class's own fields, not inherited ones
    const ownFields = new Map<string, SchemaField>();
    for (const f of cls.fields) ownFields.set(f.name, f);

    const allFieldNames = getAllFieldNames(cls);
    const inherited = parentDefaults(cls);
    const unconsumed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(defaults)) {
      if (!allFieldNames.has(key)) {
        unconsumed[key] = value;
        continue;
      }

      const field = ownFields.get(key);
      if (!field) {
        // Inherited field, the class overrides a parent's default
        if (key in inherited && !deepEqual(value, inherited[key])) unconsumed[key] = value;
        continue;
      }

      if (value === null) continue; // null is always a zero-value (null ptrs, uninitialized handles)

      if (typeof value !== "object") {
        // Skip zero values (0, false, "")
        if (value === 0 || value === "" || value === false) continue;
        field.defaultValue = stringifyDefault(value, field.type);
      } else if (Array.isArray(value)) {
        // Skip empty arrays and all-zero arrays (e.g. Vector [0,0,0])
        if (value.length === 0 || isAllZeroArray(value)) continue;
        field.defaultValue = JSON.stringify(value);
      } else {
        // For declared_class fields, diff against the target's full defaults to avoid redundancy
        const leaf = resolveLeafType(field.type);
        const target =
          leaf.category === "declared_class" && leaf.module
            ? classMap.get(`${leaf.module}/${leaf.name}`)
            : undefined;
        const obj = target
          ? diffObject(value as Record<string, unknown>, getDefaults(target))
          : (value as Record<string, unknown>);
        if (obj) field.defaultValue = JSON.stringify(obj);
      }
    }

    // Rewrite metadata: replace MGetKV3ClassDefaults with unconsumed remainder, or remove if empty
    cls.metadata = cls.metadata.filter((m) => m.name !== "MGetKV3ClassDefaults");
    if (Object.keys(unconsumed).length > 0) {
      cls.metadata.push({ name: "MGetKV3ClassDefaults", value: unconsumed });
    }
  }
}

// Raw shapes of the JSON dump. If these change, update the pseudo-schema in scripts/generate-llms.ts (llms.txt).
interface RawSchemaClass {
  name: string;
  module: string;
  size?: number;
  alignment?: number;
  flags?: SchemaClassFlag[];
  parents?: SchemaParent[];
  fields?: {
    name: string;
    offset?: number;
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

interface RawConVar {
  name: string;
  type: string;
  default?: string;
  min?: string;
  max?: string;
  enum?: string;
  enumModule?: string;
  flags?: string[];
  modules?: string[];
  help?: string;
}

interface RawConCommand {
  name: string;
  flags?: string[];
  modules?: string[];
  help?: string;
}

interface RawEntityClass {
  class: string;
  module: string;
  classModule?: string;
  designName?: string;
  baseClass?: string;
  spawnable: boolean;
  flags?: string[];
  spawnOrder?: number;
  components?: EntityComponent[];
  keys?: (Omit<EntityKey, "declaredIn" | "declaredInModule"> & {
    declaredIn?: string;
    declaredInModule?: string;
  })[];
  inputs?: (Omit<EntityInput, "params" | "returns" | "pulseNode"> & {
    params?: EntityParam[];
    returns?: EntityParam[];
    pulseNode?: boolean;
  })[];
  outputs?: (Omit<EntityOutput, "params"> & { params?: EntityParam[] })[];
}

export interface SchemasJson {
  classes: RawSchemaClass[];
  enums: RawSchemaEnum[];
  convars?: RawConVar[];
  commands?: RawConCommand[];
  entities?: RawEntityClass[];
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

function compareNames(a: { name: string }, b: { name: string }): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function normalizeConsoleItem<T extends RawConCommand>(item: T) {
  return {
    ...item,
    flags: item.flags ?? [],
    modules: item.modules ?? [],
  };
}

/** Convars and commands in one list, sorted by name */
export function parseConsole(data: Pick<SchemasJson, "convars" | "commands">): ConsoleItem[] {
  const convars: ConVar[] = (data.convars ?? []).map((c) => ({
    ...normalizeConsoleItem(c),
    kind: "convar",
  }));
  const commands: ConCommand[] = (data.commands ?? []).map((c) => ({
    ...normalizeConsoleItem(c),
    kind: "command",
  }));
  return [...convars, ...commands].sort(compareNames);
}

/** @internal Exported for testing */
export function parseEntities(raw: RawEntityClass[]): EntityClass[] {
  return raw.map((e) => {
    // The dump omits classModule when it's module, and a key's declaredIn(Module) when it's
    // the entity's class
    const classModule = e.classModule ?? e.module;
    return {
      ...e,
      classModule,
      flags: e.flags ?? [],
      spawnOrder: e.spawnOrder ?? 0,
      components: e.components ?? [],
      keys: (e.keys ?? []).map((k) => ({
        ...k,
        declaredIn: k.declaredIn ?? e.class,
        declaredInModule: k.declaredInModule ?? classModule,
      })),
      inputs: (e.inputs ?? [])
        .map((i) => ({
          ...i,
          params: i.params ?? [],
          returns: i.returns ?? [],
          pulseNode: i.pulseNode ?? false,
        }))
        .sort(compareNames),
      outputs: (e.outputs ?? []).map((o) => ({ ...o, params: o.params ?? [] })).sort(compareNames),
    };
  });
}

export function parseSchemas(data: SchemasJson) {
  const classes = data.classes as SchemaClass[];
  for (const c of classes) {
    c.kind = "class";
    c.flags ??= [];
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
  all.sort((a, b) => compareModuleNames(a.module, b.module) || compareNames(a, b));

  const declarations = new Map<string, Map<string, Declaration>>();
  for (const d of all) {
    let moduleMap = declarations.get(d.module);
    if (!moduleMap) {
      moduleMap = new Map();
      declarations.set(d.module, moduleMap);
    }
    moduleMap.set(d.name, d);
  }

  return {
    declarations,
    consoleItems: parseConsole(data),
    entities: parseEntities(data.entities ?? []),
    metadata: {
      revision: data.revision ?? 0,
      versionDate: data.version_date ?? "",
      versionTime: data.version_time ?? "",
    } satisfies SchemaMetadata,
  };
}
