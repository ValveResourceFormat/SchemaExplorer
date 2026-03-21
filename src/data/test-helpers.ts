import { parseSchemas, type SchemasJson } from "./schemas";
import { allDeclarations, buildAllGameContexts, getGameContext } from "./derived";
import type { SchemaClass, Declaration } from "./types";
import type { GameId } from "../games-list";
import testData from "../utils/test-schemas.json";

export const parsedSchemas = parseSchemas(testData as SchemasJson);

export const declarations = [...allDeclarations(parsedSchemas.declarations)];

export function findDecl(name: string): Declaration | undefined {
  for (const moduleMap of parsedSchemas.declarations.values()) {
    const d = moduleMap.get(name);
    if (d) return d;
  }
  return undefined;
}

export function getClass(name: string): SchemaClass {
  const decl = findDecl(name);
  if (!decl || decl.kind !== "class") throw new Error(`Class ${name} not found`);
  return decl;
}

export function getField(cls: SchemaClass, name: string) {
  const field = cls.fields.find((f) => f.name === name);
  if (!field) throw new Error(`Field ${name} not found on ${cls.name}`);
  return field;
}

export function buildTestContext(gameId: GameId = "cs2") {
  const loaded = new Map<GameId, ReturnType<typeof parseSchemas>>();
  loaded.set(gameId, parsedSchemas);
  buildAllGameContexts(loaded, new Map());
  return getGameContext(gameId);
}
