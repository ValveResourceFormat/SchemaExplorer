import { parseSchemas, type SchemasJson } from "./schemas";
import { allDeclarations, buildAllGameContexts, getGameContext, type GameContext } from "./derived";
import { INTRINSIC_MODULE } from "./intrinsics";
import type { SchemaClass, SchemaFieldType, Declaration } from "./types";
import type { GameId } from "../games-list";
import { parseSearch } from "../utils/filtering";
import { searchSchemas, type SearchContext, type SearchResult } from "../utils/search";
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

type RawClass = SchemasJson["classes"][number];
type RawField = NonNullable<RawClass["fields"]>[number];

export const builtin = (name: string): SchemaFieldType => ({ category: "builtin", name });

export function field(
  name: string,
  type: SchemaFieldType = builtin("int32"),
  offset?: number,
): RawField {
  return { name, type, offset };
}

export function cls(module: string, name: string, fields: RawField[] = [], rest = {}): RawClass {
  return { name, module, size: 64, fields, ...rest };
}

/** The context of a game made of only the given schemas */
export function buildContext(data: SchemasJson, game: GameId = "cs2"): GameContext {
  const loaded = new Map([[game, parseSchemas(structuredClone(data))]]);
  buildAllGameContexts(loaded, new Map());
  return getGameContext(game);
}

/** The result without the intrinsic classes every game has, which the fixtures don't mean to test */
export function search(context: SearchContext, query: string): SearchResult {
  const result = searchSchemas(context, parseSearch(query));
  const own = (declaration: Declaration) => declaration.module !== INTRINSIC_MODULE;
  return {
    names: result.names.filter((row) => own(row.hit.declaration)),
    fields: result.fields.filter((row) => own(row.hit.declaration)),
    inherited: result.inherited,
    similar: result.similar.filter((row) => own(row.hit.declaration)),
    declarations: new Set([...result.declarations].filter(own)),
  };
}

export function buildTestContext(gameId: GameId = "cs2") {
  const loaded = new Map<GameId, ReturnType<typeof parseSchemas>>();
  loaded.set(gameId, parsedSchemas);
  buildAllGameContexts(loaded, new Map());
  return getGameContext(gameId);
}
