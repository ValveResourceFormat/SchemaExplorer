import { GameId } from "../games-list";
import { parseSchemas, type SchemasJson } from "./schemas";

// The build emits every file this matches, so it leaves out the devOnly games in games-list.ts
const schemaUrls = import.meta.glob<string>(
  ["../../schemas/*.json.gz", "!**/steamvr.json.gz", "!**/steampal.json.gz"],
  { import: "default", query: "?url", eager: true },
);

function schemaUrl(gameId: GameId): string {
  // The dev server serves the schemas folder as it is, including the dev only games
  if (import.meta.env.DEV) return `${import.meta.env.BASE_URL}schemas/${gameId}.json.gz`;
  const key = Object.keys(schemaUrls).find((k) => k.endsWith(`/${gameId}.json.gz`));
  if (!key) throw new Error(`No schema found for ${gameId}`);
  return schemaUrls[key];
}

export async function loadGameSchemas(gameId: GameId) {
  const url = schemaUrl(gameId);
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Network request failed. Check your internet connection.");
  }
  if (!response.ok) throw new Error(`Server returned ${response.status} for ${url}`);

  const data: SchemasJson = await new Response(
    response.body!.pipeThrough(new DecompressionStream("gzip")),
  ).json();

  return parseSchemas(data);
}
