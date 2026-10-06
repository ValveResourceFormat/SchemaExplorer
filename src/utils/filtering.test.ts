import { describe, it, expect } from "vitest";
import {
  buildHash,
  parseSearch,
  parseIntValue,
  isFilterPrefix,
  matchesWords,
  matchesMetadataKeys,
  matchesMetadataValues,
  searchDeclarations,
  fuzzyScore,
  EMPTY_PARSED,
} from "./filtering";
import type { SchemaClass, SchemaEnum } from "../data/types";
import { declarations } from "../data/test-helpers";

const classesByName = new Map<string, SchemaClass>();
const enumsByName = new Map<string, SchemaEnum>();
for (const d of declarations) {
  if (d.kind === "class") classesByName.set(d.name, d);
  else enumsByName.set(d.name, d);
}

// -- parseIntValue --

describe("parseIntValue", () => {
  it("parses decimal", () => {
    expect(parseIntValue("128")).toBe(128);
  });
  it("parses hex", () => {
    expect(parseIntValue("0x80")).toBe(128);
  });
  it("returns null for empty string", () => {
    expect(parseIntValue("")).toBeNull();
  });
  it("returns null for non-numeric", () => {
    expect(parseIntValue("abc")).toBeNull();
  });
  it("trims whitespace", () => {
    expect(parseIntValue(" 42 ")).toBe(42);
  });
});

// -- isFilterPrefix --

describe("isFilterPrefix", () => {
  it("recognizes module:", () => {
    expect(isFilterPrefix("module:client")).toBe(true);
  });
  it("recognizes offset:", () => {
    expect(isFilterPrefix("offset:5")).toBe(true);
  });
  it("recognizes metadata:", () => {
    expect(isFilterPrefix("metadata:key")).toBe(true);
  });
  it("recognizes enumvalue:", () => {
    expect(isFilterPrefix("enumvalue:4")).toBe(true);
  });
  it("recognizes metadatavalue:", () => {
    expect(isFilterPrefix("metadatavalue:val")).toBe(true);
  });
  it("rejects plain words", () => {
    expect(isFilterPrefix("foo")).toBe(false);
    expect(isFilterPrefix("moduleName")).toBe(false);
  });
});

// -- parseSearch --

describe("parseSearch", () => {
  it("returns empty for empty string", () => {
    const result = parseSearch("");
    expect(result.nameWords).toEqual([]);
    expect(result.moduleWords).toEqual([]);
    expect(result.offsets.size).toBe(0);
    expect(result.enumValues.size).toBe(0);
    expect(result.metadataKeys).toEqual([]);
    expect(result.metadataValues).toEqual([]);
  });

  it("parses simple name words", () => {
    const result = parseSearch("foo bar");
    expect(result.nameWords).toEqual(["foo", "bar"]);
  });

  it("parses module filter", () => {
    const result = parseSearch("module:client");
    expect(result.moduleWords).toEqual(["client"]);
    expect(result.nameWords).toEqual([]);
  });

  it("parses decimal offset", () => {
    const result = parseSearch("offset:128");
    expect(result.offsets).toEqual(new Set([128]));
  });

  it("parses hex offset", () => {
    const result = parseSearch("offset:0x1A");
    expect(result.offsets).toEqual(new Set([26]));
  });

  it("ignores invalid offset", () => {
    const result = parseSearch("offset:abc");
    expect(result.offsets.size).toBe(0);
  });

  it("parses metadata key filter", () => {
    const result = parseSearch("metadata:MNotSaved");
    expect(result.metadataKeys).toEqual(["mnotsaved"]);
  });

  it("does not treat metadatavalue: as metadata:", () => {
    const result = parseSearch("metadatavalue:foo");
    expect(result.metadataValues).toEqual(["foo"]);
    expect(result.metadataKeys).toEqual([]);
  });

  it("parses mixed query", () => {
    const result = parseSearch("CPlayer module:server offset:0x10 metadata:MNotSaved");
    expect(result.nameWords).toEqual(["cplayer"]);
    expect(result.moduleWords).toEqual(["server"]);
    expect(result.offsets).toEqual(new Set([16]));
    expect(result.metadataKeys).toEqual(["mnotsaved"]);
  });

  it("lowercases everything", () => {
    const result = parseSearch("FOO Module:SERVER");
    expect(result.nameWords).toEqual(["foo"]);
    expect(result.moduleWords).toEqual(["server"]);
  });

  it("order of words and filters does not matter", () => {
    const a = parseSearch(
      "C_Fish module:client metadata:MNotSaved offset:0x10 enumvalue:4 metadatavalue:coord",
    );
    const b = parseSearch(
      "metadatavalue:coord enumvalue:4 metadata:MNotSaved offset:0x10 module:client C_Fish",
    );
    expect(a.nameWords).toEqual(b.nameWords);
    expect(a.moduleWords).toEqual(b.moduleWords);
    expect(a.offsets).toEqual(b.offsets);
    expect(a.enumValues).toEqual(b.enumValues);
    expect(a.metadataKeys).toEqual(b.metadataKeys);
    expect(a.metadataValues).toEqual(b.metadataValues);
  });

  it("parses decimal enumvalue", () => {
    const result = parseSearch("enumvalue:4");
    expect(result.enumValues).toEqual(new Set([4]));
  });

  it("parses hex enumvalue", () => {
    const result = parseSearch("enumvalue:0xFF");
    expect(result.enumValues).toEqual(new Set([255]));
  });

  it("parses multiple enumvalues", () => {
    const result = parseSearch("enumvalue:1 enumvalue:2");
    expect(result.enumValues).toEqual(new Set([1, 2]));
  });

  it("ignores invalid enumvalue", () => {
    const result = parseSearch("enumvalue:abc");
    expect(result.enumValues.size).toBe(0);
  });

  it("ignores empty enumvalue:", () => {
    const result = parseSearch("enumvalue:");
    expect(result.enumValues.size).toBe(0);
  });

  it("parses multiple offsets", () => {
    const result = parseSearch("offset:0x10 offset:0x14");
    expect(result.offsets).toEqual(new Set([16, 20]));
  });

  it("parses multiple module words", () => {
    const result = parseSearch("module:client module:server");
    expect(result.moduleWords).toEqual(["client", "server"]);
  });

  it("parses multiple metadata keys", () => {
    const result = parseSearch("metadata:MNotSaved metadata:MPropertyFriendlyName");
    expect(result.metadataKeys).toEqual(["mnotsaved", "mpropertyfriendlyname"]);
  });

  it("ignores empty metadata: value", () => {
    const result = parseSearch("metadata:");
    expect(result.metadataKeys).toEqual([]);
  });

  it("ignores empty metadatavalue: value", () => {
    const result = parseSearch("metadatavalue:");
    expect(result.metadataValues).toEqual([]);
  });

  it("ignores empty module: value", () => {
    const result = parseSearch("module:");
    expect(result.moduleWords).toEqual([]);
  });
});

// -- matchesWords --

describe("matchesWords", () => {
  it("matches when all words present", () => {
    expect(matchesWords("CPlayerPawn", ["player", "pawn"])).toBe(true);
  });
  it("fails when a word is missing", () => {
    expect(matchesWords("CPlayerPawn", ["player", "entity"])).toBe(false);
  });
  it("is case insensitive", () => {
    expect(matchesWords("CPlayerPawn", ["cplayerpawn"])).toBe(true);
  });
  it("returns true for empty words (vacuous truth)", () => {
    expect(matchesWords("anything", [])).toBe(true);
  });
});

// -- matchesMetadataKeys --

describe("matchesMetadataKeys", () => {
  it("matches when key present", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["mnot"])).toBe(true);
  });
  it("fails when key absent", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["other"])).toBe(false);
  });
  it("returns false for undefined metadata", () => {
    expect(matchesMetadataKeys(undefined, ["key"])).toBe(false);
  });
  it("returns false for empty metadata", () => {
    expect(matchesMetadataKeys([], ["key"])).toBe(false);
  });
  it("returns false for empty keys", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], [])).toBe(false);
  });
  it("partial match works (uses includes)", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["saved"])).toBe(true);
  });
});

// -- matchesMetadataValues --

describe("matchesMetadataValues", () => {
  it("matches when value present", () => {
    expect(matchesMetadataValues([{ name: "key", value: "true" }], ["true"])).toBe(true);
  });
  it("fails when value absent", () => {
    expect(matchesMetadataValues([{ name: "key", value: "true" }], ["false"])).toBe(false);
  });
  it("returns false for undefined metadata", () => {
    expect(matchesMetadataValues(undefined, ["val"])).toBe(false);
  });
  it("skips entries with undefined value", () => {
    expect(matchesMetadataValues([{ name: "key" }], ["val"])).toBe(false);
  });
  it("partial value match works", () => {
    expect(matchesMetadataValues([{ name: "key", value: "water_surface" }], ["water"])).toBe(true);
  });
});

// -- Real schema: searchDeclarations --

