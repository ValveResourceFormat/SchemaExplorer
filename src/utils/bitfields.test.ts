import { describe, it, expect } from "vitest";
import { computeBitfieldInfo } from "./bitfields";
import type { SchemaField } from "../data/types";

function makeField(
  name: string,
  offset: number,
  type: SchemaField["type"] = { category: "builtin", name: "int32" },
  metadata: SchemaField["metadata"] = [],
): SchemaField {
  return { name, offset, type, metadata };
}

function makeBitfield(name: string, offset: number, count: number): SchemaField {
  return makeField(name, offset, { category: "bitfield", count });
}

describe("computeBitfieldInfo", () => {
  it("returns empty map for no fields", () => {
    const result = computeBitfieldInfo([]);
    expect(result.size).toBe(0);
  });

  it("returns empty map for non-bitfield fields", () => {
    const fields = [makeField("a", 0), makeField("b", 4)];
    const result = computeBitfieldInfo(fields);
    expect(result.size).toBe(0);
  });

  it("handles a single bitfield", () => {
    const field = makeBitfield("flag", 0, 1);
    const result = computeBitfieldInfo([field]);

    expect(result.size).toBe(1);
    const info = result.get(field)!;
    expect(info.bitOffset).toBe(0);
    expect(info.bitCount).toBe(1);
    expect(info.padding).toBe(7);
    expect(info.totalBits).toBe(1);
  });

  it("handles consecutive bitfields at the same offset", () => {
    const a = makeBitfield("a", 0, 3);
    const b = makeBitfield("b", 0, 5);
    const result = computeBitfieldInfo([a, b]);

    expect(result.size).toBe(2);

    const infoA = result.get(a)!;
    expect(infoA.bitOffset).toBe(0);
    expect(infoA.bitCount).toBe(3);
    expect(infoA.padding).toBe(0);
    expect(infoA.totalBits).toBe(0);

    const infoB = result.get(b)!;
    expect(infoB.bitOffset).toBe(3);
    expect(infoB.bitCount).toBe(5);
    expect(infoB.padding).toBe(0);
    expect(infoB.totalBits).toBe(8);
  });

  it("computes padding when bits don't fill a byte", () => {
    const a = makeBitfield("a", 0, 2);
    const b = makeBitfield("b", 0, 3);
    const result = computeBitfieldInfo([a, b]);

    const infoB = result.get(b)!;
    expect(infoB.totalBits).toBe(5);
    expect(infoB.padding).toBe(3);
  });

  it("has zero padding when bits fill exact bytes", () => {
    const a = makeBitfield("a", 0, 4);
    const b = makeBitfield("b", 0, 4);
    const result = computeBitfieldInfo([a, b]);

    const infoB = result.get(b)!;
    expect(infoB.totalBits).toBe(8);
    expect(infoB.padding).toBe(0);
  });

  it("handles multiple groups at different offsets", () => {
    const a = makeBitfield("a", 0, 3);
    const b = makeBitfield("b", 0, 5);
    const c = makeBitfield("c", 4, 1);
    const d = makeBitfield("d", 4, 2);
    const result = computeBitfieldInfo([a, b, c, d]);

    expect(result.size).toBe(4);

    // First group
    expect(result.get(a)!.bitOffset).toBe(0);
    expect(result.get(b)!.bitOffset).toBe(3);
    expect(result.get(b)!.totalBits).toBe(8);

    // Second group
    expect(result.get(c)!.bitOffset).toBe(0);
    expect(result.get(d)!.bitOffset).toBe(1);
    expect(result.get(d)!.totalBits).toBe(3);
    expect(result.get(d)!.padding).toBe(5);
  });

  it("handles non-bitfield fields between bitfield groups", () => {
    const a = makeBitfield("a", 0, 4);
    const regular = makeField("mid", 4);
    const b = makeBitfield("b", 8, 6);
    const result = computeBitfieldInfo([a, regular, b]);

    expect(result.size).toBe(2);

    const infoA = result.get(a)!;
    expect(infoA.bitOffset).toBe(0);
    expect(infoA.bitCount).toBe(4);
    expect(infoA.totalBits).toBe(4);
    expect(infoA.padding).toBe(4);

    const infoB = result.get(b)!;
    expect(infoB.bitOffset).toBe(0);
    expect(infoB.bitCount).toBe(6);
    expect(infoB.totalBits).toBe(6);
    expect(infoB.padding).toBe(2);
  });

  it("handles multi-byte bitfield groups", () => {
    const a = makeBitfield("a", 0, 8);
    const b = makeBitfield("b", 0, 8);
    const c = makeBitfield("c", 0, 1);
    const result = computeBitfieldInfo([a, b, c]);

    expect(result.get(a)!.bitOffset).toBe(0);
    expect(result.get(a)!.bitCount).toBe(8);

    expect(result.get(b)!.bitOffset).toBe(8);
    expect(result.get(b)!.bitCount).toBe(8);

    expect(result.get(c)!.bitOffset).toBe(16);
    expect(result.get(c)!.bitCount).toBe(1);
    expect(result.get(c)!.totalBits).toBe(17);
    expect(result.get(c)!.padding).toBe(7);
  });

  it("only sets totalBits and padding on last field in group", () => {
    const a = makeBitfield("a", 0, 2);
    const b = makeBitfield("b", 0, 3);
    const c = makeBitfield("c", 0, 1);
    const result = computeBitfieldInfo([a, b, c]);

    expect(result.get(a)!.totalBits).toBe(0);
    expect(result.get(a)!.padding).toBe(0);

    expect(result.get(b)!.totalBits).toBe(0);
    expect(result.get(b)!.padding).toBe(0);

    expect(result.get(c)!.totalBits).toBe(6);
    expect(result.get(c)!.padding).toBe(2);
  });
});
