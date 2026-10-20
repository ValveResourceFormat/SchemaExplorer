import { describe, expect, it } from "vitest";
import { buildContext, builtin, cls, field, search } from "../data/test-helpers";
import {
  TIER_EXACT,
  TIER_FUZZY,
  TIER_PREFIX,
  TIER_SUBSTRING,
  TIER_WORD_START,
} from "./match-score";
import { strippedFieldName } from "./search-index";
import { itemName, rowSides, type SearchResult } from "./search-types";

const int = builtin("int32");
const float = builtin("float32");
const base = (name: string, module = "server") => ({ name, module });

function nameRows(result: SearchResult): string[] {
  return result.names.map((row) => row.hit.declaration.name);
}

function fieldRows(result: SearchResult): string[] {
  return result.fields.map((row) => `${row.hit.declaration.name}.${itemName(row.hit)}`);
}

function similarRows(result: SearchResult): string[] {
  return result.similar.map((row) => {
    const { hit } = row;
    if (hit.kind === "fuzzy") return hit.declaration.name;
    return `${hit.declaration.name}.${itemName(hit)}`;
  });
}

function inheritedRows(result: SearchResult): string[] {
  return result.inherited.map((row) => {
    const classes = rowSides(row).flatMap((side) => side.classes.map((c) => c.name));
    return `${row.hit.declaration.name}.${row.hit.field.name}: ${classes.join(", ")}`;
  });
}

describe("joined words", () => {
  const context = buildContext({
    classes: [
      cls("server", "CDOTAGamerules"),
      cls("client", "C_DOTAGamerules"),
      cls("server", "CHolder", [
        field("m_iPlayerID", int, 8),
        field("m_flManaRegen", float, 12),
        field("m_nRenderMode", int, 16),
        field("m_flViewmodelFOV", float, 20),
      ]),
      cls("server", "CPlayerThing", [field("m_nSomeID", int, 8)]),
    ],
    enums: [],
  });

  it("scores two words as one name for a class, as a pair", () => {
    const result = search(context, "game rules");
    expect(nameRows(result)).toEqual(["CDOTAGamerules"]);
    const [row] = result.names;
    expect(row.paired?.declaration.name).toBe("C_DOTAGamerules");
    expect(row.hit.nameWords).toHaveLength(1);
    expect(row.hit.tier).toBe(TIER_WORD_START);
  });

  it("finds a field by two words that are one name", () => {
    const result = search(context, "player id");
    expect(fieldRows(result)).toEqual(["CHolder.m_iPlayerID", "CPlayerThing.m_nSomeID"]);

    const [joined, split] = result.fields.map((row) => row.hit);
    expect(joined.tier).toBe(TIER_EXACT);
    expect(joined.nameWords).toEqual([]);
    expect(joined.kind === "field" && joined.fieldWords).toHaveLength(1);
    expect(split.nameWords).toHaveLength(1);
  });

  it("matches the name without its prefix", () => {
    expect(search(context, "mana regen").fields[0].hit.tier).toBe(TIER_EXACT);
    expect(search(context, "render mode").fields[0].hit.tier).toBe(TIER_EXACT);
    const viewmodel = search(context, "view model").fields[0].hit;
    expect(fieldRows(search(context, "view model"))).toEqual(["CHolder.m_flViewmodelFOV"]);
    expect(viewmodel.tier).toBe(TIER_PREFIX);
  });

  it("keeps the ranges of the joined match in the field name", () => {
    const hit = search(context, "mana regen").fields[0].hit;
    expect(hit.kind === "field" && hit.fieldWords[0].ranges).toEqual([4, 13]);
    expect(hit.kind === "field" && hit.fieldWords[0].text).toBe("m_flManaRegen");
  });
});

