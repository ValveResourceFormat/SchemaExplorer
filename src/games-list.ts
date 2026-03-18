export const GAME_LIST = [
  { id: "cs2", name: "Counter-Strike 2", repo: "SteamTracking/GameTracking-CS2" },
  { id: "dota2", name: "Dota 2", repo: "SteamTracking/GameTracking-Dota2" },
  { id: "deadlock", name: "Deadlock", repo: "SteamTracking/GameTracking-Deadlock" },
] as const;

export type GameDef = (typeof GAME_LIST)[number];
export type GameId = GameDef["id"];

export function getGameDef(id: string): GameDef | undefined {
  return GAME_LIST.find((g) => g.id === id);
}

export function isGameId(id: string): id is GameId {
  return GAME_LIST.some((g) => g.id === id);
}

export const SITE_ORIGIN = "https://s2v.app";

const MODULE_PRIORITY = ["client", "server"];

export function compareModuleNames(a: string, b: string): number {
  const ai = MODULE_PRIORITY.indexOf(a);
  const bi = MODULE_PRIORITY.indexOf(b);
  if (ai !== bi) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  return a.localeCompare(b);
}
