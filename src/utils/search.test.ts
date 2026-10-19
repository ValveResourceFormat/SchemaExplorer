import { describe, expect, it } from "vitest";
import { SHOW_FILTER_NAMES, type ShowFilter } from "../data/show-filters";
import { buildContext, buildTestContext, builtin, cls, field, search } from "../data/test-helpers";
import type { Declaration, SchemaFieldType } from "../data/types";
import { parseSearch } from "./filtering";
import { TIER_EXACT, TIER_FUZZY, TIER_WORD_START } from "./match-score";
import {
  countSearchShowFilters,
  filterSearchResult,
  itemName,
  rowSides,
  searchSchemas,
  type PairableHit,
  type SearchResult,
} from "./search";

function handleTo(name: string, module: string): SchemaFieldType {
  return {
    category: "atomic",
    name: "CHandle",
    inner: { category: "declared_class", name, module },
  };
}

/** Whether some name words matched the declaration and the others the field or member */
function isSplit(hit: PairableHit): boolean {
  return hit.kind !== "name" && hit.nameWords.length > 0 && hit.fieldWords.length > 0;
}

function nameRows(result: SearchResult): string[] {
  return result.names.map((row) => row.hit.declaration.name);
}

function fieldRows(result: SearchResult): string[] {
  return result.fields.map((row) => {
    const { hit } = row;
    return `${hit.declaration.name}.${itemName(hit)}`;
  });
}

function similarNames(result: SearchResult): string[] {
  return result.similar.map((row) => row.hit.declaration.name);
}

const rankingContext = buildContext({
  classes: [
    cls("server", "CCSPlayerPawn", [
      field("m_iHealth", builtin("int32"), 8),
      field("m_agentRadius", builtin("float32"), 12),
      field("m_flRadius", builtin("float32"), 16),
      field("m_isRescued", builtin("bool"), 20),
      field("m_activeTimer", builtin("float32"), 24),
      field("m_hPawn", builtin("uint32"), 28),
    ]),
    cls("server", "SPAWNGROUP_HEADER"),
    cls("server", "PawnData"),
    cls("server", "CPlAWNode"),
    cls("server", "Ns::Widget"),
    cls("server", "Unwidgeted"),
    cls("server", "CMulti", [
      field("m_flPawnHealth", builtin("float32"), 8),
      field("m_flHealthRadius", builtin("float32"), 12),
    ]),
  ],
  enums: [],
});

describe("ranking", () => {
  it("puts a word start before the middle of a word", () => {
    const result = search(rankingContext, "pawn");
    expect(nameRows(result)).toEqual(["PawnData", "CCSPlayerPawn", "SPAWNGROUP_HEADER"]);
    const tiers = result.names.map((row) => row.hit.tier);
    expect(tiers[1]).toBe(TIER_WORD_START);
    expect(tiers[2]).toBeGreaterThan(TIER_WORD_START);
  });

  it("puts shorter names first within a tier, then earlier positions", () => {
    const context = buildContext({
      classes: [
        cls("server", "CCS2PawnGraphController"),
        cls("server", "CCSPlayerPawn"),
        cls("server", "CPawnX"),
      ],
      enums: [],
    });
    expect(nameRows(search(context, "pawn"))).toEqual([
      "CPawnX",
      "CCSPlayerPawn",
      "CCS2PawnGraphController",
    ]);
  });

  it("puts a word after :: at a word start", () => {
    const result = search(rankingContext, "widget");
    expect(nameRows(result)).toEqual(["Ns::Widget", "Unwidgeted"]);
  });

  it("keeps fuzzy hits out of the results", () => {
    const result = search(rankingContext, "pawn");
    expect(similarNames(result)).toEqual(["CPlAWNode"]);
    expect(result.similar[0].hit.tier).toBe(TIER_FUZZY);
    expect(result.declarations.has(result.similar[0].hit.declaration)).toBe(false);
    for (const row of result.names) expect(row.hit.tier).toBeLessThan(TIER_FUZZY);
    for (const row of result.fields) expect(row.hit.tier).toBeLessThan(TIER_FUZZY);
  });

  it("has only similar names when nothing else matches", () => {
    const result = search(rankingContext, "cspp");
    expect(result.names).toEqual([]);
    expect(result.fields).toEqual([]);
    expect(result.declarations.size).toBe(0);
    expect(similarNames(result)).toEqual(["CCSPlayerPawn"]);
  });

  it("leaves the similar names out when asked to, and nothing else", () => {
    for (const query of ["pawn", "cspp", "ccsplayerpawn.health", "zzzz.qqqq"]) {
      const parsed = parseSearch(query);
      const full = searchSchemas(rankingContext, parsed);
      const without = searchSchemas(rankingContext, parsed, { similar: false });
      expect(without.similar).toEqual([]);
      expect(nameRows(without)).toEqual(nameRows(full));
      expect(fieldRows(without)).toEqual(fieldRows(full));
      expect(without.inherited).toEqual(full.inherited);
      expect([...without.declarations]).toEqual([...full.declarations]);
    }
    const dotted = searchSchemas(rankingContext, parseSearch("ccsplayerpawn.health"));
    expect(fieldRows(dotted)).toContain("CCSPlayerPawn.m_iHealth");
  });

  it("leaves a declaration with another hit out of the similar names", () => {
    const context = buildContext({
      classes: [cls("server", "CPlayerAreaWallNode", [field("m_pawnCount")])],
      enums: [],
    });
    const result = search(context, "pawn");
    expect(fieldRows(result)).toEqual(["CPlayerAreaWallNode.m_pawnCount"]);
    expect(result.similar).toEqual([]);
  });

  it("does not match fields fuzzily", () => {
    const result = search(rankingContext, "hlt");
    expect(result.fields).toEqual([]);
  });

  it("finds nothing without a query", () => {
    const result = search(rankingContext, "");
    expect(result.names).toEqual([]);
    expect(result.declarations.size).toBe(0);
  });
});