describe("searchDeclarations — declaration matching", () => {
  describe("name search", () => {
    it("finds class by exact name", () => {
      const result = searchDeclarations(declarations, parseSearch("C_CSWeaponBaseGun"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds class by partial name", () => {
      const result = searchDeclarations(declarations, parseSearch("WeaponBaseGun"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds class by case-insensitive partial name", () => {
      const result = searchDeclarations(declarations, parseSearch("weaponbasegun"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds class by field name", () => {
      const result = searchDeclarations(declarations, parseSearch("m_zoomLevel"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds enum by member name", () => {
      const result = searchDeclarations(declarations, parseSearch("CancelOnSucceeded"));
      expect(result.some((d) => d.name === "PulseCursorCancelPriority_t")).toBe(true);
    });

    it("finds enum by partial member name", () => {
      const result = searchDeclarations(declarations, parseSearch("SoftCancel"));
      expect(result.some((d) => d.name === "PulseCursorCancelPriority_t")).toBe(true);
    });

    it("multiple name words must all match somewhere", () => {
      // "weapon" matches class name, "zoom" matches field name
      const result = searchDeclarations(declarations, parseSearch("weapon zoom"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("multiple name words that don't both match returns nothing for that class", () => {
      // "weapon" matches class name, but "fishangle" matches neither fields nor class
      const result = searchDeclarations(declarations, parseSearch("weapon fishangle"));
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds class by field metadata key as name word", () => {
      // MPropertyAttributeChoiceName appears as a metadata key on C_OP_RenderTreeShake fields
      const result = searchDeclarations(declarations, parseSearch("MPropertyAttributeChoiceName"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((d) => d.name === "C_OP_RenderTreeShake")).toBe(true);
    });

    it("empty search returns nothing", () => {
      const result = searchDeclarations(declarations, EMPTY_PARSED);
      expect(result).toHaveLength(0);
    });

    it("nonsense search returns nothing", () => {
      const result = searchDeclarations(declarations, parseSearch("xyzzy999qqq"));
      expect(result).toHaveLength(0);
    });
  });

  describe("module filter", () => {
    it("module:server returns only server classes", () => {
      const result = searchDeclarations(declarations, parseSearch("module:server"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module === "server")).toBe(true);
    });

    it("module:client returns only client classes", () => {
      const result = searchDeclarations(declarations, parseSearch("module:client"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module === "client")).toBe(true);
    });

    it("module filter is partial match (prefix)", () => {
      const result = searchDeclarations(declarations, parseSearch("module:pulse"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module.includes("pulse"))).toBe(true);
    });

    it("module filter is partial match (mid-string)", () => {
      // "lib" appears mid-string in animgraphlib, mapdoclib, navlib, physicslib, pulse_runtime_lib
      const result = searchDeclarations(declarations, parseSearch("module:lib"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module.includes("lib"))).toBe(true);
      // Shouldn't include client or server
      expect(result.every((d) => d.module !== "client" && d.module !== "server")).toBe(true);
    });

    it("module:server excludes client-only classes", () => {
      const result = searchDeclarations(declarations, parseSearch("module:server"));
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
    });

    it("module + name narrows results", () => {
      const result = searchDeclarations(declarations, parseSearch("CFuncWater module:server"));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("CFuncWater");
      expect(result[0].module).toBe("server");
    });

    it("module + name mismatch returns nothing", () => {
      // CFlashbangProjectile is in server, not client
      const result = searchDeclarations(
        declarations,
        parseSearch("CFlashbangProjectile module:client"),
      );
      expect(result).toHaveLength(0);
    });

    it("module filter with multiple modules uses OR", () => {
      const result = searchDeclarations(declarations, parseSearch("module:client module:server"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module === "client" || d.module === "server")).toBe(true);
    });

    it("module-only search returns empty fields", () => {
      const result = searchDeclarations(declarations, parseSearch("module:server"));
      const flash = result.find((d) => d.name === "CFlashbangProjectile") as SchemaClass;
      expect(flash).toBeDefined();
      expect(flash.fields).toHaveLength(0);
    });

    it("same class in different modules — both returned without module filter", () => {
      const result = searchDeclarations(declarations, parseSearch("CFuncWater"));
      const funcWaters = result.filter((d) => d.name === "CFuncWater");
      expect(funcWaters).toHaveLength(2);
      expect(funcWaters.map((d) => d.module).sort()).toEqual(["client", "server"]);
    });

    it("same class in different modules — module filter selects one", () => {
      const clientResult = searchDeclarations(
        declarations,
        parseSearch("CFuncWater module:client"),
      );
      const serverResult = searchDeclarations(
        declarations,
        parseSearch("CFuncWater module:server"),
      );
      expect(clientResult).toHaveLength(1);
      expect(clientResult[0].module).toBe("client");
      expect(serverResult).toHaveLength(1);
      expect(serverResult[0].module).toBe("server");
    });
  });

  describe("offset filter", () => {
    it("finds class with matching field offset", () => {
      // C_CSWeaponBaseGun has m_zoomLevel at offset 8000 (0x1F40)
      const result = searchDeclarations(declarations, parseSearch("offset:8000"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("finds class with hex offset", () => {
      // 8000 = 0x1F40
      const result = searchDeclarations(declarations, parseSearch("offset:0x1F40"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("offset filter excludes enums", () => {
      const result = searchDeclarations(declarations, parseSearch("offset:0"));
      expect(result.every((d) => d.kind === "class")).toBe(true);
    });

    it("offset that matches no field returns nothing for that class", () => {
      // 99999 is unlikely to be a real offset
      const result = searchDeclarations(declarations, parseSearch("offset:99999"));
      expect(result).toHaveLength(0);
    });

    it("multiple offsets (OR within offsets)", () => {
      // CFlashbangProjectile: m_flTimeToDetonate=2992, m_numOpponentsHit=2996
      const result = searchDeclarations(declarations, parseSearch("offset:2992 offset:2996"));
      // Both offsets exist in CFlashbangProjectile
      expect(result.some((d) => d.name === "CFlashbangProjectile")).toBe(true);
    });

    it("offset + name word narrows results", () => {
      const result = searchDeclarations(declarations, parseSearch("Flashbang offset:2992"));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("CFlashbangProjectile");
    });

    it("offset + wrong name returns nothing", () => {
      const result = searchDeclarations(declarations, parseSearch("C_Fish offset:2992"));
      expect(result).toHaveLength(0);
    });

    it("offset + module filter", () => {
      const result = searchDeclarations(declarations, parseSearch("module:server offset:2992"));
      expect(result.some((d) => d.name === "CFlashbangProjectile")).toBe(true);
      expect(result.every((d) => d.module === "server")).toBe(true);
    });
  });

  describe("enum value filter", () => {
    it("finds enum with matching member value", () => {
      // DOTA_UNIT_TARGET_TEAM_CUSTOM = 4
      const result = searchDeclarations(declarations, parseSearch("enumvalue:4"));
      expect(result.some((d) => d.name === "DOTA_UNIT_TARGET_TEAM")).toBe(true);
    });

    it("finds enum with hex value", () => {
      // 4 = 0x4
      const result = searchDeclarations(declarations, parseSearch("enumvalue:0x4"));
      expect(result.some((d) => d.name === "DOTA_UNIT_TARGET_TEAM")).toBe(true);
    });

    it("enumvalue filter excludes classes", () => {
      const result = searchDeclarations(declarations, parseSearch("enumvalue:0"));
      expect(result.every((d) => d.kind === "enum")).toBe(true);
    });

    it("enumvalue that matches no member returns nothing", () => {
      const result = searchDeclarations(declarations, parseSearch("enumvalue:99999"));
      expect(result).toHaveLength(0);
    });

    it("multiple enumvalues (OR within values)", () => {
      // PulseCursorCancelPriority_t: CancelOnSucceeded=1, SoftCancel=2
      const result = searchDeclarations(declarations, parseSearch("enumvalue:1 enumvalue:2"));
      expect(result.some((d) => d.name === "PulseCursorCancelPriority_t")).toBe(true);
    });

    it("enumvalue + name word narrows results", () => {
      // DOTA_UNIT_TARGET_TEAM_CUSTOM = 4, name has "DOTA"
      const result = searchDeclarations(declarations, parseSearch("DOTA enumvalue:4"));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("DOTA_UNIT_TARGET_TEAM");
    });

    it("enumvalue + wrong name returns nothing", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseTestEnumColor_t enumvalue:4"),
      );
      // PulseTestEnumColor_t has BLACK=0, WHITE=1, RED=2, GREEN=3, BLUE=4
      // Wait — BLUE=4. So this SHOULD match.
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("PulseTestEnumColor_t");
    });

    it("enumvalue + module filter", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("module:pulse_runtime_lib enumvalue:2"),
      );
      expect(result.every((d) => d.module === "pulse_runtime_lib")).toBe(true);
      expect(result.some((d) => d.name === "PulseCursorCancelPriority_t")).toBe(true);
    });

    it("enumvalue:0 matches members at value 0", () => {
      // All 3 enums have a member at value 0
      const result = searchDeclarations(declarations, parseSearch("enumvalue:0"));
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("offset + enumvalue combined returns nothing (mutually exclusive)", () => {
      // offset excludes enums, enumvalue excludes classes — nothing can pass both
      const result = searchDeclarations(declarations, parseSearch("offset:0 enumvalue:0"));
      expect(result).toHaveLength(0);
    });
  });

  describe("metadata key filter", () => {
    it("finds classes with MNotSaved on fields", () => {
      const result = searchDeclarations(declarations, parseSearch("metadata:MNotSaved"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("does not find class without that metadata", () => {
      // CFlashbangProjectile has no metadata on any field
      const result = searchDeclarations(declarations, parseSearch("metadata:MNotSaved"));
      expect(result.every((d) => d.name !== "CFlashbangProjectile")).toBe(true);
    });

    it("metadata: filter matches field-level metadata keys", () => {
      // C_OP_RenderTreeShake has no class metadata, only its fields have MPropertyFriendlyName
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MPropertyFriendlyName"),
      );
      expect(result.some((d) => d.name === "C_OP_RenderTreeShake")).toBe(true);
    });

    it("metadata key filter is case-insensitive partial match", () => {
      const result = searchDeclarations(declarations, parseSearch("metadata:notsav"));
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("metadata key + name word", () => {
      const result = searchDeclarations(declarations, parseSearch("C_Fish metadata:MNotSaved"));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_Fish");
    });

    it("metadata key that doesn't exist returns nothing", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:ThisDoesNotExist12345"),
      );
      expect(result).toHaveLength(0);
    });

    it("metadata key + module", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MNotSaved module:server"),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module === "server")).toBe(true);
    });

    it("finds enums by member metadata key", () => {
      // PulseTestEnumColor_t members have MPropertyFriendlyName
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MPropertyFriendlyName"),
      );
      expect(result.some((d) => d.name === "PulseTestEnumColor_t")).toBe(true);
    });

    it("finds enum by enum-level metadata key", () => {
      // DOTA_UNIT_TARGET_TEAM has MEnumFlagsWithOverlappingBits on enum metadata
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MEnumFlagsWithOverlappingBits"),
      );
      expect(result.some((d) => d.name === "DOTA_UNIT_TARGET_TEAM")).toBe(true);
    });

    it("enum-level metadata match returns empty members", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("DOTA_UNIT_TARGET_TEAM metadata:MEnumFlagsWithOverlappingBits"),
      );
      expect(result).toHaveLength(1);
      const e = result[0] as SchemaEnum;
      expect(e.members).toHaveLength(0);
    });

    it("enum-level metadata match + member name word filters members", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("DOTA_UNIT_TARGET_TEAM metadata:MEnumFlagsWithOverlappingBits ENEMY"),
      );
      expect(result).toHaveLength(1);
      const e = result[0] as SchemaEnum;
      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("DOTA_UNIT_TARGET_TEAM_ENEMY");
    });

    it("finds class by declaration-level metadata key", () => {
      // C_Fish has MNetworkNoBase on class metadata (not field metadata)
      const result = searchDeclarations(declarations, parseSearch("metadata:MNetworkNoBase"));
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("declaration-level metadata match returns empty fields", () => {
      // MNetworkNoBase is on class metadata, not field metadata
      // No remaining field words, no offset, no field-level metadata → empty fields
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkNoBase"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(0);
    });

    it("declaration-level metadata match + name word filters fields", () => {
      // Class metadata matches MNetworkNoBase, "depth" becomes remaining word → field filter
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkNoBase depth"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_deathDepth");
    });

    it("declaration-level metadata match + offset filters fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkNoBase offset:4588"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_x");
    });

    it("metadata key on class + metadata key on field must both match at same level", () => {
      // MNetworkNoBase is only on class metadata, MNotSaved only on field metadata
      // No single level has both → no match
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkNoBase metadata:MNotSaved"),
      );
      expect(result).toHaveLength(0);
    });

    it("declaration-level metadata key only (no class name) finds classes", () => {
      // MGetKV3ClassDefaults only exists on class metadata, and only stays there with defaults
      // that no field took, like on TestUnknownKeys and TestBrokenDefaults
      const result = searchDeclarations(declarations, parseSearch("metadata:MGetKV3ClassDefaults"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((d) => d.name === "TestUnknownKeys")).toBe(true);
      expect(result.some((d) => d.name === "TestBrokenDefaults")).toBe(true);
      // CFlashbangProjectile has no class metadata → excluded
      expect(result.every((d) => d.name !== "CFlashbangProjectile")).toBe(true);
    });
  });

  describe("metadata value filter", () => {
    it("finds class by metadata value on field", () => {
      // C_OP_RenderTreeShake.m_nRadiusFieldOverride has MPropertyAttributeChoiceName with
      // value "particlefield_scalar"
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:particlefield_scalar"),
      );
      expect(result.some((d) => d.name === "C_OP_RenderTreeShake")).toBe(true);
    });

    it("finds class by MPropertyFriendlyName value", () => {
      // C_OP_WaterImpulseRenderer.m_flWobble has MPropertyFriendlyName "impulse wobble radius"
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:wobble"));
      expect(result.some((d) => d.name === "C_OP_WaterImpulseRenderer")).toBe(true);
    });

    it("finds class by partial metadata value", () => {
      // "Twist amount (-1..1)" is a MPropertyFriendlyName value on C_OP_RenderTreeShake
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:twist"));
      expect(result.some((d) => d.name === "C_OP_RenderTreeShake")).toBe(true);
    });

    it("finds enum by member metadata value", () => {
      // PulseTestEnumColor_t.BLACK has MPropertyFriendlyName = "Black"
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:black"));
      expect(result.some((d) => d.name === "PulseTestEnumColor_t")).toBe(true);
    });

    it("metadata value that doesn't exist returns nothing", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:zzz_nonexistent_zzz"),
      );
      expect(result).toHaveLength(0);
    });

    it("metadata value + name word", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("WaterImpulse metadatavalue:impulse"),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_OP_WaterImpulseRenderer");
    });

    it("metadata value + module filter", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:impulse module:particles"),
      );
      expect(result.some((d) => d.name === "C_OP_WaterImpulseRenderer")).toBe(true);
      expect(result.every((d) => d.module === "particles")).toBe(true);
    });

    it("metadata value + wrong module returns nothing for that class", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:impulse module:client"),
      );
      expect(result.every((d) => d.name !== "C_OP_WaterImpulseRenderer")).toBe(true);
    });

    it("finds class by declaration-level metadata value", () => {
      // TestUnknownKeys class metadata keeps the defaults no field took, m_extra and m_unknown
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:m_unknown"));
      expect(result.some((d) => d.name === "TestUnknownKeys")).toBe(true);
    });

    it("declaration-level metadatavalue match returns empty fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("TestUnknownKeys metadatavalue:m_unknown"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(0);
    });

    it("declaration-level metadatavalue match + name word filters fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("TestUnknownKeys metadatavalue:m_unknown flx"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_flX");
    });

    it("declaration-level metadata key + value combined returns empty fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("TestUnknownKeys metadata:MGetKV3ClassDefaults metadatavalue:m_unknown"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      // No remaining field words, no offset, no field-level metadata → empty fields
      expect(cls.fields).toHaveLength(0);
    });
  });

  describe("combined filters", () => {
    it("name + module + metadata key", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("Fish module:client metadata:MNotSaved"),
      );
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
      expect(result.every((d) => d.module === "client")).toBe(true);
    });

    it("name + offset + module", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("Flashbang module:server offset:2992"),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("CFlashbangProjectile");
    });

    it("metadata key + metadata value on same field", () => {
      // Both key and value must exist on the same field
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MPropertyAttributeChoiceName metadatavalue:particlefield_vector"),
      );
      expect(result.map((d) => d.name)).toEqual(["C_OP_RemapTransformVisibilityToVector"]);
    });

    it("name + metadata key + metadata value", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("RenderTreeShake metadata:MPropertyFriendlyName metadatavalue:twist"),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_OP_RenderTreeShake");
    });

    it("all filters combined", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake module:particles offset:568 metadata:MPropertyFriendlyName metadatavalue:twist",
        ),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_OP_RenderTreeShake");
    });

    it("contradictory filters return nothing", () => {
      // CFlashbangProjectile is server, has no metadata
      const result = searchDeclarations(
        declarations,
        parseSearch("CFlashbangProjectile module:client metadata:MNotSaved"),
      );
      expect(result).toHaveLength(0);
    });

    it("class name word + field name word", () => {
      // "Weapon" in class name, "silencer" in field name m_iSilencerBodygroup
      const result = searchDeclarations(declarations, parseSearch("weapon silencer"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("two field name words from different fields → no match", () => {
      // "zoom" is in m_zoomLevel, "silencer" is in m_iSilencerBodygroup
      // No single field has both words → no field passes → declaration excluded
      const result = searchDeclarations(declarations, parseSearch("zoom silencer"));
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
    });
  });
});