describe("snake_case words", () => {
  const context = buildContext({
    classes: [
      cls("server", "CHolder", [
        field("m_flManaRegen", float, 8),
        field("m_iMoveSpeed", int, 12),
        field("m_flMaxSpeed", float, 16),
      ]),
      cls("server", "CMaxSpeedThing"),
    ],
    enums: [
      {
        name: "EMove",
        module: "server",
        alignment: "uint8",
        members: [{ name: "MoveSpeedFast", value: 0 }],
      },
    ],
  });

  it("find a CamelCase field", () => {
    const result = search(context, "mana_regen");
    expect(fieldRows(result)).toEqual(["CHolder.m_flManaRegen"]);
    expect(result.fields[0].hit.tier).toBe(TIER_EXACT);
    expect(search(context, "move_speed").fields[0].hit.declaration.name).toBe("CHolder");
    expect(fieldRows(search(context, "max_speed"))).toEqual(["CHolder.m_flMaxSpeed"]);
  });

  it("find a CamelCase class and member", () => {
    expect(nameRows(search(context, "max_speed"))).toEqual(["CMaxSpeedThing"]);
    expect(fieldRows(search(context, "move_speed"))).toContain("EMove.MoveSpeedFast");
  });
});

describe("client and server twins", () => {
  const context = buildContext({
    classes: [
      cls("server", "CBaseThing"),
      cls("client", "C_BaseThing"),
      cls("client", "C_ClientOnly"),
    ],
    enums: [],
  });

  it("hit the same way for the name of the server class", () => {
    const result = search(context, "CBaseThing");
    expect(result.names).toHaveLength(1);
    const [row] = result.names;
    expect(row.paired).toBeDefined();
    expect(row.hit.tier).toBe(TIER_EXACT);
    expect(row.paired?.tier).toBe(TIER_EXACT);
    expect(result.similar).toEqual([]);
  });

  it("hit the same way for the name of the client class", () => {
    const result = search(context, "C_BaseThing");
    expect(result.names).toHaveLength(1);
    expect(result.names[0].paired).toBeDefined();
    expect(result.similar).toEqual([]);
  });

  it("highlight the name of each class", () => {
    const [row] = search(context, "cbasething").names;
    const client = rowSides(row).find((hit) => hit.declaration.module === "client");
    const server = rowSides(row).find((hit) => hit.declaration.module === "server");
    expect(client?.nameWords[0].ranges).toEqual([0, 11]);
    expect(server?.nameWords[0].ranges).toEqual([0, 10]);
  });

  it("find a client class by the name of its server class", () => {
    const result = search(context, "CClientOnly");
    expect(nameRows(result)).toEqual(["C_ClientOnly"]);
    expect(result.names[0].hit.nameWords[0].ranges).toEqual([0, 12]);
  });
});

describe("Class::member and Class.member", () => {
  const context = buildContext({
    classes: [
      cls("server", "CFoo", [field("m_iHealth", int, 8)]),
      cls("server", "CBar", [], { parents: [base("CFoo")] }),
      cls("server", "CFoo::Bar_t", [field("m_x", int, 8)]),
    ],
    enums: [],
  });

  it("search again as a class word and a field word", () => {
    for (const query of ["CFoo::m_iHealth", "CFoo.m_iHealth"]) {
      const result = search(context, query);
      expect(fieldRows(result)).toEqual(["CFoo.m_iHealth"]);
      const hit = result.fields[0].hit;
      expect(hit.nameWords.map((w) => w.word)).toEqual(["cfoo"]);
      expect(hit.kind === "field" && hit.fieldWords.map((w) => w.word)).toEqual(["m_ihealth"]);
    }
  });

  it("find the field a class has from a base", () => {
    const result = search(context, "CBar::m_iHealth");
    expect(inheritedRows(result)).toEqual(["CFoo.m_iHealth: CBar"]);
  });

  it("match a nested type name as a whole first", () => {
    const result = search(context, "CFoo::Bar_t");
    expect(nameRows(result)).toEqual(["CFoo::Bar_t"]);
    expect(result.fields).toEqual([]);
  });

  it("split at the last separator of a nested type", () => {
    expect(fieldRows(search(context, "CFoo::Bar_t::m_x"))).toEqual(["CFoo::Bar_t.m_x"]);
  });

  it("find nothing when the class has no such field", () => {
    const result = search(context, "CNope::m_iHealth");
    expect(result.names).toEqual([]);
    expect(result.fields).toEqual([]);
    expect(result.inherited).toEqual([]);
    expect(search(context, "CBar::m_x").inherited).toEqual([]);
    expect(search(context, "CBar::m_x").fields).toEqual([]);
  });
});

