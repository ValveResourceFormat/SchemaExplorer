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
      hasNetworkMetadata: json.includes('"MNetworkEnable"'),
      hasNetwork: json.includes('"network":'),
      hasEntities: (raw.entities?.length ?? 0) > 0,
    };
  }),
);

const gameLines = games
  .map(
    (g) =>
      `- ${g.name}: ${g.url}\n  (${g.sizeGz} MB gzipped / ${g.sizeRaw} MB raw${g.revision ? `, revision ${g.revision}, ${g.date}` : ""})`,
  )
  .join("\n");

const exampleFile = games[0].file;
const gamesWith = (has: "hasEntities" | "hasNetwork" | "hasNetworkMetadata") =>
  games
    .filter((g) => g[has])
    .map((g) => g.name)
    .join(", ") || "no game";
const entityGames = gamesWith("hasEntities");
const netMetadataGames = gamesWith("hasNetworkMetadata");
const netGames = gamesWith("hasNetwork");

// The "JSON structure" section below must be kept in sync with the raw types:
// RawSchemaClass / RawSchemaEnum / SchemasJson in src/data/schemas.ts
// and SchemaFieldType / SchemaMetadataEntry in src/data/types.ts.
const text = `# Source 2 Schema Explorer

Engine schemas, entity classes, convars and commands of Source 2 games. Don't crawl the site, and
there is no API: download a game's JSON and query it with a script (jq, node). Games:

${gameLines}

URLs change with each update, get them from ${SITE_ORIGIN}${BASE_PATH}/llms.txt. Files are gzipped
JSON; parse them, never paste them into context. Offsets and sizes are the Windows memory layout.

## JSON structure

\`\`\`
{ generator, revision, version_date, version_time, classes: Class[], enums: Enum[],
  convars?: ConVar[], commands?: Command[], entities?: Entity[] }
Class  { module, name, size?, alignment?, flags?: string[], parents?: {module,name,offset?}[],
         fields?: Field[], metadata?: Meta[], network?: ClassNet }
       // bytes; sizes and offsets omitted for games that aren't kept up to date. flags: abstract,
       // trivial_constructor, trivial_destructor, construct_disallowed. parents: direct bases,
       // offset = start of a later base (multiple inheritance). fields: own only
Field  { name, offset?, type: Type, metadata?: Meta[], network?: FieldNet }
       // static members (some games): last, no offset, tagged {name: "static"}
FieldNet { type, sentAs?, class?, alias?, typeAlias?, serializer?, encoder?, recipientsFilter?,
          changePointerCallback?, changeCallbacks?: string[], userGroups?: string[], priority?,
          bitCount?, encodeFlags?, min?, max?, embeddedFieldOffsetDelta?, polymorphic?, resourceType? }
       // Only in ${netGames}, from the game's network database; a field is networked exactly when
       // it has one. Defaults omitted: priority 64, bitCount 32, min/max ±FLT_MAX. type: networked
       // type, like a network vector's element type; sentAs: when different; class: of embedded,
       // pointer and component fields when type doesn't name it; resourceType: like "vmdl"
ClassNet { includeByName?, excludeByName?: field[], includeByUserGroup?, excludeByUserGroup?,
          userGroupProxies?: group[], overrides?: {field, kind, class?, value?}[],
          varTypeOverrides?: {field: type}, replayCompatFields?: {field, callback}[], varsAtomic?,
          structNotInNetworkUtlVectorEmbedded?, outOfPVSUpdates? }
       // Only when the class has one of these. overrides kind: serializer, encoder, changeCallback,
       // changeTag, bitCount, userGroup, priority, outOfPVSUpdates, removeAll or "kindN" if unknown;
       // no class = nearest base with the field.
       // replayCompatFields field: regex over field paths. Booleans only when true;
       // outOfPVSUpdates default 2 omitted
Enum   { module, name, alignment, members?: {name, value, metadata?: Meta[]}[], metadata?: Meta[] }
       // alignment: underlying type, e.g. "uint8_t"
Meta   { name, value?: string | object }
       // value: raw text, string literals quoted; absent for tags like MNotSaved.
       // MGetKV3ClassDefaults: JSON object (keys sorted, NaN as "-nan", per-run values zeroed),
       // "Could not parse KV3 Defaults", or absent. Omits top-level keys equal to the first
       // parent's; full defaults = first parent's full defaults + own keys.
       // MNetworkNoBase on a class: its bases' fields aren't sent, except ones it includes.
       // Other MNetwork* metadata: only in ${netMetadataGames}, which have no network data.
Type   builtin {name} | declared_class {module?,name} | declared_enum {module,name} | ptr {inner}
       | fixed_array {inner, count} | atomic {name, inner?, inner2?, count?, size?, alignment?}
       | bitfield {count}   (category = the kind)
       // atomic: engine type not in the schemas, like Vector or CUtlVector<inner>; count =
       // integer template argument, like CBitVec<count>; size/alignment of this instantiation.
       // bitfield: bit position not encoded. declared_class without module: in no schema scope
ConVar  { name, type, default?, min?, max?, enum?, enumModule?, flags: string[], modules: string[], help? }
       // type: bool, (u)int16/32/64, float32/64, string, color, vector2/3/4, qangle, vector_ws
       // (always string in some games, with Source 1 flag names). Values are strings, vectors
       // like "[0.707, 0.707, 0]". modules: declaring modules, empty with flag "reference".
       // Unnamed flag bits: flag_N; gamedll/clientdll omitted when modules has server/client.
       // enum: schema enum of "enum_value" convars, value = enumerator names joined with |
Command { name, flags: string[], modules: string[], help? }
Entity  { class, module, classModule?, designName?, baseClass?, spawnable, flags?, spawnOrder?,
          components?: ({name} | {base, override})[], keys?: Key[], inputs?: Input[],
          outputs?: Output[] }
       // Only in ${entityGames}.
       // class: schema class in classModule (default module). baseClass: class of the nearest
       // base entity in the module; keys/inputs/outputs are only those added since it, like FGD.
       // Root: CEntityInstance (designName "root"), with the inputs/outputs of every entity.
       // components: {name} the class adds, {base, override} replaces a base's with a subclass
Key     { name, type, field?, declaredIn?, declaredInModule?, component?, path?, enum?, enumModule?,
          procedural?, removed?, arrayStart?, arrayCount?, flags?: string[] }
       // type: FIELD_*. field: C++ member, under path (dotted) in embedded structs. declaredIn:
       // class whose datadesc adds the key, field may be in its schema parents; defaults to the
       // entity's class and classModule. With arrayCount, name is a pattern like "Case%02d".
       // component: like "CBodyComponent", declaredIn is then its datamap class (CGameSceneNode),
       // field and path are in it. flags: ADDED_KEYFIELD, ADDITIONAL_FIELDS, EXPLICIT_BASE
Input   { name, params?: Param[], returns?: Param[], description?, pulseNode? }
Output  { name, params?: Param[], description? }
Param   { name, type, enumModule? }
       // type: PVAL_*, maybe with a subtype like "PVAL_EHANDLE:func_mover"; enumModule: module of
       // a PVAL_SCHEMA_ENUM:Name enum, also nested
\`\`\`

Declarations are keyed by (module, name). The same name can be in several modules, and types often
point to other modules (server classes use client enums): don't filter type references by module.

## Examples

\`\`\`
# Class with its fields
gunzip -c ${exampleFile} | jq '.classes[] | select(.module=="server" and .name=="CBaseEntity")'

# Classes with field m_iHealth (own fields only)
gunzip -c ${exampleFile} | jq -r '.classes[] | select(any(.fields[]?; .name=="m_iHealth")) | .module + "/" + .name'

# Fields using enum MoveType_t anywhere in their type
gunzip -c ${exampleFile} | jq -r '.classes[] | (.module + "/" + .name) as $c | .fields[]? | select(any(.type | ..; objects and .category=="declared_enum" and .name=="MoveType_t")) | $c + "." + .name'

# Enum members
gunzip -c ${exampleFile} | jq '.enums[] | select(.name=="MoveType_t").members[] | {name, value}'

# Search class names by substring (renamed or in another module)
gunzip -c ${exampleFile} | jq -r '.classes[] | select(.name | test("CreateWithinSphere")) | .module + "/" + .name'

# Without jq
node -e 'const d=JSON.parse(require("zlib").gunzipSync(require("fs").readFileSync("${exampleFile}")));console.log(d.enums.find(e=>e.name=="MoveType_t").members)'
\`\`\`

Site source: https://github.com/ValveResourceFormat/SchemaExplorer
`;

await writeFile(join(clientDir, "llms.txt"), text);
console.log(`Wrote llms.txt for ${games.map((g) => g.id).join(", ")}`);