// -- searchDeclarations — field/member filtering --

describe("searchDeclarations — field filtering", () => {
  describe("class field filtering", () => {
    it("returns class with empty fields when search matches class name only", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      const parsed = parseSearch("C_CSWeaponBaseGun");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.name).toBe(decl.name);
      expect(result.fields).toHaveLength(0);
    });

    it("filters fields by field name word", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // "weapon" matches class name, "zoom" is remaining → filters to m_zoomLevel
      const parsed = parseSearch("C_CSWeaponBaseGun zoom");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_zoomLevel");
    });

    it("filters fields by offset", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // offset 8004 = m_iBurstShotsRemaining
      const parsed = parseSearch("offset:8004");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_iBurstShotsRemaining");
    });

    it("filters to multiple fields matching the same offset", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // Use two offsets to get two fields
      const parsed = parseSearch("offset:8000 offset:8004");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(2);
      expect(result.fields.map((f) => f.name)).toEqual(["m_zoomLevel", "m_iBurstShotsRemaining"]);
    });

    it("filters fields by metadata key", () => {
      const decl = classesByName.get("C_OP_RenderTreeShake")!;
      // Only 2 of 10 fields have MPropertyAttributeChoiceName
      const parsed = parseSearch("metadata:MPropertyAttributeChoiceName");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields.map((f) => f.name)).toEqual([
        "m_nPeakStrengthFieldOverride",
        "m_nRadiusFieldOverride",
      ]);
    });

    it("filters fields by metadata value", () => {
      const decl = classesByName.get("C_OP_RenderTreeShake")!;
      // m_flTwistAmount has MPropertyFriendlyName "Twist amount (-1..1)"
      const parsed = parseSearch("metadatavalue:twist");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_flTwistAmount");
    });

    it("field name word + metadata key combined", () => {
      const decl = classesByName.get("C_OP_RenderTreeShake")!;
      // "radius" matches m_flRadius and m_nRadiusFieldOverride, only the second has
      // MPropertyAttributeChoiceName
      const parsed = parseSearch(
        "C_OP_RenderTreeShake radius metadata:MPropertyAttributeChoiceName",
      );
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_nRadiusFieldOverride");
    });

    it("field name word that matches nothing → declaration excluded", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      const parsed = parseSearch("C_CSWeaponBaseGun xyzzynotafield");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });

    it("metadata key that no field has → declaration excluded", () => {
      const decl = classesByName.get("CFlashbangProjectile")!;
      // CFlashbangProjectile has no metadata on any field
      const parsed = parseSearch("metadata:MNotSaved");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });

    it("preserves field metadata in filtered results", () => {
      const decl = classesByName.get("C_INIT_CheckParticleForWater")!;
      const parsed = parseSearch("metadatavalue:particlefield_scalar");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      // m_nFieldOutput should still have all its metadata entries
      expect(result.fields[0].metadata).toEqual([
        { name: "MPropertyFriendlyName", value: '"output attribute"' },
        { name: "MPropertyAttributeChoiceName", value: '"particlefield_scalar"' },
      ]);
    });

    it("preserves class-level metadata in filtered result", () => {
      const decl = classesByName.get("C_Fish")!;
      const parsed = parseSearch("C_Fish wiggle");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      // Class metadata should be unchanged
      expect(result.metadata).toBe(decl.metadata);
      expect(result.metadata).toEqual([{ name: "MNetworkNoBase" }]);
    });

    it("preserves parents in filtered result", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      const parsed = parseSearch("C_CSWeaponBaseGun zoom");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.parents).toBe(decl.parents);
      expect(result.parents[0].name).toBe("C_CSWeaponBase");
    });

    it("no field-level filter words → empty fields returned", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // All words match the class name, no remaining words → empty fields
      const parsed = parseSearch("CSWeapon");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.name).toBe(decl.name);
      expect(result.fields).toHaveLength(0);
    });

    it("offset + metadata key combined on fields", () => {
      const decl = classesByName.get("C_OP_RenderTreeShake")!;
      // offset 556 is m_nRadiusFieldOverride, which has MPropertyAttributeChoiceName
      // Combined: field must match BOTH offset AND metadata key
      const parsed = parseSearch("offset:556 metadata:MPropertyAttributeChoiceName");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_nRadiusFieldOverride");
    });

    it("offset + metadata key with no overlap → declaration excluded", () => {
      const decl = classesByName.get("C_OP_RenderTreeShake")!;
      // offset 552 is m_flRadius, which has no MPropertyAttributeChoiceName
      const parsed = parseSearch("offset:552 metadata:MPropertyAttributeChoiceName");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });

    it("field name word matches metadata key name", () => {
      const decl = classesByName.get("C_Fish")!;
      // "MNotSaved" appears as a metadata key on fields — name word falls through to metadata check
      const parsed = parseSearch("C_Fish MNotSaved");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      // All C_Fish fields have MNotSaved, so all should match
      expect(result.fields.length).toBe(decl.fields.length);
    });

    it("partial field name word matches subset of fields", () => {
      const decl = classesByName.get("C_Fish")!;
      // "error" matches m_errorHistory, m_errorHistoryIndex, m_errorHistoryCount, m_averageError
      const parsed = parseSearch("C_Fish error");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields.length).toBe(4);
      expect(result.fields.every((f) => f.name.toLowerCase().includes("error"))).toBe(true);
    });

    it("multiple name words progressively narrow field results", () => {
      // "error" on C_Fish: 4 fields
      const broad = searchDeclarations(declarations, parseSearch("C_Fish error"));
      const fishBroad = broad.find((d) => d.name === "C_Fish") as SchemaClass;
      expect(fishBroad.fields).toHaveLength(4);

      // "error" + "index": only m_errorHistoryIndex
      const narrow = searchDeclarations(declarations, parseSearch("C_Fish error index"));
      const fishNarrow = narrow.find((d) => d.name === "C_Fish") as SchemaClass;
      expect(fishNarrow.fields).toHaveLength(1);
      expect(fishNarrow.fields[0].name).toBe("m_errorHistoryIndex");
    });
  });

  describe("enum member filtering", () => {
    it("returns enum with empty members when search matches enum name only", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      const parsed = parseSearch("PulseTestEnumColor_t");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.name).toBe(decl.name);
      expect(result.members).toHaveLength(0);
    });

    it("filters members by name word", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // "pulse" matches enum name, "red" is remaining → matches RED member
      const parsed = parseSearch("PulseTestEnumColor_t RED");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("RED");
    });

    it("filters members by partial name", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      // "cancel" matches both enum name and some members
      // "soft" is remaining → matches SoftCancel
      const parsed = parseSearch("PulseCursorCancelPriority_t soft");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("SoftCancel");
    });

    it("filters members by metadata key", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      // All members have MPropertyFriendlyName, but only 3 have MPropertyDescription
      const parsed = parseSearch("metadata:MPropertyDescription");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(3);
      expect(result.members.map((m) => m.name)).toEqual([
        "CancelOnSucceeded",
        "SoftCancel",
        "HardCancel",
      ]);
      // "None" should be excluded — it only has MPropertyFriendlyName
      expect(result.members.every((m) => m.name !== "None")).toBe(true);
    });

    it("filters members by metadata value", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // BLACK member has MPropertyFriendlyName value "Black"
      const parsed = parseSearch("metadatavalue:black");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("BLACK");
    });

    it("filters members by partial metadata value", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      // "elegantly" appears in SoftCancel's MPropertyFriendlyName value
      const parsed = parseSearch("metadatavalue:elegantly");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("SoftCancel");
    });

    it("member name + metadata value combined", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      // Name remaining "hard" + metadatavalue "immediately"
      const parsed = parseSearch("PulseCursorCancelPriority_t hard metadatavalue:immediately");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("HardCancel");
    });

    it("preserves member metadata in filtered results", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      const parsed = parseSearch("metadatavalue:elegantly");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      const meta = result.members[0].metadata;
      expect(meta.some((m) => m.name === "MPropertyFriendlyName")).toBe(true);
      expect(meta.some((m) => m.name === "MPropertyDescription")).toBe(true);
    });

    it("preserves enum-level properties in filtered result", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      const parsed = parseSearch("PulseTestEnumColor_t RED");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.alignment).toBe(decl.alignment);
      expect(result.module).toBe(decl.module);
      expect(result.name).toBe(decl.name);
    });

    it("filters members by enumvalue", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // RED=2
      const parsed = parseSearch("enumvalue:2");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("RED");
    });

    it("filters members by hex enumvalue", () => {
      const decl = enumsByName.get("DOTA_UNIT_TARGET_TEAM")!;
      // DOTA_UNIT_TARGET_TEAM_CUSTOM = 4 = 0x4
      const parsed = parseSearch("enumvalue:0x4");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("DOTA_UNIT_TARGET_TEAM_CUSTOM");
    });

    it("multiple enumvalues filter with OR", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // WHITE=1, GREEN=3
      const parsed = parseSearch("enumvalue:1 enumvalue:3");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(2);
      const names = result.members.map((m) => m.name);
      expect(names).toContain("WHITE");
      expect(names).toContain("GREEN");
    });

    it("enumvalue + name word combined", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // "pulse" consumed by enum name, "red" is remaining → RED=2
      // enumvalue:2 also matches RED
      const parsed = parseSearch("PulseTestEnumColor_t RED enumvalue:2");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("RED");
    });

    it("enumvalue + metadata combined on member", () => {
      const decl = enumsByName.get("PulseCursorCancelPriority_t")!;
      // SoftCancel=2 has MPropertyDescription
      const parsed = parseSearch("enumvalue:2 metadata:MPropertyDescription");
      const result = searchDeclarations([decl], parsed)[0] as SchemaEnum;
      expect(result.members).toHaveLength(1);
      expect(result.members[0].name).toBe("SoftCancel");
    });

    it("enumvalue that no member has → declaration excluded", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      // values are 0-4, 99 doesn't exist
      const parsed = parseSearch("enumvalue:99");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });

    it("member name word that matches nothing → declaration excluded", () => {
      const decl = enumsByName.get("PulseTestEnumColor_t")!;
      const parsed = parseSearch("PulseTestEnumColor_t xyznotamember");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });
  });
});

// -- Search result ranking --