describe("inherited fields of a split query", () => {
  const context = buildContext({
    classes: [
      cls("server", "CFadeBase", [
        field("m_flStartFadeInTime", float, 8),
        field("m_spawnflags", int, 12),
        field("m_hPawn", int, 16),
      ]),
      cls("server", "CGroundFoo", [], { parents: [base("CFadeBase")] }),
      cls("server", "CRoundFoo", [], { parents: [base("CFadeBase")] }),
      cls("server", "CHpFoo", [], { parents: [base("CFadeBase")] }),
      cls("server", "CPlayerFoo", [], { parents: [base("CFadeBase")] }),
    ],
    enums: [],
  });

  it("need the class side words at the start of a word", () => {
    expect(inheritedRows(search(context, "round time"))).toEqual([
      "CFadeBase.m_flStartFadeInTime: CRoundFoo",
    ]);
  });

  it("need the class side words to have three letters", () => {
    expect(search(context, "hp time").inherited).toEqual([]);
  });

  it("need the field side words at the start of a word", () => {
    expect(inheritedRows(search(context, "player pawn"))).toEqual([
      "CFadeBase.m_hPawn: CPlayerFoo",
    ]);
  });
});

describe("similar names by letters in order", () => {
  const context = buildContext({
    classes: [
      cls("server", "CPathParticleRopeAlias_path_particle_rope_clientside"),
      cls("server", "CCSPlayerPawn"),
      cls("client", "C_CSPlayerPawn"),
      cls("server", "CFilterMassGreater"),
      cls("client", "CFilterMassGreater"),
      cls("server", "CBaseOther_x"),
    ],
    enums: [],
  });

  it("need the letters close together", () => {
    expect(search(context, "health").similar).toEqual([]);
  });

  it("are not looked for with a word ending in an underscore", () => {
    expect(search(context, "cbo_").similar).toEqual([]);
    expect(similarRows(search(context, "cbo"))).toEqual(["CBaseOther_x"]);
  });

  it("list a client and server class once", () => {
    expect(similarRows(search(context, "cspp"))).toHaveLength(1);
  });

  it("list a class of the same name in both modules once", () => {
    const result = search(context, "cfmag");
    expect(similarRows(result)).toEqual(["CFilterMassGreater"]);
  });
});

describe("field names with a type prefix and no m_", () => {
  const context = buildContext({
    classes: [
      cls("server", "CStats", [
        field("unLastHits", int, 8),
        field("m_iLastHitStreak", int, 12),
        field("targetName", int, 16),
        field("eType", int, 20),
        field("isRescued", int, 24),
      ]),
    ],
    enums: [],
  });

  it("strips a whole known prefix followed by an uppercase letter", () => {
    expect(strippedFieldName("unLastHits")).toBe("LastHits");
    expect(strippedFieldName("eType")).toBe("Type");
    expect(strippedFieldName("m_iHealth")).toBe("Health");
    expect(strippedFieldName("flRadius")).toBe("Radius");
  });

  it("strips a bare m_ before an uppercase letter", () => {
    expect(strippedFieldName("m_ArmorValue")).toBe("ArmorValue");
    expect(strippedFieldName("m_Collision")).toBe("Collision");
    expect(strippedFieldName("m_armorValue")).toBeNull();
  });

  it("ranks a field with a bare m_ like one with a type prefix", () => {
    const armor = buildContext({
      classes: [
        cls("server", "CPawn", [
          field("m_flArmorRatio", float, 8),
          field("m_iPawnArmor", int, 12),
          field("m_ArmorValue", int, 16),
        ]),
      ],
      enums: [],
    });
    const result = search(armor, "armor");
    expect(fieldRows(result)[0]).toBe("CPawn.m_ArmorValue");
  });

  it("leaves words alone", () => {
    expect(strippedFieldName("isRescued")).toBeNull();
    expect(strippedFieldName("targetName")).toBeNull();
    expect(strippedFieldName("health")).toBeNull();
    expect(strippedFieldName("nextTick")).toBeNull();
    expect(strippedFieldName("m_agentRadius")).toBeNull();
    expect(strippedFieldName("un")).toBeNull();
  });

  it("ranks the stripped name as an exact match", () => {
    const result = search(context, "lasthits");
    expect(fieldRows(result)).toEqual(["CStats.unLastHits", "CStats.m_iLastHitStreak"]);
    expect(result.fields[0].hit.tier).toBe(TIER_EXACT);
    const first = result.fields[0].hit;
    expect(first.kind === "field" && first.fieldWords[0].ranges).toEqual([2, 10]);
    expect(search(context, "type").fields[0].hit.tier).toBe(TIER_EXACT);
    expect(search(context, "name").fields[0].hit.tier).toBe(TIER_WORD_START);
  });
});

