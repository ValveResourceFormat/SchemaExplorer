import { bench, describe } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchemas, type SchemasJson } from "../data/schemas";
import { allDeclarations } from "../data/derived";
import { parseSearch, searchDeclarations, fuzzyScore } from "./filtering";

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

describe("fuzzyScore", () => {
  bench("exact match", () => {
    fuzzyScore("cbaseentity", "CBaseEntity");
  });

  bench("prefix match", () => {
    fuzzyScore("cbase", "CBaseEntity");
  });

  bench("substring match", () => {
    fuzzyScore("entity", "CBaseEntity");
  });

  bench("fuzzy boundary match (CBE)", () => {
    fuzzyScore("cbe", "CBaseEntity");
  });

  bench("fuzzy long pattern (initfromsnapshot)", () => {
    fuzzyScore("initfromsnapshot", "C_INIT_InitFromCPSnapshot");
  });

  bench("no match (null)", () => {
    fuzzyScore("xyz", "CBaseEntity");
  });

  bench("no match long target", () => {
    fuzzyScore("xyz", "C_DOTA_Ability_Special_Bonus_Unique_Hoodwink_SharpshooterPierceHeroes");
  });
});

describe("searchDeclarations — CS2", () => {
  bench("exact: CBaseEntity", () => {
    searchDeclarations(cs2All, queries.cbaseentity);
  });

  bench("prefix: CBase", () => {
    searchDeclarations(cs2All, queries.cbase);
  });

  bench("substring: weapon", () => {
    searchDeclarations(cs2All, queries.weapon);
  });

  bench("fuzzy: CBE", () => {
    searchDeclarations(cs2All, queries.cbe);
  });

  bench("fuzzy: cswb", () => {
    searchDeclarations(cs2All, queries.cswb);
  });

  bench("multi-word: base entity", () => {
    searchDeclarations(cs2All, queries.baseEntity);
  });

  bench("field: m_flRadius", () => {
    searchDeclarations(cs2All, queries.flRadius);
  });

  bench("combined: weapon module:client", () => {
    searchDeclarations(cs2All, queries.weaponClient);
  });
});

describe("searchDeclarations — Dota2 (largest)", () => {
  bench("exact: CBaseEntity", () => {
    searchDeclarations(dota2All, queries.cbaseentity);
  });

  bench("prefix: CBase", () => {
    searchDeclarations(dota2All, queries.cbase);
  });

  bench("substring: weapon", () => {
    searchDeclarations(dota2All, queries.weapon);
  });

  bench("fuzzy: CBE", () => {
    searchDeclarations(dota2All, queries.cbe);
  });

  bench("fuzzy: initfromsnapshot", () => {
    searchDeclarations(dota2All, queries.initfromsnapshot);
  });

  bench("multi-word: base entity", () => {
    searchDeclarations(dota2All, queries.baseEntity);
  });

  bench("field: m_flRadius", () => {
    searchDeclarations(dota2All, queries.flRadius);
  });

  bench("short fuzzy: cbe (worst case)", () => {
    searchDeclarations(dota2All, queries.cbe);
  });
});

describe("searchDeclarations — Deadlock", () => {
  bench("exact: CBaseEntity", () => {
    searchDeclarations(deadlockAll, queries.cbaseentity);
  });

  bench("fuzzy: CBE", () => {
    searchDeclarations(deadlockAll, queries.cbe);
  });

  bench("fuzzy: initfromsnapshot", () => {
    searchDeclarations(deadlockAll, queries.initfromsnapshot);
  });

  bench("multi-word: base entity", () => {
    searchDeclarations(deadlockAll, queries.baseEntity);
  });
});
