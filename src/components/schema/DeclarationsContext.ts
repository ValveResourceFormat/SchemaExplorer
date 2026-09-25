import { createContext } from "react";
import { href } from "react-router";
import type { GameContext } from "../../data/derived";
import { DEFAULT_GAME } from "../../games-list";
import { buildEntityLookups } from "../../data/derived";
import type { SearchMode } from "../../utils/section-search";

export type { GameContext } from "../../data/derived";
export { declarationKey } from "../../data/derived";

export function schemaPath(game: string, module?: string, scope?: string): string {
  return href("/:game?/:module?/:scope?", { game, module, scope });
}

/** The class page of an entity */
export function entityPath(game: string, entity: { classModule: string; class: string }): string {
  return schemaPath(game, entity.classModule, entity.class);
}

/** A field on its class page */
export function fieldLink(game: string, module: string, name: string, field: string) {
  return { pathname: schemaPath(game, module, name), hash: `field=${encodeURIComponent(field)}` };
}

/** A keyvalue in the entity card of its class page */
export function keyvalueLink(
  game: string,
  entity: { classModule: string; class: string },
  key: string,
) {
  return { pathname: entityPath(game, entity), hash: `kv=${encodeURIComponent(key)}` };
}

export function consolePath(game: string): string {
  return href("/:game/convars", { game });
}

/** Where a section starts, the game's home or its convars page */
export function sectionPath(game: string, section: SearchMode): string {
  return section === "console" ? consolePath(game) : schemaPath(game);
}

export const DeclarationsContext = createContext<GameContext>({
  game: DEFAULT_GAME,
  declarations: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGamesLookup: new Map(),
  crossModuleLookup: new Map(),
  consoleItems: [],
  enumConVars: new Map(),
  ...buildEntityLookups([], new Map()),
  error: null,
});
