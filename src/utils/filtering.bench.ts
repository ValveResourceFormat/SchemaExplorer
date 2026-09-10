import { test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchemas, type SchemasJson } from "../data/schemas";
import { allDeclarations } from "../data/derived";
import { parseSearch, searchDeclarations, fuzzyScore } from "./filtering";

// Vite turns imported bindings into getters; bind them locally so the hot
// loops measure the function itself rather than the export getter.
// https://vitest.dev/guide/benchmarking#module-runner-overhead
const _fuzzyScore = fuzzyScore;
const _searchDeclarations = searchDeclarations;

function loadSchema(name: string) {
  const path = join(__dirname, "../../schemas", `${name}.json`);
  const data = JSON.parse(readFileSync(path, "utf8")) as SchemasJson;
  return parseSchemas(data);
}

const cs2All = [...allDeclarations(loadSchema("cs2").declarations)];
const dota2All = [...allDeclarations(loadSchema("dota2").declarations)];
const deadlockAll = [...allDeclarations(loadSchema("deadlock").declarations)];

// Pre-parse queries outside bench callbacks to measure searchDeclarations only
const queries = {
  cbaseentity: parseSearch("CBaseEntity"),
  cbase: parseSearch("CBase"),
  weapon: parseSearch("weapon"),
  cbe: parseSearch("CBE"),
  cswb: parseSearch("cswb"),
  baseEntity: parseSearch("base entity"),
  flRadius: parseSearch("m_flRadius"),
  weaponClient: parseSearch("weapon module:client"),
  initfromsnapshot: parseSearch("initfromsnapshot"),
};

test("fuzzyScore", async ({ bench }) => {
  await bench.compare(
    bench("exact match", () => {
      _fuzzyScore("cbaseentity", "CBaseEntity");
    }),
    bench("prefix match", () => {
      _fuzzyScore("cbase", "CBaseEntity");
    }),
    bench("substring match", () => {
      _fuzzyScore("entity", "CBaseEntity");
    }),
    bench("fuzzy boundary match (CBE)", () => {
      _fuzzyScore("cbe", "CBaseEntity");
    }),
    bench("fuzzy long pattern (initfromsnapshot)", () => {
      _fuzzyScore("initfromsnapshot", "C_INIT_InitFromCPSnapshot");
    }),
    bench("no match (null)", () => {
      _fuzzyScore("xyz", "CBaseEntity");
    }),
    bench("no match long target", () => {
      _fuzzyScore("xyz", "C_DOTA_Ability_Special_Bonus_Unique_Hoodwink_SharpshooterPierceHeroes");
    }),
  );
});

test("searchDeclarations — CS2", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchDeclarations(cs2All, queries.cbaseentity);
    }),
    bench("prefix: CBase", () => {
      _searchDeclarations(cs2All, queries.cbase);
    }),
    bench("substring: weapon", () => {
      _searchDeclarations(cs2All, queries.weapon);
    }),
    bench("fuzzy: CBE", () => {
      _searchDeclarations(cs2All, queries.cbe);
    }),
    bench("fuzzy: cswb", () => {
      _searchDeclarations(cs2All, queries.cswb);
    }),
    bench("multi-word: base entity", () => {
      _searchDeclarations(cs2All, queries.baseEntity);
    }),
    bench("field: m_flRadius", () => {
      _searchDeclarations(cs2All, queries.flRadius);
    }),
    bench("combined: weapon module:client", () => {
      _searchDeclarations(cs2All, queries.weaponClient);
    }),
  );
});

test("searchDeclarations — Dota2 (largest)", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchDeclarations(dota2All, queries.cbaseentity);
    }),
    bench("prefix: CBase", () => {
      _searchDeclarations(dota2All, queries.cbase);
    }),
    bench("substring: weapon", () => {
      _searchDeclarations(dota2All, queries.weapon);
    }),
    bench("fuzzy: CBE", () => {
      _searchDeclarations(dota2All, queries.cbe);
    }),
    bench("fuzzy: initfromsnapshot", () => {
      _searchDeclarations(dota2All, queries.initfromsnapshot);
    }),
    bench("multi-word: base entity", () => {
      _searchDeclarations(dota2All, queries.baseEntity);
    }),
    bench("field: m_flRadius", () => {
      _searchDeclarations(dota2All, queries.flRadius);
    }),
    bench("short fuzzy: cbe (worst case)", () => {
      _searchDeclarations(dota2All, queries.cbe);
    }),
  );
});

test("searchDeclarations — Deadlock", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchDeclarations(deadlockAll, queries.cbaseentity);
    }),
    bench("fuzzy: CBE", () => {
      _searchDeclarations(deadlockAll, queries.cbe);
    }),
    bench("fuzzy: initfromsnapshot", () => {
      _searchDeclarations(deadlockAll, queries.initfromsnapshot);
    }),
    bench("multi-word: base entity", () => {
      _searchDeclarations(deadlockAll, queries.baseEntity);
    }),
  );
});
