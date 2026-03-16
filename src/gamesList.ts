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
