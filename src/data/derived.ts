import type { Declaration, SchemaFieldType } from "./types.ts";
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

export type GameContext = {
  game: GameId;
  declarations: Map<string, Map<string, Declaration>>;
  metadata: ParsedSchemas["metadata"];
  references: Map<string, ReferenceEntry[]>;
  otherGamesLookup: Map<GameId, Map<string, Declaration>>;
  crossModuleLookup: Map<string, Declaration>;
  error: string | null;
};

// -- Utilities --

export function declarationKey(module: string, name: string): string {
  return `${module}/${name}`;
}

export function* allDeclarations(
  declarations: Map<string, Map<string, Declaration>>,
): Iterable<Declaration> {
  for (const moduleMap of declarations.values()) yield* moduleMap.values();
}

// -- Private helpers --

function collectTypeKeys(type: SchemaFieldType, out: Set<string>) {
  switch (type.category) {
    case "declared_class":
    case "declared_enum":
      out.add(declarationKey(type.module, type.name));
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

  function addRef(target: string, entry: ReferenceEntry) {
    let list = refs.get(target);
    if (!list) {
      list = [];
      refs.set(target, list);
    }
    list.push(entry);
  }

  for (const decl of allDeclarations(declarations)) {
    if (decl.kind === "class") {
      for (const parent of decl.parents) {
        addRef(declarationKey(parent.module, parent.name), {
          declarationName: decl.name,
          declarationModule: decl.module,
          relation: "class",
        });
      }
      for (const field of decl.fields) {
        const keys = new Set<string>();
        collectTypeKeys(field.type, keys);
        const declKey = declarationKey(decl.module, decl.name);
        for (const key of keys) {
          if (key !== declKey) {
            addRef(key, {
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

// -- Game context store --

const contexts = new Map<GameId, GameContext>();

export function buildAllGameContexts(
  loaded: Map<GameId, ParsedSchemas>,
  errors: Map<GameId, string>,
): void {
  contexts.clear();

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
      error: errors.get(g.id) ?? null,
    });
  }
}

export function getGameContext(gameId: GameId): GameContext {
  return contexts.get(gameId)!;
}
