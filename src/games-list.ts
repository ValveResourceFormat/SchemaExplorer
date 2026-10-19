const GAMES = [
  {
    id: "cs2",
    name: "Counter-Strike 2",
    shortName: "CS2",
    repo: "SteamTracking/GameTracking-CS2",
  },
  {
    id: "dota2",
    name: "Dota 2",
    shortName: "Dota 2",
    repo: "SteamTracking/GameTracking-Dota2",
  },
  {
    id: "deadlock",
    name: "Deadlock",
    shortName: "Deadlock",
    repo: "SteamTracking/GameTracking-Deadlock",
  },
  {
    id: "hlvr",
    name: "Half-Life: Alyx",
    shortName: "HL:Alyx",
  },
  {
    id: "steamvr",
    name: "SteamVR Home",
    shortName: "SteamVR Home",
    devOnly: true,
  },
  {
    id: "steampal",
    name: "Aperture Desk Job",
    shortName: "Desk Job",
    devOnly: true,
  },
] as const;

export type GameId = (typeof GAMES)[number]["id"];

interface GameDef {
  id: GameId;
  name: string;
  /** For page titles, where the full name takes too much room */
  shortName: string;
  /** GameTracking repository, games without one are a one-off dump that is never updated */
  repo?: string;
  /** Only shown by the dev server, the deployed site only has its JSON, linked from llms.txt */
  devOnly?: boolean;
}

/** Every game with a dump in schemas/, including the dev only ones */
export const ALL_GAMES: readonly GameDef[] = GAMES;

// Build scripts run in plain Node, where import.meta.env doesn't exist, and only build the deployed site
export const GAME_LIST: readonly GameDef[] = import.meta.env?.DEV
  ? ALL_GAMES
  : ALL_GAMES.filter((g) => !g.devOnly);
export const DEFAULT_GAME: GameId = GAME_LIST[0].id;

export function getGameDef(id: string): GameDef | undefined {
  return GAME_LIST.find((g) => g.id === id);
}

/** A file DumpSource2 wrote into the game's GameTracking repository */
export function dumpFileUrl(id: string, path: string): string | null {
  const repo = getGameDef(id)?.repo;
  return repo ? `https://github.com/${repo}/blob/master/DumpSource2/${path}` : null;
}

export function isGameId(id: string): id is GameId {
  return GAME_LIST.some((g) => g.id === id);
}

export const SITE_ORIGIN = "https://s2v.app";
export const BASE_PATH = "/SchemaExplorer";

export function canonicalUrl(game?: string, module?: string, scope?: string): string {
  return `${SITE_ORIGIN}${BASE_PATH}/${[game, module, scope].filter(Boolean).join("/")}`;
}

/** Title, description, Open Graph and canonical tags of a page */
export function pageMeta(title: string, description: string, url: string) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { tagName: "link", rel: "canonical", href: url },
  ];
}
