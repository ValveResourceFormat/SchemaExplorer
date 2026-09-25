import { describe, expect, it } from "vitest";
import type { ConsoleItem, Declaration } from "../data/types";
import { nameMatchTier } from "./filtering";
import { betterMatches, searchForSection } from "./section-search";

describe("nameMatchTier", () => {
  it("rates the worst-matching word", () => {
    expect(nameMatchTier(["sv_cheats"], ["sv_cheats"])).toBe(0);
    expect(nameMatchTier(["sv_cheats"], ["sv_"])).toBe(1);
    expect(nameMatchTier(["CLogicRelay"], ["relay"])).toBe(2);
    expect(nameMatchTier(["CLogicRelay"], ["clr"])).toBe(3);
    expect(nameMatchTier(["CLogicRelay"], ["relay", "health"])).toBe(4);
  });

  it("reads spaces as underscores or nothing", () => {
    expect(nameMatchTier(["cl_color"], ["cl", "color"])).toBe(0);
    expect(nameMatchTier(["CLevelsColorCorrectionLayer"], ["cl", "color"])).toBe(2);
    expect(nameMatchTier(["m_flRadius"], ["fl", "radius"])).toBe(2);
  });

  it("takes the best of the names", () => {
    expect(nameMatchTier(["CLogicRelay", "logic_relay"], ["logic_relay"])).toBe(0);
  });
});

describe("betterMatches", () => {
  const convarResults = (items: ConsoleItem[], words: string[]) =>
    ({ section: "console", items, words }) as const;
  const convar = (name: string) => ({ kind: "convar", name }) as ConsoleItem;
  const relay = { kind: "class", name: "CLogicRelay", module: "server" } as Declaration;
  const lookups = {
    declarations: new Map([["server", new Map([[relay.name, relay]])]]),
    designNamesByDeclaration: new Map([[relay, ["logic_relay"]]]),
  };

  it("keeps only matches in a better tier than the own results", () => {
    const other = [convar("tv_relay"), convar("relay")];
    expect(betterMatches(lookups, [relay], convarResults(other, ["relay"])).items).toEqual([
      convar("relay"),
    ]);
  });

  it("uses design names for the own results", () => {
    expect(
      betterMatches(lookups, [relay], convarResults([convar("logic_relay")], ["logic_relay"]))
        .items,
    ).toEqual([]);
  });

  it("takes the first results when there are no own results", () => {
    const other = [convar("sv_cheats"), convar("sv_cheats_2")];
    expect(betterMatches(lookups, [], convarResults(other, ["sv_cheats"])).items).toEqual(other);
  });

  it("needs name words to compare", () => {
    expect(betterMatches(lookups, [], convarResults([convar("sv_cheats")], [])).items).toEqual([]);
  });
});

describe("searchForSection", () => {
  it("keeps name words and module: in both sections", () => {
    expect(searchForSection("relay module:server", "console")).toEqual({
      search: "relay module:server",
      complete: true,
    });
    expect(searchForSection("relay module:server", "schemas")).toEqual({
      search: "relay module:server",
      complete: true,
    });
  });

  it("drops console-only tags for schemas", () => {
    expect(searchForSection("sv_ flag:cheat -module:client type:bool", "schemas")).toEqual({
      search: "sv_",
      complete: false,
    });
  });

  it("drops schema-only tags for the console", () => {
    expect(
      searchForSection(
        "health offset:0x10 metadata:MPropertyFriendlyName Entity:trigger_",
        "console",
      ),
    ).toEqual({ search: "health", complete: false });
  });

  it("ignores extra spaces", () => {
    expect(searchForSection("  a   b ", "console")).toEqual({ search: "a b", complete: true });
  });
});
