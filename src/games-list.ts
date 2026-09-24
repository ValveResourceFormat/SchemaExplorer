export const GAME_LIST = [
  { id: "cs2", name: "Counter-Strike 2", repo: "SteamTracking/GameTracking-CS2" },
  { id: "dota2", name: "Dota 2", repo: "SteamTracking/GameTracking-Dota2" },
  { id: "deadlock", name: "Deadlock", repo: "SteamTracking/GameTracking-Deadlock" },
] as const;

type GameDef = (typeof GAME_LIST)[number];
export type GameId = GameDef["id"];
export const DEFAULT_GAME: GameId = GAME_LIST[0].id;

export function getGameDef(id: string): GameDef | undefined {
  return GAME_LIST.find((g) => g.id === id);
}

/** A file DumpSource2 wrote into the game's GameTracking repository */
export function dumpFileUrl(id: string, path: string): string | null {
  const game = getGameDef(id);
  return game ? `https://github.com/${game.repo}/blob/master/DumpSource2/${path}` : null;
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

const MODULE_PRIORITY = ["client", "server"];

export function compareModuleNames(a: string, b: string): number {
  const ai = MODULE_PRIORITY.indexOf(a);
  const bi = MODULE_PRIORITY.indexOf(b);
  if (ai !== bi) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
