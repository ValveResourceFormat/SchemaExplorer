import { createContext } from "react";
import { href } from "react-router";
import { Declaration, SchemaClass } from "../../data/types";
import { SchemaMetadata } from "../../data/loader";
import { GameId } from "../../games-list";

export type ReferenceEntry = {
  declarationName: string;
  declarationModule: string;
  fieldName?: string;
  relation: "field" | "class";
};

export function declarationKey(module: string, name: string): string {
  return `${module}/${name}`;
}

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
  loading: boolean;
  error: string | null;
};

export const DeclarationsContext = createContext<DeclarationsContextType>({
  game: "cs2",
  declarations: [],
  classesByKey: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGamesLookup: new Map(),
  loading: false,
  error: null,
});