describe("field names without their type prefix", () => {
  it("finds the name after m_ and the prefix as an exact match", () => {
    const hit = search(rankingContext, "health").fields[0].hit;
    expect(hit.tier).toBe(TIER_EXACT);
    // The ranges are moved back to the full name m_iHealth
    expect(hit.kind === "field" && hit.fieldWords[0].ranges).toEqual([3, 9]);
    expect(hit.kind === "field" && hit.fieldWords[0].text).toBe("m_iHealth");
  });

  it("ranks the stripped exact match before the longer ones", () => {
    const result = search(rankingContext, "health");
    expect(fieldRows(result)).toEqual([
      "CCSPlayerPawn.m_iHealth",
      "CMulti.m_flHealthRadius",
      "CMulti.m_flPawnHealth",
    ]);
  });

  it("only strips a known prefix", () => {
    const result = search(rankingContext, "radius");
    expect(fieldRows(result)).toEqual([
      "CCSPlayerPawn.m_flRadius",
      "CMulti.m_flHealthRadius",
      "CCSPlayerPawn.m_agentRadius",
    ]);
    const agent = result.fields[2].hit;
    expect(agent.tier).toBe(TIER_WORD_START);
    expect(agent.kind === "field" && agent.fieldWords[0].ranges).toEqual([7, 13]);
  });

  it("leaves words that look like a prefix alone", () => {
    const rescued = search(rankingContext, "rescued").fields[0].hit;
    expect(rescued.tier).toBe(TIER_WORD_START);
    expect(rescued.kind === "field" && rescued.fieldWords[0].ranges).toEqual([4, 11]);

    const active = search(rankingContext, "active").fields[0].hit;
    expect(active.tier).toBe(TIER_WORD_START);
  });

  it("still matches the whole name", () => {
    const result = search(rankingContext, "m_flradius");
    expect(fieldRows(result)).toEqual(["CCSPlayerPawn.m_flRadius"]);
    expect(result.fields[0].hit.tier).toBe(TIER_EXACT);
  });
});

describe("several words", () => {
  it("scores a declaration name and its fields apart", () => {
    const result = search(rankingContext, "pawn");
    expect(nameRows(result)).toContain("CCSPlayerPawn");
    expect(fieldRows(result)).toContain("CCSPlayerPawn.m_hPawn");
  });

  it("puts a hit with every word in one name before a split hit", () => {
    const result = search(rankingContext, "pawn health");
    expect(fieldRows(result)).toEqual(["CMulti.m_flPawnHealth", "CCSPlayerPawn.m_iHealth"]);

    const [whole, split] = result.fields.map((row) => row.hit);
    expect(isSplit(whole)).toBe(false);
    expect(isSplit(split)).toBe(true);
    if (split.kind !== "field") throw new Error("not a field");
    expect(split.nameWords.map((w) => [w.word, w.source])).toEqual([["pawn", "name"]]);
    expect(split.fieldWords.map((w) => [w.word, w.source])).toEqual([["health", "field"]]);
  });

  it("splits three words between the class and the field", () => {
    const result = search(rankingContext, "player pawn health");
    expect(fieldRows(result)).toEqual(["CCSPlayerPawn.m_iHealth"]);
    const hit = result.fields[0].hit;
    expect(hit.nameWords.map((w) => w.word)).toEqual(["player", "pawn"]);
    expect(hit.kind === "field" && hit.fieldWords.map((w) => w.word)).toEqual(["health"]);
  });

  it("needs the words of the field side in the same field", () => {
    expect(search(rankingContext, "player health radius").fields).toEqual([]);
    expect(fieldRows(search(rankingContext, "health radius"))).toEqual(["CMulti.m_flHealthRadius"]);
  });

  it("needs every word to match the class or the field", () => {
    expect(search(rankingContext, "pawn timer rescued").fields).toEqual([]);
  });

  describe("when the class name has every word", () => {
    const context = buildContext({
      classes: [
        cls("server", "CBaseEntity", [
          field("m_hEntity", builtin("uint32"), 8),
          field("m_flBaseEntityScale", builtin("float32"), 12),
          field("m_flBase", builtin("float32"), 16),
        ]),
        cls("server", "CFilterHealth", [
          field("m_flAmount", builtin("float32"), 16),
          field("m_flOther", builtin("float32"), 20),
        ]),
        cls("server", "CPlayerPawn", [field("m_iHealth", builtin("int32"), 8)]),
      ],
      enums: [],
    });

    it("drops a field that has only some of the words", () => {
      const result = search(context, "base entity");
      expect(nameRows(result)).toEqual(["CBaseEntity"]);
      expect(fieldRows(result)).toEqual(["CBaseEntity.m_flBaseEntityScale"]);
    });

    it("keeps a field that only a tag finds", () => {
      const result = search(context, "health offset:0x10");
      expect(fieldRows(result)).toEqual(["CFilterHealth.m_flAmount"]);
    });

    it("still splits the words when the class name lacks one", () => {
      const result = search(context, "player health");
      expect(fieldRows(result)).toEqual(["CPlayerPawn.m_iHealth"]);
    });
  });

  it("finds a class with all words in its name", () => {
    const result = search(rankingContext, "player pawn");
    expect(nameRows(result)).toEqual(["CCSPlayerPawn"]);
  });

  it("matches words in the class name and an entity design name", () => {
    const context = buildContext({
      classes: [cls("server", "CTriggerMultiple", [field("m_flWait", builtin("float32"))])],
      enums: [],
      entities: [
        {
          class: "CTriggerMultiple",
          module: "server",
          designName: "trigger_multiple",
          spawnable: true,
        },
      ],
    });
    const named = search(context, "trigger_multiple").names[0].hit;
    expect(named.tier).toBe(TIER_EXACT);
    expect(named.nameWords[0].source).toBe("designName");
    expect(named.nameWords[0].text).toBe("trigger_multiple");

    const split = search(context, "trigger_multiple wait");
    const hit = split.fields[0].hit;
    expect(isSplit(hit)).toBe(true);
    expect(hit.nameWords[0].source).toBe("designName");
  });

  it("credits the class name for a word its design name matches only as well", () => {
    const context = buildContext({
      classes: [cls("client", "C_CSPlayerPawnBase", [field("m_iHealth", builtin("int32"))])],
      enums: [],
      entities: [
        {
          class: "C_CSPlayerPawnBase",
          module: "client",
          designName: "player_pawn_base",
          spawnable: true,
        },
      ],
    });
    const hit = search(context, "pawn heal").fields[0].hit;
    expect(hit.nameWords[0].source).toBe("name");
    expect(hit.nameWords[0].text).toBe("C_CSPlayerPawnBase");
  });

  it("ranks an exact entity name before a class name that only starts a word", () => {
    const context = buildContext({
      classes: [cls("server", "CSmartPropElement_PropPhysics"), cls("server", "CPhysicsProp")],
      enums: [],
      entities: [
        { class: "CPhysicsProp", module: "server", designName: "prop_physics", spawnable: true },
      ],
    });
    expect(nameRows(search(context, "prop_physics"))).toEqual([
      "CPhysicsProp",
      "CSmartPropElement_PropPhysics",
    ]);
  });
});

describe("positions", () => {
  it("gives the range of a substring", () => {
    const rows = search(rankingContext, "player").names;
    const pawn = rows.find((row) => row.hit.declaration.name === "CCSPlayerPawn");
    const word = pawn!.hit.nameWords[0];
    expect(word.text).toBe("CCSPlayerPawn");
    expect(word.ranges).toEqual([3, 9]);
  });

  it("gives the matched letters of a fuzzy hit", () => {
    const word = search(rankingContext, "cspp").similar[0].hit.nameWords[0];
    expect(word.ranges).toEqual([0, 1, 2, 4, 9, 10]);
  });
});

// -- Pairing --