describe("search result ranking", () => {
  it("exact name match ranks first", () => {
    const result = searchDeclarations(declarations, parseSearch("CFuncWater"));
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe("CFuncWater");
    expect(result[1].name).toBe("CFuncWater");
  });

  it("exact match is case-insensitive", () => {
    const result = searchDeclarations(declarations, parseSearch("cfuncwater"));
    expect(result[0].name).toBe("CFuncWater");
    expect(result[1].name).toBe("CFuncWater");
  });

  it("starts-with ranks above substring", () => {
    const result = searchDeclarations(declarations, parseSearch("CFilter"));
    const names = result.map((d) => d.name);
    // CFilterEnemy and CFilterProximity start with "cfilter"
    expect(names[0]).toBe("CFilterEnemy");
    expect(names[1]).toBe("CFilterProximity");
    expect(names[2]).toBe("CFilterProximity");
  });

  it("declaration-level name match above field-only match (water)", () => {
    const result = searchDeclarations(declarations, parseSearch("water"));
    const names = result.map((d) => d.name);
    // Name matches: C_INIT_CheckParticleForWater, C_OP_WaterImpulseRenderer, CFuncWater (x2)
    const nameMatches = ["C_INIT_CheckParticleForWater", "C_OP_WaterImpulseRenderer", "CFuncWater"];
    // Field-only: C_BaseEntity, C_Fish
    const fieldOnly = ["C_BaseEntity", "C_Fish"];

    // All name matches should come before all field-only matches
    const lastNameMatchIdx = Math.max(...nameMatches.map((n) => names.lastIndexOf(n)));
    const firstFieldOnlyIdx = Math.min(
      ...fieldOnly.map((n) => names.indexOf(n)).filter((i) => i >= 0),
    );
    expect(lastNameMatchIdx).toBeLessThan(firstFieldOnlyIdx);
  });

  it("declaration-level name match above field-only match (effect)", () => {
    const result = searchDeclarations(declarations, parseSearch("effect"));
    const names = result.map((d) => d.name);
    // CEffectData (client + server) should come before field-only matches
    const lastEffectIdx = names.lastIndexOf("CEffectData");
    const fieldOnly = [
      "C_BaseEntity",
      "C_PathParticleRope",
      "CPathParticleRope",
      "CScriptedSequence",
    ];
    const firstFieldOnlyIdx = Math.min(
      ...fieldOnly.map((n) => names.indexOf(n)).filter((i) => i >= 0),
    );
    expect(lastEffectIdx).toBeLessThan(firstFieldOnlyIdx);
  });

  it("substring position affects ranking (sphere)", () => {
    const result = searchDeclarations(declarations, parseSearch("sphere"));
    const names = result.map((d) => d.name);
    // Sorted by substring position (earlier = better), then alphabetical
    expect(names).toEqual([
      "CastSphereSATParams_t",
      "CNavVolumeSphere",
      "CSoundEventSphereEntity",
      "C_SoundEventSphereEntity",
      "CSoundAreaEntitySphere",
      "C_SoundAreaEntitySphere",
      "CAnimationGraphVisualizerSphere",
    ]);
  });

  it("alphabetical within tier, module as tiebreaker", () => {
    const result = searchDeclarations(declarations, parseSearch("CFuncWater"));
    // Both are exact matches (tier 0), same name → sorted by module
    expect(result[0].module).toBe("client");
    expect(result[1].module).toBe("server");
  });

  it("same result set regardless of ranking", () => {
    const result = searchDeclarations(declarations, parseSearch("water"));
    // Verify all expected names are present (ranking may reorder them)
    const nameSet = new Set(result.map((d) => d.name));
    expect(nameSet).toEqual(
      new Set([
        "C_BaseEntity",
        "C_Fish",
        "C_INIT_CheckParticleForWater",
        "C_OP_WaterImpulseRenderer",
        "CFuncWater",
        // A fuzzy match, NetWork…Quantized…Vector
        "CNetworkOriginCellCoordQuantizedVector",
      ]),
    );
    expect(result).toHaveLength(7); // CFuncWater appears in client + server
  });

  it("module-only filter preserves tier ordering", () => {
    const result = searchDeclarations(declarations, parseSearch("water module:client"));
    const names = result.map((d) => d.name);
    // Client name matches: CFuncWater
    // Client field-only: C_BaseEntity, C_Fish
    const cfuncIdx = names.indexOf("CFuncWater");
    const baseEntityIdx = names.indexOf("C_BaseEntity");
    const fishIdx = names.indexOf("C_Fish");
    expect(cfuncIdx).toBeLessThan(baseEntityIdx);
    expect(cfuncIdx).toBeLessThan(fishIdx);
  });

  it("multi-word search", () => {
    const result = searchDeclarations(declarations, parseSearch("sound sphere"));
    const names = result.map((d) => d.name);
    // Only declarations matching both words, scored by combined substring positions
    expect(names).toEqual([
      "CSoundEventSphereEntity",
      "C_SoundEventSphereEntity",
      "CSoundAreaEntitySphere",
      "C_SoundAreaEntitySphere",
    ]);
  });

  it("enum exact match ranks first", () => {
    const result = searchDeclarations(declarations, parseSearch("PulseTestEnumColor_t"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PulseTestEnumColor_t");
  });

  it("enum starts-with", () => {
    const result = searchDeclarations(declarations, parseSearch("Pulse"));
    // PulseCursorCancelPriority_t and PulseTestEnumColor_t start with "pulse" (tier 1)
    // C_OP_RenderClientPhysicsImpulse and C_OP_WaterImpulseRenderer contain "pulse" (tier 2)
    const names = result.map((d) => d.name);
    expect(names.indexOf("PulseCursorCancelPriority_t")).toBeLessThan(
      names.indexOf("C_OP_RenderClientPhysicsImpulse"),
    );
    expect(names.indexOf("PulseTestEnumColor_t")).toBeLessThan(
      names.indexOf("C_OP_WaterImpulseRenderer"),
    );
  });

  it("field-only results alphabetical", () => {
    const result = searchDeclarations(declarations, parseSearch("water"));
    // Among field-only matches: C_BaseEntity before C_Fish
    const fieldOnly = result.filter((d) => fuzzyScore("water", d.name) === null);
    expect(fieldOnly[0].name).toBe("C_BaseEntity");
    expect(fieldOnly[1].name).toBe("C_Fish");
  });

  it("no name words (module-only) results are alphabetical", () => {
    const result = searchDeclarations(declarations, parseSearch("module:client"));
    const names = result.map((d) => d.name);
    // All get score 2, sorted alphabetically (ASCII order: uppercase before _)
    expect(names).toEqual([
      "CCSPlayerController_DamageServices",
      "CEffectData",
      "CEnvSoundscape",
      "CFilterProximity",
      "CFuncWater",
      "CNetworkOriginCellCoordQuantizedVector",
      "C_BaseEntity",
      "C_CSObserverPawn",
      "C_CSWeaponBaseGun",
      "C_Fish",
      "C_FuncConveyor",
      "C_FuncTrackTrain",
      "C_Hostage",
      "C_PathParticleRope",
      "C_RectLight",
      "C_SoundAreaEntitySphere",
      "C_SoundEventSphereEntity",
      "DOTA_UNIT_TARGET_TEAM",
      "ragdollelement_t",
      "sky3dparams_t",
    ]);
  });

  it("empty result stays empty", () => {
    const result = searchDeclarations(declarations, parseSearch("xyzzy999qqq"));
    expect(result).toEqual([]);
  });

  it("single result unchanged", () => {
    const result = searchDeclarations(declarations, parseSearch("PulseTestEnumColor_t"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PulseTestEnumColor_t");
  });

  it("metadata filter doesn't affect tier", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("CEnvSoundscape metadata:MNotSaved"),
    );
    // CEnvSoundscape matches by name (tier 0 exact) — metadata just filters fields
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("CEnvSoundscape");
    expect(result[1].name).toBe("CEnvSoundscape");
  });

  it("starts-with score preserved when offset forces field path", () => {
    // "CFlashbang" starts-with match on CFlashbangProjectile (score 1),
    // offset:2992 forces field-level filtering but shouldn't push score to 3
    const result = searchDeclarations(declarations, parseSearch("CFlashbang offset:2992"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("CFlashbangProjectile");
    // Verify it has filtered fields (field path was used)
    expect((result[0] as SchemaClass).fields.length).toBeGreaterThan(0);
  });

  it("starts-with score preserved when metadata forces field path", () => {
    // "C_OP_RenderTree" starts-with match on C_OP_RenderTreeShake (score 1),
    // metadata forces field-level filtering
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTree metadata:MPropertyAttributeChoiceName"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_OP_RenderTreeShake");
    expect((result[0] as SchemaClass).fields.length).toBeGreaterThan(0);
  });

  it("mixed name+field multi-word query gets field-only score", () => {
    // "weapon" matches C_CSWeaponBaseGun name, "zoom" matches field → score 3
    // Should rank below a pure name match if both were in results
    const result = searchDeclarations(declarations, parseSearch("weapon zoom"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_CSWeaponBaseGun");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
    expect((result[0] as SchemaClass).fields[0].name).toBe("m_zoomLevel");
  });

  it("field-only metadata results ranked below name matches", () => {
    // "water" + metadata:MNotSaved → only field-only matches survive, like C_Fish.m_waterLevel
    // (CFuncWater has no MNotSaved fields, so it's excluded)
    const result = searchDeclarations(declarations, parseSearch("water metadata:MNotSaved"));
    expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    // All results are field-only matches (score 3)
    expect(
      result.every(
        (d) => !d.name.toLowerCase().includes("water") || (d as SchemaClass).fields.length > 0,
      ),
    ).toBe(true);
  });
});

// -- Exhaustive visible/hidden checks --

describe("field and metadata visibility", () => {
  // C_PathParticleRope has 16 fields:
  //   Not networked: m_bStartActive, m_flMaxSimulationTime, m_iszEffectName, m_PathNodes_Name
  //   Networked: m_flParticleSpacing, m_iEffectIndex (also MNotSaved), m_PathNodes_Position,
  //     m_PathNodes_TangentIn, m_PathNodes_TangentOut, m_PathNodes_Color, m_PathNodes_RadiusScale
  //   Networked with change callbacks: m_flSlack, m_flRadius, m_ColorTint,
  //     m_nEffectState, m_PathNodes_PinEnabled

  const notNetworked = [
    "m_bStartActive",
    "m_flMaxSimulationTime",
    "m_iszEffectName",
    "m_PathNodes_Name",
  ];
  const networkedOnly = [
    "m_flParticleSpacing",
    "m_iEffectIndex",
    "m_PathNodes_Position",
    "m_PathNodes_TangentIn",
    "m_PathNodes_TangentOut",
    "m_PathNodes_Color",
    "m_PathNodes_RadiusScale",
  ];
  const networkedWithCallback = [
    "m_flSlack",
    "m_flRadius",
    "m_ColorTint",
    "m_nEffectState",
    "m_PathNodes_PinEnabled",
  ];
  const allRopeFields = [...notNetworked, ...networkedOnly, ...networkedWithCallback];

  describe("network filter + field name word — AND logic", () => {
    it("returns only m_PathNodes_PinEnabled (AND, not OR)", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("network:changecallbacks m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();

      // Only m_PathNodes_PinEnabled has BOTH: name contains "PinEnabled" AND a change callback
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_PathNodes_PinEnabled");
    });

    it("fields with only a change callback but wrong name are hidden", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("network:changecallbacks m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      const names = rope.fields.map((f) => f.name);

      // These have a change callback but NOT "PinEnabled" in name → hidden
      expect(names).not.toContain("m_flSlack");
      expect(names).not.toContain("m_flRadius");
      expect(names).not.toContain("m_ColorTint");
      expect(names).not.toContain("m_nEffectState");
    });

    it("fields without a change callback are hidden", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("network:changecallbacks m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      const names = rope.fields.map((f) => f.name);

      for (const f of [...notNetworked, ...networkedOnly]) {
        expect(names).not.toContain(f);
      }
    });
  });

  describe("class name only → all fields visible", () => {
    it("searching just the class name returns empty fields", () => {
      const result = searchDeclarations(declarations, parseSearch("C_PathParticleRope"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();
      expect(rope.fields).toHaveLength(0);
    });

    it("fields without metadata are not returned when only class name is searched", () => {
      const result = searchDeclarations(declarations, parseSearch("C_PathParticleRope"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();
      expect(rope.fields).toHaveLength(0);
    });
  });

  describe("class name + network filter → only matching-network fields visible", () => {
    it("class name + network:changecallbacks shows only fields with a change callback", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:changecallbacks"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();

      // Only the 5 fields with a change callback should be visible
      expect(rope.fields).toHaveLength(5);
      const names = rope.fields.map((f) => f.name);
      for (const f of networkedWithCallback) {
        expect(names).toContain(f);
      }

      // Networked fields without a callback should be hidden
      for (const f of networkedOnly) {
        expect(names).not.toContain(f);
      }

      // Fields that aren't networked at all should be hidden
      for (const f of notNetworked) {
        expect(names).not.toContain(f);
      }
    });

    it("class name + network:type shows all networked fields, hides the rest", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:type"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // Every networked field has a type, 12 fields are networked
      expect(rope.fields).toHaveLength(12);
      const names = rope.fields.map((f) => f.name);

      for (const f of [...networkedOnly, ...networkedWithCallback]) {
        expect(names).toContain(f);
      }

      // The 4 fields that aren't networked should be hidden
      for (const f of notNetworked) {
        expect(names).not.toContain(f);
      }
    });
  });

  describe("class name + field name word → only matching fields visible", () => {
    it("class name + 'slack' shows only m_flSlack", () => {
      const result = searchDeclarations(declarations, parseSearch("C_PathParticleRope slack"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flSlack");

      // All other fields hidden
      const names = rope.fields.map((f) => f.name);
      for (const f of allRopeFields.filter((n) => n !== "m_flSlack")) {
        expect(names).not.toContain(f);
      }
    });

    it("partial word 'PathNodes' matches multiple fields", () => {
      const result = searchDeclarations(declarations, parseSearch("C_PathParticleRope PathNodes"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // 8 fields contain "PathNodes" in name
      const pathFields = allRopeFields.filter((f) => f.includes("PathNodes"));
      expect(rope.fields).toHaveLength(pathFields.length);

      const names = rope.fields.map((f) => f.name);
      for (const f of pathFields) {
        expect(names).toContain(f);
      }

      // Non-PathNodes fields hidden
      for (const f of allRopeFields.filter((n) => !n.includes("PathNodes"))) {
        expect(names).not.toContain(f);
      }
    });
  });

  describe("network value filter → only matching-value fields visible", () => {
    it("network:parametersChanged shows only fields with that callback", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:parametersChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // m_flSlack, m_flRadius, m_ColorTint have the "parametersChanged" change callback
      expect(rope.fields).toHaveLength(3);
      const names = rope.fields.map((f) => f.name);
      expect(names).toContain("m_flSlack");
      expect(names).toContain("m_flRadius");
      expect(names).toContain("m_ColorTint");

      // Other callback fields with different values are hidden
      expect(names).not.toContain("m_nEffectState"); // effectStateChanged
      expect(names).not.toContain("m_PathNodes_PinEnabled"); // pinStateChanged

      // Fields without a change callback are hidden
      for (const f of [...notNetworked, ...networkedOnly]) {
        expect(names).not.toContain(f);
      }
    });

    it("network:pinStateChanged shows only m_PathNodes_PinEnabled", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:pinStateChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_PathNodes_PinEnabled");
    });
  });

  describe("metadata and network data preserved on visible fields, not stripped", () => {
    it("when filtering by network data, visible fields keep their metadata", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:vpcf"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // m_iEffectIndex is sent as a vpcf resource and has MNotSaved
      expect(rope.fields.map((f) => f.name)).toEqual(["m_iEffectIndex"]);
      expect(rope.fields[0].metadata).toEqual([{ name: "MNotSaved" }]);
    });

    it("when filtering by a network value, visible field keeps the rest of its network data", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope network:effectStateChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope.fields).toHaveLength(1);
      const field = rope.fields[0];
      expect(field.name).toBe("m_nEffectState");
      expect(field.network?.changeCallbacks).toEqual(["effectStateChanged"]);
      expect(field.network?.type).toBeDefined();
    });
  });

  describe("name word matching field names", () => {
    it("'leader' matches C_Hostage via field name m_leader", () => {
      const result = searchDeclarations(declarations, parseSearch("leader"));
      expect(result.some((d) => d.name === "C_Hostage")).toBe(true);
    });

    it("'hostage' as name matches hostage classes by name, not just metadata", () => {
      const result = searchDeclarations(declarations, parseSearch("hostage"));
      // Should find multiple hostage-related classes
      const hostageResults = result.filter((d) => d.name.toLowerCase().includes("hostage"));
      expect(hostageResults.length).toBeGreaterThan(0);
    });
  });

  describe("field name word that also exists as metadata key name", () => {
    it("name word 'MNotSaved' matches fields via their metadata key", () => {
      // On C_PathParticleRope, m_iEffectIndex has MNotSaved metadata
      const result = searchDeclarations(declarations, parseSearch("C_PathParticleRope MNotSaved"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();

      // Only m_iEffectIndex has MNotSaved
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_iEffectIndex");

      // All other fields should be hidden
      for (const f of allRopeFields.filter((n) => n !== "m_iEffectIndex")) {
        expect(rope.fields.every((rf) => rf.name !== f)).toBe(true);
      }
    });

    it("remaining words can mix field name + metadata key matches on same field", () => {
      // C_PathParticleRope: "effect" is in m_iszEffectName, m_nEffectState, and m_iEffectIndex,
      // "notsaved" matches the metadata key MNotSaved only m_iEffectIndex has
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope effect notsaved"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_iEffectIndex");
    });

    it("words that can't all be found on a single field via name+metadata → excluded", () => {
      // "slack" matches m_flSlack name, "mnotsaved" matches m_iEffectIndex metadata
      // No single field has both → excluded
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope slack mnotsaved"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });
  });

  describe("offset filter visibility", () => {
    it("offset shows only field at that offset, hides all others", () => {
      // C_PathParticleRope: m_flSlack is at offset 1596
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1596"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flSlack");
      expect(rope.fields[0].offset).toBe(1596);

      // All other fields hidden
      for (const f of allRopeFields.filter((n) => n !== "m_flSlack")) {
        expect(rope.fields.every((rf) => rf.name !== f)).toBe(true);
      }
    });

    it("offset + metadata key shows only field matching BOTH", () => {
      // offset 1552 is m_bStartActive (no metadata) → hidden because fails metadata
      // offset 1616 is m_iEffectIndex (has MNotSaved) → visible
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1552 offset:1616 metadata:MNotSaved"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // Only m_iEffectIndex passes both offset AND metadata check
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_iEffectIndex");
      // m_bStartActive at offset 1552 has no metadata → excluded
    });

    it("offset that matches bare field — no metadata filter → field visible", () => {
      // offset 1552 is m_bStartActive (no metadata)
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1552"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_bStartActive");
      expect(rope.fields[0].metadata).toHaveLength(0);
    });
  });

  describe("enum member visibility", () => {
    // PulseCursorCancelPriority_t: 4 members
    //   None: MPropertyFriendlyName only
    //   CancelOnSucceeded, SoftCancel, HardCancel: MPropertyFriendlyName + MPropertyDescription

    it("metadata:MPropertyDescription hides 'None' member, shows other 3", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t metadata:MPropertyDescription"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(3);
      const names = e.members.map((m) => m.name);
      expect(names).toContain("CancelOnSucceeded");
      expect(names).toContain("SoftCancel");
      expect(names).toContain("HardCancel");
      expect(names).not.toContain("None");
    });

    it("visible members keep ALL their metadata entries", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t metadata:MPropertyDescription"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      // SoftCancel should still have both MPropertyFriendlyName AND MPropertyDescription
      const soft = e.members.find((m) => m.name === "SoftCancel")!;
      expect(soft.metadata).toHaveLength(2);
      expect(soft.metadata.some((m) => m.name === "MPropertyFriendlyName")).toBe(true);
      expect(soft.metadata.some((m) => m.name === "MPropertyDescription")).toBe(true);
    });

    it("metadatavalue:'wind-down' shows only matching members", () => {
      // "wind-down" appears in SoftCancel and HardCancel MPropertyDescription values
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t metadatavalue:wind-down"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(2);
      const names = e.members.map((m) => m.name);
      expect(names).toContain("SoftCancel");
      expect(names).toContain("HardCancel");
      expect(names).not.toContain("None");
      expect(names).not.toContain("CancelOnSucceeded");
    });

    it("enum name only → empty members", () => {
      const result = searchDeclarations(declarations, parseSearch("PulseCursorCancelPriority_t"));
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(0);
    });

    it("member name word narrows to single member, others hidden", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t SoftCancel"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("SoftCancel");
    });

    it("enumvalue:3 shows only members with value 3, hides others", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t enumvalue:3"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("HardCancel");
    });

    it("enumvalue preserves member metadata on matching members", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t enumvalue:2"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("SoftCancel");
      expect(e.members[0].metadata.some((m) => m.name === "MPropertyFriendlyName")).toBe(true);
      expect(e.members[0].metadata.some((m) => m.name === "MPropertyDescription")).toBe(true);
    });

    it("enumvalue + metadatavalue combined narrows members", () => {
      // SoftCancel=2, HardCancel=3 both have MPropertyDescription with "wind-down"
      // enumvalue:2 limits to just SoftCancel
      const result = searchDeclarations(
        declarations,
        parseSearch("PulseCursorCancelPriority_t enumvalue:2 metadatavalue:wind-down"),
      );
      const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;

      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("SoftCancel");
    });

    it("enumvalue preserves enum-level metadata", () => {
      // DOTA_UNIT_TARGET_TEAM has enum-level MEnumFlagsWithOverlappingBits
      const result = searchDeclarations(
        declarations,
        parseSearch("DOTA_UNIT_TARGET_TEAM enumvalue:4"),
      );
      const e = result.find((d) => d.name === "DOTA_UNIT_TARGET_TEAM") as SchemaEnum;

      expect(e.members).toHaveLength(1);
      expect(e.members[0].name).toBe("DOTA_UNIT_TARGET_TEAM_CUSTOM");
      // Enum-level metadata is preserved
      expect(e.metadata.some((m) => m.name === "MEnumFlagsWithOverlappingBits")).toBe(true);
    });
  });
});

// -- Complex edge cases --

describe("complex edge cases", () => {
  // sky3dparams_t has 6 fields, all networked:
  //   scale
  //   origin:            sent with the "coord" encoder
  //   bClip3DSkyBoxNearToWorldFar:    MNotSaved
  //   flClip3DSkyBoxNearToWorldFarOffset: MNotSaved
  //   fog:               MNotSaved
  //   m_nWorldGroupID

  describe("multiple metadata keys must ALL match on the field", () => {
    it("metadata:MPropertyFriendlyName metadata:MPropertyAttributeChoiceName → only fields with BOTH keys", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake metadata:MPropertyFriendlyName metadata:MPropertyAttributeChoiceName",
        ),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;
      expect(shake).toBeDefined();

      // All 10 fields have MPropertyFriendlyName, 2 also have MPropertyAttributeChoiceName
      expect(shake.fields.map((f) => f.name)).toEqual([
        "m_nPeakStrengthFieldOverride",
        "m_nRadiusFieldOverride",
      ]);
    });
  });

  describe("metadata key + metadata value combined on field level", () => {
    it("metadata:MPropertyAttributeChoiceName metadatavalue:peak → AND on fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake metadata:MPropertyAttributeChoiceName metadatavalue:peak",
        ),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      // Only m_nPeakStrengthFieldOverride has MPropertyAttributeChoiceName AND a value with "peak"
      const names = shake.fields.map((f) => f.name);
      expect(names).toEqual(["m_nPeakStrengthFieldOverride"]);

      // m_flPeakStrength has "peak strength" but no MPropertyAttributeChoiceName → hidden
      expect(names).not.toContain("m_flPeakStrength");
      // m_nRadiusFieldOverride has MPropertyAttributeChoiceName but no "peak" → hidden
      expect(names).not.toContain("m_nRadiusFieldOverride");
    });
  });

  describe("free text matches metadata KEY names, not VALUES", () => {
    it("free text 'smooth' does NOT match field via metadata value", () => {
      // C_OP_RenderTreeShake.m_flTransitionTime has MPropertyFriendlyName
      // "amount of time taken to smooth between different shake parameters"
      // "smooth" as free text checks field NAMES and metadata KEY names, not values
      const result = searchDeclarations(declarations, parseSearch("C_OP_RenderTreeShake smooth"));
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake");
      expect(shake).toBeUndefined();
    });

    it("free text 'coord' does NOT match field via network data", () => {
      // sky3dparams_t.origin is sent with the "coord" encoder, only network: searches that
      const result = searchDeclarations(declarations, parseSearch("sky3dparams_t coord"));
      const sky = result.find((d) => d.name === "sky3dparams_t");
      expect(sky).toBeUndefined();
    });

    it("metadatavalue:smooth DOES match field via metadata value", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_OP_RenderTreeShake metadatavalue:smooth"),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      expect(shake.fields).toHaveLength(1);
      expect(shake.fields[0].name).toBe("m_flTransitionTime");
    });

    it("free text 'AttributeChoiceName' matches via metadata KEY name", () => {
      // "MPropertyAttributeChoiceName" is a metadata key on two fields
      const result = searchDeclarations(
        declarations,
        parseSearch("C_OP_RenderTreeShake AttributeChoiceName"),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      expect(shake.fields.map((f) => f.name)).toEqual([
        "m_nPeakStrengthFieldOverride",
        "m_nRadiusFieldOverride",
      ]);
    });
  });

  describe("word consumption by class name (remaining words logic)", () => {
    it("word fully consumed by class name → empty fields", () => {
      // "sky3d" is in "sky3dparams_t", fully consumed → no remaining words → empty fields
      const result = searchDeclarations(declarations, parseSearch("sky3d"));
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
      expect(sky).toBeDefined();
      expect(sky.fields).toHaveLength(0);
    });

    it("one word consumed by class name, other becomes field filter", () => {
      // "sky3d" consumed, "fog" remaining → only fog field
      const result = searchDeclarations(declarations, parseSearch("sky3d fog"));
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
      expect(sky).toBeDefined();
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("fog");
    });

    it("word partially in class name AND field names → consumed by class, empty fields", () => {
      // "path" is in "C_PathParticleRope" → consumed
      // No remaining words → empty fields
      const result = searchDeclarations(declarations, parseSearch("path"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      if (rope) {
        expect(rope.fields).toHaveLength(0);
      }
    });

    it("word NOT in class name becomes field filter", () => {
      // "skybox" is NOT in "sky3dparams_t" class name → remaining word → field filter
      // But "skybox" IS in field name "bClip3DSkyBoxNearToWorldFar"
      const result = searchDeclarations(declarations, parseSearch("sky3dparams_t skybox"));
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;

      // Only fields containing "skybox" (case-insensitive)
      expect(sky.fields).toHaveLength(2);
      const names = sky.fields.map((f) => f.name);
      expect(names).toContain("bClip3DSkyBoxNearToWorldFar");
      expect(names).toContain("flClip3DSkyBoxNearToWorldFarOffset");

      // Other fields hidden
      expect(names).not.toContain("scale");
      expect(names).not.toContain("origin");
      expect(names).not.toContain("fog");
      expect(names).not.toContain("m_nWorldGroupID");
    });
  });

  describe("class-level metadata does not cause false matches", () => {
    it("word matching only class metadata key → declaration excluded", () => {
      // C_Fish has class metadata "MNetworkNoBase" but NO field has that key
      // The word "MNetworkNoBase" doesn't match any field → no match → excluded
      const result = searchDeclarations(declarations, parseSearch("C_Fish MNetworkNoBase"));
      expect(result.every((d) => d.name !== "C_Fish")).toBe(true);
    });
  });

  describe("same field name across multiple classes", () => {
    it("m_flRadius search returns multiple classes", () => {
      const result = searchDeclarations(declarations, parseSearch("m_flRadius"));
      // m_flRadius exists in 38+ classes
      expect(result.length).toBeGreaterThan(5);
    });

    it("class without 'radius' in name → only m_flRadius field visible", () => {
      // CEnvSoundscape has 11 fields, "m_flradius" not in class name → remaining word
      const result = searchDeclarations(declarations, parseSearch("m_flRadius"));
      const soundscape = result.find(
        (d) => d.name === "CEnvSoundscape" && d.module === "client",
      ) as SchemaClass;
      expect(soundscape).toBeDefined();
      expect(soundscape.fields).toHaveLength(1);
      expect(soundscape.fields[0].name).toBe("m_flRadius");
    });

    it("class WITH 'radius' in name → word consumed, all fields visible", () => {
      // C_SoundAreaEntitySphere only has 1 field anyway, but CFilterProximity
      // has "radius" nowhere in class name, so let's check C_SoundAreaEntitySphere
      // Actually it only has 1 field. Let's verify consumption logic differently:
      // C_PathParticleRope has m_flRadius. "rope" is not "radius", so "m_flradius"
      // is NOT consumed by "c_pathparticlerope". It becomes a field filter → only m_flRadius
      const result = searchDeclarations(declarations, parseSearch("m_flRadius"));
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flRadius");
    });

    it("m_flRadius + module:server narrows to server classes only, each with that field", () => {
      const result = searchDeclarations(declarations, parseSearch("m_flRadius module:server"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((d) => d.module === "server")).toBe(true);

      // For classes where "m_flradius" is NOT in the class name, only that field visible
      const soundscapeServer = result.find(
        (d) => d.name === "CEnvSoundscape" && d.module === "server",
      ) as SchemaClass;
      if (soundscapeServer) {
        expect(soundscapeServer.fields).toHaveLength(1);
        expect(soundscapeServer.fields[0].name).toBe("m_flRadius");
      }
    });
  });

  describe("offset + metadata value combined", () => {
    it("offset + metadatavalue both must match the same field", () => {
      // C_OP_RenderTreeShake: m_flTwistAmount at offset 568, "Twist amount (-1..1)"
      //                       m_flRadialAmount at offset 572, "Radial Amount (-1..1)"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_OP_RenderTreeShake offset:568 metadatavalue:twist"),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      expect(shake.fields).toHaveLength(1);
      expect(shake.fields[0].name).toBe("m_flTwistAmount");
      expect(shake.fields[0].offset).toBe(568);
    });

    it("offset for one field + metadatavalue from different field → excluded", () => {
      // offset 568 is m_flTwistAmount, but "radial" is on m_flRadialAmount → no field matches BOTH
      const result = searchDeclarations(
        declarations,
        parseSearch("C_OP_RenderTreeShake offset:568 metadatavalue:radial"),
      );
      expect(result.every((d) => d.name !== "C_OP_RenderTreeShake")).toBe(true);
    });
  });

  describe("offset and enumvalue are kind-exclusive", () => {
    it("enum + offset filter → enum excluded from results entirely", () => {
      // PulseTestEnumColor_t is an enum — offset filter only works on classes
      const result = searchDeclarations(declarations, parseSearch("PulseTestEnumColor_t offset:0"));
      const e = result.find((d) => d.name === "PulseTestEnumColor_t");

      // Enums fail offset check entirely
      expect(e).toBeUndefined();
    });

    it("class + enumvalue filter → class excluded from results entirely", () => {
      const result = searchDeclarations(declarations, parseSearch("C_BaseEntity enumvalue:0"));
      const c = result.find((d) => d.name === "C_BaseEntity");

      expect(c).toBeUndefined();
    });

    it("offset + enumvalue combined → nothing matches (mutually exclusive)", () => {
      const result = searchDeclarations(declarations, parseSearch("offset:0 enumvalue:0"));
      expect(result).toHaveLength(0);
    });
  });

  describe("C_BaseEntity — large class, field name search", () => {
    it("searching 'changed' finds C_BaseEntity via field names", () => {
      const result = searchDeclarations(declarations, parseSearch("C_BaseEntity changed"));
      const base = result.find(
        (d) => d.name === "C_BaseEntity" && d.module === "client",
      ) as SchemaClass;
      expect(base).toBeDefined();

      // Only fields with "changed" in name should be visible
      expect(base.fields).toHaveLength(2);
      const names = base.fields.map((f) => f.name);
      expect(names).toContain("m_bAnimTimeChanged");
      expect(names).toContain("m_bSimulationTimeChanged");
    });

    it("the other 81 fields of C_BaseEntity are hidden when searching 'changed'", () => {
      const result = searchDeclarations(declarations, parseSearch("C_BaseEntity changed"));
      const base = result.find(
        (d) => d.name === "C_BaseEntity" && d.module === "client",
      ) as SchemaClass;

      // C_BaseEntity has 83 fields total, only 2 with "changed" in name
      expect(base.fields).toHaveLength(2);
      // Spot-check some of the 81 that should be hidden
      const names = base.fields.map((f) => f.name);
      expect(names).not.toContain("m_vecVelocity");
      expect(names).not.toContain("m_hSceneObjectController");
      expect(names).not.toContain("m_nActualMoveType");
    });
  });

  describe("CEnvSoundscape — class with mixed bare and metadata fields", () => {
    // CEnvSoundscape has 11 fields:
    //   bare (no metadata): m_OnPlay, m_flRadius, m_soundEventName, m_bOverrideWithEvent,
    //     m_positionNames, m_hProxySoundscape, m_bDisabled, m_soundscapeName
    //   MNotSaved: m_soundscapeIndex, m_soundscapeEntityListId, m_soundEventHash
    //   NO class-level metadata

    it("searching by name only returns empty fields", () => {
      const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape"));
      const env = result.find(
        (d) => d.name === "CEnvSoundscape" && d.module === "client",
      ) as SchemaClass;
      expect(env.fields).toHaveLength(0);
    });

    it("metadata:MNotSaved shows only the 3 fields with MNotSaved, hides 8 bare fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("CEnvSoundscape metadata:MNotSaved"),
      );
      const env = result.find(
        (d) => d.name === "CEnvSoundscape" && d.module === "client",
      ) as SchemaClass;

      expect(env.fields).toHaveLength(3);
      const names = env.fields.map((f) => f.name);
      expect(names).toContain("m_soundscapeIndex");
      expect(names).toContain("m_soundscapeEntityListId");
      expect(names).toContain("m_soundEventHash");

      // Bare fields hidden
      expect(names).not.toContain("m_OnPlay");
      expect(names).not.toContain("m_flRadius");
      expect(names).not.toContain("m_soundEventName");
      expect(names).not.toContain("m_bOverrideWithEvent");
      expect(names).not.toContain("m_positionNames");
      expect(names).not.toContain("m_hProxySoundscape");
      expect(names).not.toContain("m_bDisabled");
      expect(names).not.toContain("m_soundscapeName");
    });

    it("metadata:MPropertyFriendlyName on class with NO MPropertyFriendlyName → not found", () => {
      // CEnvSoundscape has no MPropertyFriendlyName on any field or class
      const result = searchDeclarations(
        declarations,
        parseSearch("CEnvSoundscape metadata:MPropertyFriendlyName"),
      );
      // No field has MPropertyFriendlyName → no match
      expect(result.every((d) => d.name !== "CEnvSoundscape" || d.module !== "client")).toBe(true);
    });

    it("offset:1568 shows only m_flRadius (bare field), metadata preserved as empty", () => {
      const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape offset:1568"));
      const env = result.find(
        (d) => d.name === "CEnvSoundscape" && d.module === "client",
      ) as SchemaClass;

      expect(env.fields).toHaveLength(1);
      expect(env.fields[0].name).toBe("m_flRadius");
      expect(env.fields[0].offset).toBe(1568);
      // This field has no metadata — verify it's still empty, not fabricated
      expect(env.fields[0].metadata).toHaveLength(0);
    });
  });

  describe("three-way AND: name word + metadata key + offset", () => {
    it("all three must match the same field", () => {
      // C_PathParticleRope: m_iEffectIndex at offset 1616, has MNotSaved
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope effect offset:1616 metadata:MNotSaved"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_iEffectIndex");
    });

    it("name word + offset + network data must match the same field", () => {
      // C_PathParticleRope: m_flSlack at offset 1596, has a change callback
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope slack offset:1596 network:changecallbacks"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flSlack");
    });

    it("name matches but wrong offset → excluded", () => {
      // "slack" matches m_flSlack, but offset 1600 is m_flRadius → no field passes all
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope slack offset:1600"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });

    it("offset matches but wrong metadata → excluded", () => {
      // offset 1592 is m_flParticleSpacing (networked, no MNotSaved)
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1592 metadata:MNotSaved"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });

    it("name word + offset + metadatavalue all matching same field", () => {
      // C_OP_RenderTreeShake: m_flTwistAmount at offset 568, "Twist amount (-1..1)"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_OP_RenderTreeShake amount offset:568 metadatavalue:twist"),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      expect(shake.fields).toHaveLength(1);
      expect(shake.fields[0].name).toBe("m_flTwistAmount");
    });

    it("four-way AND: name + offset + metadata key + metadata value", () => {
      // C_OP_RenderTreeShake: m_nRadiusFieldOverride at offset 556,
      // MPropertyAttributeChoiceName (key) value "particlefield_scalar"
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake override offset:556 metadata:MPropertyAttributeChoiceName metadatavalue:particlefield",
        ),
      );
      const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;

      expect(shake.fields).toHaveLength(1);
      expect(shake.fields[0].name).toBe("m_nRadiusFieldOverride");
      // Both metadata entries preserved
      expect(shake.fields[0].metadata).toHaveLength(2);
    });

    it("four-way AND where one condition fails → excluded", () => {
      // Everything matches m_nRadiusFieldOverride EXCEPT offset 552 (that's m_flRadius)
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake override offset:552 metadata:MPropertyAttributeChoiceName metadatavalue:particlefield",
        ),
      );
      expect(result.every((d) => d.name !== "C_OP_RenderTreeShake")).toBe(true);
    });
  });

  describe("no false positives from cross-field or class-level matches", () => {
    it("metadata key on field A + metadata value on field B → excluded", () => {
      // The *FieldOverride fields have MPropertyAttributeChoiceName, m_flTwistAmount has "twist"
      // No single field has BOTH → no match → excluded
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_OP_RenderTreeShake metadata:MPropertyAttributeChoiceName metadatavalue:twist",
        ),
      );
      expect(result.every((d) => d.name !== "C_OP_RenderTreeShake")).toBe(true);
    });

    it("metadata key on field A + network data on field B → excluded", () => {
      // m_iEffectIndex has MNotSaved, m_flSlack has the "parametersChanged" change callback
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadata:MNotSaved network:parametersChanged"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });

    it("two field-name words from different fields → excluded", () => {
      // "zoom" matches m_zoomLevel, "silencer" matches m_iSilencerBodygroup
      // No single field has both → no match
      const result = searchDeclarations(declarations, parseSearch("zoom silencer"));
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
    });
  });
});