describe("relevance among equal matches", () => {
  const networked = { type: "int32" };

  it("lists a client and server pair first", () => {
    const context = buildContext({
      classes: [
        cls("server", "CAbe", [field("m_iHealth", int, 8)]),
        cls("server", "CZed", [field("m_iHealth", int, 8)]),
        cls("client", "C_Zed", [field("m_iHealth", int, 8)]),
      ],
      enums: [],
    });
    const result = search(context, "health");
    expect(fieldRows(result)).toEqual(["CZed.m_iHealth", "CAbe.m_iHealth"]);
    expect(result.fields[0].paired).toBeDefined();
  });

  it("lists a networked field before a plain one", () => {
    const context = buildContext({
      classes: [
        cls("server", "CPlain", [field("m_iHealth", int, 8)]),
        cls("server", "CNet", [{ ...field("m_iHealth", int, 8), network: networked }]),
      ],
      enums: [],
    });
    expect(fieldRows(search(context, "health"))).toEqual(["CNet.m_iHealth", "CPlain.m_iHealth"]);
  });

  it("lists the fields of a class with many subclasses before the others", () => {
    const context = buildContext({
      classes: [
        cls("server", "CAlone", [field("m_iHealth", int, 8)]),
        cls("server", "CRoot", [field("m_iHealth", int, 8)]),
        cls("server", "CChildA", [], { parents: [base("CRoot")] }),
        cls("server", "CChildB", [], { parents: [base("CRoot")] }),
      ],
      enums: [],
    });
    expect(fieldRows(search(context, "health"))).toEqual(["CRoot.m_iHealth", "CAlone.m_iHealth"]);
  });

  it("lists the fields of a class with an entity name before the others", () => {
    const context = buildContext({
      classes: [
        cls("server", "CAlone", [field("m_iHealth", int, 8)]),
        cls("server", "CSpawned", [field("m_iHealth", int, 8)]),
      ],
      enums: [],
      entities: [{ class: "CSpawned", module: "server", designName: "spawned", spawnable: true }],
    });
    expect(fieldRows(search(context, "health"))).toEqual([
      "CSpawned.m_iHealth",
      "CAlone.m_iHealth",
    ]);
  });

  it("lists an m_ field before a snake_case one", () => {
    const context = buildContext({
      classes: [
        cls("server", "CAlpha", [field("health", float, 8)]),
        cls("server", "CBeta", [field("m_flHealth", float, 8)]),
      ],
      enums: [],
    });
    expect(fieldRows(search(context, "health"))).toEqual(["CBeta.m_flHealth", "CAlpha.health"]);
  });

  it("lists a class name match before an entity name only match of the same tier", () => {
    const context = buildContext({
      classes: [cls("server", "CC4"), cls("server", "CBaseWeapon")],
      enums: [],
      entities: [{ class: "CC4", module: "server", designName: "item_weapon_c4", spawnable: true }],
    });
    const result = search(context, "weapon");
    expect(nameRows(result)).toEqual(["CBaseWeapon", "CC4"]);
    expect(result.names[1].hit.tier).toBe(result.names[0].hit.tier);
  });

  it("lists an exact entity name before a class name match", () => {
    const context = buildContext({
      classes: [cls("server", "CBaseWeapon"), cls("server", "CC4")],
      enums: [],
      entities: [{ class: "CC4", module: "server", designName: "weapon", spawnable: true }],
    });
    const result = search(context, "weapon");
    expect(nameRows(result)).toEqual(["CC4", "CBaseWeapon"]);
    expect(result.names[0].hit.tier).toBeLessThan(result.names[1].hit.tier);
  });

  it("counts the start of an entity name like the start of a word in a class name", () => {
    const context = buildContext({
      classes: [cls("server", "CBaseWeapon"), cls("server", "CC4")],
      enums: [],
      entities: [{ class: "CC4", module: "server", designName: "weapon_c4", spawnable: true }],
    });
    const result = search(context, "weapon");
    expect(nameRows(result)).toEqual(["CBaseWeapon", "CC4"]);
    expect(result.names[1].hit.tier).toBe(TIER_WORD_START);
  });

  it("keeps the start of an entity name for a word with an underscore", () => {
    const context = buildContext({
      classes: [
        cls("server", "CSmartPropElement_PropPhysics"),
        cls("server", "CPhysicsPropOverride"),
      ],
      enums: [],
      entities: [
        {
          class: "CPhysicsPropOverride",
          module: "server",
          designName: "prop_physics_override",
          spawnable: true,
        },
      ],
    });
    const result = search(context, "prop_physics");
    expect(nameRows(result)).toEqual(["CPhysicsPropOverride", "CSmartPropElement_PropPhysics"]);
    expect(result.names[0].hit.tier).toBe(TIER_PREFIX);
  });

  it("lists a class that matches by its name too before one that matches by its entity name only", () => {
    const context = buildContext({
      classes: [
        cls("server", "CDOTACustomGameHeroPickRules"),
        cls("server", "CDOTAGamerulesProxy"),
      ],
      enums: [],
      entities: [
        {
          class: "CDOTAGamerulesProxy",
          module: "server",
          designName: "dota_gamerules",
          spawnable: true,
        },
      ],
    });
    expect(nameRows(search(context, "game rules"))).toEqual([
      "CDOTAGamerulesProxy",
      "CDOTACustomGameHeroPickRules",
    ]);
  });

  it("lists numbered class names after the others of the same tier", () => {
    const context = buildContext({
      classes: [
        cls("server", "CBonus_Armor_2"),
        cls("server", "CBonus_Armor_Percent"),
        cls("server", "CBonus_Armor_30"),
      ],
      enums: [],
    });
    expect(nameRows(search(context, "armor"))).toEqual([
      "CBonus_Armor_Percent",
      "CBonus_Armor_2",
      "CBonus_Armor_30",
    ]);
  });
});

