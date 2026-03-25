import { GameId } from "../games-list";
import { parseSchemas, type SchemasJson } from "./schemas";

const schemaUrls = import.meta.glob<string>("../../schemas/*.json.gz", {
  import: "default",
  query: "?url",
  eager: true,
});

export async function loadGameSchemas(gameId: GameId) {
  const key = Object.keys(schemaUrls).find((k) => k.endsWith(`/${gameId}.json.gz`));
  if (!key) throw new Error(`No schema found for ${gameId}`);
  const url = schemaUrls[key];
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