const pairingContext = buildContext({
  classes: [
    cls("client", "C_Foo", [
      field("m_flA", builtin("float32"), 4),
      field("m_hTarget", handleTo("C_Baz", "client"), 8),
      field("m_vecPos", builtin("Vector"), 12),
      field("m_nClientOnly", builtin("int32"), 16),
    ]),
    cls("server", "CFoo", [
      field("m_flA", builtin("float32"), 4),
      field("m_hTarget", handleTo("CBaz", "server"), 16),
      field("m_vecPos", builtin("QAngle"), 20),
      field("m_nServerOnly", builtin("int32"), 24),
    ]),
    cls("client", "C_Baz"),
    cls("server", "CBaz"),
    cls("client", "C_ABC"),
    cls("server", "CABC"),
  ],
  enums: [
    {
      name: "EMode",
      module: "client",
      alignment: "uint8",
      members: [
        { name: "EMode_A", value: 0 },
        { name: "EMode_B", value: 1 },
      ],
    },
    {
      name: "EMode",
      module: "server",
      alignment: "uint8",
      members: [
        { name: "EMode_A", value: 0 },
        { name: "EMode_B", value: 2 },
      ],
    },
  ],
});

describe("client and server pairs", () => {
  it("merges the two classes into one row, the server one on a tie", () => {
    const result = search(pairingContext, "foo");
    expect(result.names).toHaveLength(1);
    const [row] = result.names;
    expect(row.hit.declaration.name).toBe("CFoo");
    expect(row.paired?.declaration.name).toBe("C_Foo");
    expect(result.declarations.size).toBe(2);
  });

  it("shows the side that matched better", () => {
    const context = buildContext({
      classes: [cls("client", "C_QuxThing"), cls("server", "CQuxThing")],
      enums: [],
      entities: [{ class: "CQuxThing", module: "server", designName: "qux", spawnable: true }],
    });
    const [row] = search(context, "qux").names;
    expect(row.hit.declaration.name).toBe("CQuxThing");
    expect(row.paired?.declaration.name).toBe("C_QuxThing");
    expect(row.hit.tier).toBeLessThan(row.paired!.tier);
  });

  it("scores a client and a server class alike without their prefix", () => {
    const [row] = search(pairingContext, "abc").names;
    expect(row.hit.declaration.name).toBe("CABC");
    expect(row.paired?.declaration.name).toBe("C_ABC");
    expect(row.hit.tier).toBe(row.paired!.tier);
  });

  it("merges the same field of both classes", () => {
    const result = search(pairingContext, "m_fla");
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].hit.declaration.name).toBe("CFoo");
    expect(result.fields[0].paired?.declaration.name).toBe("C_Foo");
    expect(result.declarations.size).toBe(2);
  });

  it("merges types that differ only in C_ and C, inside template arguments too", () => {
    const result = search(pairingContext, "target");
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].paired).toBeDefined();
  });

  it("keeps fields of different types apart", () => {
    const result = search(pairingContext, "vecpos");
    expect(fieldRows(result)).toEqual(["CFoo.m_vecPos", "C_Foo.m_vecPos"]);
    expect(result.fields.every((row) => row.paired === undefined)).toBe(true);
  });

  it("keeps a hit on one side alone", () => {
    const result = search(pairingContext, "only");
    expect(fieldRows(result)).toEqual(["C_Foo.m_nClientOnly", "CFoo.m_nServerOnly"]);
    expect(result.fields.every((row) => row.paired === undefined)).toBe(true);
  });

  it("merges split hits whose class word matched different names", () => {
    const context = buildContext({
      classes: [
        cls("server", "CPlayerPawn", [field("m_iHealth", builtin("int32"), 8)]),
        cls("client", "C_PlayerPawn", [field("m_iHealth", builtin("int32"), 8)]),
      ],
      enums: [],
      entities: [{ class: "CPlayerPawn", module: "server", designName: "player", spawnable: true }],
    });
    const result = search(context, "player health");
    expect(result.fields).toHaveLength(1);
    const [row] = result.fields;
    expect(row.hit.nameWords[0].source).not.toBe(row.paired?.nameWords[0].source);
    expect(row.paired).toBeDefined();
  });

  it("keeps a hit alone when the other class does not hit", () => {
    const result = search(pairingContext, "only");
    expect(result.names).toEqual([]);
    const alone = search(pairingContext, "c_foo m_nclientonly");
    expect(alone.fields[0].paired).toBeUndefined();
  });

  it("merges an offset: query only when both sides match", () => {
    const both = search(pairingContext, "offset:4");
    expect(both.fields).toHaveLength(1);
    expect(both.fields[0].paired).toBeDefined();

    const client = search(pairingContext, "offset:8");
    expect(fieldRows(client)).toEqual(["C_Foo.m_hTarget"]);
    expect(client.fields[0].paired).toBeUndefined();

    const differing = search(pairingContext, "offset:16");
    expect(fieldRows(differing)).toEqual(["CFoo.m_hTarget", "C_Foo.m_nClientOnly"]);
    expect(differing.fields.every((row) => row.paired === undefined)).toBe(true);
  });

  it("pairs enum members by name and value", () => {
    const result = search(pairingContext, "emode_");
    const rows = result.fields.map((row) => [
      row.hit.kind === "member" && row.hit.member.name,
      row.hit.kind === "member" && row.hit.member.value,
      row.paired !== undefined,
    ]);
    expect(rows).toEqual([
      ["EMode_A", 0, true],
      ["EMode_B", 1, false],
      ["EMode_B", 2, false],
    ]);
  });
});

// -- Tags --

const tagContext = buildContext({
  classes: [
    cls(
      "server",
      "CTrigger",
      [
        {
          ...field("m_flWait", builtin("float32"), 8),
          metadata: [{ name: "MPropertyFriendlyName", value: "Wait time" }],
          network: { type: "float32", encoder: "coord" },
        },
        field("m_iCount", builtin("int32"), 12),
      ],
      {
        metadata: [{ name: "MVDataRoot" }],
        network: { includeByName: ["m_flWait"] },
      },
    ),
    cls("server", "CPlain", [field("m_iOther", builtin("int32"), 8)]),
    cls("client", "CClientOnly"),
  ],
  enums: [
    {
      name: "ETeam",
      module: "server",
      alignment: "uint8",
      members: [
        { name: "TEAM_NONE", value: 0 },
        { name: "TEAM_RED", value: 2 },
      ],
    },
  ],
  entities: [
    {
      class: "CTrigger",
      module: "server",
      designName: "trigger_multiple",
      spawnable: true,
      inputs: [{ name: "Kill" }],
      outputs: [{ name: "OnTrigger" }],
    },
  ],
});

