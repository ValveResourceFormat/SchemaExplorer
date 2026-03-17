import { describe, it, expect } from "vitest";
import { isFlagEnum, getBaseFlags, decomposeFlags } from "./enum-flags";
import type { SchemaEnumMember } from "../api";

const m = (name: string, value: number): SchemaEnumMember => ({
  name,
  value,
  metadata: [],
});

// -- isFlagEnum --

describe("isFlagEnum", () => {
  it("detects a simple flags enum", () => {
    expect(isFlagEnum([m("A", 1), m("B", 2), m("C", 4), m("AB", 3)])).toBe(true);
  });

  it("detects CITADEL_UNIT_TARGET_TYPE-like enum", () => {
    const members = [
      m("NONE", 0),
      m("HERO_FRIENDLY", 1),
      m("TROOPER_FRIENDLY", 2),
      m("BOSS_FRIENDLY", 4),
      m("BUILDING_FRIENDLY", 8),
      m("HERO_ENEMY", 256),
      m("TROOPER_ENEMY", 512),
      m("HERO", 257),
      m("ALL", 783),
    ];
    expect(isFlagEnum(members)).toBe(true);
  });

  it("rejects a sequential enum", () => {
    expect(isFlagEnum([m("A", 0), m("B", 1), m("C", 2), m("D", 3), m("E", 4)])).toBe(false);
  });

  it("rejects enums with too few members", () => {
    expect(isFlagEnum([m("A", 1), m("B", 2)])).toBe(false);
  });

  it("rejects enum with no powers of 2", () => {
    expect(isFlagEnum([m("A", 3), m("B", 5), m("C", 6), m("D", 7)])).toBe(false);
  });
});

// -- decomposeFlags --

describe("decomposeFlags", () => {
  const members = [
    m("HERO_FRIENDLY", 1),
    m("TROOPER_FRIENDLY", 2),
    m("BOSS_FRIENDLY", 4),
    m("BUILDING_FRIENDLY", 8),
    m("HERO_ENEMY", 256),
    m("TROOPER_ENEMY", 512),
    m("BOSS_ENEMY", 1024),
  ];
  const baseFlags = getBaseFlags(members);

  it("returns null for zero", () => {
    expect(decomposeFlags(0, baseFlags)).toBeNull();
  });

  it("returns null for a base flag (power of 2)", () => {
    expect(decomposeFlags(1, baseFlags)).toBeNull();
    expect(decomposeFlags(256, baseFlags)).toBeNull();
  });

  it("decomposes a two-flag combination", () => {
    // HERO = HERO_FRIENDLY | HERO_ENEMY = 1 | 256 = 257
    expect(decomposeFlags(257, baseFlags)).toEqual(["HERO_FRIENDLY", "HERO_ENEMY"]);
  });

  it("decomposes a multi-flag combination", () => {
    // 1 | 2 | 4 | 8 = 15
    expect(decomposeFlags(15, baseFlags)).toEqual([
      "HERO_FRIENDLY",
      "TROOPER_FRIENDLY",
      "BOSS_FRIENDLY",
      "BUILDING_FRIENDLY",
    ]);
  });

  it("decomposes across friendly and enemy flags", () => {
    // 2 | 4 | 512 | 1024 = 1542
    expect(decomposeFlags(1542, baseFlags)).toEqual([
      "TROOPER_FRIENDLY",
      "BOSS_FRIENDLY",
      "TROOPER_ENEMY",
      "BOSS_ENEMY",
    ]);
  });

  it("returns null if decomposition has remainder", () => {
    const limited = getBaseFlags([m("A", 1), m("B", 4)]);
    // 7 = 1 | 2 | 4, but 2 is not a base flag here
    expect(decomposeFlags(7, limited)).toBeNull();
  });

  it("returns flags in ascending order", () => {
    expect(decomposeFlags(1 | 4 | 1024, baseFlags)).toEqual([
      "HERO_FRIENDLY",
      "BOSS_FRIENDLY",
      "BOSS_ENEMY",
    ]);
  });
});
