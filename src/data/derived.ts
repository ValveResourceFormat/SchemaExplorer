import type {
  ConsoleItem,
  ConVar,
  Declaration,
  EntityClass,
  EntityKey,
  SchemaClass,
  SchemaField,
  SchemaFieldType,
  SchemaParent,
} from "./types.ts";
import type { ParsedSchemas } from "./schemas.ts";
import type { GameId } from "../games-list.ts";
import { GAME_LIST } from "../games-list.ts";
import { INTRINSIC_MODULE } from "./intrinsics.ts";

// -- Types --

export type ReferenceEntry = {
  declarationName: string;
  declarationModule: string;
  fieldName?: string;
  relation: "field" | "class";
};

export type EntityKeyRef = { entity: EntityClass; key: EntityKey };

export type EntityLookups = {
  entities: EntityClass[];
  /** declarationKey(classModule, class) → entities; CEntityInstance is the root of both client and server */
  entityByClass: Map<string, EntityClass[]>;
  /** module → design name → entity */
  entityByDesignName: Map<string, Map<string, EntityClass>>;
  /** declarationKey(module, class) → entity, for walking baseClass */
  entityByModuleClass: Map<string, EntityClass>;
  /** declarationKey(owner module, owner class)/field → keys bound to that schema field */
  keyByField: Map<string, EntityKeyRef[]>;
  /** declarationKey(enumModule, enum) → keys using the enum */
  enumKeyRefs: Map<string, EntityKeyRef[]>;
  /** Schema class that owns each key's field, see resolveKeyField */
  keyOwners: Map<EntityKey, { module: string; name: string }>;
  /** Entities of each schema class, keyed by the class object for per-keystroke search */
  entitiesByDeclaration: Map<Declaration, EntityClass[]>;
  /** Deduplicated design names of each schema class (CEntityInstance is "root" twice) */
  designNamesByDeclaration: Map<Declaration, string[]>;
  /** Every design name, sorted, for search suggestions */
  designNames: string[];
};

export type GameContext = EntityLookups & {
  game: GameId;
  declarations: Map<string, Map<string, Declaration>>;
  metadata: ParsedSchemas["metadata"];
  references: Map<string, ReferenceEntry[]>;
  otherGamesLookup: Map<GameId, Map<string, Declaration>>;
  crossModuleLookup: Map<string, Declaration>;
  consoleItems: ConsoleItem[];
  /** Lowercase names of the console items that another game has too */
  sharedConsoleNames: Set<string>;
  /** declarationKey(enumModule, enum) → convars using the enum */
  enumConVars: Map<string, ConVar[]>;
  error: string | null;
};

// -- Utilities --

export function declarationKey(module: string, name: string): string {
  return `${module}/${name}`;
}

function pushTo<K, T>(map: Map<K, T[]>, key: K, value: T) {
  let list = map.get(key);
  if (!list) map.set(key, (list = []));
  list.push(value);
}

export function* allDeclarations(
  declarations: Map<string, Map<string, Declaration>>,
): Iterable<Declaration> {
  for (const moduleMap of declarations.values()) yield* moduleMap.values();
}

const metadataKeysCache = new WeakMap<Map<string, Map<string, Declaration>>, string[]>();

/**
 * Every metadata key used anywhere in a game, sorted, for search autocomplete.
 * Walking every declaration is expensive and the result only changes per game, so
 * it is cached on the declarations map rather than recomputed per render. During
 * prerendering that is the difference between once per game and once per page.
 */
