import { Declaration } from "./Docs/api";
import { GameId } from "../games";
import { parseSchemas, type SchemasJson, type SchemaMetadata } from "./schemas";
export type { SchemasJson, SchemaMetadata };

const schemaUrls = import.meta.glob<string>("../../schemas/*.json.gz", {
  import: "default",
  query: "?url",
  eager: true,
});

const cache = new Map<GameId, Promise<{ declarations: Declaration[]; metadata: SchemaMetadata }>>();

export function loadGameSchemas(gameId: GameId) {
  const cached = cache.get(gameId);
  if (cached) return cached;

  const promise = (async () => {
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

    const buf = await response.arrayBuffer();
    let data: SchemasJson;
    // If the first two bytes are the gzip magic number, decompress manually;
    // otherwise the browser already decompressed it via Content-Encoding.
    const magic = new Uint8Array(buf, 0, 2);
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      const decompressed = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
      data = await new Response(decompressed).json();
    } else {
      data = JSON.parse(new TextDecoder().decode(buf));
    }

    return parseSchemas(data);
  })().catch((e) => {
    cache.delete(gameId);
    throw e;
  });

  cache.set(gameId, promise);
  return promise;
}
