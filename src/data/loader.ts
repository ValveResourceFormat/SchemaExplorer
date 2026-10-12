import { GameId } from "../games-list";
import { parseSchemas, type SchemasJson } from "./schemas";

// The build emits every file this matches, including the devOnly games that llms.txt links to
const schemaUrls = import.meta.glob<string>("../../schemas/*.json.gz", {
  import: "default",
  query: "?url",
  eager: true,
});

function schemaUrl(gameId: GameId): string {
  const url = schemaUrls[`../../schemas/${gameId}.json.gz`];
  if (!url) throw new Error(`No schema found for ${gameId}`);
  return url;
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