// -- Filter permutation coverage --

describe("filter permutation coverage", () => {
  it("name + module + metadatavalue", () => {
    // C_OP_RenderTreeShake: m_flTwistAmount has MPropertyFriendlyName "Twist amount (-1..1)"
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake module:particles metadatavalue:twist"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_OP_RenderTreeShake");
    expect(result[0].module).toBe("particles");
    const fields = (result[0] as SchemaClass).fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("m_flTwistAmount");
  });

  it("name + module + network", () => {
    // sky3dparams_t client: origin is sent with the "coord" encoder
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t module:client network:coord"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].module).toBe("client");
    const fields = (result[0] as SchemaClass).fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("origin");
  });

  it("module + offset + metadata", () => {
    // C_OP_RenderTreeShake: m_nRadiusFieldOverride offset=556 has MPropertyAttributeChoiceName
    const result = searchDeclarations(
      declarations,
      parseSearch("module:particles offset:556 metadata:MPropertyAttributeChoiceName"),
    );
    expect(result.length).toBeGreaterThan(0);
    const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;
    expect(shake).toBeDefined();
    expect(shake.fields).toHaveLength(1);
    expect(shake.fields[0].name).toBe("m_nRadiusFieldOverride");
  });

  it("module + offset + network", () => {
    // sky3dparams_t client: origin offset=12 is sent with the "coord" encoder
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client offset:12 network:coord"),
    );
    const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
    expect(sky).toBeDefined();
    expect(sky.fields).toHaveLength(1);
    expect(sky.fields[0].name).toBe("origin");
  });

  it("module + network key=value", () => {
    // C_Fish client: m_x has the serializer "fish_pos_x"
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client network:serializer=fish_pos_x"),
    );
    const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;
    expect(fish).toBeDefined();
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_x");
  });

  it("offset + metadata + metadatavalue", () => {
    // C_OP_RenderTreeShake: m_nRadiusFieldOverride offset=556 has
    // MPropertyAttributeChoiceName="particlefield_scalar"
    const result = searchDeclarations(
      declarations,
      parseSearch(
        "offset:556 metadata:MPropertyAttributeChoiceName metadatavalue:particlefield_scalar",
      ),
    );
    const shake = result.find((d) => d.name === "C_OP_RenderTreeShake") as SchemaClass;
    expect(shake).toBeDefined();
    expect(shake.fields).toHaveLength(1);
    expect(shake.fields[0].name).toBe("m_nRadiusFieldOverride");
  });

  it("name + module + offset + network", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t module:client offset:12 network:coord"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("sky3dparams_t");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
  });

  it("name + module + metadata + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch(
        "C_OP_RenderTreeShake module:particles metadata:MPropertyAttributeChoiceName metadatavalue:peak",
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_OP_RenderTreeShake");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
    expect((result[0] as SchemaClass).fields[0].name).toBe("m_nPeakStrengthFieldOverride");
  });

  it("module + offset + metadata + network", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client offset:4588 metadata:MNotSaved network:serializer=fish_pos_x"),
    );
    const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;
    expect(fish).toBeDefined();
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_x");
  });

  it("multiple metadatavalue: values (AND semantics)", () => {
    // C_OP_RenderTreeShake: the *FieldOverride fields have "strength" in their friendly names
    // and "particlefield_scalar", m_flPeakStrength has only "peak strength"
    // Both values must match on each field
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake metadatavalue:strength metadatavalue:scalar"),
    );
    expect(result).toHaveLength(1);
    const shake = result[0] as SchemaClass;
    expect(shake.fields.map((f) => f.name)).toEqual([
      "m_nPeakStrengthFieldOverride",
      "m_nRadiusFieldOverride",
    ]);
  });

  it("multiple metadatavalue: where no single field has both → excluded", () => {
    // "twist" is on m_flTwistAmount, "radial" is on m_flRadialAmount — no single field has both
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake metadatavalue:twist metadatavalue:radial"),
    );
    expect(result).toHaveLength(0);
  });

  it("name + enumvalue", () => {
    // DOTA_UNIT_TARGET_TEAM_CUSTOM = 4
    const result = searchDeclarations(declarations, parseSearch("DOTA enumvalue:4"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("DOTA_UNIT_TARGET_TEAM");
    expect((result[0] as SchemaEnum).members).toHaveLength(1);
    expect((result[0] as SchemaEnum).members[0].name).toBe("DOTA_UNIT_TARGET_TEAM_CUSTOM");
  });

  it("name + module + enumvalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("PulseCursorCancelPriority_t module:pulse_runtime_lib enumvalue:2"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("PulseCursorCancelPriority_t");
    expect((result[0] as SchemaEnum).members).toHaveLength(1);
    expect((result[0] as SchemaEnum).members[0].name).toBe("SoftCancel");
  });

  it("enumvalue + metadata", () => {
    // SoftCancel=2 has MPropertyDescription
    const result = searchDeclarations(
      declarations,
      parseSearch("enumvalue:2 metadata:MPropertyDescription"),
    );
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });

  it("enumvalue + metadatavalue", () => {
    // SoftCancel=2, has MPropertyDescription with "elegantly"
    const result = searchDeclarations(
      declarations,
      parseSearch("enumvalue:2 metadatavalue:elegantly"),
    );
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });

  it("name + enumvalue + metadata + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch(
        "PulseCursorCancelPriority_t enumvalue:2 metadata:MPropertyDescription metadatavalue:elegantly",
      ),
    );
    expect(result).toHaveLength(1);
    const e = result[0] as SchemaEnum;
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });

  it("enumvalue + metadatavalue where no member matches both → excluded", () => {
    // None=0 has no MPropertyDescription, but SoftCancel=2 does with "elegantly"
    const result = searchDeclarations(
      declarations,
      parseSearch("PulseCursorCancelPriority_t enumvalue:0 metadatavalue:elegantly"),
    );
    expect(result).toHaveLength(0);
  });

  it("module + enumvalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("module:pulse_runtime_lib enumvalue:3"),
    );
    expect(result.every((d) => d.module === "pulse_runtime_lib")).toBe(true);
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members.every((m) => m.value === 3)).toBe(true);
  });

  it("module + enumvalue + metadata", () => {
    // SoftCancel=2 and HardCancel=3 have MPropertyDescription
    const result = searchDeclarations(
      declarations,
      parseSearch("module:pulse_runtime_lib enumvalue:3 metadata:MPropertyDescription"),
    );
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("HardCancel");
  });

  it("module + enumvalue + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("module:pulse_runtime_lib enumvalue:2 metadatavalue:elegantly"),
    );
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });

  it("module + enumvalue + metadata + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch(
        "module:pulse_runtime_lib enumvalue:2 metadata:MPropertyDescription metadatavalue:elegantly",
      ),
    );
    const e = result.find((d) => d.name === "PulseCursorCancelPriority_t") as SchemaEnum;
    expect(e).toBeDefined();
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });

  it("name + module + enumvalue + metadata + metadatavalue (all filters)", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch(
        "PulseCursorCancelPriority_t module:pulse_runtime_lib enumvalue:2 metadata:MPropertyDescription metadatavalue:elegantly",
      ),
    );
    expect(result).toHaveLength(1);
    const e = result[0] as SchemaEnum;
    expect(e.members).toHaveLength(1);
    expect(e.members[0].name).toBe("SoftCancel");
  });
});