export function getMetadataKeys(declarations: Map<string, Map<string, Declaration>>): string[] {
  let keys = metadataKeysCache.get(declarations);
  if (keys) return keys;

  const set = new Set<string>();
  for (const d of allDeclarations(declarations)) {
    for (const m of d.metadata) set.add(m.name);
    if (d.kind === "class") {
      for (const f of d.fields) for (const m of f.metadata) set.add(m.name);
    } else {
      for (const mem of d.members) for (const m of mem.metadata) set.add(m.name);
    }
  }

  keys = [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  metadataKeysCache.set(declarations, keys);
  return keys;
}

// -- Private helpers --

function collectTypeKeys(type: SchemaFieldType, out: Set<string>) {
  switch (type.category) {
    case "declared_class":
    case "declared_enum":
      if (type.module) out.add(declarationKey(type.module, type.name));
      break;
    case "ptr":
    case "fixed_array":
      collectTypeKeys(type.inner, out);
      break;
    case "atomic":
      out.add(declarationKey(INTRINSIC_MODULE, type.name));
      if (type.inner) collectTypeKeys(type.inner, out);
      if (type.inner2) collectTypeKeys(type.inner2, out);
      break;
  }
}

function buildReferences(
  declarations: Map<string, Map<string, Declaration>>,
): Map<string, ReferenceEntry[]> {
  const refs = new Map<string, ReferenceEntry[]>();

  const typeKeys = new Set<string>();

  for (const decl of allDeclarations(declarations)) {
    if (decl.kind === "class") {
      const selfKey = declarationKey(decl.module, decl.name);
      for (const parent of decl.parents) {
        pushTo(refs, declarationKey(parent.module, parent.name), {
          declarationName: decl.name,
          declarationModule: decl.module,
          relation: "class",
        });
      }
      for (const field of decl.fields) {
        typeKeys.clear();
        collectTypeKeys(field.type, typeKeys);
        for (const key of typeKeys) {
          if (key !== selfKey) {
            pushTo(refs, key, {
              declarationName: decl.name,
              declarationModule: decl.module,
              fieldName: field.name,
              relation: "field",
            });
          }
        }
      }
    }
  }

  return refs;
}

// Client classes use C_ prefix (e.g. C_BaseEntity), server uses C (e.g. CBaseEntity)
export function crossModuleName(name: string): string | null {
  if (name.startsWith("C_")) return "C" + name.slice(2);
  if (name.startsWith("C") && name[1] !== "_") return "C_" + name.slice(1);
  return null;
}

/** A declaration by name when the module is unknown: in the preferred module, then any */
export function findDeclarationByName(
  declarations: Map<string, Map<string, Declaration>>,
  name: string,
  kind?: Declaration["kind"],
  preferModule?: string,
): Declaration | undefined {
  const matches = (d: Declaration | undefined) => d != null && (!kind || d.kind === kind);
  const preferred = preferModule && declarations.get(preferModule)?.get(name);
  if (preferred && matches(preferred)) return preferred;
  for (const moduleMap of declarations.values()) {
    const d = moduleMap.get(name);
    if (matches(d)) return d;
  }
  return undefined;
}

export interface InheritedBase {
  parent: SchemaParent;
  /** Where the base starts in the derived class, non-zero for later bases in multiple inheritance */
  offset: number;
  fields: SchemaField[];
}

/**
 * Every base of a class, the farthest first. A later base in multiple inheritance sits at an
 * offset, and its fields and own bases move with it.
 */
export function inheritedBases(
  declarations: Map<string, Map<string, Declaration>>,
  parents: SchemaParent[],
): InheritedBase[] {
  const bases: InheritedBase[] = [];
  const visited = new Set<string>();
  function collect(parents: SchemaParent[], baseOffset: number) {
    for (const parent of parents) {
      const key = declarationKey(parent.module, parent.name);
      if (visited.has(key)) continue;
      visited.add(key);
      const offset = baseOffset + (parent.offset ?? 0);
      const decl = declarations.get(parent.module)?.get(parent.name);
      if (decl?.kind === "class") collect(decl.parents, offset);
      bases.push({ parent, offset, fields: decl?.kind === "class" ? decl.fields : [] });
    }
  }
  collect(parents, 0);
  return bases;
}

// -- Entities --

/**
 * Finds the schema class that owns a key's field: the declaredIn class, then its schema
 * parents when declaredIn only inherits the field.
 */
export function resolveKeyField(
  declarations: Map<string, Map<string, Declaration>>,
  key: EntityKey,
): { module: string; name: string } | null {
  if (!key.field) return null;

  const start = declarations.get(key.declaredInModule)?.get(key.declaredIn);
  if (start?.kind !== "class") return null;

  const visited = new Set<SchemaClass>();
  const stack: SchemaClass[] = [start];
  while (stack.length > 0) {
    const cls = stack.pop()!;
    if (visited.has(cls)) continue;
    visited.add(cls);
    if (cls.fields.some((f) => f.name === key.field)) return { module: cls.module, name: cls.name };
    for (const p of cls.parents) {
      const parent = declarations.get(p.module)?.get(p.name);
      if (parent?.kind === "class") stack.push(parent);
    }
  }

  // The field is not in the schema, link to the declaring class anyway
  return { module: start.module, name: start.name };
}

export function keyFieldKey(module: string, name: string, field: string): string {
  return `${declarationKey(module, name)}/${field}`;
}

export function buildEntityLookups(
  entities: EntityClass[],
  declarations: Map<string, Map<string, Declaration>>,
): EntityLookups {
  const entityByClass = new Map<string, EntityClass[]>();
  const entityByDesignName = new Map<string, Map<string, EntityClass>>();
  const entityByModuleClass = new Map<string, EntityClass>();
  const keyByField = new Map<string, EntityKeyRef[]>();
  const enumKeyRefs = new Map<string, EntityKeyRef[]>();
  const keyOwners = new Map<EntityKey, { module: string; name: string }>();
  const entitiesByDeclaration = new Map<Declaration, EntityClass[]>();
  const designNamesByDeclaration = new Map<Declaration, string[]>();
  const designNames = new Set<string>();

  for (const entity of entities) {
    pushTo(entityByClass, declarationKey(entity.classModule, entity.class), entity);
    entityByModuleClass.set(declarationKey(entity.module, entity.class), entity);

    const { designName } = entity;
    const decl = declarations.get(entity.classModule)?.get(entity.class);
    if (decl) {
      pushTo(entitiesByDeclaration, decl, entity);
      if (designName && !designNamesByDeclaration.get(decl)?.includes(designName)) {
        pushTo(designNamesByDeclaration, decl, designName);
      }
    }

    if (designName) {
      let byName = entityByDesignName.get(entity.module);
      if (!byName) entityByDesignName.set(entity.module, (byName = new Map()));
      byName.set(designName, entity);
      designNames.add(designName);
    }

    for (const key of entity.keys) {
      const ref = { entity, key };
      const owner = resolveKeyField(declarations, key);
      if (owner) {
        keyOwners.set(key, owner);
        pushTo(keyByField, keyFieldKey(owner.module, owner.name, key.field!), ref);
      }
      if (key.enum && key.enumModule) {
        pushTo(enumKeyRefs, declarationKey(key.enumModule, key.enum), ref);
      }
    }
  }

  return {
    entities,
    entityByClass,
    entityByDesignName,
    entityByModuleClass,
    keyByField,
    enumKeyRefs,
    keyOwners,
    entitiesByDeclaration,
    designNamesByDeclaration,
    designNames: [...designNames].sort(),
  };
}

const chainCache = new WeakMap<EntityClass, EntityClass[]>();

/** Bases of an entity from the nearest up to the root, excluding the entity itself */
export function entityChain(
  lookups: Pick<EntityLookups, "entityByModuleClass">,
  entity: EntityClass,
): EntityClass[] {
  const cached = chainCache.get(entity);
  if (cached) return cached;
  const chain: EntityClass[] = [];
  const seen = new Set<EntityClass>([entity]);
  let base = entity.baseClass
    ? lookups.entityByModuleClass.get(declarationKey(entity.module, entity.baseClass))
    : undefined;
  while (base && !seen.has(base)) {
    seen.add(base);
    chain.push(base);
    base = base.baseClass
      ? lookups.entityByModuleClass.get(declarationKey(base.module, base.baseClass))
      : undefined;
  }
  chainCache.set(entity, chain);
  return chain;
}

/** Finds an entity by design name, in the preferred module first, then the server, then any */
export function findEntityByDesignName(
  lookups: Pick<EntityLookups, "entityByDesignName">,
  designName: string,
  preferModule?: string,
): EntityClass | undefined {
  const inModule = (module: string) => lookups.entityByDesignName.get(module)?.get(designName);
  const preferred = (preferModule && inModule(preferModule)) || inModule("server");
  if (preferred) return preferred;
  for (const byName of lookups.entityByDesignName.values()) {
    const found = byName.get(designName);
    if (found) return found;
  }
  return undefined;
}

function buildEnumConVars(items: ConsoleItem[]): Map<string, ConVar[]> {
  const map = new Map<string, ConVar[]>();
  for (const item of items) {
    if (item.kind === "convar" && item.enum && item.enumModule) {
      pushTo(map, declarationKey(item.enumModule, item.enum), item);
    }
  }
  return map;
}

// -- Game context store --

const contexts = new Map<GameId, GameContext>();

export function buildAllGameContexts(
  loaded: Map<GameId, ParsedSchemas>,
  errors: Map<GameId, string>,
): void {
  contexts.clear();

  const consoleNames = new Map<GameId, Set<string>>();
  for (const g of GAME_LIST) {
    const items = loaded.get(g.id)?.consoleItems ?? [];
    consoleNames.set(g.id, new Set(items.map((i) => i.name.toLowerCase())));
  }

  for (const g of GAME_LIST) {
    const schema = loaded.get(g.id);
    const declarations = schema?.declarations ?? new Map<string, Map<string, Declaration>>();
    const modules = new Set(declarations.keys());

    const otherGamesLookup = new Map<GameId, Map<string, Declaration>>();
    for (const other of GAME_LIST) {
      if (other.id === g.id) continue;
      const otherSchema = loaded.get(other.id);
      if (!otherSchema) continue;
      const map = new Map<string, Declaration>();
      for (const d of allDeclarations(otherSchema.declarations)) {
        const existing = map.get(d.name);
        if (!existing || (modules.has(d.module) && !modules.has(existing.module))) {
          map.set(d.name, d);
        }
      }
      otherGamesLookup.set(other.id, map);
    }

    // Build cross-module lookup between client and server
    const clientByName = declarations.get("client") ?? new Map<string, Declaration>();
    const serverByName = declarations.get("server") ?? new Map<string, Declaration>();

    const crossModuleLookup = new Map<string, Declaration>();
    for (const [src, dst] of [
      [clientByName, serverByName],
      [serverByName, clientByName],
    ] as const) {
      for (const [name, d] of src) {
        const mapped = crossModuleName(name);
        const match = (mapped && dst.get(mapped)) || dst.get(name);
        if (match && match.kind === d.kind) {
          crossModuleLookup.set(declarationKey(d.module, name), match);
        }
      }
    }

    contexts.set(g.id, {
      game: g.id,
      declarations,
      metadata: schema?.metadata ?? { revision: 0, versionDate: "", versionTime: "" },
      references: buildReferences(declarations),
      otherGamesLookup,
      crossModuleLookup,
      consoleItems: schema?.consoleItems ?? [],
      sharedConsoleNames: new Set(
        [...consoleNames.get(g.id)!].filter((name) =>
          GAME_LIST.some((other) => other.id !== g.id && consoleNames.get(other.id)!.has(name)),
        ),
      ),
      enumConVars: buildEnumConVars(schema?.consoleItems ?? []),
      ...buildEntityLookups(schema?.entities ?? [], declarations),
      error: errors.get(g.id) ?? null,
    });
  }
}

export function getGameContext(gameId: GameId): GameContext {
  return contexts.get(gameId)!;
}
