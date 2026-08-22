import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BASE_PATH, GAME_LIST, SITE_ORIGIN } from "../src/games-list.ts";
import type { SchemasJson } from "../src/data/schemas.ts";

/**
 * Generates build/client/llms.txt pointing at the hashed schema assets,
 * so agents can download the raw JSON instead of crawling HTML pages.
 */
const clientDir = join(process.cwd(), "build", "client");
const assetsDir = join(clientDir, "assets");

const assets = await readdir(assetsDir);
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

const games = await Promise.all(
  GAME_LIST.map(async (game) => {
    const file = assets.find((f) => f.startsWith(`${game.id}.json-`) && f.endsWith(".gz"));
    if (!file) throw new Error(`No hashed schema asset found for ${game.id}`);
    const [{ size: gzSize }, json] = await Promise.all([
      stat(join(assetsDir, file)),
      readFile(`schemas/${game.id}.json`, "utf-8"),
    ]);
    const raw: SchemasJson = JSON.parse(json);
    return {
      ...game,
      file,
      url: `${SITE_ORIGIN}${BASE_PATH}/assets/${file}`,
      sizeGz: mb(gzSize),
      sizeRaw: mb(json.length),
      revision: raw.revision,
      date: raw.version_date,
      hasNetwork: json.includes('"MNetworkEnable"'),
    };
  }),
);

const gameLines = games
  .map(
    (g) =>
      `- ${g.name}: ${g.url}\n  (${g.sizeGz} MB gzipped / ${g.sizeRaw} MB raw, revision ${g.revision}, ${g.date})`,
  )
  .join("\n");

const exampleFile = games[0].file;
const netGames =
  games
    .filter((g) => g.hasNetwork)
    .map((g) => g.name)
    .join(", ") || "no game";

// The "JSON structure" section below must be kept in sync with the raw types:
// RawSchemaClass / RawSchemaEnum / SchemasJson in src/data/schemas.ts
// and SchemaFieldType / SchemaMetadataEntry in src/data/types.ts.
const text = `# Source 2 Schema Explorer

Browsable UI for the engine schemas (classes, enums, fields, metadata) of Source 2 games.
Every class and enum has a prerendered HTML page, but crawling them is slow and the pages
contain no more data than the JSON below. Do not crawl the site.

There is no search or JSON API. For any lookup, download the raw schema for the game and search it
with a script (jq, node, ...). Only these games are available:

${gameLines}

URLs are content-hashed and change with each schema update; fetch ${SITE_ORIGIN}${BASE_PATH}/llms.txt
to get the current ones. Files are plain gzip of a single JSON document. Parse with a script,
never paste the file into context. Offsets and sizes are the runtime in-memory layout on Windows,
not the on-disk resource layout.

## JSON structure

\`\`\`
{ generator, revision, version_date, version_time, classes: Class[], enums: Enum[] }
Class  { module, name, size, parents?: {module,name}[], fields?: Field[], metadata?: Meta[] }
       // size in bytes; parents = direct base classes only; fields = own only, not inherited
Field  { name, offset, type: Type, metadata?: Meta[] }   // offset in bytes from class start
Enum   { module, name, alignment, members?: {name, value, metadata?: Meta[]}[], metadata?: Meta[] }
       // alignment = underlying C type as a string, e.g. "uint8_t"; value is a number
Meta   { name, value?: string }
       // value is raw unparsed text (string literals keep their quotes); absent for flag-only entries like MNotSaved.
       // Common: MPropertyFriendlyName, MPropertyDescription, MGetKV3ClassDefaults (class defaults as KV3-ish JSON text).
       // Networking metadata (MNetworkEnable, MNetworkVarNames, ...) is present only in ${netGames}.
Type   { category, ...fields by category }
       builtin {name} | declared_class {module,name} | declared_enum {module,name} | ptr {inner: Type}
       fixed_array {inner: Type, count} | atomic {name, inner?: Type, inner2?: Type} | bitfield {count}
       // atomic = template container, e.g. CUtlVector<inner>, CUtlMap<inner,inner2>, CHandle<inner>
       // bitfield = count bits; bit position is not encoded (offset is always 0)
\`\`\`

Declarations are keyed by (module, name). Besides "client" and "server" there are ~40 engine modules
(entity2, animationsystem, particles, ...). The same name can exist in several modules (client/server
variants of an entity), and a type reference may point to another module than the class using it
(server classes commonly reference enums declared in "client") — do not filter type refs by module.

## Examples (jq; the node one-liner at the end works without jq)

\`\`\`
# A class with all its fields
gunzip -c ${exampleFile} | jq '.classes[] | select(.module=="server" and .name=="CBaseEntity")'

# Which classes declare a field named m_iHealth (own fields only — check parents for inherited)
gunzip -c ${exampleFile} | jq -r '.classes[] | select(any(.fields[]?; .name=="m_iHealth")) | .module + "/" + .name'

# Fields whose type contains enum MoveType_t anywhere (inside ptr/array/template too)
gunzip -c ${exampleFile} | jq -r '.classes[] | (.module + "/" + .name) as $c | .fields[]? | select(any(.type | ..; objects and .category=="declared_enum" and .name=="MoveType_t")) | $c + "." + .name'

# Enum members
gunzip -c ${exampleFile} | jq '.enums[] | select(.name=="MoveType_t").members[] | {name, value}'

# Class not found? It may be renamed or in another module: search names by substring across all modules
gunzip -c ${exampleFile} | jq -r '.classes[] | select(.name | test("CreateWithinSphere")) | .module + "/" + .name'

# All classes of one module (module list: [.classes[].module] | unique)
gunzip -c ${exampleFile} | jq -c '.classes[] | select(.module=="navlib") | {name, fields: [.fields[]?.name]}'

# Without jq
node -e 'const d=JSON.parse(require("zlib").gunzipSync(require("fs").readFileSync("${exampleFile}")));console.log(d.enums.find(e=>e.name=="MoveType_t").members)'
\`\`\`

Site source: https://github.com/ValveResourceFormat/SchemaExplorer
`;

await writeFile(join(clientDir, "llms.txt"), text);
console.log(`Wrote llms.txt for ${games.map((g) => g.id).join(", ")}`);