describe("tags only", () => {
  it("lists the declarations of a module", () => {
    const result = search(tagContext, "module:server");
    expect(nameRows(result).sort()).toEqual(["CPlain", "CTrigger", "ETeam"]);
    expect(result.fields).toEqual([]);
    expect(result.names[0].hit.nameWords).toEqual([]);
    expect(result.names[0].hit.tier).toBe(TIER_EXACT);
  });

  it("finds the class of an entity", () => {
    const result = search(tagContext, "entity:trigger");
    expect(nameRows(result)).toEqual(["CTrigger"]);
    expect(result.names[0].hit.tags).toEqual([
      { kind: "entity", designNames: ["trigger_multiple"] },
    ]);
    expect(result.fields).toEqual([]);
  });

  it("finds the class of an input or output", () => {
    const input = search(tagContext, "input:kill").names[0].hit;
    expect(input.declaration.name).toBe("CTrigger");
    const [tag] = input.tags;
    expect(tag.kind === "io" && tag.inputs.map((i) => i.name)).toEqual(["Kill"]);
    expect(nameRows(search(tagContext, "output:ontrigger"))).toEqual(["CTrigger"]);
    expect(search(tagContext, "input:nothing").names).toEqual([]);
  });

  it("finds classes by their metadata and fields by theirs", () => {
    const root = search(tagContext, "metadata:mvdataroot");
    expect(nameRows(root)).toEqual(["CTrigger"]);
    expect(root.fields).toEqual([]);

    const friendly = search(tagContext, "metadata:friendly");
    expect(friendly.names).toEqual([]);
    expect(fieldRows(friendly)).toEqual(["CTrigger.m_flWait"]);
    const [tag] = friendly.fields[0].hit.tags;
    expect(tag.kind === "metadata" && tag.entries.map((e) => e.name)).toEqual([
      "MPropertyFriendlyName",
    ]);

    expect(fieldRows(search(tagContext, "metadatavalue:wait"))).toEqual(["CTrigger.m_flWait"]);
  });

  it("finds classes and fields by their network data", () => {
    const own = search(tagContext, "network:includebyname");
    expect(nameRows(own)).toEqual(["CTrigger"]);
    expect(own.fields).toEqual([]);

    const field = search(tagContext, "network:encoder");
    expect(field.names).toEqual([]);
    expect(fieldRows(field)).toEqual(["CTrigger.m_flWait"]);
  });

  it("finds fields by offset, with no declarations of their own", () => {
    const result = search(tagContext, "offset:8");
    expect(result.names).toEqual([]);
    expect(fieldRows(result)).toEqual(["CTrigger.m_flWait", "CPlain.m_iOther"]);
    expect(result.fields[0].hit.tags).toEqual([{ kind: "offset", offset: 8 }]);
    expect(result.declarations.size).toBe(2);
  });

  it("finds enum members by value", () => {
    const result = search(tagContext, "enumvalue:2");
    expect(fieldRows(result)).toEqual(["ETeam.TEAM_RED"]);
    expect(result.fields[0].hit.tags).toEqual([{ kind: "enumValue", value: 2 }]);
    expect(result.names).toEqual([]);
  });

  it("combines a name word with a tag", () => {
    const result = search(tagContext, "wait entity:trigger");
    expect(nameRows(result)).toEqual([]);
    expect(fieldRows(result)).toEqual(["CTrigger.m_flWait"]);
    expect(isSplit(result.fields[0].hit)).toBe(false);

    expect(search(tagContext, "wait entity:nothing").fields).toEqual([]);
    expect(search(tagContext, "count module:client").fields).toEqual([]);
  });

  it("lists the fields of a class with the tags by name words alone", () => {
    const metadata = search(tagContext, "metadata:mvdataroot count");
    expect(nameRows(metadata)).toEqual([]);
    expect(fieldRows(metadata)).toEqual(["CTrigger.m_iCount"]);
    const [tag] = metadata.fields[0].hit.tags;
    expect(tag.kind === "metadata" && tag.entries.map((e) => e.name)).toEqual(["MVDataRoot"]);

    const network = search(tagContext, "trigger network:includebyname count");
    expect(fieldRows(network)).toEqual(["CTrigger.m_iCount"]);
    expect(network.fields[0].hit.tags.map((t) => t.kind)).toEqual(["network"]);
    expect(isSplit(network.fields[0].hit)).toBe(true);
  });

  it("still lists a field that has the tags itself", () => {
    const result = search(tagContext, "metadata:friendly wait");
    expect(fieldRows(result)).toEqual(["CTrigger.m_flWait"]);
    expect(search(tagContext, "metadata:friendly count").fields).toEqual([]);
  });

  it("keeps the offset of a field when the class has the tags", () => {
    expect(fieldRows(search(tagContext, "metadata:mvdataroot count offset:12"))).toEqual([
      "CTrigger.m_iCount",
    ]);
    expect(search(tagContext, "metadata:mvdataroot count offset:8").fields).toEqual([]);
  });

  it("lists no field of a class without the tags", () => {
    expect(search(tagContext, "metadata:mvdataroot other").fields).toEqual([]);
  });

  it("keeps a class name word and a field tag together", () => {
    const result = search(tagContext, "trigger metadata:friendly");
    expect(fieldRows(result)).toEqual(["CTrigger.m_flWait"]);
    expect(result.fields[0].hit.nameWords.map((w) => w.word)).toEqual(["trigger"]);
  });
});

// -- Test fixtures --

describe("fixture schemas", () => {
  const context = buildTestContext();

  it("finds the health of an entity", () => {
    const result = search(context, "health");
    const rows = fieldRows(result);
    expect(rows[0]).toBe("C_BaseEntity.m_iHealth");
    expect(rows.indexOf("C_BaseEntity.m_iMaxHealth")).toBeGreaterThan(0);
    expect(result.fields[0].hit.tier).toBe(TIER_EXACT);
  });

  it("merges the radius field of a class in both modules", () => {
    const result = search(context, "m_flradius");
    const soundscape = result.fields.find((row) => row.hit.declaration.name === "CEnvSoundscape");
    expect(soundscape?.hit.declaration.module).toBe("server");
    expect(soundscape?.paired?.declaration.module).toBe("client");
  });

  it("counts every declaration once", () => {
    const result = search(context, "m_flradius");
    const declarations = new Set(
      result.fields.flatMap((row) => [row.hit.declaration, row.paired?.declaration]),
    );
    declarations.delete(undefined);
    expect(result.declarations).toEqual(declarations);
  });
});

// -- Tag filters on the fixture schemas --

