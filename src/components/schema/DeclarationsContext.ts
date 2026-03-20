import { createContext } from "react";
import { href } from "react-router";
import { Declaration, SchemaClass } from "../../data/types";
import { SchemaMetadata } from "../../data/schemas";
import { DEFAULT_GAME, GameId } from "../../games-list";
export { declarationKey } from "../../data/derived";
import type { ReferenceEntry } from "../../data/derived";

export function schemaPath(game: string, module?: string, scope?: string): string {
  return href("/:game?/:module?/:scope?", { game, module, scope });
}

export type DeclarationsContextType = {
  game: GameId;
  declarations: Declaration[];
  classesByKey: Map<string, SchemaClass>;
  metadata: SchemaMetadata;
  references: Map<string, ReferenceEntry[]>;
  otherGamesLookup: Map<GameId, Map<string, Declaration>>;
  error: string | null;
};

export const DeclarationsContext = createContext<DeclarationsContextType>({
  game: DEFAULT_GAME,
  declarations: [],
  classesByKey: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGamesLookup: new Map(),
  error: null,
});
