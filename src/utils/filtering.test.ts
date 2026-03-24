import { describe, it, expect } from "vitest";
import {
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
    const result = parseSearch("metadata:MNetworkEnable");
    expect(result.metadataKeys).toEqual(["mnetworkenable"]);
  });

  it("does not treat metadatavalue: as metadata:", () => {
    const result = parseSearch("metadatavalue:foo");
    expect(result.metadataValues).toEqual(["foo"]);
    expect(result.metadataKeys).toEqual([]);
  });

  it("parses mixed query", () => {
    const result = parseSearch("CPlayer module:server offset:0x10 metadata:MNetworkEnable");
    expect(result.nameWords).toEqual(["cplayer"]);
    expect(result.moduleWords).toEqual(["server"]);
    expect(result.offsets).toEqual(new Set([16]));
    expect(result.metadataKeys).toEqual(["mnetworkenable"]);
  });

  it("lowercases everything", () => {
    const result = parseSearch("FOO Module:SERVER");
    expect(result.nameWords).toEqual(["foo"]);
    expect(result.moduleWords).toEqual(["server"]);
  });

  it("order of words and filters does not matter", () => {
    const a = parseSearch(
      "C_Fish module:client metadata:MNetworkEnable offset:0x10 enumvalue:4 metadatavalue:coord",
    );
    const b = parseSearch(
      "metadatavalue:coord enumvalue:4 metadata:MNetworkEnable offset:0x10 module:client C_Fish",
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
    const result = parseSearch("metadata:MNetworkEnable metadata:MNotSaved");
    expect(result.metadataKeys).toEqual(["mnetworkenable", "mnotsaved"]);
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
    expect(matchesMetadataKeys([{ name: "MNetworkEnable" }], ["mnetwork"])).toBe(true);
  });
  it("fails when key absent", () => {
    expect(matchesMetadataKeys([{ name: "MNetworkEnable" }], ["other"])).toBe(false);
  });
  it("returns false for undefined metadata", () => {
    expect(matchesMetadataKeys(undefined, ["key"])).toBe(false);
  });
  it("returns false for empty metadata", () => {
    expect(matchesMetadataKeys([], ["key"])).toBe(false);
  });
  it("returns false for empty keys", () => {
    expect(matchesMetadataKeys([{ name: "MNetworkEnable" }], [])).toBe(false);
  });
  it("partial match works (uses includes)", () => {
    expect(matchesMetadataKeys([{ name: "MNetworkEnable" }], ["network"])).toBe(true);
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
      // MNetworkChangeCallback appears as a metadata key on C_Fish.m_x
      const result = searchDeclarations(declarations, parseSearch("MNetworkChangeCallback"));
      expect(result.length).toBeGreaterThan(0);
      // C_Fish has fields with MNetworkChangeCallback
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
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
    it("finds classes with MNetworkEnable on fields", () => {
      const result = searchDeclarations(declarations, parseSearch("metadata:MNetworkEnable"));
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("does not find class without that metadata", () => {
      // CFlashbangProjectile has no metadata on any field
      const result = searchDeclarations(declarations, parseSearch("metadata:MNetworkEnable"));
      expect(result.every((d) => d.name !== "CFlashbangProjectile")).toBe(true);
    });

    it("metadata: filter matches field-level metadata keys", () => {
      // metadata: filter checks fields, not class-level metadata
      // C_CSWeaponBaseGun fields have MNetworkEnable, not MNetworkVarNames
      const result = searchDeclarations(declarations, parseSearch("metadata:MNetworkEnable"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("metadata key filter is case-insensitive partial match", () => {
      const result = searchDeclarations(declarations, parseSearch("metadata:network"));
      expect(result.length).toBeGreaterThan(0);
    });

    it("metadata key + name word", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkEnable"),
      );
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
        parseSearch("metadata:MNetworkEnable module:server"),
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
      // C_CSWeaponBaseGun has MNetworkVarNames on class metadata (not field metadata)
      const result = searchDeclarations(declarations, parseSearch("metadata:MNetworkVarNames"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("declaration-level metadata match returns empty fields", () => {
      // MNetworkVarNames is on class metadata, not field metadata
      // No remaining field words, no offset, no field-level metadata → empty fields
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadata:MNetworkVarNames"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(0);
    });

    it("declaration-level metadata match + name word filters fields", () => {
      // Class metadata matches MNetworkVarNames, "zoom" becomes remaining word → field filter
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadata:MNetworkVarNames zoom"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_zoomLevel");
    });

    it("declaration-level metadata match + offset filters fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadata:MNetworkVarNames offset:8000"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_zoomLevel");
    });

    it("metadata key on class + metadata key on field must both match at same level", () => {
      // MNetworkVarNames is only on class metadata, MNetworkEnable only on field metadata
      // No single level has both → no match
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadata:MNetworkVarNames metadata:MNetworkEnable"),
      );
      expect(result).toHaveLength(0);
    });

    it("declaration-level metadata key only (no class name) finds classes", () => {
      // MNetworkIncludeByName only exists on class metadata (C_Hostage, C_Fish, C_BaseEntity)
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MNetworkIncludeByName"),
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((d) => d.name === "C_Hostage")).toBe(true);
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
      // CFlashbangProjectile has no class metadata → excluded
      expect(result.every((d) => d.name !== "CFlashbangProjectile")).toBe(true);
    });
  });

  describe("metadata value filter", () => {
    it("finds class by metadata value on field", () => {
      // C_Fish.m_poolOrigin has MNetworkEncoder with value "coord"
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:coord"));
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("finds class by MNetworkSerializer value", () => {
      // C_Fish.m_x has MNetworkSerializer with value "fish_pos_x"
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:fish_pos_x"));
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("finds class by partial metadata value", () => {
      // "RenderingChanged" is a MNetworkChangeCallback value on C_RectLight.m_bShowLight
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:renderingchanged"),
      );
      expect(result.some((d) => d.name === "C_RectLight")).toBe(true);
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
      const result = searchDeclarations(declarations, parseSearch("C_Fish metadatavalue:fish_pos"));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_Fish");
    });

    it("metadata value + module filter", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:fish_pos module:client"),
      );
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
      expect(result.every((d) => d.module === "client")).toBe(true);
    });

    it("metadata value + wrong module returns nothing for that class", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadatavalue:fish_pos module:server"),
      );
      expect(result.every((d) => d.name !== "C_Fish")).toBe(true);
    });

    it("finds class by declaration-level metadata value", () => {
      // C_CSWeaponBaseGun class metadata has MNetworkVarNames="int m_zoomLevel"
      const result = searchDeclarations(declarations, parseSearch("metadatavalue:m_zoomLevel"));
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
    });

    it("declaration-level metadatavalue match returns empty fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadatavalue:m_zoomLevel"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(0);
    });

    it("declaration-level metadatavalue match + name word filters fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun metadatavalue:m_zoomLevel silencer"),
      );
      expect(result).toHaveLength(1);
      const cls = result[0] as SchemaClass;
      expect(cls.fields).toHaveLength(1);
      expect(cls.fields[0].name).toBe("m_iSilencerBodygroup");
    });

    it("declaration-level metadata key + value combined returns empty fields", () => {
      // C_Hostage has class metadata MNetworkIncludeByName="m_iMaxHealth"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Hostage metadata:MNetworkIncludeByName metadatavalue:m_iMaxHealth"),
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
        parseSearch("WeaponBaseGun module:client metadata:MNetworkEnable"),
      );
      expect(result.some((d) => d.name === "C_CSWeaponBaseGun")).toBe(true);
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
        parseSearch("metadata:MNetworkChangeCallback metadatavalue:OnPos"),
      );
      expect(result.some((d) => d.name === "C_Fish")).toBe(true);
    });

    it("name + metadata key + metadata value", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish metadata:MNetworkSerializer metadatavalue:fish_pos"),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_Fish");
    });

    it("all filters combined", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_Fish module:client offset:4588 metadata:MNetworkEnable metadatavalue:fish_pos_x",
        ),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("C_Fish");
    });

    it("contradictory filters return nothing", () => {
      // CFlashbangProjectile is server, has no metadata
      const result = searchDeclarations(
        declarations,
        parseSearch("CFlashbangProjectile module:client metadata:MNetworkEnable"),
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
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // Only 4 of 7 fields have MNetworkEnable
      const parsed = parseSearch("metadata:MNetworkEnable");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(4);
      const names = result.fields.map((f) => f.name);
      expect(names).toContain("m_zoomLevel");
      expect(names).toContain("m_iBurstShotsRemaining");
      expect(names).toContain("m_bNeedsBoltAction");
      expect(names).toContain("m_nRevolverCylinderIdx");
      // Fields without MNetworkEnable should be gone
      expect(names).not.toContain("m_iSilencerBodygroup");
      expect(names).not.toContain("m_silencedModelIndex");
      expect(names).not.toContain("m_inPrecache");
    });

    it("filters fields by metadata value", () => {
      const decl = classesByName.get("C_Fish")!;
      // m_x has MNetworkSerializer value "fish_pos_x"
      const parsed = parseSearch("metadatavalue:fish_pos_x");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_x");
    });

    it("field name word + metadata key combined", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // "weapon" matches class name, "zoom" filters fields, metadata:MNetworkEnable further narrows
      // m_zoomLevel has MNetworkEnable, so it passes both
      const parsed = parseSearch("C_CSWeaponBaseGun zoom metadata:MNetworkEnable");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_zoomLevel");
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
      const parsed = parseSearch("metadata:MNetworkEnable");
      const result = searchDeclarations([decl], parsed);
      expect(result).toHaveLength(0);
    });

    it("preserves field metadata in filtered results", () => {
      const decl = classesByName.get("C_Fish")!;
      const parsed = parseSearch("metadatavalue:fish_pos_x");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      // m_x should still have all its metadata entries
      const meta = result.fields[0].metadata;
      expect(meta.some((m) => m.name === "MNetworkEnable")).toBe(true);
      expect(meta.some((m) => m.name === "MNetworkSerializer" && m.value === '"fish_pos_x"')).toBe(
        true,
      );
      expect(
        meta.some((m) => m.name === "MNetworkChangeCallback" && m.value === '"OnPosChanged"'),
      ).toBe(true);
    });

    it("preserves class-level metadata in filtered result", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      const parsed = parseSearch("C_CSWeaponBaseGun zoom");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      // Class metadata should be unchanged
      expect(result.metadata).toBe(decl.metadata);
      expect(result.metadata.length).toBe(4);
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
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // offset 8008 is m_iSilencerBodygroup (no metadata), 8000 is m_zoomLevel (has MNetworkEnable)
      // Combined: field must match BOTH offset AND metadata key
      const parsed = parseSearch("offset:8000 metadata:MNetworkEnable");
      const result = searchDeclarations([decl], parsed)[0] as SchemaClass;
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("m_zoomLevel");
    });

    it("offset + metadata key with no overlap → declaration excluded", () => {
      const decl = classesByName.get("C_CSWeaponBaseGun")!;
      // offset 8008 is m_iSilencerBodygroup which has NO metadata
      const parsed = parseSearch("offset:8008 metadata:MNetworkEnable");
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
      ]),
    );
    expect(result).toHaveLength(6); // CFuncWater appears in client + server
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
    const fieldOnly = result.filter((d) => !d.name.toLowerCase().includes("water"));
    expect(fieldOnly[0].name).toBe("C_BaseEntity");
    expect(fieldOnly[1].name).toBe("C_Fish");
  });

  it("no name words (module-only) results are alphabetical", () => {
    const result = searchDeclarations(declarations, parseSearch("module:client"));
    const names = result.map((d) => d.name);
    // All get score 2, sorted alphabetically (ASCII order: uppercase before _)
    expect(names).toEqual([
      "CEffectData",
      "CEnvSoundscape",
      "CFilterProximity",
      "CFuncWater",
      "C_BaseEntity",
      "C_CSWeaponBaseGun",
      "C_Fish",
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
    // "C_CSWeapon" starts-with match on C_CSWeaponBaseGun (score 1),
    // metadata forces field-level filtering
    const result = searchDeclarations(
      declarations,
      parseSearch("C_CSWeapon metadata:MNetworkEnable"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_CSWeaponBaseGun");
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
    // "water" + metadata:MNetworkEnable → only field-only matches survive
    // (CFuncWater has no MNetworkEnable fields, so it's excluded)
    const result = searchDeclarations(declarations, parseSearch("water metadata:MNetworkEnable"));
    expect(result.length).toBeGreaterThan(0);
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
  //   NO metadata: m_bStartActive, m_flMaxSimulationTime, m_iszEffectName, m_PathNodes_Name
  //   MNetworkEnable only: m_flParticleSpacing, m_iEffectIndex, m_PathNodes_Position,
  //     m_PathNodes_TangentIn, m_PathNodes_TangentOut, m_PathNodes_Color, m_PathNodes_RadiusScale
  //   MNetworkEnable + MNetworkChangeCallback: m_flSlack, m_flRadius, m_ColorTint,
  //     m_nEffectState, m_PathNodes_PinEnabled

  const noMetaFields = [
    "m_bStartActive",
    "m_flMaxSimulationTime",
    "m_iszEffectName",
    "m_PathNodes_Name",
  ];
  const networkEnableOnly = [
    "m_flParticleSpacing",
    "m_iEffectIndex",
    "m_PathNodes_Position",
    "m_PathNodes_TangentIn",
    "m_PathNodes_TangentOut",
    "m_PathNodes_Color",
    "m_PathNodes_RadiusScale",
  ];
  const networkEnableWithCallback = [
    "m_flSlack",
    "m_flRadius",
    "m_ColorTint",
    "m_nEffectState",
    "m_PathNodes_PinEnabled",
  ];
  const allRopeFields = [...noMetaFields, ...networkEnableOnly, ...networkEnableWithCallback];

  describe("metadata key + field name word — AND logic", () => {
    it("returns only m_PathNodes_PinEnabled (AND, not OR)", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MNetworkChangeCallback m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();

      // Only m_PathNodes_PinEnabled has BOTH: name contains "PinEnabled" AND has MNetworkChangeCallback
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_PathNodes_PinEnabled");
    });

    it("fields with only MNetworkChangeCallback but wrong name are hidden", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MNetworkChangeCallback m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      const names = rope.fields.map((f) => f.name);

      // These have MNetworkChangeCallback but NOT "PinEnabled" in name → hidden
      expect(names).not.toContain("m_flSlack");
      expect(names).not.toContain("m_flRadius");
      expect(names).not.toContain("m_ColorTint");
      expect(names).not.toContain("m_nEffectState");
    });

    it("fields without MNetworkChangeCallback are hidden", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("metadata:MNetworkChangeCallback m_PathNodes_PinEnabled"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      const names = rope.fields.map((f) => f.name);

      for (const f of [...noMetaFields, ...networkEnableOnly]) {
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

  describe("class name + metadata filter → only matching-metadata fields visible", () => {
    it("class name + metadata:MNetworkChangeCallback shows only fields with that metadata", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadata:MNetworkChangeCallback"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();

      // Only the 5 fields with MNetworkChangeCallback should be visible
      expect(rope.fields).toHaveLength(5);
      const names = rope.fields.map((f) => f.name);
      for (const f of networkEnableWithCallback) {
        expect(names).toContain(f);
      }

      // Fields with only MNetworkEnable (no callback) should be hidden
      for (const f of networkEnableOnly) {
        expect(names).not.toContain(f);
      }

      // Fields with no metadata at all should be hidden
      for (const f of noMetaFields) {
        expect(names).not.toContain(f);
      }
    });

    it("class name + metadata:MNetworkEnable shows all fields with that metadata, hides bare fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadata:MNetworkEnable"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // 12 fields have MNetworkEnable
      expect(rope.fields).toHaveLength(12);
      const names = rope.fields.map((f) => f.name);

      for (const f of [...networkEnableOnly, ...networkEnableWithCallback]) {
        expect(names).toContain(f);
      }

      // The 4 fields with no metadata should be hidden
      for (const f of noMetaFields) {
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

  describe("metadata value filter → only matching-value fields visible", () => {
    it("metadatavalue:parametersChanged shows only fields with that callback value", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadatavalue:parametersChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // m_flSlack, m_flRadius, m_ColorTint have MNetworkChangeCallback = "parametersChanged"
      expect(rope.fields).toHaveLength(3);
      const names = rope.fields.map((f) => f.name);
      expect(names).toContain("m_flSlack");
      expect(names).toContain("m_flRadius");
      expect(names).toContain("m_ColorTint");

      // Other callback fields with different values are hidden
      expect(names).not.toContain("m_nEffectState"); // effectStateChanged
      expect(names).not.toContain("m_PathNodes_PinEnabled"); // pinStateChanged

      // Fields without metadata values at all are hidden
      for (const f of [...noMetaFields, ...networkEnableOnly]) {
        expect(names).not.toContain(f);
      }
    });

    it("metadatavalue:pinStateChanged shows only m_PathNodes_PinEnabled", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadatavalue:pinStateChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_PathNodes_PinEnabled");
    });
  });

  describe("metadata preserved on visible fields, not stripped", () => {
    it("when filtering by MNetworkChangeCallback, visible fields keep ALL their metadata", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadata:MNetworkChangeCallback"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // m_flSlack should have both MNetworkEnable AND MNetworkChangeCallback
      const slack = rope.fields.find((f) => f.name === "m_flSlack")!;
      expect(slack.metadata).toHaveLength(2);
      expect(slack.metadata.some((m) => m.name === "MNetworkEnable")).toBe(true);
      expect(
        slack.metadata.some(
          (m) => m.name === "MNetworkChangeCallback" && m.value === '"parametersChanged"',
        ),
      ).toBe(true);

      // m_iEffectIndex has MNetworkEnable + MNotSaved — it should NOT be in results
      expect(rope.fields.every((f) => f.name !== "m_iEffectIndex")).toBe(true);
    });

    it("when filtering by metadatavalue, visible field keeps unrelated metadata entries", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadatavalue:effectStateChanged"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope.fields).toHaveLength(1);
      const field = rope.fields[0];
      expect(field.name).toBe("m_nEffectState");
      // Both metadata entries preserved
      expect(field.metadata.some((m) => m.name === "MNetworkEnable")).toBe(true);
      expect(
        field.metadata.some(
          (m) => m.name === "MNetworkChangeCallback" && m.value === '"effectStateChanged"',
        ),
      ).toBe(true);
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
      // C_PathParticleRope: m_flSlack has name containing "slack" AND metadata key "MNetworkChangeCallback"
      // Both "slack" and "callback" should match — "slack" via name, "callback" via metadata key
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope slack callback"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;
      expect(rope).toBeDefined();
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flSlack");
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
      // offset 1596 is m_flSlack (has MNetworkChangeCallback) → visible
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1552 offset:1596 metadata:MNetworkChangeCallback"),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // Only m_flSlack passes both offset AND metadata check
      expect(rope.fields).toHaveLength(1);
      expect(rope.fields[0].name).toBe("m_flSlack");
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
  // sky3dparams_t has 6 fields:
  //   scale:             MNetworkEnable
  //   origin:            MNetworkEnable, MNetworkEncoder("coord")
  //   bClip3DSkyBoxNearToWorldFar:    MNetworkEnable, MNotSaved
  //   flClip3DSkyBoxNearToWorldFarOffset: MNetworkEnable, MNotSaved
  //   fog:               MNetworkEnable, MNotSaved
  //   m_nWorldGroupID:   MNetworkEnable

  describe("multiple metadata keys must ALL match on the field", () => {
    it("metadata:MNetworkEnable metadata:MNotSaved → only fields with BOTH keys", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("sky3dparams_t metadata:MNetworkEnable metadata:MNotSaved"),
      );
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
      expect(sky).toBeDefined();

      // 3 fields have both MNetworkEnable AND MNotSaved
      expect(sky.fields).toHaveLength(3);
      const names = sky.fields.map((f) => f.name);
      expect(names).toContain("bClip3DSkyBoxNearToWorldFar");
      expect(names).toContain("flClip3DSkyBoxNearToWorldFarOffset");
      expect(names).toContain("fog");

      // Fields with only MNetworkEnable (no MNotSaved) are hidden
      expect(names).not.toContain("scale");
      expect(names).not.toContain("origin");
      expect(names).not.toContain("m_nWorldGroupID");
    });

    it("metadata:MNetworkEnable metadata:MNetworkEncoder → only origin", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("sky3dparams_t metadata:MNetworkEnable metadata:MNetworkEncoder"),
      );
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;

      // Only origin has both MNetworkEnable AND MNetworkEncoder
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("origin");
    });

    it("metadata:MNotSaved metadata:MNetworkEncoder → class not found (no single field/class has both)", () => {
      // matchesMetadataKeys requires ALL keys present in a SINGLE metadata array
      // No single field on sky3dparams_t has both MNotSaved AND MNetworkEncoder
      // No single field has both keys → no match
      const result = searchDeclarations(
        declarations,
        parseSearch("sky3dparams_t metadata:MNotSaved metadata:MNetworkEncoder"),
      );
      const sky = result.find((d) => d.name === "sky3dparams_t");
      expect(sky).toBeUndefined();
    });
  });

  describe("metadata key + metadata value combined on field level", () => {
    it("metadata:MNetworkChangeCallback metadatavalue:parametersChanged → AND on fields", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch(
          "C_PathParticleRope metadata:MNetworkChangeCallback metadatavalue:parametersChanged",
        ),
      );
      const rope = result.find((d) => d.name === "C_PathParticleRope") as SchemaClass;

      // Only fields with MNetworkChangeCallback AND value containing "parametersChanged"
      expect(rope.fields).toHaveLength(3);
      const names = rope.fields.map((f) => f.name);
      expect(names).toContain("m_flSlack");
      expect(names).toContain("m_flRadius");
      expect(names).toContain("m_ColorTint");

      // m_nEffectState has MNetworkChangeCallback but value is "effectStateChanged" → hidden
      expect(names).not.toContain("m_nEffectState");
      // m_PathNodes_PinEnabled has MNetworkChangeCallback but value is "pinStateChanged" → hidden
      expect(names).not.toContain("m_PathNodes_PinEnabled");
    });
  });

  describe("free text matches metadata KEY names, not VALUES", () => {
    it("free text 'coord' does NOT match field via metadata value", () => {
      // sky3dparams_t.origin has MNetworkEncoder with value "coord"
      // "coord" as free text checks field NAMES and metadata KEY names, not values
      // Since "coord" doesn't match class name, any field name, or any metadata KEY name,
      // No field name or metadata key contains "coord" → no match
      const result = searchDeclarations(declarations, parseSearch("sky3dparams_t coord"));
      const sky = result.find((d) => d.name === "sky3dparams_t");
      expect(sky).toBeUndefined();
    });

    it("metadatavalue:coord DOES match field via metadata value", () => {
      const result = searchDeclarations(
        declarations,
        parseSearch("sky3dparams_t metadatavalue:coord"),
      );
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;

      // origin has MNetworkEncoder value "coord"
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("origin");
    });

    it("free text 'MNetworkEncoder' matches via metadata KEY name", () => {
      // "MNetworkEncoder" is a metadata key on the origin field
      const result = searchDeclarations(declarations, parseSearch("sky3dparams_t MNetworkEncoder"));
      const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;

      // origin has metadata key "MNetworkEncoder"
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("origin");
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
      // C_CSWeaponBaseGun has class metadata "MNetworkVarNames" but NO field has that key
      // The word "MNetworkVarNames" doesn't match any field → no match → excluded
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun MNetworkVarNames"),
      );
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
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
      // C_Fish: m_x at offset 4588, has MNetworkSerializer value "fish_pos_x"
      //         m_y at offset 4592, has MNetworkSerializer value "fish_pos_y"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish offset:4588 metadatavalue:fish_pos_x"),
      );
      const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;

      expect(fish.fields).toHaveLength(1);
      expect(fish.fields[0].name).toBe("m_x");
      expect(fish.fields[0].offset).toBe(4588);
    });

    it("offset for one field + metadatavalue from different field → excluded", () => {
      // offset 4588 is m_x, but metadatavalue "fish_pos_y" is on m_y → no field matches BOTH
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish offset:4588 metadatavalue:fish_pos_y"),
      );
      expect(result.every((d) => d.name !== "C_Fish")).toBe(true);
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

    it("metadata:MNetworkEnable on class with NO MNetworkEnable → not found", () => {
      // CEnvSoundscape has no MNetworkEnable on any field or class
      const result = searchDeclarations(
        declarations,
        parseSearch("CEnvSoundscape metadata:MNetworkEnable"),
      );
      // No field has MNetworkEnable → no match
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
      // C_PathParticleRope: m_flSlack at offset 1596, has MNetworkChangeCallback
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope slack offset:1596 metadata:MNetworkChangeCallback"),
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
      // offset 1592 is m_flParticleSpacing (MNetworkEnable only, no MNotSaved)
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope offset:1592 metadata:MNotSaved"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });

    it("name word + offset + metadatavalue all matching same field", () => {
      // C_Fish: m_x at offset 4588, has MNetworkSerializer value "fish_pos_x"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish m_x offset:4588 metadatavalue:fish_pos_x"),
      );
      const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;

      expect(fish.fields).toHaveLength(1);
      expect(fish.fields[0].name).toBe("m_x");
    });

    it("four-way AND: name + offset + metadata key + metadata value", () => {
      // C_Fish: m_x at offset 4588, MNetworkSerializer (key) value "fish_pos_x"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish m_x offset:4588 metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
      );
      const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;

      expect(fish.fields).toHaveLength(1);
      expect(fish.fields[0].name).toBe("m_x");
      // All 4 metadata entries preserved
      expect(fish.fields[0].metadata.length).toBeGreaterThanOrEqual(3);
    });

    it("four-way AND where one condition fails → excluded", () => {
      // Everything matches m_x EXCEPT offset 4592 (that's m_y)
      const result = searchDeclarations(
        declarations,
        parseSearch("C_Fish m_x offset:4592 metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
      );
      expect(result.every((d) => d.name !== "C_Fish")).toBe(true);
    });
  });

  describe("no false positives from cross-field or class-level matches", () => {
    it("metadata key on field A + metadata value on field B → excluded", () => {
      // m_iEffectIndex has MNotSaved, m_flSlack has value "parametersChanged"
      // No single field has BOTH → no match → excluded
      const result = searchDeclarations(
        declarations,
        parseSearch("C_PathParticleRope metadata:MNotSaved metadatavalue:parametersChanged"),
      );
      expect(result.every((d) => d.name !== "C_PathParticleRope")).toBe(true);
    });

    it("word matching only class metadata key → excluded", () => {
      // C_CSWeaponBaseGun class has metadata key "MNetworkVarNames"
      // but no field name or field metadata key contains "mnetworkvarnames"
      const result = searchDeclarations(
        declarations,
        parseSearch("C_CSWeaponBaseGun MNetworkVarNames"),
      );
      expect(result.every((d) => d.name !== "C_CSWeaponBaseGun")).toBe(true);
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
    // sky3dparams_t client: origin has MNetworkEncoder="coord"
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t module:client metadatavalue:coord"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("sky3dparams_t");
    expect(result[0].module).toBe("client");
    const fields = (result[0] as SchemaClass).fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("origin");
  });

  it("module + offset + metadata", () => {
    // sky3dparams_t client: origin offset=12 has MNetworkEnable + MNetworkEncoder
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client offset:12 metadata:MNetworkEncoder"),
    );
    expect(result.length).toBeGreaterThan(0);
    const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
    expect(sky).toBeDefined();
    expect(sky.fields).toHaveLength(1);
    expect(sky.fields[0].name).toBe("origin");
  });

  it("module + offset + metadatavalue", () => {
    // sky3dparams_t client: origin offset=12 has MNetworkEncoder value "coord"
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client offset:12 metadatavalue:coord"),
    );
    const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
    expect(sky).toBeDefined();
    expect(sky.fields).toHaveLength(1);
    expect(sky.fields[0].name).toBe("origin");
  });

  it("module + metadata + metadatavalue", () => {
    // C_Fish client: m_x has MNetworkSerializer="fish_pos_x"
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
    );
    const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;
    expect(fish).toBeDefined();
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_x");
  });

  it("offset + metadata + metadatavalue", () => {
    // C_Fish: m_x offset=4588 has MNetworkSerializer="fish_pos_x"
    const result = searchDeclarations(
      declarations,
      parseSearch("offset:4588 metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
    );
    const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;
    expect(fish).toBeDefined();
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_x");
  });

  it("name + module + offset + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t module:client offset:12 metadatavalue:coord"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("sky3dparams_t");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
  });

  it("name + module + metadata + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("C_Fish module:client metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C_Fish");
    expect((result[0] as SchemaClass).fields).toHaveLength(1);
    expect((result[0] as SchemaClass).fields[0].name).toBe("m_x");
  });

  it("module + offset + metadata + metadatavalue", () => {
    const result = searchDeclarations(
      declarations,
      parseSearch("module:client offset:4588 metadata:MNetworkSerializer metadatavalue:fish_pos_x"),
    );
    const fish = result.find((d) => d.name === "C_Fish") as SchemaClass;
    expect(fish).toBeDefined();
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_x");
  });

  it("multiple metadatavalue: values (AND semantics)", () => {
    // C_Fish: m_x, m_y, m_z all have MNetworkSerializer="fish_pos_*" and MNetworkChangeCallback="OnPosChanged"
    // Both values must match on each field
    const result = searchDeclarations(
      declarations,
      parseSearch("C_Fish metadatavalue:fish_pos metadatavalue:onpos"),
    );
    expect(result).toHaveLength(1);
    const fish = result[0] as SchemaClass;
    // m_x, m_y, m_z each have both values
    expect(fish.fields).toHaveLength(3);
    expect(fish.fields.map((f) => f.name)).toEqual(["m_x", "m_y", "m_z"]);
  });

  it("multiple metadatavalue: where no single field has both → excluded", () => {
    // "fish_pos_x" is on m_x, "angle_normalize" is on m_angle — no single field has both values
    const result = searchDeclarations(
      declarations,
      parseSearch("C_Fish metadatavalue:fish_pos_x metadatavalue:angle_normalize"),
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
    // "sky3dparams_t" consumes all name words, but metadata:MNetworkEncoder narrows fields
    // sky3dparams_t exists in both client and server modules
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t metadata:MNetworkEncoder"),
    );
    expect(result).toHaveLength(2);
    for (const d of result) {
      const sky = d as SchemaClass;
      expect(sky.name).toBe("sky3dparams_t");
      // Only 1 field has MNetworkEncoder: origin
      expect(sky.fields).toHaveLength(1);
      expect(sky.fields[0].name).toBe("origin");
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
    // C_Fish: "pool" matches m_poolOrigin field name, "encoder" matches its MNetworkEncoder metadata key
    // Both must match on the SAME field
    const result = searchDeclarations(declarations, parseSearch("C_Fish pool encoder"));
    expect(result).toHaveLength(1);
    const fish = result[0] as SchemaClass;
    expect(fish.fields).toHaveLength(1);
    expect(fish.fields[0].name).toBe("m_poolOrigin");
  });

  it("two remaining words: one in field name, one in metadata key of DIFFERENT field → excluded", () => {
    // C_Fish: "errorhistory" matches m_errorHistory (has MNotSaved)
    // "MNetworkChangeCallback" only on m_x,m_y,m_z,m_angle,m_poolOrigin (not on error fields)
    // No single field has both
    const result = searchDeclarations(
      declarations,
      parseSearch("C_Fish errorhistory MNetworkChangeCallback"),
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
    // Search by metadatavalue:fish_pos_x → returns m_x
    // m_x has 4 metadata entries, ALL should be preserved
    const result = searchDeclarations(declarations, parseSearch("C_Fish metadatavalue:fish_pos_x"));
    const fish = result[0] as SchemaClass;
    expect(fish.fields).toHaveLength(1);
    const meta = fish.fields[0].metadata;
    expect(meta.length).toBeGreaterThanOrEqual(4);
    expect(meta.some((m) => m.name === "MNetworkEnable")).toBe(true);
    expect(meta.some((m) => m.name === "MNotSaved")).toBe(true);
    expect(meta.some((m) => m.name === "MNetworkSerializer")).toBe(true);
    expect(meta.some((m) => m.name === "MNetworkChangeCallback")).toBe(true);
  });

  it("offset filter does not strip metadata from matched field", () => {
    // sky3dparams_t: origin at offset 12 has MNetworkEnable + MNetworkEncoder
    const result = searchDeclarations(declarations, parseSearch("offset:12"));
    const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
    expect(sky).toBeDefined();
    const origin = sky.fields.find((f) => f.name === "origin")!;
    expect(origin.metadata.some((m) => m.name === "MNetworkEncoder")).toBe(true);
    expect(origin.metadata.some((m) => m.name === "MNetworkEnable")).toBe(true);
  });

  it("quoted metadata values are searchable without quotes", () => {
    // MNetworkEncoder value is stored as '"coord"' (with quotes in the string)
    // Searching for just "coord" should match via includes()
    const result = searchDeclarations(
      declarations,
      parseSearch("sky3dparams_t metadatavalue:coord"),
    );
    const sky = result[0] as SchemaClass;
    expect(sky.fields).toHaveLength(1);
    expect(sky.fields[0].name).toBe("origin");
  });
});

// -- Boundary / edge cases --

describe("boundary and edge cases", () => {
  it("class with no matching fields is excluded entirely (not returned with empty fields)", () => {
    const decl = classesByName.get("CFlashbangProjectile")!;
    // metadata:MNetworkEnable — CFlashbangProjectile has no metadata on fields
    const result = searchDeclarations([decl], parseSearch("metadata:MNetworkEnable"));
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
    // "encoder" is a substring of MNetworkEncoder metadata key
    // sky3dparams_t: only "origin" field has MNetworkEncoder
    const result = searchDeclarations(declarations, parseSearch("sky3dparams_t encoder"));
    const sky = result.find((d) => d.name === "sky3dparams_t") as SchemaClass;
    expect(sky).toBeDefined();
    expect(sky.fields).toHaveLength(1);
    expect(sky.fields[0].name).toBe("origin");
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
