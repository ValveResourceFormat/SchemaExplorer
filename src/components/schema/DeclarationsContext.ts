import { createContext } from "react";
import { href } from "react-router";
import type { GameContext } from "../../data/derived";
import { DEFAULT_GAME } from "../../games-list";

export type { GameContext } from "../../data/derived";
export { declarationKey } from "../../data/derived";

export function schemaPath(game: string, module?: string, scope?: string): string {
  return href("/:game?/:module?/:scope?", { game, module, scope });
}

export const DeclarationsContext = createContext<GameContext>({
  game: DEFAULT_GAME,
  declarations: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGamesLookup: new Map(),
  crossModuleLookup: new Map(),
  error: null,
});
