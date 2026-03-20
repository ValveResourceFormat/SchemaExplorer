import { describe, it, expect } from "vitest";
import { isFlagEnum, getBaseFlags, decomposeFlags } from "./enum-flags";
import type { SchemaEnumMember } from "../data/types";

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

  it("detects flag enum with high-bit values (>= 0x80000000)", () => {
    const members = [
      m("A", 0x10000000),
      m("B", 0x20000000),
      m("C", 0x40000000),
      m("D", 0x80000000),
      m("AB", 0x30000000),
    ];
    expect(isFlagEnum(members)).toBe(true);
  });

  it("detects flag enum with mix of low and high bits", () => {
    const members = [m("A", 1), m("B", 2), m("C", 0x80000000), m("AC", 0x80000001)];
    expect(isFlagEnum(members)).toBe(true);
  });

  it("detects flag enum with composite using only high bits", () => {
    const members = [
      m("A", 0x10000000),
      m("B", 0x20000000),
      m("C", 0x40000000),
      m("D", 0x80000000),
      m("CD", 0xc0000000),
    ];
    expect(isFlagEnum(members)).toBe(true);
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

  it("decomposes values with high bits (>= 0x80000000)", () => {
    const highMembers = [m("A", 0x10000000), m("B", 0x20000000), m("C", 0x80000000)];
    const highBase = getBaseFlags(highMembers);
    // 0x80000000 | 0x10000000 = 0x90000000
    expect(decomposeFlags(0x90000000, highBase)).toEqual(["A", "C"]);
  });

  it("decomposes all high-bit flags combined", () => {
    const highMembers = [m("A", 0x10000000), m("B", 0x40000000), m("C", 0x80000000)];
    const highBase = getBaseFlags(highMembers);
    // 0x10000000 | 0x40000000 | 0x80000000 = 0xD0000000
    expect(decomposeFlags(0xd0000000, highBase)).toEqual(["A", "B", "C"]);
  });

  it("decomposes mix of low and high bit flags", () => {
    const mixed = [m("LOW", 1), m("MID", 0x100), m("HIGH", 0x80000000)];
    const mixedBase = getBaseFlags(mixed);
    // 1 | 0x80000000 = 0x80000001
    expect(decomposeFlags(0x80000001, mixedBase)).toEqual(["LOW", "HIGH"]);
  });

  it("returns null when high-bit decomposition has remainder", () => {
    const highMembers = [m("A", 0x10000000), m("B", 0x80000000)];
    const highBase = getBaseFlags(highMembers);
    // 0xF0000000 cannot be fully decomposed from A and B
    expect(decomposeFlags(0xf0000000, highBase)).toBeNull();
  });

  it("handles 0xFFFFFFFF as composite of 31-bit flags + 0x80000000", () => {
    // Use 2**i to avoid signed 32-bit truncation from <<
    const allBits = Array.from({ length: 32 }, (_, i) => m(`B${i}`, 2 ** i));
    const allBase = getBaseFlags(allBits);
    // All 32 bits set = 0xFFFFFFFF = 4294967295
    expect(decomposeFlags(0xffffffff, allBase)).toHaveLength(32);
  });
});
