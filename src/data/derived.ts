import type { Declaration, SchemaClass, SchemaFieldType } from "./types";
import type { GameId } from "../games-list";
import { GAME_LIST } from "../games-list";
import { preloadedData } from "./preload";
import { intrinsicDeclarations, INTRINSIC_MODULE } from "./intrinsics";

export type ReferenceEntry = {
  declarationName: string;
  declarationModule: string;
  fieldName?: string;
  relation: "field" | "class";
};

export function declarationKey(module: string, name: string): string {
  return `${module}/${name}`;
}

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

function buildReferences(declarations: Declaration[]): Map<string, ReferenceEntry[]> {
  const refs = new Map<string, ReferenceEntry[]>();

  function addRef(target: string, entry: ReferenceEntry) {
    let list = refs.get(target);
    if (!list) {
      list = [];
      refs.set(target, list);
    }
    list.push(entry);
  }

  for (const decl of declarations) {
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

type DerivedGameData = {
  classesByKey: Map<string, SchemaClass>;
  references: Map<string, ReferenceEntry[]>;
  otherGamesLookup: Map<GameId, Map<string, Declaration>>;
};

const cache = new Map<GameId, DerivedGameData>();

export function getDerivedGameData(gameId: GameId): DerivedGameData {
  const cached = cache.get(gameId);
  if (cached) return cached;

  const schema = preloadedData.get(gameId);
  const declarations = schema?.declarations ?? [];

  const allDeclarations = [...declarations, ...intrinsicDeclarations];

  const classesByKey = new Map<string, SchemaClass>();
  for (const d of allDeclarations) {
    if (d.kind === "class") classesByKey.set(declarationKey(d.module, d.name), d);
  }

  const modules = new Set(declarations.map((d) => d.module));

  const otherGamesLookup = new Map<GameId, Map<string, Declaration>>();
  for (const g of GAME_LIST) {
    if (g.id === gameId) continue;
    const other = preloadedData.get(g.id);
    if (other) {
      const map = new Map<string, Declaration>();
      for (const d of other.declarations) {
        // On duplicate names, prefer the one whose module also exists in the current game
        const existing = map.get(d.name);
        if (!existing || (modules.has(d.module) && !modules.has(existing.module))) {
          map.set(d.name, d);
        }
      }
      otherGamesLookup.set(g.id, map);
    }
  }

  const result: DerivedGameData = {
    classesByKey,
    references: buildReferences(allDeclarations),
    otherGamesLookup,
  };

  cache.set(gameId, result);
  return result;
}
