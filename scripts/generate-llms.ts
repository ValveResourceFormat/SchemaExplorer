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
      hasEntities: (raw.entities?.length ?? 0) > 0,
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
const entityGames =
  games
    .filter((g) => g.hasEntities)
    .map((g) => g.name)
    .join(", ") || "no game";

const netGames =
  games
    .filter((g) => g.hasNetwork)
    .map((g) => g.name)
    .join(", ") || "no game";

// The "JSON structure" section below must be kept in sync with the raw types:
// RawSchemaClass / RawSchemaEnum / SchemasJson in src/data/schemas.ts
// and SchemaFieldType / SchemaMetadataEntry in src/data/types.ts.
const text = `# Source 2 Schema Explorer

Browsable UI for the engine schemas (classes, enums, fields, metadata), entity classes,
console variables and commands of Source 2 games.
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
{ generator, revision, version_date, version_time, classes: Class[], enums: Enum[],
  convars?: ConVar[], commands?: Command[], entities?: Entity[] }
Class  { module, name, size, alignment?, flags?: string[], parents?: {module,name,offset?}[],
         fields?: Field[], metadata?: Meta[] }
       // size and alignment in bytes, alignment omitted when unknown; flags: abstract,
       // trivial_constructor, trivial_destructor, construct_disallowed; parents = direct base
       // classes only, offset (non-zero only) is where a later base in multiple inheritance starts,
       // its fields are at offset + field offset; fields = own only, not inherited
Field  { name, offset, type: Type, metadata?: Meta[] }   // offset in bytes from class start
Enum   { module, name, alignment, members?: {name, value, metadata?: Meta[]}[], metadata?: Meta[] }
       // alignment = underlying C type as a string, e.g. "uint8_t"; value is a number
Meta   { name, value?: string | object }
       // value is raw unparsed text (string literals keep their quotes); absent for flag-only entries like
       // MNotSaved and class tags like MNetworkNoBase. Common: MPropertyFriendlyName,
       // MPropertyDescription, MGetKV3ClassDefaults (class defaults).
       // MGetKV3ClassDefaults value is a JSON object (hidden fields omitted, keys sorted, NaN and
       // infinity as strings like "-nan", values that differ between runs zeroed), the string
       // "Could not parse KV3 Defaults", or absent when the class has no defaults. The object only
       // has the keys that differ from the first parent's full defaults; for a class's full
       // defaults, merge recursively: its own keys win, then each parent's full defaults in order.
       // MNetworkOverride value is "Class::field".
       // Networking metadata (MNetworkEnable, MNetworkVarNames, ...) is present only in ${netGames}.
Type   { category, ...fields by category }
       builtin {name} | declared_class {module?,name} | declared_enum {module,name} | ptr {inner: Type}
       fixed_array {inner: Type, count} | atomic {name, inner?: Type, inner2?: Type, count?}
       | bitfield {count}
       // atomic = template container, e.g. CUtlVector<inner>, CUtlMap<inner,inner2>, CHandle<inner>;
       // count is an integer last template argument, e.g. CBitVec<count>,
       // CUtlVectorFixedGrowable<inner,count>
       // bitfield = count bits; bit position is not encoded (offset is always 0)
       // declared_class without module is a class that is not in any schema scope
ConVar  { name, type, default?, min?, max?, flags: string[], modules: string[], help? }
       // type: bool, int16, uint16, int32, uint32, int64, uint64, float32, float64, string, color,
       // vector2, vector3, vector4, qangle, vector_ws. default/min/max are strings; vectors and
       // colors look like "[0.707, 0.707, 0]". modules = declaring modules, empty (with the
       // "reference" flag) when only referenced. Unnamed flag bits show as flag_N. flags leave out
       // gamedll when modules has server and clientdll when it has client.
Command { name, flags: string[], modules: string[], help? }
Entity  { class, module, classModule?, designName?, baseClass?, spawnable, flags?, spawnOrder?,
          components?: {base, override}[], keys?: Key[], inputs?: Input[], outputs?: Output[] }
       // Present only in ${entityGames}. class is a schema class in classModule (omitted when it's
       // module); module links the entity class list. keys/inputs/outputs are only the ones added
       // since baseClass (the nearest base entity in the same module), like FGD; walk baseClass for
       // inherited ones.
       // The root, CEntityInstance (designName "root"), holds the inputs/outputs of every entity.
Key     { name, type, field?, declaredIn?, declaredInModule?, path?, enum?, enumModule?,
          procedural?, removed?, arrayStart?, arrayCount? }
       // type is FIELD_*; field is the C++ member in class declaredIn (in declaredInModule), under
       // path (dotted) when it is in an embedded struct. declaredIn is omitted when it's the
       // entity's class, declaredInModule when it's the entity's classModule. With arrayCount, name
       // is a printf pattern like "Case%02d".
Input   { name, params?: Param[], returns?: Param[], description?, pulseNode? }
Output  { name, params?: Param[], description? }
       // empty params/returns and a false pulseNode are omitted
Param   { name, type, enumModule? }
       // type is PVAL_*, optionally with a subtype like "PVAL_EHANDLE:func_mover";
       // enumModule is the module of a PVAL_SCHEMA_ENUM:Name enum, also when nested like
       // PVAL_ARRAY:PVAL_SCHEMA_ENUM:Name
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
