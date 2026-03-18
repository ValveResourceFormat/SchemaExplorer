import { createContext } from "react";
import { href } from "react-router";
import { Declaration, SchemaClass } from "../../data/types";
import { SchemaMetadata } from "../../data/schemas";
import { GameId } from "../../games-list";
import type { ReferenceEntry } from "../../data/derived";
export { declarationKey, type ReferenceEntry } from "../../data/derived";

export function declarationPath(game: string, module: string, name: string): string {
  return href("/:game/:module?/:scope?", { game, module, scope: name });
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
  game: "cs2",
  declarations: [],
  classesByKey: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGamesLookup: new Map(),
  error: null,
});
