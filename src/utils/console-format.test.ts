import { describe, it, expect } from "vitest";
import { formatDefault, formatRange, parseColor } from "./console-format";
import type { ConVar } from "../data/types";

const convar = (type: string, value?: string): ConVar => ({
  kind: "convar",
  name: "x",
  type,
  default: value,
  flags: [],
  modules: [],
});

describe("parseColor", () => {
  it("parses rgba defaults", () => {
    expect(parseColor("[255, 0, 0, 255]")).toBe("rgb(255 0 0 / 1)");
    expect(parseColor("[0, 0, 0, 0]")).toBe("rgb(0 0 0 / 0)");
  });

  it("parses rgb defaults", () => {
    expect(parseColor("[136, 206, 245]")).toBe("rgb(136 206 245 / 1)");
  });

  it("rejects anything else", () => {
    expect(parseColor("[0.5, 0.5, 0.5]")).toBeNull();
    expect(parseColor("red")).toBeNull();
  });
});

describe("formatDefault", () => {
  it("quotes strings, including empty ones", () => {
    expect(formatDefault(convar("string", "hello"))).toBe('"hello"');
    expect(formatDefault(convar("string", ""))).toBe('""');
  });

  it("keeps other values as-is", () => {
    expect(formatDefault(convar("float32", "0.5"))).toBe("0.5");
    expect(formatDefault(convar("vector3", "[0, 0, 0]"))).toBe("[0, 0, 0]");
  });

  it("returns null without a default", () => {
    expect(formatDefault(convar("int32"))).toBeNull();
  });
});

describe("formatRange", () => {
  it("formats both, one or no bound", () => {
    expect(formatRange("0", "1")).toBe("[0 .. 1]");
    expect(formatRange("0")).toBe("[≥ 0]");
    expect(formatRange(undefined, "5")).toBe("[≤ 5]");
    expect(formatRange()).toBeNull();
  });
});