describe("class name prefix", () => {
  const context = buildContext({
    classes: [
      cls("server", "CGameRules"),
      cls("server", "CGameRulesProxy"),
      cls("server", "CDOTAGameRules"),
      cls("client", "C_Rules"),
      cls("server", "Color"),
    ],
    enums: [],
  });

  it("matches a name without its C as the start of the name", () => {
    const result = search(context, "gamerules");
    expect(nameRows(result)).toEqual(["CGameRules", "CGameRulesProxy", "CDOTAGameRules"]);
    expect(result.names[0].hit.tier).toBe(TIER_EXACT);
    expect(result.names[1].hit.tier).toBe(TIER_PREFIX);
    expect(result.names[2].hit.tier).toBe(TIER_WORD_START);
  });

  it("gives the ranges in the full name", () => {
    const [row] = search(context, "game").names;
    expect(row.hit.nameWords[0].ranges).toEqual([1, 5]);
  });

  it("matches the two words of a name as one name", () => {
    const [row] = search(context, "game rules").names;
    expect(row.hit.declaration.name).toBe("CGameRules");
    expect(row.hit.tier).toBe(TIER_EXACT);
  });

  it("gives the ranges of a client class in the full name", () => {
    const result = search(context, "rules");
    const client = result.names.find((row) => row.hit.declaration.name === "C_Rules");
    expect(client?.hit.tier).toBe(TIER_EXACT);
    expect(client?.hit.nameWords[0].ranges).toEqual([2, 7]);
  });

  it("only strips a C before an uppercase letter or an underscore", () => {
    const result = search(context, "olor");
    expect(nameRows(result)).toEqual(["Color"]);
    expect(result.names[0].hit.tier).toBe(TIER_SUBSTRING);
  });
});

describe("whole words", () => {
  it("list a match that ends a word before one that cuts into the next", () => {
    const context = buildContext({
      classes: [cls("server", "CManager"), cls("server", "CManaDrain")],
      enums: [],
    });
    expect(nameRows(search(context, "mana"))).toEqual(["CManaDrain", "CManager"]);
  });

  it("list a field the same way", () => {
    const context = buildContext({
      classes: [cls("server", "CFoo", [field("m_flWardTime"), field("m_flWarden")])],
      enums: [],
    });
    expect(fieldRows(search(context, "ward"))).toEqual(["CFoo.m_flWardTime", "CFoo.m_flWarden"]);
  });
});