describe("fixture tag filters", () => {
  const context = buildTestContext();

  function declared(query: string): Declaration[] {
    return [...search(context, query).declarations];
  }

  function declaredNames(query: string): string[] {
    return declared(query).map((d) => d.name);
  }

  describe("names", () => {
    it("finds a class by its name, in any case and in part", () => {
      expect(declaredNames("C_CSWeaponBaseGun")).toContain("C_CSWeaponBaseGun");
      expect(declaredNames("WeaponBaseGun")).toContain("C_CSWeaponBaseGun");
      expect(declaredNames("weaponbasegun")).toContain("C_CSWeaponBaseGun");
    });

    it("finds a class by a field name", () => {
      expect(fieldRows(search(context, "m_zoomLevel"))).toContain("C_CSWeaponBaseGun.m_zoomLevel");
    });

    it("finds an enum by a member name", () => {
      expect(declaredNames("CancelOnSucceeded")).toContain("PulseCursorCancelPriority_t");
      expect(declaredNames("SoftCancel")).toContain("PulseCursorCancelPriority_t");
    });

    it("needs every word in the class name or in one field", () => {
      expect(declaredNames("weapon zoom")).toContain("C_CSWeaponBaseGun");
      expect(declaredNames("weapon silencer")).toContain("C_CSWeaponBaseGun");
      expect(declaredNames("weapon fishangle")).not.toContain("C_CSWeaponBaseGun");
      expect(declaredNames("zoom silencer")).not.toContain("C_CSWeaponBaseGun");
    });

    it("finds nothing for an empty or nonsense query", () => {
      expect(declared("")).toEqual([]);
      expect(declared("   ")).toEqual([]);
      expect(declared("xyzzy999qqq")).toEqual([]);
    });

    it("ignores extra whitespace", () => {
      expect(declaredNames("  weapon \t zoom  ")).toEqual(declaredNames("weapon zoom"));
    });
  });

  describe("module:", () => {
    it("lists the declarations of a module", () => {
      const server = declared("module:server");
      expect(server.length).toBeGreaterThan(0);
      expect(server.every((d) => d.module === "server")).toBe(true);
      expect(server.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(false);
      expect(search(context, "module:server").fields).toEqual([]);
    });

    it("matches part of a module name, in any case", () => {
      const pulse = declared("module:pulse");
      expect(pulse.length).toBeGreaterThan(0);
      expect(pulse.every((d) => d.module.includes("pulse"))).toBe(true);

      const libs = declared("module:LIB");
      expect(libs.length).toBeGreaterThan(0);
      expect(libs.every((d) => d.module.includes("lib"))).toBe(true);
    });

    it("takes any of several modules", () => {
      const both = declared("module:client module:server");
      expect(both.some((d) => d.module === "client")).toBe(true);
      expect(both.some((d) => d.module === "server")).toBe(true);
      expect(both.every((d) => d.module === "client" || d.module === "server")).toBe(true);
    });

    it("narrows a name to one module", () => {
      expect(
        declared("CFuncWater")
          .map((d) => d.module)
          .sort(),
      ).toEqual(["client", "server"]);
      expect(declared("CFuncWater module:server").map((d) => d.module)).toEqual(["server"]);
      expect(declared("CFuncWater module:client").map((d) => d.module)).toEqual(["client"]);
      expect(declared("CFlashbangProjectile module:client")).toEqual([]);
    });
  });

  describe("offset:", () => {
    it("finds the field at an offset, in decimal and hex", () => {
      // C_CSWeaponBaseGun.m_zoomLevel is at 8000
      expect(fieldRows(search(context, "offset:8000"))).toContain("C_CSWeaponBaseGun.m_zoomLevel");
      expect(fieldRows(search(context, "offset:0x1F40"))).toContain(
        "C_CSWeaponBaseGun.m_zoomLevel",
      );
    });

    it("lists fields only", () => {
      const result = search(context, "offset:0");
      expect(result.names).toEqual([]);
      expect(result.fields.length).toBeGreaterThan(0);
      expect(declared("offset:0").every((d) => d.kind === "class")).toBe(true);
      expect(declared("offset:99999")).toEqual([]);
    });

    it("takes any of several offsets", () => {
      // CFlashbangProjectile has m_flTimeToDetonate at 2992 and m_numOpponentsHit at 2996
      const rows = fieldRows(search(context, "offset:2992 offset:2996"));
      expect(rows).toContain("CFlashbangProjectile.m_flTimeToDetonate");
      expect(rows).toContain("CFlashbangProjectile.m_numOpponentsHit");
    });

    it("combines with a name and a module", () => {
      expect(declaredNames("Flashbang offset:2992")).toEqual(["CFlashbangProjectile"]);
      expect(declaredNames("Flashbang module:server offset:2992")).toEqual([
        "CFlashbangProjectile",
      ]);
      expect(declared("C_Fish offset:2992")).toEqual([]);
      expect(declared("module:client offset:2992")).toEqual([]);
    });

    it("never combines with enumvalue:", () => {
      expect(declared("offset:0 enumvalue:0")).toEqual([]);
    });
  });

  describe("enumvalue:", () => {
    it("finds the member with a value, in decimal and hex", () => {
      expect(declaredNames("enumvalue:4")).toContain("DOTA_UNIT_TARGET_TEAM");
      expect(declaredNames("enumvalue:0x4")).toContain("DOTA_UNIT_TARGET_TEAM");
    });

    it("lists enums only", () => {
      const result = search(context, "enumvalue:0");
      expect(result.names).toEqual([]);
      expect(declared("enumvalue:0").length).toBeGreaterThanOrEqual(3);
      expect(declared("enumvalue:0").every((d) => d.kind === "enum")).toBe(true);
      expect(declared("enumvalue:99999")).toEqual([]);
    });

    it("takes any of several values", () => {
      const rows = fieldRows(search(context, "enumvalue:1 enumvalue:2"));
      expect(rows.some((row) => row.startsWith("PulseCursorCancelPriority_t."))).toBe(true);
    });

    it("combines with a name and a module", () => {
      expect(declaredNames("DOTA enumvalue:4")).toEqual(["DOTA_UNIT_TARGET_TEAM"]);
      expect(declaredNames("PulseTestEnumColor_t enumvalue:4")).toEqual(["PulseTestEnumColor_t"]);
      const pulse = declared("module:pulse_runtime_lib enumvalue:2");
      expect(pulse.every((d) => d.module === "pulse_runtime_lib")).toBe(true);
      expect(pulse.some((d) => d.name === "PulseCursorCancelPriority_t")).toBe(true);
    });
  });

  describe("metadata:", () => {
    it("finds classes by the metadata of their fields", () => {
      expect(declaredNames("metadata:MNotSaved")).toContain("C_Fish");
      expect(declaredNames("metadata:MNotSaved")).not.toContain("CFlashbangProjectile");
      expect(declaredNames("metadata:MPropertyFriendlyName")).toContain("C_OP_RenderTreeShake");
    });

    it("matches part of a key, in any case", () => {
      expect(declaredNames("metadata:notsav")).toContain("C_Fish");
    });

    it("finds enums by the metadata of their members and their own", () => {
      expect(declaredNames("metadata:MPropertyFriendlyName")).toContain("PulseTestEnumColor_t");
      expect(declaredNames("metadata:MEnumFlagsWithOverlappingBits")).toContain(
        "DOTA_UNIT_TARGET_TEAM",
      );
    });

    it("finds a class by its own metadata, listing no field", () => {
      const result = search(context, "C_Fish metadata:MNetworkNoBase");
      expect(nameRows(result)).toEqual(["C_Fish"]);
      expect(result.fields).toEqual([]);
    });

    it("lists the fields of a class with the metadata by name words", () => {
      const result = search(context, "C_Fish metadata:MNetworkNoBase history");
      expect(fieldRows(result).sort()).toEqual([
        "C_Fish.m_errorHistory",
        "C_Fish.m_errorHistoryCount",
        "C_Fish.m_errorHistoryIndex",
      ]);
      const [tag] = result.fields[0].hit.tags;
      expect(tag.kind === "metadata" && tag.entries.map((e) => e.name)).toEqual(["MNetworkNoBase"]);
    });

    it("finds classes whose metadata is a key without a value", () => {
      const names = declaredNames("metadata:MGetKV3ClassDefaults");
      expect(names).toContain("TestUnknownKeys");
      expect(names).toContain("TestBrokenDefaults");
      expect(names).not.toContain("CFlashbangProjectile");
    });

    it("lists the matching entries as the reason", () => {
      const [row] = search(context, "C_Fish metadata:MNetworkNoBase").names;
      const [tag] = row.hit.tags;
      expect(tag.kind === "metadata" && tag.entries.map((e) => e.name)).toEqual(["MNetworkNoBase"]);
    });

    it("combines with a name, a module and a missing key", () => {
      expect(declaredNames("C_Fish metadata:MNotSaved")).toEqual(["C_Fish"]);
      const server = declared("metadata:MNotSaved module:server");
      expect(server.length).toBeGreaterThan(0);
      expect(server.every((d) => d.module === "server")).toBe(true);
      expect(declared("metadata:ThisDoesNotExist12345")).toEqual([]);
      expect(declared("CFlashbangProjectile module:client metadata:MNotSaved")).toEqual([]);
    });

    it("needs every key on the same field or declaration", () => {
      expect(declared("C_Fish metadata:MNetworkNoBase metadata:MNotSaved")).toEqual([]);
    });
  });

  describe("metadatavalue:", () => {
    it("finds classes by the value of a field's metadata", () => {
      expect(declaredNames("metadatavalue:particlefield_scalar")).toContain("C_OP_RenderTreeShake");
      expect(declaredNames("metadatavalue:wobble")).toContain("C_OP_WaterImpulseRenderer");
      expect(declaredNames("metadatavalue:twist")).toContain("C_OP_RenderTreeShake");
    });

    it("finds enums by the value of a member's metadata", () => {
      expect(declaredNames("metadatavalue:black")).toContain("PulseTestEnumColor_t");
    });

    it("finds a class by the value of its own metadata", () => {
      expect(declaredNames("metadatavalue:m_unknown")).toContain("TestUnknownKeys");
      const result = search(context, "TestUnknownKeys metadatavalue:m_unknown");
      expect(nameRows(result)).toEqual(["TestUnknownKeys"]);
      expect(result.fields).toEqual([]);
    });

    it("combines with a name and a module", () => {
      expect(declaredNames("WaterImpulse metadatavalue:impulse")).toEqual([
        "C_OP_WaterImpulseRenderer",
      ]);
      const particles = declared("metadatavalue:impulse module:particles");
      expect(particles.some((d) => d.name === "C_OP_WaterImpulseRenderer")).toBe(true);
      expect(particles.every((d) => d.module === "particles")).toBe(true);
      expect(declaredNames("metadatavalue:impulse module:client")).not.toContain(
        "C_OP_WaterImpulseRenderer",
      );
      expect(declared("metadatavalue:zzz_nonexistent_zzz")).toEqual([]);
    });

    it("needs the key and the value on the same field", () => {
      expect(
        declaredNames("metadata:MPropertyAttributeChoiceName metadatavalue:particlefield_vector"),
      ).toEqual(["C_OP_RemapTransformVisibilityToVector"]);
    });

    it("combines name, module, offset, key and value", () => {
      expect(
        declaredNames(
          "C_OP_RenderTreeShake module:particles offset:568 metadata:MPropertyFriendlyName metadatavalue:twist",
        ),
      ).toEqual(["C_OP_RenderTreeShake"]);
    });
  });

  describe("ranking and similar names", () => {
    it("puts an exact name first", () => {
      expect(search(context, "CEffectData").names[0].hit.declaration.name).toBe("CEffectData");
      expect(search(context, "ceffectdata").names[0].hit.tier).toBe(TIER_EXACT);
    });

    it("puts a shorter prefix match first", () => {
      const names = nameRows(search(context, "CFilter"));
      expect(names.indexOf("CFilterEnemy")).toBeLessThan(names.indexOf("CFilterProximity"));
    });

    it("lists a non-contiguous match as a similar name, not a result", () => {
      const result = search(context, "cnvsph");
      expect(similarNames(result)).toContain("CNavVolumeSphere");
      expect(nameRows(result)).not.toContain("CNavVolumeSphere");
    });

    it("matches two letters as a substring only", () => {
      const result = search(context, "cb");
      expect(result.declarations.size).toBeGreaterThan(0);
      expect(result.similar).toEqual([]);
    });
  });

  describe("network:", () => {
    function fieldsOf(query: string, className: string): string[] {
      const names: string[] = [];
      for (const row of search(context, query).fields) {
        if (row.hit.declaration.name === className && row.hit.kind === "field") {
          names.push(row.hit.field.name);
        }
      }
      return names;
    }

    it("finds fields by a network value", () => {
      expect(fieldsOf("network:posx", "CNetworkOriginCellCoordQuantizedVector")).toEqual([
        "m_vecX",
      ]);
    });

    it("finds fields by a network property name", () => {
      expect(fieldsOf("network:sentas", "C_FuncConveyor").sort()).toEqual([
        "m_hConveyorModels",
        "m_nTransitionStartTick",
      ]);
    });

    it("needs every word on the same field", () => {
      expect(
        fieldsOf("network:oncellchanged network:sentas", "CNetworkOriginCellCoordQuantizedVector"),
      ).toEqual(["m_vecX", "m_vecY", "m_vecZ"]);
      expect(declared("network:cellx network:posx")).toEqual([]);
    });

    it("finds a class by its own network data, listing no field", () => {
      const own = search(context, "network:varsatomic");
      expect(nameRows(own)).toEqual(["CNetworkOriginCellCoordQuantizedVector"]);
      expect(own.fields).toEqual([]);

      // varTypeOverrides is keyed by field, and its values are types
      const override = search(context, "network:CCSObserver_CameraServices");
      expect(nameRows(override)).toEqual(["C_CSObserverPawn"]);
    });

    it("leaves metadata to metadata:", () => {
      expect(declared("network:mnotsaved")).toEqual([]);
      expect(declared("network:mnetworknobase")).toEqual([]);
    });

    it("combines with a name word", () => {
      const fields = fieldsOf("damage network:localplayer", "CCSPlayerController_DamageServices");
      expect(fields.sort()).toEqual(["m_DamageList", "m_nSendUpdate"]);
    });
  });
});

// -- Inherited fields --

const base = (name: string, module = "server") => ({ name, module });

const inheritedContext = buildContext({
  classes: [
    cls("server", "CRoot", [field("m_flHealthScale", builtin("float32"), 8)]),
    cls(
      "server",
      "CBase",
      [
        { ...field("m_iHealth", builtin("int32"), 16), network: { type: "int32" } },
        field("m_nOther", builtin("int32"), 20),
      ],
      { parents: [base("CRoot")] },
    ),
    cls("server", "CPlayerPawn", [field("m_iArmor", builtin("int32"), 24)], {
      parents: [base("CBase")],
    }),
    cls("server", "CPlayerController", [], {
      parents: [base("CBase")],
      metadata: [{ name: "MVDataRoot" }],
    }),
    cls("server", "CPlayerWithOwn", [field("m_iHealthMax", builtin("int32"), 24)], {
      parents: [base("CBase")],
    }),
    cls("server", "CZombie", [], { parents: [base("CBase")] }),
    cls("client", "C_Base", [field("m_iHealth", builtin("int32"), 16)]),
    cls("client", "C_PlayerPawn", [], { parents: [base("C_Base", "client")] }),
  ],
  enums: [],
});

function inheritedRows(result: SearchResult): string[] {
  return result.inherited.map((row) => {
    const classes = rowSides(row).flatMap((side) => side.classes.map((c) => c.name));
    return `${row.hit.declaration.name}.${row.hit.field.name}: ${classes.join(", ")}`;
  });
}

describe("inherited fields", () => {
  it("groups the classes of a split query by the field they have from a base", () => {
    const result = search(inheritedContext, "player health");
    expect(inheritedRows(result)).toEqual([
      "CBase.m_iHealth: CPlayerController, CPlayerPawn, CPlayerWithOwn, C_PlayerPawn",
      "CRoot.m_flHealthScale: CPlayerController, CPlayerPawn, CPlayerWithOwn",
    ]);
  });

  it("keeps the field side words for highlighting", () => {
    const [, { hit }] = search(inheritedContext, "player health").inherited;
    expect(hit.fieldWords.map((w) => w.word)).toEqual(["health"]);
    expect(hit.fieldWords[0].text).toBe("m_flHealthScale");
  });

  it("lists a class that has a matching field of its own in the inherited rows too", () => {
    const result = search(inheritedContext, "player health");
    expect(fieldRows(result)).toEqual(["CPlayerWithOwn.m_iHealthMax"]);
    const base = result.inherited.find((row) => row.hit.declaration.name === "CBase");
    const classes = base!.hit.classes.map((c) => c.name);
    expect(classes).toContain("CPlayerWithOwn");
  });

  it("counts a class with split field hits of its own once in the declarations", () => {
    const result = search(inheritedContext, "player health");
    const names = [...result.declarations].filter((d) => d.name === "CPlayerWithOwn");
    expect(names).toHaveLength(1);
  });

  it("lists the declaring classes bases first when the fields match alike", () => {
    const context = buildContext({
      classes: [
        cls("server", "CRoot", [field("m_flSizeA", builtin("float32"), 8)]),
        cls("server", "CBase", [field("m_flSizeB", builtin("float32"), 12)], {
          parents: [base("CRoot")],
        }),
        cls("server", "CPlayer", [], { parents: [base("CBase")] }),
      ],
      enums: [],
    });
    const names = search(context, "player size").inherited.map((row) => row.hit.declaration.name);
    expect(names).toEqual(["CRoot", "CBase"]);
  });

  it("lists the better matching fields before the bases", () => {
    const result = search(inheritedContext, "player health");
    const names = result.inherited.map((row) => row.hit.declaration.name);
    expect(names).toEqual(["CBase", "CRoot"]);
  });

  it("orders the fields of a class by declaration", () => {
    const context = buildContext({
      classes: [
        cls("server", "CBase", [
          field("m_flSizeZeta", builtin("float32"), 8),
          field("m_flSizeAlpha", builtin("float32"), 12),
        ]),
        cls("server", "CPlayer", [], { parents: [base("CBase")] }),
      ],
      enums: [],
    });
    expect(inheritedRows(search(context, "player size"))).toEqual([
      "CBase.m_flSizeZeta: CPlayer",
      "CBase.m_flSizeAlpha: CPlayer",
    ]);
  });

  it("pairs the field of client and server base classes", () => {
    const [{ hit, paired }] = search(inheritedContext, "player health").inherited;
    expect(hit.declaration.module).toBe("server");
    expect(paired?.declaration.name).toBe("C_Base");
    expect(hit.classes.map((c) => c.name)).toEqual([
      "CPlayerController",
      "CPlayerPawn",
      "CPlayerWithOwn",
    ]);
    expect(paired?.classes.map((c) => c.name)).toEqual(["C_PlayerPawn"]);
  });

  it("keeps fields of paired bases with different types apart", () => {
    const context = buildContext({
      classes: [
        cls("server", "CBase", [field("m_iHealth", builtin("int32"), 16)]),
        cls("client", "C_Base", [field("m_iHealth", builtin("float32"), 16)]),
        cls("server", "CPlayer", [], { parents: [base("CBase")] }),
        cls("client", "C_Player", [], { parents: [base("C_Base", "client")] }),
      ],
      enums: [],
    });
    const result = search(context, "player health");
    expect(inheritedRows(result)).toEqual([
      "CBase.m_iHealth: CPlayer",
      "C_Base.m_iHealth: C_Player",
    ]);
    expect(result.inherited.every((row) => row.paired === undefined)).toBe(true);
  });

  it("adds the classes to the declarations", () => {
    const result = search(inheritedContext, "player health");
    const names = [...result.declarations].map((d) => d.name).sort();
    expect(names).toEqual(["CPlayerController", "CPlayerPawn", "CPlayerWithOwn", "C_PlayerPawn"]);
  });

  it("has none for a query of one word", () => {
    expect(search(inheritedContext, "health").inherited).toEqual([]);
    expect(search(inheritedContext, "player").inherited).toEqual([]);
  });

  it("has none when one class matches every word", () => {
    const context = buildContext({
      classes: [
        cls("server", "CBase", [field("m_iHealth", builtin("int32"), 16)]),
        cls("server", "CPlayerHealth", [], { parents: [base("CBase")] }),
      ],
      enums: [],
    });
    expect(search(context, "player health").inherited).toEqual([]);
  });

  it("has none for a field tag filter", () => {
    expect(search(inheritedContext, "player health network:int32").inherited).toEqual([]);
  });

  it("matches the field side words on the base's field", () => {
    expect(search(inheritedContext, "player zzz").inherited).toEqual([]);
    expect(inheritedRows(search(inheritedContext, "zombie other"))).toEqual([
      "CBase.m_nOther: CZombie",
    ]);
  });
});

describe("inherited fields and the show filters", () => {
  const result = search(inheritedContext, "player health");

  function shownRows(show: ShowFilter): string[] {
    return inheritedRows(filterSearchResult(result, show, inheritedContext));
  }

  it("keeps the classes that pass", () => {
    expect(shownRows("vdata")).toEqual([
      "CBase.m_iHealth: CPlayerController",
      "CRoot.m_flHealthScale: CPlayerController",
    ]);
  });

  it("tests the inherited field for networked", () => {
    expect(shownRows("networked")).toEqual([
      "CBase.m_iHealth: CPlayerController, CPlayerPawn, CPlayerWithOwn",
    ]);
  });

  it("drops the hits left without classes", () => {
    expect(shownRows("enums")).toEqual([]);
  });

  it("keeps the hit itself for a filter every class passes", () => {
    expect(filterSearchResult(result, "classes", inheritedContext).inherited).toEqual(
      result.inherited,
    );
  });

  it("keeps the side of a pair that passes", () => {
    const filtered = filterSearchResult(result, "networked", inheritedContext);
    expect(filtered.inherited[0].paired).toBeUndefined();
    expect(filtered.inherited[0].hit.declaration.module).toBe("server");
  });

  it("narrows the declarations to the classes that pass", () => {
    const filtered = filterSearchResult(result, "vdata", inheritedContext);
    expect([...filtered.declarations].map((d) => d.name)).toEqual(["CPlayerController"]);
  });

  it("counts like the filtered declarations", () => {
    const counts = countSearchShowFilters(result, inheritedContext);
    expect(counts.get("all")).toBe(4);
    expect(counts.get("vdata")).toBe(1);
    for (const show of SHOW_FILTER_NAMES) {
      const filtered = filterSearchResult(result, show, inheritedContext);
      expect(counts.get(show)).toBe(filtered.declarations.size);
    }
  });
});

// -- Show filters --

const showContext = buildContext({
  classes: [
    // Only the client class has a networked field
    cls("server", "CFoo", [field("m_flA", builtin("float32"), 8)]),
    cls("client", "C_Foo", [
      { ...field("m_flA", builtin("float32"), 8), network: { type: "float32" } },
    ]),
    cls("server", "CBar", [
      { ...field("m_flB", builtin("float32"), 8), network: { type: "float32" } },
      field("m_flC", builtin("float32"), 12),
    ]),
    cls("server", "CPlain", [field("m_flD", builtin("float32"), 8)]),
  ],
  enums: [
    {
      name: "EMode_t",
      module: "server",
      alignment: "uint8",
      members: [{ name: "MODE_FLAT", value: 0 }],
    },
  ],
});

function shownFields(result: SearchResult, show: ShowFilter): string[] {
  return fieldRows(filterSearchResult(result, show, showContext));
}

describe("show filters on a result", () => {
  it("returns the result itself for all", () => {
    const result = search(showContext, "m_fl");
    expect(filterSearchResult(result, "all", showContext)).toBe(result);
  });

  it("tests the field of a field row for networked", () => {
    const result = search(showContext, "m_fl");
    expect(shownFields(result, "networked")).toEqual(["C_Foo.m_flA", "CBar.m_flB"]);
  });

  it("tests the declaration of a field row for the other filters", () => {
    const result = search(showContext, "m_fl");
    expect(shownFields(result, "classes")).toHaveLength(4);
    expect(shownFields(result, "enums")).toEqual([]);
  });

  it("never lists an enum member as networked", () => {
    const result = search(showContext, "mode");
    expect(fieldRows(result)).toEqual(["EMode_t.MODE_FLAT"]);
    expect(shownFields(result, "networked")).toEqual([]);
    expect(shownFields(result, "enums")).toEqual(["EMode_t.MODE_FLAT"]);
  });

  it("keeps only the side of a paired row that passes", () => {
    const result = search(showContext, "m_fla");
    const [row] = result.fields;
    expect(row.hit.declaration.name).toBe("CFoo");
    expect(row.paired?.declaration.name).toBe("C_Foo");

    const networked = filterSearchResult(result, "networked", showContext);
    expect(networked.fields).toHaveLength(1);
    expect(networked.fields[0].hit.declaration.name).toBe("C_Foo");
    expect(networked.fields[0].paired).toBeUndefined();
    expect([...networked.declarations].map((d) => d.name)).toEqual(["C_Foo"]);

    const classes = filterSearchResult(result, "classes", showContext);
    expect(classes.fields[0]).toBe(row);
  });

  it("drops the declarations left without a row", () => {
    const result = search(showContext, "m_fl");
    const networked = filterSearchResult(result, "networked", showContext);
    expect([...networked.declarations].map((d) => d.name).sort()).toEqual(["CBar", "C_Foo"]);
  });

  it("filters the similar names by their declaration", () => {
    const result = search(rankingContext, "pawn");
    expect(result.similar).toHaveLength(1);
    expect(filterSearchResult(result, "classes", rankingContext).similar).toHaveLength(1);
    expect(filterSearchResult(result, "enums", rankingContext).similar).toEqual([]);
  });
});

describe("show filter counts", () => {
  it("counts each declaration once, both sides of a pair included", () => {
    const counts = countSearchShowFilters(search(showContext, "m_fl"), showContext);
    expect(counts.get("all")).toBe(4);
    expect(counts.get("classes")).toBe(4);
    expect(counts.get("enums")).toBe(0);
  });

  it("counts a networked field row for its class only", () => {
    const counts = countSearchShowFilters(search(showContext, "m_fl"), showContext);
    // C_Foo counts through its field, CBar through m_flB and not through the plain m_flC
    expect(counts.get("networked")).toBe(2);
  });

  it("counts a class on the field side of a paired row that passes", () => {
    const counts = countSearchShowFilters(search(showContext, "m_fla"), showContext);
    expect(counts.get("all")).toBe(2);
    expect(counts.get("networked")).toBe(1);
  });

  it("counts the enum of a member row", () => {
    const counts = countSearchShowFilters(search(showContext, "mode"), showContext);
    expect(counts.get("all")).toBe(1);
    expect(counts.get("enums")).toBe(1);
    expect(counts.get("classes")).toBe(0);
  });

  it("does not count similar names", () => {
    const result = search(rankingContext, "cspp");
    expect(result.similar).toHaveLength(1);
    const counts = countSearchShowFilters(result, rankingContext);
    expect([...counts.values()]).toEqual(SHOW_FILTER_NAMES.map(() => 0));
  });

  it("matches the declarations of the filtered result", () => {
    const result = search(showContext, "m_fl");
    const counts = countSearchShowFilters(result, showContext);
    for (const show of SHOW_FILTER_NAMES) {
      const filtered = filterSearchResult(result, show, showContext);
      expect(counts.get(show)).toBe(filtered.declarations.size);
    }
  });
});
