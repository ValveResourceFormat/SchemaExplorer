import { describe, it, expect } from "vitest";
import { buildInheritedGroups, entityLabel, formatDescription } from "./entity-format";
import type { EntityClass, EntityInput } from "../data/types";

const input = (name: string): EntityInput => ({ name, params: [], returns: [], pulseNode: false });
const entity = (cls: string, inputs: string[]): EntityClass => ({
  class: cls,
  module: "server",
  classModule: "server",
  spawnable: true,
  flags: [],
  spawnOrder: 0,
  components: [],
  keys: [],
  inputs: inputs.map(input),
  outputs: [],
});

describe("formatDescription", () => {
  it("turns <br> into line breaks", () => {
    expect(formatDescription("a<br>b<br/>c<BR />d")).toBe("a\nb\nc\nd");
  });
});

describe("buildInheritedGroups", () => {
  const root = entity("CEntityInstance", ["Kill", "AddOutput", "Enable"]);
  const brush = entity("CFuncBrush", ["Enable", "Disable"]);
  const volume = entity("CFuncElectrifiedVolume", ["Disable"]);
  const groups = buildInheritedGroups(volume, [brush, root], (e) => e.inputs);

  it("groups inherited entries by base, nearest first", () => {
    expect(groups.map((g) => g.entity.class)).toEqual(["CFuncBrush", "CEntityInstance"]);
  });

  it("marks entries redeclared by a nearer class as overridden", () => {
    const brushDisable = groups[0].entries.find((e) => e.entry.name === "Disable");
    expect(brushDisable?.overriddenBy).toBe(volume);
    const rootEnable = groups[1].entries.find((e) => e.entry.name === "Enable");
    expect(rootEnable?.overriddenBy).toBe(brush);
  });

  it("counts only entries that aren't overridden", () => {
    expect(groups.map((g) => g.count)).toEqual([1, 2]);
  });

  it("compares names case-insensitively", () => {
    const lower = entity("CLower", ["kill"]);
    const [g] = buildInheritedGroups(lower, [root], (e) => e.inputs);
    expect(g.entries.find((e) => e.entry.name === "Kill")?.overriddenBy).toBe(lower);
  });

  it("skips bases without entries", () => {
    const empty = entity("CEmpty", []);
    expect(
      buildInheritedGroups(volume, [empty, root], (e) => e.inputs).map((g) => g.entity),
    ).toEqual([root]);
  });
});

describe("entityLabel", () => {
  it("prefers the design name over the class", () => {
    expect(entityLabel({ ...entity("CTriggerMultiple", []), designName: "trigger_multiple" })).toBe(
      "trigger_multiple",
    );
    expect(entityLabel(entity("CBaseEntity", []))).toBe("CBaseEntity");
  });
});
