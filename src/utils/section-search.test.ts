import { describe, expect, it } from "vitest";
import type { ConsoleItem, Declaration } from "../data/types";
import { buildContext, builtin, cls, field, search } from "../data/test-helpers";
import type { ConsoleMatch } from "./console-filtering";
import {
  nameMatchTier,
  TIER_EXACT,
  TIER_FUZZY,
  TIER_PREFIX,
  TIER_SUBSTRING,
  TIER_WORD_START,
} from "./match-score";
import type { NameHit, SearchResult, SearchRow } from "./search-types";
import {
  betterMatches,
  searchForSection,
  type SectionItems,
  type SectionResults,
} from "./section-search";

describe("nameMatchTier", () => {
  it("rates the worst-matching word", () => {
    expect(nameMatchTier(["sv_cheats"], ["sv_cheats"])).toBe(0);
    expect(nameMatchTier(["sv_cheats"], ["sv_"])).toBe(1);
    expect(nameMatchTier(["CLogicRelay"], ["relay"])).toBe(2);
    expect(nameMatchTier(["CLogicRelay"], ["clr"])).toBe(4);
    expect(nameMatchTier(["CLogicRelay"], ["relay", "health"])).toBe(5);
  });

  it("tells a word start from the middle of a word", () => {
    expect(nameMatchTier(["CCSPlayerPawn"], ["pawn"])).toBe(2);
    expect(nameMatchTier(["SPAWNGROUP_HEADER"], ["pawn"])).toBe(3);
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
  const convar = (name: string, tier = TIER_EXACT): ConsoleMatch => ({
    item: { kind: "convar", name } as ConsoleItem,
    tier,
  });
  const declaration = (name: string) => ({ kind: "class", name, module: "server" }) as Declaration;
  const relay = declaration("CLogicRelay");
  const lookups = { designNamesByDeclaration: new Map([[relay, ["logic_relay"]]]) };

  const nameRow = (decl: Declaration): SearchRow<NameHit> => ({
    hit: { kind: "name", declaration: decl, tier: 0, score: 0, nameWords: [], tags: [] },
  });
  const schemaResult = (...declarations: Declaration[]): SearchResult => ({
    names: declarations.map(nameRow),
    fields: [],
    inherited: [],
    similar: [],
    declarations: new Set(declarations),
  });
  const ownSchemas = (...declarations: Declaration[]): SectionItems => ({
    section: "schemas",
    result: schemaResult(...declarations),
  });
  const convars = (items: ConsoleMatch[], words: string[]): SectionResults => ({
    section: "console",
    items,
    words,
  });

  it("keeps only matches in a better tier than the own results", () => {
    const other = [convar("tv_relay", TIER_WORD_START), convar("relay")];
    const better = betterMatches(lookups, ownSchemas(relay), convars(other, ["relay"]));
    expect(better).toEqual({ section: "console", items: [convar("relay")] });
  });

  it("uses design names for the own results", () => {
    const other = convars([convar("logic_relay")], ["logic_relay"]);
    expect(betterMatches(lookups, ownSchemas(relay), other)).toEqual({
      section: "console",
      items: [],
    });
  });

  it("takes the first results when there are no own results", () => {
    const other = [convar("sv_cheats"), convar("sv_cheats_2", TIER_PREFIX)];
    const better = betterMatches(lookups, ownSchemas(), convars(other, ["sv_cheats"]));
    expect(better).toEqual({ section: "console", items: other });
  });

  it("does not admit fuzzy console matches without own results", () => {
    const other = [
      convar("hammer_overlay_draw_projection_triangles", TIER_FUZZY),
      convar("hero_speed", TIER_PREFIX),
    ];
    const better = betterMatches(lookups, ownSchemas(), convars(other, ["hero"]));
    expect(better).toEqual({ section: "console", items: [convar("hero_speed", TIER_PREFIX)] });
  });

  it("does not admit fuzzy console matches against weak own results", () => {
    const own = ownSchemas(declaration("CSomeCheatsHelper"));
    const other = convars(
      [convar("sv_querycache_stats", TIER_FUZZY), convar("sv_cheats")],
      ["sv_cheats"],
    );
    const better = betterMatches(lookups, own, other);
    expect(better).toEqual({ section: "console", items: [convar("sv_cheats")] });
  });

  it("does not admit fuzzy schema matches", () => {
    const own: SectionItems = { section: "console", items: [] };
    const other: SectionResults = {
      section: "schemas",
      result: schemaResult(declaration("CHeroEntityRelation"), declaration("CHero")),
      words: ["hero"],
    };
    const better = betterMatches(lookups, own, other);
    const names = better.section === "schemas" && better.names.map((r) => r.hit.declaration.name);
    expect(names).toEqual(["CHeroEntityRelation", "CHero"]);

    const fuzzy: SectionResults = {
      ...other,
      result: schemaResult(declaration("CHammerEverything")),
    };
    expect(betterMatches(lookups, own, fuzzy)).toEqual({
      section: "schemas",
      names: [],
      fields: [],
    });
  });

  it("needs name words to compare", () => {
    const better = betterMatches(lookups, ownSchemas(), convars([convar("sv_cheats")], []));
    expect(better).toEqual({ section: "console", items: [] });
  });

  describe("field and member rows", () => {
    const context = buildContext({
      classes: [cls("server", "CFoo", [field("m_flRadius", builtin("float32"), 8)])],
      enums: [
        {
          name: "EMode_t",
          module: "server",
          alignment: "uint8",
          members: [{ name: "MODE_FLAT", value: 0 }],
        },
      ],
    });

    it("rates an exact field name above a substring convar", () => {
      const result = search(context, "radius");
      expect(result.names).toEqual([]);
      const own: SectionItems = { section: "schemas", result };
      const other = convars([convar("sv_cheats_radius", TIER_WORD_START)], ["radius"]);
      expect(betterMatches(context, own, other)).toEqual({ section: "console", items: [] });
    });

    it("rates a member name too", () => {
      const own: SectionItems = { section: "schemas", result: search(context, "mode_flat") };
      const other = convars([convar("sv_mode_flat", TIER_WORD_START)], ["mode_flat"]);
      expect(betterMatches(context, own, other)).toEqual({ section: "console", items: [] });
    });

    it("picks a field row by its name when the convars page has weaker results", () => {
      const own: SectionItems = {
        section: "console",
        items: [convar("sv_cheats_radius", TIER_WORD_START)],
      };
      const result = search(context, "radius");
      const other: SectionResults = { section: "schemas", result, words: ["radius"] };
      const better = betterMatches(context, own, other);
      const fields = better.section === "schemas" && better.fields.map((r) => r.hit.declaration);
      expect(fields).toEqual([result.fields[0].hit.declaration]);
    });

    it("leaves out a field row that a convar matches better", () => {
      const own: SectionItems = { section: "console", items: [convar("radius")] };
      const other: SectionResults = {
        section: "schemas",
        result: search(context, "radius"),
        words: ["radius"],
      };
      const better = betterMatches(context, own, other);
      expect(better).toEqual({ section: "schemas", names: [], fields: [] });
    });
  });

  it("compares console results with the declarations of schema rows", () => {
    const own: SectionItems = { section: "console", items: [convar("tv_relay", TIER_WORD_START)] };
    const other: SectionResults = {
      section: "schemas",
      result: schemaResult(relay, declaration("RelayHelper"), declaration("CSomethingElse")),
      words: ["relay"],
    };
    const better = betterMatches(lookups, own, other);
    const names = better.section === "schemas" && better.names.map((r) => r.hit.declaration.name);
    expect(names).toEqual(["RelayHelper"]);
  });
});

describe("betterMatches with whole words", () => {
  const declaration = (name: string) => ({ kind: "class", name, module: "server" }) as Declaration;
  const nameRow = (decl: Declaration): SearchRow<NameHit> => ({
    hit: { kind: "name", declaration: decl, tier: 0, score: 0, nameWords: [], tags: [] },
  });
  const convar = (name: string, tier: number): ConsoleMatch => ({
    item: { kind: "convar", name } as ConsoleItem,
    tier,
  });

  it("leaves out a schema match that cuts into the next word", () => {
    const manager = declaration("CManager");
    const drain = declaration("CManaDrain");
    const result: SearchResult = {
      names: [nameRow(manager), nameRow(drain)],
      fields: [],
      inherited: [],
      similar: [],
      declarations: new Set([manager, drain]),
    };
    const own: SectionItems = { section: "console", items: [convar("x_mana", TIER_SUBSTRING)] };
    const other: SectionResults = { section: "schemas", result, words: ["mana"] };
    const better = betterMatches({ designNamesByDeclaration: new Map() }, own, other);
    const names = better.section === "schemas" && better.names.map((r) => r.hit.declaration.name);
    expect(names).toEqual(["CManaDrain"]);
  });

  describe("field names without their type prefix", () => {
    const context = buildContext({
      classes: [cls("server", "CFoo", [field("m_flFps", builtin("float32"), 8)])],
      enums: [],
    });
    const other: SectionResults = {
      section: "schemas",
      result: search(context, "fps"),
      words: ["fps"],
    };

    it("are no better than a convar with the word as its prefix", () => {
      const own: SectionItems = { section: "console", items: [convar("fps_max", TIER_PREFIX)] };
      expect(betterMatches(context, own, other)).toEqual({
        section: "schemas",
        names: [],
        fields: [],
      });
    });

    it("are better than a convar with the word inside", () => {
      const own: SectionItems = {
        section: "console",
        items: [convar("sv_fps", TIER_WORD_START)],
      };
      const better = betterMatches(context, own, other);
      expect(better.section === "schemas" && better.fields).toHaveLength(1);
    });
  });
});

describe("searchForSection", () => {
  it("treats a tag written alone and its value as one", () => {
    expect(searchForSection("relay flag: cheat", "schemas")).toEqual({
      search: "relay",
      complete: false,
    });
    expect(searchForSection("relay entity: weapon", "console")).toEqual({
      search: "relay",
      complete: false,
    });
    expect(searchForSection("relay module: server", "console")).toEqual({
      search: "relay module:server",
      complete: true,
    });
  });

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

  it("ignores tabs and newlines", () => {
    expect(searchForSection("a\t\tb\n", "console")).toEqual({ search: "a b", complete: true });
  });
});
