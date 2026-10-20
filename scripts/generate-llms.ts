import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ALL_GAMES, BASE_PATH, SITE_ORIGIN } from "../src/games-list.ts";
import type { SchemasJson } from "../src/data/schemas.ts";

/**
 * Writes build/client/llms.txt with links to the hashed schema assets. Agents can then download
 * the raw JSON and do not have to crawl the HTML pages.
 */
const clientDir = join(process.cwd(), "build", "client");
const assetsDir = join(clientDir, "assets");

const assets = await readdir(assetsDir);
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

const games = await Promise.all(
  ALL_GAMES.map(async (game) => {
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
  .map((g) => {
    const notes = [`${g.sizeGz} MB gzipped / ${g.sizeRaw} MB raw`];
    if (g.revision) notes.push(`revision ${g.revision}, ${g.date}`);
    if (g.devOnly) notes.push("JSON only, the site does not show this game");
    return `- ${g.name}: ${g.url}\n  (${notes.join(", ")})`;
  })
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

// The "JSON structure" section below must match the raw types: RawSchemaClass, RawSchemaEnum, and
// SchemasJson in src/data/schemas.ts, and SchemaFieldType and SchemaMetadataEntry in
// src/data/types.ts.
const text = `# Source 2 Schema Explorer

This file describes the engine schemas, entity classes, convars, and commands of Source 2 games.
Do not crawl the site. The site has no API. Download the JSON of a game and query it with a script,
for example with jq or node. The games are:

${gameLines}

The URLs change with each game update. Get the current URLs from
${SITE_ORIGIN}${BASE_PATH}/llms.txt. Each file is gzipped JSON. Parse the file with a script. Do not paste a file into your context.
All offsets and sizes are from the Windows memory layout.

## JSON structure

\`\`\`
{ generator, revision, version_date, version_time, classes: Class[], enums: Enum[],
  convars?: ConVar[], commands?: Command[], entities?: Entity[] }
Class  { module, name, size?, alignment?, flags?: string[], parents?: {module,name,offset?}[],
         fields?: Field[], metadata?: Meta[], network?: ClassNet }
       // size and offsets: in bytes. Games that are not kept up to date have no sizes and no
       // offsets.
       // flags: abstract, trivial_constructor, trivial_destructor, construct_allowed,
       // construct_disallowed. The dump writes construct_allowed only for a class without
       // alignment.
       // A class with alignment is constructible. A class without alignment is constructible
       // when it has construct_allowed and has neither abstract nor construct_disallowed.
       // parents: the direct bases. parents.offset: the start of a later base (multiple
       // inheritance).
       // fields: only the fields that the class declares.
Field  { name, offset?, type: Type, metadata?: Meta[], network?: FieldNet }
       // Some games also list static members. Static members come last, have no offset, and
       // have the metadata entry {name: "static"}.
FieldNet { type, sentAs?, class?, alias?, typeAlias?, serializer?, encoder?, recipientsFilter?,
          changePointerCallback?, changeCallbacks?: string[], userGroups?: string[], priority?,
          bitCount?, encodeFlags?, min?, max?, embeddedFieldOffsetDelta?, polymorphic?, resourceType? }
       // Only ${netGames} have network data. The data comes from the network database of the
       // game. A field has network data when, and only when, the game networks the field.
       // The dump omits default values: priority 64, bitCount 32, and min and max ±FLT_MAX.
       // type: the networked type, for example the element type of a network vector.
       // sentAs: the type that the game sends, only when it is different from type.
       // class: the class of an embedded, pointer, or component field, only when type does not
       // name the class.
       // resourceType: the resource extension, for example "vmdl".
ClassNet { includeByName?, excludeByName?: field[], includeByUserGroup?, excludeByUserGroup?,
          userGroupProxies?: group[], overrides?: {field, kind, class?, value?}[],
          varTypeOverrides?: {field: type}, replayCompatFields?: {field, callback}[], varsAtomic?,
          structNotInNetworkUtlVectorEmbedded?, outOfPVSUpdates?, networkClass? }
       // The dump writes ClassNet only when the class has one of these keys.
       // overrides.kind: serializer, encoder, changeCallback, changeTag, bitCount, userGroup,
       // priority, outOfPVSUpdates, removeAll, or "kindN" for an unknown kind.
       // overrides.class: when it is missing, the field is in the nearest base that has the
       // field.
       // replayCompatFields.field: a regex over field paths.
       // The dump writes booleans only when they are true. It omits outOfPVSUpdates when the
       // value is 2.
       // networkClass: the server class has a DECLARE_NETWORKCLASS registration.
       // Demo class ids: the server sends some classes in the class info of a demo. A class must
       // have networkClass, be constructible, and be CBaseEntity or derive from it.
       // To get the class ids, sort these classes by name. Change ASCII letters to lowercase,
       // then compare the bytes. Thus _ sorts before letters. The class id is the index in this
       // sorted list. The server sends a class id in floor(log2(count)) + 1 bits.
       // The class ids are valid only for demos from the same game build.
Enum   { module, name, alignment, flags?: string[],
         members?: {name, value: number | string, metadata?: Meta[]}[], metadata?: Meta[] }
       // alignment: the underlying type, for example "uint8_t".
       // flags: unsigned. This flag means that the storage type is unsigned. Every enum with
       // values past the signed limit has this flag.
       // value: the signed 64-bit value. Past ±(2^53-1), value is a string of its decimal
       // digits. Parse that string with BigInt. Thus the uint64 value with all bits set is -1.
Meta   { name, value?: string | object }
       // value: the raw text, with string literals in quotes. Tags like MNotSaved have no value.
       // MGetKV3ClassDefaults: a JSON object, the string "Could not parse KV3 Defaults", or no
       // value. In the object, the keys are sorted, NaN is "-nan", and per-run values are 0.
       // Integers past ±(2^53-1) are strings of their decimal digits, at any depth.
       // The object omits a top-level key when its value is equal to the value in the first
       // parent. The full defaults are the full defaults of the first parent plus the keys of
       // the class.
       // MNetworkNoBase on a class: the game does not send the fields of its bases. The fields
       // that the class includes are an exception.
       // MGlobalTypeScope on a class or enum: the declaration is in the global type scope. Only
       // the declarations that ask for this tag have it.
       // Other MNetwork* metadata: only ${netMetadataGames} have it. These games have no network
       // data.
Type   builtin {name} | declared_class {module?,name} | declared_enum {module,name} | ptr {inner}
       | fixed_array {inner, count} | atomic {name, inner?, inner2?, count?, size?, alignment?}
       | bitfield {count}
       // category: the kind of the type, for example "atomic".
       // atomic: an engine type that is not in the schemas, for example Vector or
       // CUtlVector<inner>. count: an integer template argument, for example CBitVec<count>.
       // size and alignment: the layout of this instantiation.
       // bitfield: the dump does not encode the bit position.
       // declared_class without module: the class is in no schema scope.
ConVar  { name, type, default?, min?, max?, enum?, enumModule?, flags: string[], modules: string[], help? }
       // type: bool, (u)int16/32/64, float32/64, string, color, vector2/3/4, qangle, or
       // vector_ws. In some games, the type is always string and the flags use Source 1 names.
       // All values are strings. Vector values look like "[0.707, 0.707, 0]".
       // modules: the modules that declare the convar. modules is empty when flags has
       // "reference".
       // An unnamed flag bit is flag_N. The dump omits gamedll when modules has server, and
       // omits clientdll when modules has client.
       // enum: the schema enum of an "enum_value" convar. The value is the enumerator names,
       // joined with |.
Command { name, flags: string[], modules: string[], help? }
Entity  { class, module, classModule?, designName?, baseClass?, spawnable, flags?, spawnOrder?,
          components?: ({name} | {base, override})[], keys?: Key[], inputs?: Input[],
          outputs?: Output[] }
       // Only ${entityGames} have entities.
       // class: the schema class in classModule. classModule defaults to module.
       // baseClass: the class of the nearest base entity in the module. keys, inputs, and
       // outputs list only the items that the entity adds after baseClass, like FGD does.
       // The root is CEntityInstance (designName "root"). The root has the inputs and outputs
       // of every entity.
       // components: {name} is a component that the class adds. {base, override} replaces the
       // component of a base with a subclass.
Key     { name, type, field?, declaredIn?, declaredInModule?, component?, path?, enum?, enumModule?,
          procedural?, removed?, arrayStart?, arrayCount?, flags?: string[] }
       // type: FIELD_*. field: the C++ member. In an embedded struct, field is under path
       // (dotted).
       // declaredIn: the class whose datadesc adds the key. The field can be in the schema
       // parents of that class. declaredIn and declaredInModule default to the class and
       // classModule of the entity.
       // With arrayCount, name is a pattern, for example "Case%02d".
       // component: for example "CBodyComponent". declaredIn is then the datamap class of the
       // component, for example CGameSceneNode. field and path are in that class.
       // flags: ADDED_KEYFIELD, ADDITIONAL_FIELDS, EXPLICIT_BASE.
Input   { name, params?: Param[], returns?: Param[], description?, pulseNode? }
Output  { name, params?: Param[], description? }
Param   { name, type, enumModule? }
       // type: PVAL_*. The type can have a subtype, for example "PVAL_EHANDLE:func_mover".
       // enumModule: the module of a PVAL_SCHEMA_ENUM:Name enum, also nested.
\`\`\`

The key of a declaration is the pair (module, name). The same name can be in more than one
module. Types often refer to other modules, for example server classes use client enums. Do not
filter type references by module.

## Examples

\`\`\`
# Class with its fields
gunzip -c ${exampleFile} | jq '.classes[] | select(.module=="server" and .name=="CBaseEntity")'

# Classes with the field m_iHealth (only the fields that each class declares)
gunzip -c ${exampleFile} | jq -r '.classes[] | select(any(.fields[]?; .name=="m_iHealth")) | .module + "/" + .name'

# Fields that use the enum MoveType_t anywhere in their type
gunzip -c ${exampleFile} | jq -r '.classes[] | (.module + "/" + .name) as $c | .fields[]? | select(any(.type | ..; objects and .category=="declared_enum" and .name=="MoveType_t")) | $c + "." + .name'

# Enum members
gunzip -c ${exampleFile} | jq '.enums[] | select(.name=="MoveType_t").members[] | {name, value}'

# Find class names by substring, for example a renamed class or a class in another module
gunzip -c ${exampleFile} | jq -r '.classes[] | select(.name | test("CreateWithinSphere")) | .module + "/" + .name'

# Without jq
node -e 'const d=JSON.parse(require("zlib").gunzipSync(require("fs").readFileSync("${exampleFile}")));console.log(d.enums.find(e=>e.name=="MoveType_t").members)'
\`\`\`

Site source: https://github.com/ValveResourceFormat/SchemaExplorer
`;

await writeFile(join(clientDir, "llms.txt"), text);
console.log(`Wrote llms.txt for ${games.map((g) => g.id).join(", ")}`);
