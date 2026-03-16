import { createContext } from "react";
import { Declaration, SchemaClass } from "./api";
import { SchemaMetadata } from "../data";
import { GameId } from "../../games";

export type ReferenceEntry = {
  declarationName: string;
  declarationModule: string;
  fieldName?: string;
  relation: "field" | "class";
};

export function declarationKey(module: string, name: string): string {
  return `${module}/${name}`;
}

export type DeclarationsContextType = {
  game: GameId;
  root: string;
  declarations: Declaration[];
  classesByKey: Map<string, SchemaClass>;
  metadata: SchemaMetadata;
  references: Map<string, ReferenceEntry[]>;
  otherGames: Map<GameId, Declaration[]>;
  otherGamesLookup: Map<GameId, Map<string, Declaration>>;
  loading: boolean;
  error: string | null;
};

export const DeclarationsContext = createContext<DeclarationsContextType>({
  game: "cs2",
  root: "",
  declarations: [],
  classesByKey: new Map(),
  metadata: { revision: 0, versionDate: "", versionTime: "" },
  references: new Map(),
  otherGames: new Map(),
  otherGamesLookup: new Map(),
  loading: false,
  error: null,
});