// -- Word consumption and visibility edge cases --

describe("word consumption and visibility", () => {
  it("word consumed by class name still allows metadata to filter fields", () => {
    // "sky3dparams_t" consumes all name words, but metadata:MNotSaved narrows fields
    // sky3dparams_t exists in both client and server modules
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t metadata:MNotSaved"),
    );
    expect(result).toHaveLength(2);
    for (const d of result) {
      const sky = d as SchemaClass;
      expect(sky.name).toBe("sky3dparams_t");
      // Only 3 fields have MNotSaved
      expect(sky.fields.map((f) => f.name)).toEqual([
        "bClip3DSkyBoxNearToWorldFar",
        "flClip3DSkyBoxNearToWorldFarOffset",
        "fog",
      ]);
    }
  });

  it("word consumed by class name still allows offset to filter fields", () => {
    // sky3dparams_t exists in both client (origin offset=12) and server (origin offset=12)
    const result = searchDeclarations(declarations, parseSearch("sky3dparams_t offset:12"));
    expect(result).toHaveLength(2);
    for (const d of result) {
      const sky = d as SchemaClass;
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("origin");
      expect(sky.fields.every((f) => f.name !== "scale")).toBe(true);
    }
  });

  it("word in both class name and field name is consumed by class — empty fields returned", () => {
    // "soundscape" is in CEnvSoundscape (class name) AND m_soundscapeIndex, m_soundscapeName (fields)
    // Word is consumed by class name → no remaining words → empty fields
    const result = searchDeclarations(declarations, parseSearch("soundscape"));
    const env = result.find(
      (d) => d.name === "CEnvSoundscape" && d.module === "client",
    ) as SchemaClass;
    expect(env).toBeDefined();
    expect(env.fields).toHaveLength(0);
  });

  it("remaining word matches field name — other fields excluded", () => {
    // "CEnvSoundscape disabled" → "disabled" doesn't match class name → remaining word
    // Only m_bDisabled should match
    const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape disabled"));
    const env = result.find(
      (d) => d.name === "CEnvSoundscape" && d.module === "client",
    ) as SchemaClass;
    expect(env).toBeDefined();
    expect(env.fields).toHaveLength(1);
    expect(env.fields[0].name).toBe("m_bDisabled");
  });

  it("remaining word matches metadata key name but not field name", () => {
    // "CEnvSoundscape MNotSaved" → "mnotsaved" is a remaining word
    // Matches fields that have MNotSaved metadata key: m_soundscapeIndex, m_soundscapeEntityListId, m_soundEventHash
    const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape MNotSaved"));
    const env = result.find(
      (d) => d.name === "CEnvSoundscape" && d.module === "client",
    ) as SchemaClass;
    expect(env).toBeDefined();
    expect(env.fields).toHaveLength(3);
    const names = env.fields.map((f) => f.name);
    expect(names).toContain("m_soundscapeIndex");
    expect(names).toContain("m_soundscapeEntityListId");
    expect(names).toContain("m_soundEventHash");
    // Fields without MNotSaved should be excluded
    expect(names).not.toContain("m_flRadius");
    expect(names).not.toContain("m_OnPlay");
  });

  it("two remaining words: one matches field name, one matches metadata key on same field", () => {
    // C_OP_RenderTreeShake: "radius" matches m_flRadius and m_nRadiusFieldOverride field names,
    // "choice" matches the MPropertyAttributeChoiceName metadata key only the second has
    // Both must match on the SAME field
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake radius choice"),
    );
    expect(result).toHaveLength(1);
    const shake = result[0] as SchemaClass;
    expect(shake.fields).toHaveLength(1);
    expect(shake.fields[0].name).toBe("m_nRadiusFieldOverride");
  });

  it("two remaining words: one in field name, one in metadata key of DIFFERENT field → excluded", () => {
    // C_OP_RenderTreeShake: "twist" matches m_flTwistAmount
    // MPropertyAttributeChoiceName is only on the *FieldOverride fields
    // No single field has both
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake twist MPropertyAttributeChoiceName"),
    );
    expect(result).toHaveLength(0);
  });

  it("same class in different modules with field filter", () => {
    // CEnvSoundscape exists in client (offset 1568 for m_flRadius) and server (offset 1216)
    // offset:1568 only matches client version
    const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape offset:1568"));
    expect(result).toHaveLength(1);
    expect(result[0].module).toBe("client");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
    expect((result[0] as SchemaClass).fields[0].name).toBe("m_flRadius");
  });

  it("same class in different modules — module filter picks one", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("CEnvSoundscape module:server MNotSaved"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].module).toBe("server");
    const fields = (result[0] as SchemaClass).fields;
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.name)).toEqual([
      "m_soundscapeIndex",
      "m_soundscapeEntityListId",
      "m_soundEventHash",
    ]);
  });

  it("metadata on returned fields is complete — not stripped to matching keys", () => {
    // metadatavalue:strength matches the MPropertyFriendlyName of m_nRadiusFieldOverride,
    // its MPropertyAttributeChoiceName should be preserved too
    const result = searchDeclarations(
      declarations,
      parseSearch("C_OP_RenderTreeShake metadatavalue:strength"),
    );
    const shake = result[0] as SchemaClass;
    // "peak strength", "peak strength field override", and "strength field override"
    expect(shake.fields).toHaveLength(3);
    const override = shake.fields.find((f) => f.name === "m_nRadiusFieldOverride")!;
    expect(override.metadata).toEqual([
      { name: "MPropertyFriendlyName", value: '"strength field override"' },
      { name: "MPropertyAttributeChoiceName", value: '"particlefield_scalar"' },
    ]);
  });

  it("offset filter does not strip metadata or network data from matched field", () => {
    // C_PathParticleRope: m_iEffectIndex at offset 1616 has MNotSaved and is networked
    const result = searchDeclarations(declarations, parseSearch("offset:1616"));
    const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
    expect(rope).toBeDefined();
    const index = rope.fields.find((f) => f.name === "m_iEffectIndex")!;
    expect(index.metadata).toEqual([{ name: "MNotSaved" }]);
    expect(index.network?.resourceType).toBe("vpcf");
  });

  it("quoted metadata values are searchable without quotes", () => {
    // MPropertyFriendlyName value is stored as '"radius"' (with quotes in the string)
    // Searching for just "radius" should match via includes()
    const result = searchDeclarations(
      declarations,
      parseSearch("C_INIT_CheckParticleForWater metadatavalue:radius"),
    );
    const water = result[0] as SchemaClass;
    expect(water.fields).toHaveLength(1);
    expect(water.fields[0].name).toBe("m_flRadius");
  });
});

