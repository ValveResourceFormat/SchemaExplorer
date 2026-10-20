import { test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchemas, type SchemasJson } from "../data/schemas";
import { buildAllGameContexts, getGameContext } from "../data/derived";
import type { GameId } from "../games-list";
import { parseSearch } from "./filtering";
import { scoreName } from "./match-score";
import { searchSchemas } from "./search";

// Vite turns imported bindings into getters. Binding them locally makes the hot
// loops measure the function itself rather than the export getter.
// https://vitest.dev/guide/benchmarking#module-runner-overhead
const _scoreName = scoreName;
const _searchSchemas = searchSchemas;

function loadSchema(name: GameId) {
  const path = join(__dirname, "../../schemas", `${name}.json`);
  const data = JSON.parse(readFileSync(path, "utf8")) as SchemasJson;
  return parseSchemas(data);
}

const loaded = new Map([
  ["cs2" as const, loadSchema("cs2")],
  ["dota2" as const, loadSchema("dota2")],
  ["deadlock" as const, loadSchema("deadlock")],
]);
buildAllGameContexts(loaded, new Map());

const cs2 = getGameContext("cs2");
const dota2 = getGameContext("dota2");
const deadlock = getGameContext("deadlock");

// Pre-parse queries outside bench callbacks to measure searchSchemas only
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
  playerHealth: parseSearch("player health"),
};

test("scoreName", async ({ bench }) => {
  const score = (pattern: string, name: string) =>
    _scoreName(pattern, name, name.toLowerCase(), true);
  await bench.compare(
    bench("exact match", () => {
      score("cbaseentity", "CBaseEntity");
    }),
    bench("prefix match", () => {
      score("cbase", "CBaseEntity");
    }),
    bench("substring match", () => {
      score("entity", "CBaseEntity");
    }),
    bench("fuzzy boundary match (CBE)", () => {
      score("cbe", "CBaseEntity");
    }),
    bench("fuzzy long pattern (initfromsnapshot)", () => {
      score("initfromsnapshot", "C_INIT_InitFromCPSnapshot");
    }),
    bench("no match (null)", () => {
      score("xyz", "CBaseEntity");
    }),
    bench("no match long target", () => {
      score("xyz", "C_DOTA_Ability_Special_Bonus_Unique_Hoodwink_SharpshooterPierceHeroes");
    }),
  );
});

test("searchSchemas — CS2", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchSchemas(cs2, queries.cbaseentity);
    }),
    bench("prefix: CBase", () => {
      _searchSchemas(cs2, queries.cbase);
    }),
    bench("substring: weapon", () => {
      _searchSchemas(cs2, queries.weapon);
    }),
    bench("fuzzy: CBE", () => {
      _searchSchemas(cs2, queries.cbe);
    }),
    bench("fuzzy: cswb", () => {
      _searchSchemas(cs2, queries.cswb);
    }),
    bench("multi-word: base entity", () => {
      _searchSchemas(cs2, queries.baseEntity);
    }),
    bench("split: player health", () => {
      _searchSchemas(cs2, queries.playerHealth);
    }),
    bench("field: m_flRadius", () => {
      _searchSchemas(cs2, queries.flRadius);
    }),
    bench("combined: weapon module:client", () => {
      _searchSchemas(cs2, queries.weaponClient);
    }),
  );
});

test("searchSchemas — Dota2 (largest)", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchSchemas(dota2, queries.cbaseentity);
    }),
    bench("prefix: CBase", () => {
      _searchSchemas(dota2, queries.cbase);
    }),
    bench("substring: weapon", () => {
      _searchSchemas(dota2, queries.weapon);
    }),
    bench("fuzzy: CBE", () => {
      _searchSchemas(dota2, queries.cbe);
    }),
    bench("fuzzy: initfromsnapshot", () => {
      _searchSchemas(dota2, queries.initfromsnapshot);
    }),
    bench("multi-word: base entity", () => {
      _searchSchemas(dota2, queries.baseEntity);
    }),
    bench("field: m_flRadius", () => {
      _searchSchemas(dota2, queries.flRadius);
    }),
  );
});

test("searchSchemas — Deadlock", async ({ bench }) => {
  await bench.compare(
    bench("exact: CBaseEntity", () => {
      _searchSchemas(deadlock, queries.cbaseentity);
    }),
    bench("fuzzy: CBE", () => {
      _searchSchemas(deadlock, queries.cbe);
    }),
    bench("fuzzy: initfromsnapshot", () => {
      _searchSchemas(deadlock, queries.initfromsnapshot);
    }),
    bench("multi-word: base entity", () => {
      _searchSchemas(deadlock, queries.baseEntity);
    }),
  );
});
