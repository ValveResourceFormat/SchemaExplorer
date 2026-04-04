import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_LIST } from "../src/games-list.ts";
import { parseSchemas, type SchemasJson } from "../src/data/schemas.ts";
import { intrinsicDeclarations } from "../src/data/intrinsics.ts";
import { allDeclarations, declarationKey } from "../src/data/derived.ts";
import { readGzippedJson } from "./lib/read-gzipped-json.ts";
import type { SchemaFieldType } from "../src/data/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");

const intrinsicNames = new Set(intrinsicDeclarations.keys());

type MissingTypeInfo = { sources: Set<string>; count: number };

function collectMissing(
  type: SchemaFieldType,
  atomics: Map<string, MissingTypeInfo>,
  declared: Map<string, MissingTypeInfo>,
  knownKeys: Set<string>,
  source: string,
) {
  switch (type.category) {
    case "atomic":
      if (!intrinsicNames.has(type.name)) {
        if (!atomics.has(type.name)) atomics.set(type.name, { sources: new Set(), count: 0 });
        atomics.get(type.name)!.sources.add(source);
        atomics.get(type.name)!.count++;
      }
      if (type.inner) collectMissing(type.inner, atomics, declared, knownKeys, source);
      if (type.inner2) collectMissing(type.inner2, atomics, declared, knownKeys, source);
      break;
    case "declared_class":
    case "declared_enum": {
      const key = declarationKey(type.module, type.name);
      if (!knownKeys.has(key)) {
        if (!declared.has(key)) declared.set(key, { sources: new Set(), count: 0 });
        declared.get(key)!.sources.add(source);
        declared.get(key)!.count++;
      }
      break;
    }
    case "ptr":
    case "fixed_array":
      collectMissing(type.inner, atomics, declared, knownKeys, source);
      break;
    case "builtin":
    case "bitfield":
      break;
  }
}

const missingAtomics = new Map<string, MissingTypeInfo>();
const missingDeclared = new Map<string, MissingTypeInfo>();

for (const game of GAME_LIST) {
  const data = await readGzippedJson<SchemasJson>(`${schemasDir}/${game.id}.json.gz`);
  const { declarations } = parseSchemas(data);

  const knownKeys = new Set<string>();
  for (const d of allDeclarations(declarations)) {
    knownKeys.add(declarationKey(d.module, d.name));
  }

  for (const decl of allDeclarations(declarations)) {
    if (decl.kind !== "class") continue;
    for (const field of decl.fields) {
      collectMissing(field.type, missingAtomics, missingDeclared, knownKeys, game.id);
    }
  }
}

function printSection(title: string, entries: Map<string, MissingTypeInfo>) {
  const sorted = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length === 0) {
    console.log(`No ${title} found.`);
  } else {
    console.log(`${sorted.length} ${title}:\n`);
    for (const [name, info] of sorted) {
      console.log(`  (${info.count}) ${name}  [${[...info.sources].join(", ")}]`);
    }
  }
}

printSection("missing atomic types", missingAtomics);
console.log();
printSection("missing declared types", missingDeclared);