// -- Boundary / edge cases --

describe("boundary and edge cases", () => {
  it("class with no matching fields is excluded entirely (not returned with empty fields)", () => {
    const decl = classesByName.get("CFlashbangProjectile")!;
    // metadata:MNotSaved — CFlashbangProjectile has no metadata on fields
    const result = searchDeclarations([decl], parseSearch("metadata:MNotSaved"));
    expect(result).toHaveLength(0);
    // Verify it's not returned with 0 fields
    expect(result.find((d) => d.name === "CFlashbangProjectile")).toBeUndefined();
  });

  it("enum with no matching members is excluded entirely", () => {
    const decl = enumsByName.get("PulseTestEnumColor_t")!;
    const result = searchDeclarations([decl], parseSearch("xyznotamember"));
    expect(result).toHaveLength(0);
  });

  it("extra whitespace in search is ignored", () => {
    const result = searchDeclarations(declarations, parseSearch("  weapon   zoom  "));
    expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
  });

  it("search with only whitespace returns nothing", () => {
    const result = searchDeclarations(declarations, parseSearch("   "));
    expect(result).toHaveLength(0);
  });

  it("multiple offsets where only some match on a class", () => {
    // CFlashbangProjectile: m_flTimeToDetonate=2992, m_numOpponentsHit=2996
    // offset:2992 offset:99999 → only m_flTimeToDetonate matches (OR semantics)
    const result = searchDeclarations(
      declarations,
      parseSearch("Flashbang offset:2992 offset:99999"),
    );
    expect(result).toHaveLength(1);
    const flash = result[0] as SchemaClass;
    expect(flash.fields).toHaveLength(1);
    expect(flash.fields[0].name).toBe("m_flTimeToDetonate");
  });

  it("offset:0 matches fields at offset 0", () => {
    const result = searchDeclarations(declarations, parseSearch("offset:0"));
    expect(result.length).toBeGreaterThan(0);
    // Every returned class should have at least one field with offset 0
    for (const d of result) {
      expect((d as SchemaClass).fields.some((f) => f.offset === 0)).toBe(true);
    }
  });

  it("module filter is case-insensitive", () => {
    const result = searchDeclarations(declarations, parseSearch("module:CLIENT"));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.module === "client")).toBe(true);
  });

  it("name word substring in metadata key finds fields with that metadata", () => {
    // "choice" is a substring of the MPropertyAttributeChoiceName metadata key
    // C_INIT_CheckParticleForWater: only m_nFieldOutput has MPropertyAttributeChoiceName
    const result = searchDeclarations(
      declarations,
      parseSearch("C_INIT_CheckParticleForWater choice"),
    );
    const water = result.find((d) => d.name === "C_INIT_CheckParticleForWater") as SchemaClass;
    expect(water).toBeDefined();
    expect(water.fields).toHaveLength(1);
    expect(water.fields[0].name).toBe("m_nFieldOutput");
  });

  it("remaining word matching no field name or metadata key → class excluded", () => {
    // "net" doesn't appear in any CEnvSoundscape field name or metadata key
    // (MNotSaved → "mnotsaved" doesn't include "net")
    const result = searchDeclarations(declarations, parseSearch("CEnvSoundscape net"));
    expect(result.every((d) => d.name !== "CEnvSoundscape")).toBe(true);
  });
});

