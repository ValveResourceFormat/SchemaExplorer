import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_LIST } from "../src/games-list.ts";
import { parseSchemas, type SchemasJson } from "../src/data/schemas.ts";
import { intrinsicDeclarations } from "../src/data/intrinsics.ts";
import { readGzippedJson } from "./lib/read-gzipped-json.ts";
import type { SchemaFieldType } from "../src/data/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");

const intrinsicNames = new Set(intrinsicDeclarations.map((d) => d.name));

function collectMissing(
  type: SchemaFieldType,
  atomics: Map<string, Set<string>>,
  declared: Map<string, Set<string>>,
  knownKeys: Set<string>,
  source: string,
) {
  switch (type.category) {
    case "atomic":
      if (!intrinsicNames.has(type.name)) {
        if (!atomics.has(type.name)) atomics.set(type.name, new Set());
        atomics.get(type.name)!.add(source);
      }
      if (type.inner) collectMissing(type.inner, atomics, declared, knownKeys, source);
      if (type.inner2) collectMissing(type.inner2, atomics, declared, knownKeys, source);
      break;
    case "declared_class":
    case "declared_enum": {
      const key = `${type.module}/${type.name}`;
      if (!knownKeys.has(key)) {
        if (!declared.has(key)) declared.set(key, new Set());
        declared.get(key)!.add(source);
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

const missingAtomics = new Map<string, Set<string>>();
const missingDeclared = new Map<string, Set<string>>();

for (const game of GAME_LIST) {
  const data = await readGzippedJson<SchemasJson>(`${schemasDir}/${game.id}.json.gz`);
  const { declarations } = parseSchemas(data);

  const knownKeys = new Set(declarations.map((d) => `${d.module}/${d.name}`));

  for (const decl of declarations) {
    if (decl.kind !== "class") continue;
    for (const field of decl.fields) {
      collectMissing(field.type, missingAtomics, missingDeclared, knownKeys, game.id);
    }
  }
}

function printSection(title: string, entries: Map<string, Set<string>>) {
  const sorted = [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length === 0) {
    console.log(`No ${title} found.`);
  } else {
    console.log(`${sorted.length} ${title}:\n`);
    for (const [name, sources] of sorted) {
      console.log(`  ${name}  [${[...sources].join(", ")}]`);
    }
  }
}

printSection("missing atomic types", missingAtomics);
console.log();
printSection("missing declared types", missingDeclared);
