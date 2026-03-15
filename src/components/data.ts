import { Declaration, SchemaFieldType, SchemaMetadataEntry } from "./Docs/api";
import { GameId } from "../games";

const schemaUrls = import.meta.glob<string>("../../schemas/*.json.gz", {
  import: "default",
  query: "?url",
  eager: true,
});

interface RawSchemaClass {
  name: string;
  module: string;
  parents?: { name: string; module: string }[];
  fields?: {
    name: string;
    offset: number;
    type: SchemaFieldType;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

interface RawSchemaEnum {
  name: string;
  module: string;
  alignment: string;
  members?: {
    name: string;
    value: number;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

interface SchemasJson {
  classes: RawSchemaClass[];
  enums: RawSchemaEnum[];
  revision?: number;
  version_date?: string;
  version_time?: string;
}

export interface SchemaMetadata {
  revision: number;
  versionDate: string;
  versionTime: string;
}

const cache = new Map<GameId, Promise<{ declarations: Declaration[]; metadata: SchemaMetadata }>>();

function parseSchemas(data: SchemasJson) {
  const classes: Declaration[] = data.classes.map((c) => ({
    kind: "class" as const,
    name: c.name,
    module: c.module,
    parents: c.parents ?? [],
    fields: (c.fields ?? []).map((f) => ({
      ...f,
      metadata: f.metadata ?? [],
    })),
    metadata: c.metadata ?? [],
  }));
  const enums: Declaration[] = data.enums.map((e) => ({
    kind: "enum" as const,
    name: e.name,
    module: e.module,
    alignment: e.alignment,
    members: e.members ?? [],
    metadata: e.metadata ?? [],
  }));

  const seen = new Set<string>();
  const all: Declaration[] = [];
  for (const arr of [classes, enums]) {
    for (const d of arr) {
      const key = `${d.module}/${d.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(d);
      }
    }
  }

  return {
    declarations: all.sort((a, b) => a.name.localeCompare(b.name)),
    metadata: {
      revision: data.revision ?? 0,
      versionDate: data.version_date ?? "",
      versionTime: data.version_time ?? "",
    },
  };
}

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