describe("similar names by typo", () => {
  const context = buildContext({
    classes: [
      cls("server", "CBaseEntity", [
        field("m_iHealth", int, 8),
        field("m_fCooldown", float, 12),
        field("m_ArmorValue", int, 16),
      ]),
      cls("client", "C_BaseEntity", [
        field("m_iHealth", int, 8),
        field("m_fCooldown", float, 12),
        field("m_ArmorValue", int, 16),
      ]),
      cls("server", "CItem_Healthshot"),
      cls("server", "CUnrelated", [field("m_flRadius", float, 8)]),
    ],
    enums: [],
  });

  it("list a field and a class with a word one swap away", () => {
    const result = search(context, "healht");
    expect(similarRows(result).sort()).toEqual(["CBaseEntity.m_iHealth", "CItem_Healthshot"]);
    expect(result.fields).toEqual([]);
    expect(result.names).toEqual([]);
    expect(result.declarations.size).toBe(0);
  });

  it("list a field with a word one swap away from its name", () => {
    expect(similarRows(search(context, "cooldwon"))).toEqual(["CBaseEntity.m_fCooldown"]);
  });

  it("list a word with a letter more", () => {
    expect(similarRows(search(context, "armour"))).toEqual(["CBaseEntity.m_ArmorValue"]);
  });

  it("give a field the tier of a similar name and the ranges of the word", () => {
    const [row] = search(context, "cooldwon").similar;
    expect(row.hit.tier).toBe(TIER_FUZZY);
    expect(row.hit.kind === "field" && row.hit.fieldWords[0].ranges).toEqual([3, 11]);
  });

  it("list the client and server field as one paired row", () => {
    const rows = search(context, "healht").similar;
    const fieldRows = rows.filter((row) => row.hit.kind === "field");
    expect(fieldRows).toHaveLength(1);
    const { hit, paired } = fieldRows[0];
    const modules = [hit.declaration.module, paired?.declaration.module];
    expect(modules.sort()).toEqual(["client", "server"]);
  });

  it("list the shorter names first, a class once", () => {
    const withFuzzy = buildContext({
      classes: [cls("server", "CHealth_Typo"), cls("server", "CHealthyTypoLong")],
      enums: [],
    });
    expect(similarRows(search(withFuzzy, "healht"))).toEqual(["CHealth_Typo", "CHealthyTypoLong"]);
  });

  it("are not looked for with a word of three letters", () => {
    expect(similarRows(search(context, "hlt"))).toEqual(["CItem_Healthshot"]);
  });

  it("are not looked for when there are many results", () => {
    const names = "ABCDEFGHIJKL".split("").map((letter) => cls("server", `CHealth${letter}`));
    const crowded = buildContext({ classes: [...names, cls("server", "CHealht")], enums: [] });
    const result = search(crowded, "health");
    expect(result.names).toHaveLength(12);
    expect(similarRows(result)).toEqual([]);
  });

  it("need every word in the name", () => {
    expect(similarRows(search(context, "healht base"))).toEqual([]);
    expect(similarRows(search(context, "healht radius"))).toEqual([]);
  });
});

describe("short words and prefixes", () => {
  const context = buildContext({
    classes: [
      cls("server", "CItem_Kevlar"),
      cls("server", "CBar_t"),
      cls("server", "CFoo_r_x"),
      cls("server", "CSkipmp_x", [field("m_iHealth", int, 8), field("mp_regen", float, 12)]),
      cls("server", "CRoot", [field("r_value", float, 8)]),
    ],
    enums: [],
  });

  it("do not match a class inside a word at two letters", () => {
    expect(nameRows(search(context, "r_"))).toEqual(["CFoo_r_x"]);
    expect(nameRows(search(context, "e_"))).toEqual([]);
    expect(nameRows(search(context, "ar"))).toEqual([]);
  });

  it("do not match a class inside a word when ending in an underscore", () => {
    expect(nameRows(search(context, "mp_"))).toEqual([]);
    expect(fieldRows(search(context, "mp_"))).toEqual(["CSkipmp_x.mp_regen"]);
  });

  it("search only field names when starting with m_", () => {
    const result = search(context, "m_");
    expect(result.names).toEqual([]);
    expect(fieldRows(result)).toEqual(["CSkipmp_x.m_iHealth"]);
  });

  it("still match at the start of a word", () => {
    expect(fieldRows(search(context, "r_"))).toContain("CRoot.r_value");
    expect(nameRows(search(context, "cb"))).toEqual(["CBar_t"]);
  });
});