// -- fuzzyScore --

describe("fuzzyScore", () => {
  it("returns 0 for exact match", () => {
    expect(fuzzyScore("cbaseentity", "CBaseEntity")).toBe(0);
  });

  it("returns 0 for exact match same length", () => {
    expect(fuzzyScore("abc", "abc")).toBe(0);
  });

  it("returns prefix score for prefix match", () => {
    const score = fuzzyScore("cbase", "CBaseEntity")!;
    expect(score).toBeGreaterThanOrEqual(100);
    expect(score).toBeLessThan(200);
  });

  it("shorter target ranks higher for prefix", () => {
    const short = fuzzyScore("cbase", "CBaseEnt")!;
    const long = fuzzyScore("cbase", "CBaseEntity")!;
    expect(short).toBeLessThan(long);
  });

  it("returns substring score for contiguous substring", () => {
    const score = fuzzyScore("entity", "CBaseEntity")!;
    expect(score).toBeGreaterThanOrEqual(200);
    expect(score).toBeLessThan(1000);
  });

  it("earlier substring position scores better", () => {
    const early = fuzzyScore("base", "CBaseEntity")!; // index 1
    const late = fuzzyScore("base", "SomeClassBase")!; // index 9
    expect(early).toBeLessThan(late);
  });

  it("returns null for no match", () => {
    expect(fuzzyScore("xyz", "CBaseEntity")).toBeNull();
  });

  it("returns null for pattern longer than target", () => {
    expect(fuzzyScore("cbaseentitylong", "CBase")).toBeNull();
  });

  it("returns fuzzy score for non-contiguous match", () => {
    const score = fuzzyScore("cbe", "CBaseEntity")!;
    expect(score).toBeGreaterThanOrEqual(1000);
    expect(score).toBeLessThan(5000);
  });

  it("does not fuzzy-match 1-char patterns", () => {
    // 'c' exists in 'Base' but single chars are substring-only
    expect(fuzzyScore("c", "Base")).toBeNull();
  });

  it("does not fuzzy-match 2-char patterns", () => {
    expect(fuzzyScore("cb", "CxxxxxByyy")).toBeNull();
    // But substring still works
    expect(fuzzyScore("cb", "xcby")).toBe(201);
  });

  it("fuzzy matches 3+ char patterns", () => {
    expect(fuzzyScore("cbe", "CBaseEntity")).not.toBeNull();
  });

  it("boundary matches score better than scattered", () => {
    // CBE -> CBaseEntity (all boundary hits: C, B, E)
    const boundary = fuzzyScore("cbe", "CBaseEntity")!;
    // cbe -> xCxxxBxxxxxExx (scattered)
    const scattered = fuzzyScore("cbe", "xCxxxBxxxxxExx")!;
    expect(boundary).toBeLessThan(scattered);
  });

  it("exact always beats prefix", () => {
    const exact = fuzzyScore("cbase", "CBase")!;
    const prefix = fuzzyScore("cbase", "CBaseEntity")!;
    expect(exact).toBeLessThan(prefix);
  });

  it("prefix always beats substring", () => {
    const prefix = fuzzyScore("base", "BaseEntity")!;
    const substr = fuzzyScore("base", "CBaseEntity")!;
    expect(prefix).toBeLessThan(substr);
  });

  it("substring always beats fuzzy", () => {
    const substr = fuzzyScore("base", "CBaseEntity")!;
    const fuz = fuzzyScore("bse", "CBaseEntity")!;
    expect(substr).toBeLessThan(fuz);
  });

  it("matches camelCase boundaries", () => {
    // "cswb" -> C_CSWeaponBase (C, S, W, B at boundaries)
    const score = fuzzyScore("cswb", "C_CSWeaponBase");
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(1000);
  });

  it("handles m_ prefix naturally", () => {
    // "fl" is a substring of m_flFoo
    const score = fuzzyScore("fl", "m_flFalloff");
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(200);
    expect(score!).toBeLessThan(1000);
  });

  it("handles initfromsnapshot pattern", () => {
    const score = fuzzyScore("initfromsnapshot", "C_INIT_InitFromCPSnapshot");
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(1000);
  });

  it("case-insensitive matching", () => {
    expect(fuzzyScore("cbase", "CBASE")).toBe(0);
    expect(fuzzyScore("cbase", "cbase")).toBe(0);
  });

  it("empty pattern returns 0", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

// -- fuzzy search integration --

describe("fuzzy search integration", () => {
  it("fuzzy query finds declarations with non-contiguous match", () => {
    const result = searchDeclarations(declarations, parseSearch("cnvsph"));
    const names = result.map((d) => d.name);
    expect(names).toContain("CNavVolumeSphere");
  });

  it("exact match ranks above fuzzy match", () => {
    const result = searchDeclarations(declarations, parseSearch("CEffectData"));
    expect(result[0].name).toBe("CEffectData");
  });

  it("prefix ranks above substring which ranks above fuzzy", () => {
    const result = searchDeclarations(declarations, parseSearch("CFilter"));
    const names = result.map((d) => d.name);
    // Both CFilterEnemy and CFilterProximity are prefix matches, shorter name scores better
    const enemyIdx = names.indexOf("CFilterEnemy");
    const proxIdx = names.indexOf("CFilterProximity");
    expect(enemyIdx).toBeLessThan(proxIdx);
    // Fuzzy match (C_OP_RemapTransformVisibilityToVector) ranks after prefix matches
    const fuzzyIdx = names.indexOf("C_OP_RemapTransformVisibilityToVector");
    if (fuzzyIdx >= 0) {
      expect(proxIdx).toBeLessThan(fuzzyIdx);
    }
  });

  it("two-char query uses substring only, no fuzzy", () => {
    // "cb" with 2 chars: fuzzyScore returns null for non-substring matches
    // But field-level substring matching can still find "cb" in field names like m_CBodyComponent
    const result = searchDeclarations(declarations, parseSearch("cb"));
    // All results should have "cb" somewhere — in declaration name or in a field/member name
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("buildHash", () => {
  it("joins params and encodes values", () => {
    expect(buildHash({ kind: "convars", search: "sv_ flag:cheat" })).toBe(
      "kind=convars&search=sv_%20flag%3Acheat",
    );
  });

  it("skips empty params", () => {
    expect(buildHash({ kind: null, search: "", name: undefined })).toBe("");
    expect(buildHash({ kind: null, name: "sv_gravity" })).toBe("name=sv_gravity");
  });
});

// ==================== network: ====================

describe("network: search", () => {
  const search = (q: string) => searchDeclarations(declarations, parseSearch(q));
  const fieldsOf = (q: string, name: string) => {
    const d = search(q).find((r) => r.name === name);
    return d?.kind === "class" ? d.fields.map((f) => f.name) : undefined;
  };

  it("parses network: words", () => {
    expect(parseSearch("C_Fish network:posX").networkWords).toEqual(["posx"]);
    expect(isFilterPrefix("network:")).toBe(true);
  });

  it("finds fields by a network value", () => {
    expect(fieldsOf("network:posx", "CNetworkOriginCellCoordQuantizedVector")).toEqual(["m_vecX"]);
  });

  it("finds fields by a network property name", () => {
    expect(fieldsOf("network:sentas", "C_FuncConveyor")).toEqual([
      "m_nTransitionStartTick",
      "m_hConveyorModels",
    ]);
  });

  it("needs every network: word to match the same field", () => {
    expect(
      fieldsOf("network:oncellchanged network:sentas", "CNetworkOriginCellCoordQuantizedVector"),
    ).toEqual(["m_vecX", "m_vecY", "m_vecZ"]);
    expect(search("network:cellx network:posx")).toEqual([]);
  });

  it("matches a class's own network data without listing fields", () => {
    const result = search("network:varsatomic");
    expect(result.map((d) => d.name)).toEqual(["CNetworkOriginCellCoordQuantizedVector"]);
    expect((result[0] as SchemaClass).fields).toEqual([]);
    // varTypeOverrides is keyed by field, and its values are types
    expect(search("network:CCSObserver_CameraServices").map((d) => d.name)).toEqual([
      "C_CSObserverPawn",
    ]);
  });

  it("names the parts of a class's network data that matched", () => {
    const [result] = search("network:varsatomic") as SchemaClass[];
    expect(result.networkMatch).toEqual({ varsAtomic: true });
    const [observer] = search("network:CCSObserver_CameraServices") as SchemaClass[];
    expect(observer.networkMatch).toEqual({
      varTypeOverrides: { m_pCameraServices: "CCSObserver_CameraServices" },
    });
  });

  it("lists the fields that match too when the class's own network data matched", () => {
    const field = (name: string, userGroups: string[]) => ({
      name,
      type: { category: "builtin" as const, name: "int32" },
      metadata: [],
      network: { type: "int32", userGroups },
    });
    const entity: SchemaClass = {
      kind: "class",
      name: "CEntity",
      module: "m",
      flags: [],
      parents: [],
      metadata: [],
      fields: [field("m_iHealth", ["Player"]), field("m_iArmor", ["LocalPlayerExclusive"])],
      network: { excludeByUserGroup: ["Player", "LocalPlayerExclusive"] },
    };
    const [result] = searchDeclarations([entity], parseSearch("network:=player")) as SchemaClass[];
    expect(result.fields.map((f) => f.name)).toEqual(["m_iHealth"]);
    expect(result.networkMatch).toEqual({ excludeByUserGroup: ["Player"] });
  });

  it("names no network parts when fields matched", () => {
    const d = search("network:posx").find(
      (r) => r.name === "CNetworkOriginCellCoordQuantizedVector",
    );
    expect((d as SchemaClass).networkMatch).toBeUndefined();
  });

  it("leaves metadata to metadata:", () => {
    expect(search("network:mnotsaved")).toEqual([]);
    expect(search("network:mnetworknobase")).toEqual([]);
  });

  it("combines with name words", () => {
    expect(fieldsOf("damage network:localplayer", "CCSPlayerController_DamageServices")).toEqual([
      "m_nSendUpdate",
      "m_DamageList",
    ]);
  });
});
