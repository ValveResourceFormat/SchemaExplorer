import { describe, it, expect } from "vitest";
import {
  filterConsoleItems,
  getConsoleStats,
  nextTagState,
  getTagState,
  moduleFilter,
  parseConsoleSearch,
  searchConsoleItems,
  searchConsoleResults,
  setSearchTag,
  stripConsoleFilters,
} from "./console-filtering";
import { TIER_EXACT, TIER_PREFIX } from "./match-score";
import { parseConsole } from "../data/schemas";

const consoleItems = parseConsole({
  convars: [
    {
      name: "sv_gravity",
      type: "float32",
      default: "800",
      flags: ["notify", "replicated"],
      modules: ["client", "server"],
      help: "World gravity.",
    },
    {
      name: "sv_cheats",
      type: "bool",
      default: "false",
      flags: ["notify", "replicated"],
      modules: ["engine2"],
    },
    { name: "cl_ui_scale", type: "float32", flags: ["archive"], modules: ["panoramauiclient"] },
    { name: "r_shadowtile_waveops", type: "bool", flags: ["reference"], modules: [] },
  ],
  commands: [
    { name: "exec", flags: ["flag_33"], modules: ["engine2"], help: "Execute script file." },
    { name: "noclip", flags: ["cheat"], modules: ["server"] },
  ],
});

function names(search: string, kind?: "all" | "convars" | "commands") {
  const { results } = searchConsoleItems(consoleItems, parseConsoleSearch(search), { kind });
  return results.map((match) => match.item.name);
}

describe("parseConsole", () => {
  it("merges convars and commands sorted by name", () => {
    expect(consoleItems.map((i) => i.name)).toEqual([
      "cl_ui_scale",
      "exec",
      "noclip",
      "r_shadowtile_waveops",
      "sv_cheats",
      "sv_gravity",
    ]);
    expect(consoleItems.find((i) => i.name === "exec")?.kind).toBe("command");
  });

  it("tolerates missing arrays", () => {
    expect(parseConsole({})).toEqual([]);
  });
});

describe("getConsoleStats", () => {
  it("counts modules, flags, types and kinds", () => {
    const stats = getConsoleStats(consoleItems);
    expect(stats.modules.get("engine2")).toBe(2);
    expect(stats.flags.get("replicated")).toBe(2);
    expect(stats.types.get("bool")).toBe(2);
    expect([stats.convars, stats.commands]).toEqual([4, 2]);
    // Most used first, ties by name
    expect(stats.sorted.modules.slice(0, 2)).toEqual(["engine2", "server"]);
    expect(stats.sorted.types).toEqual(["bool", "float32"]);
    expect(getConsoleStats(consoleItems)).toBe(stats);
  });
});

describe("parseConsoleSearch", () => {
  it("splits name words and tags", () => {
    expect(
      parseConsoleSearch(
        "sv_ flag:cheat -flag:hidden module:server -module:client type:bool -type:string",
      ),
    ).toEqual({
      nameWords: ["sv_"],
      modules: ["server"],
      notModules: ["client"],
      types: ["bool"],
      notTypes: ["string"],
      flags: ["cheat"],
      notFlags: ["hidden"],
    });
  });

  it("keeps command names starting with + or - as name words", () => {
    expect(parseConsoleSearch("+attack -attack").nameWords).toEqual(["+attack", "-attack"]);
  });

  it("splits words on any whitespace", () => {
    expect(parseConsoleSearch("sv_cheats\t\tflag:cheat\n").nameWords).toEqual(["sv_cheats"]);
  });

  it("takes the word after a tag written alone as its value", () => {
    const parsed = parseConsoleSearch("flag: cheat -flag: hidden module: client type: bool sv");
    expect(parsed.flags).toEqual(["cheat"]);
    expect(parsed.notFlags).toEqual(["hidden"]);
    expect(parsed.modules).toEqual(["client"]);
    expect(parsed.types).toEqual(["bool"]);
    expect(parsed.nameWords).toEqual(["sv"]);
  });

  it("leaves a tag written alone before another tag or at the end empty", () => {
    const parsed = parseConsoleSearch("flag: module:server type:");
    expect(parsed.flags).toEqual([]);
    expect(parsed.modules).toEqual(["server"]);
    expect(parsed.types).toEqual([]);
    expect(parsed.nameWords).toEqual([]);
  });

  it("trims punctuation around name words", () => {
    for (const word of [
      '"cheats"',
      "*cheats",
      "cheats?",
      "(cheats)",
      "cheats,",
      "cheats=",
      "cheats;",
    ]) {
      expect(parseConsoleSearch(word).nameWords).toEqual(["cheats"]);
    }
    expect(parseConsoleSearch("sv_cheats. ??").nameWords).toEqual(["sv_cheats"]);
  });

  it("keeps the + and - of a command name when trimming", () => {
    expect(parseConsoleSearch("+attack, (-attack)").nameWords).toEqual(["+attack", "attack"]);
  });
});

describe("tags written alone in search strings", () => {
  it("strips both words of a tag", () => {
    expect(stripConsoleFilters("flag: cheat sv_ -module: server")).toBe("sv_");
  });

  it("sets a tag over the same tag written alone", () => {
    expect(setSearchTag("sv_ flag: cheat", "flag:", "cheat", "off")).toBe("sv_");
    expect(setSearchTag("sv_ flag: cheat", "flag:", "cheat", "exclude")).toBe("sv_ -flag:cheat");
  });
});

describe("filterConsoleItems", () => {
  it("returns everything in name order without a query", () => {
    expect(names("")).toHaveLength(consoleItems.length);
  });

  it("fuzzy matches names and ranks exact matches first", () => {
    expect(names("exec")[0]).toBe("exec");
    expect(names("sv_cheats")).toEqual(["sv_cheats"]);
  });

  it("does not search help text", () => {
    expect(names("gravity")).toEqual(["sv_gravity"]);
    expect(names("script")).toEqual([]);
  });

  it("filters by kind", () => {
    expect(names("", "commands")).toEqual(["exec", "noclip"]);
    expect(names("", "convars")).not.toContain("exec");
  });

  it("matches known module names exactly", () => {
    expect(names("module:client")).toEqual(["sv_gravity"]);
    expect(names("module:clie")).toEqual(["cl_ui_scale", "sv_gravity"]);
  });

  it("ORs modules and ANDs flags", () => {
    expect(names("module:server module:engine2")).toEqual([
      "exec",
      "noclip",
      "sv_cheats",
      "sv_gravity",
    ]);
    expect(names("flag:notify flag:replicated")).toEqual(["sv_cheats", "sv_gravity"]);
    expect(names("flag:notify flag:cheat")).toEqual([]);
  });

  it("excludes negated flags and modules", () => {
    expect(names("-flag:replicated")).toEqual([
      "cl_ui_scale",
      "exec",
      "noclip",
      "r_shadowtile_waveops",
    ]);
    expect(names("-module:engine2", "commands")).toEqual(["noclip"]);
  });

  it("type: only matches convars", () => {
    expect(names("type:bool")).toEqual(["r_shadowtile_waveops", "sv_cheats"]);
  });

  it("-type: hides convars of that type, keeping commands", () => {
    expect(names("-type:float32")).toEqual(["exec", "noclip", "r_shadowtile_waveops", "sv_cheats"]);
  });

  it("drops referenced-only convars when a module is selected", () => {
    expect(names("module:server")).not.toContain("r_shadowtile_waveops");
  });

  it("can ignore module filters for chip counts", () => {
    const parsed = parseConsoleSearch("module:server");
    expect(filterConsoleItems(consoleItems, parsed, { ignoreModules: true })).toHaveLength(
      consoleItems.length,
    );
  });
});

describe("filterConsoleItems name ranking", () => {
  const rankingItems = parseConsole({
    convars: [
      { name: "cl_clear_color_buffer", type: "bool", modules: ["client"] },
      { name: "cl_color", type: "int32", modules: ["client"] },
      { name: "cl_color_mode", type: "int32", modules: ["client"] },
      { name: "color_cl", type: "int32", modules: ["client"] },
      { name: "r_spawngroup_debug", type: "bool", modules: ["client"] },
      { name: "sv_pawn_debug", type: "bool", modules: ["server"] },
      { name: "sv_gravity", type: "float32", modules: ["server"] },
    ],
  });

  function ranked(search: string, similar = false) {
    const found = searchConsoleItems(rankingItems, parseConsoleSearch(search));
    return similar ? found.similar : found.results;
  }

  function rankedNames(search: string, similar = false) {
    return ranked(search, similar).map((match) => match.item.name);
  }

  it("finds cl_color first for the words cl color", () => {
    const found = rankedNames("cl color");
    expect(found).toEqual(["cl_color", "cl_color_mode", "color_cl", "cl_clear_color_buffer"]);
  });

  it("ranks a word start above the middle of a word", () => {
    expect(rankedNames("pawn")).toEqual(["sv_pawn_debug", "r_spawngroup_debug"]);
  });

  it("ranks exact, prefix, then shorter names", () => {
    expect(rankedNames("cl_color")).toEqual(["cl_color", "cl_color_mode"]);
  });

  it("leaves fuzzy matches out of the results", () => {
    expect(ranked("svgrv")).toEqual([]);
    expect(rankedNames("svgrv", true)).toEqual(["sv_gravity"]);
  });

  it("lists a name only once, as a result or as a similar name", () => {
    expect(rankedNames("sv_gr")).toEqual(["sv_gravity"]);
    expect(ranked("sv_gr", true)).toEqual([]);
    expect(ranked("svpdbg")).toEqual([]);
    expect(rankedNames("svpdbg", true)).toEqual(["sv_pawn_debug"]);
  });

  it("has no similar names without a search", () => {
    expect(ranked("", true)).toEqual([]);
    expect(ranked("")).toHaveLength(rankingItems.length);
  });

  it("finds the results and the similar names in one pass", () => {
    const found = searchConsoleItems(rankingItems, parseConsoleSearch("sv_gr"));
    expect(found.results.map((match) => match.item.name)).toEqual(["sv_gravity"]);
    const fuzzy = searchConsoleItems(rankingItems, parseConsoleSearch("svpdbg"));
    expect(fuzzy.results).toEqual([]);
    expect(fuzzy.similar.map((match) => match.item.name)).toEqual(["sv_pawn_debug"]);
  });

  it("keeps the items themselves", () => {
    const [match] = ranked("cl_color");
    expect(match.item).toBe(rankingItems.find((item) => item.name === "cl_color"));
  });

  it("carries the tier of the name", () => {
    expect(ranked("cl_color").map((match) => match.tier)).toEqual([TIER_EXACT, TIER_PREFIX]);
    expect(ranked("")[0].tier).toBe(TIER_EXACT);
  });

  it("filters without ranking, in item order", () => {
    const parsed = parseConsoleSearch("color");
    const found = filterConsoleItems(rankingItems, parsed).map((item) => item.name);
    expect(found).toEqual(["cl_clear_color_buffer", "cl_color", "cl_color_mode", "color_cl"]);
    expect(filterConsoleItems(rankingItems, parseConsoleSearch("svgrv"))).toEqual([]);
  });

  it("exposes the matched part of the name", () => {
    expect(ranked("gravity")[0].nameRanges).toEqual([3, 10]);
    expect(ranked("pawn")[1].nameRanges).toEqual([3, 7]);
  });

  it("merges the ranges of every word", () => {
    expect(rankedNames("grav sv")).toEqual(["sv_gravity"]);
    expect(ranked("grav sv")[0].nameRanges).toEqual([0, 2, 3, 7]);
  });

  it("covers the whole name when the joined words match it", () => {
    expect(ranked("cl color")[0].nameRanges).toEqual([0, 8]);
  });

  it("exposes each matched letter of a similar name", () => {
    expect(ranked("svgrv", true)[0].nameRanges).toEqual([0, 2, 3, 5, 6, 7]);
  });

  it("does not add ranges without name words", () => {
    expect(ranked("")[0].nameRanges).toBeUndefined();
  });
});

describe("setSearchTag / getTagState", () => {
  it("adds, negates and removes a tag", () => {
    let s = setSearchTag("sv_", "flag:", "cheat", "include");
    expect(s).toBe("sv_ flag:cheat");
    expect(getTagState(parseConsoleSearch(s), "flag:", "cheat")).toBe("include");
    s = setSearchTag(s, "flag:", "cheat", "exclude");
    expect(s).toBe("sv_ -flag:cheat");
    expect(getTagState(parseConsoleSearch(s), "flag:", "cheat")).toBe("exclude");
    s = setSearchTag(s, "flag:", "cheat", "off");
    expect(s).toBe("sv_");
    expect(getTagState(parseConsoleSearch(s), "flag:", "cheat")).toBe("off");
  });

  it("cycles flags through exclude and toggles modules", () => {
    expect(nextTagState("flag:", "off")).toBe("include");
    expect(nextTagState("flag:", "include")).toBe("exclude");
    expect(nextTagState("flag:", "exclude")).toBe("off");
    expect(nextTagState("module:", "include")).toBe("off");
  });

  it("is case-insensitive when replacing", () => {
    expect(setSearchTag("module:Server x", "module:", "server", "off")).toBe("x");
  });
});

describe("stripConsoleFilters", () => {
  it("removes tags and negated tags, keeping name words", () => {
    expect(stripConsoleFilters("sv_ flag:cheat -flag:hidden Module:server type:bool cheats")).toBe(
      "sv_ cheats",
    );
  });

  it("keeps command names that start with a dash", () => {
    expect(stripConsoleFilters("-attack flag:cheat")).toBe("-attack");
  });
});

describe("similar names", () => {
  function similarNames(search: string): string[] {
    const { similar } = searchConsoleItems(consoleItems, parseConsoleSearch(search));
    return similar.map((match) => match.item.name);
  }

  it("lists a name with a word that is one swap or edit away", () => {
    expect(similarNames("gravtiy")).toEqual(["sv_gravity"]);
    expect(similarNames("cheatz")).toEqual(["sv_cheats"]);
    expect(similarNames("gravit")).toEqual([]);
    const { results } = searchConsoleItems(consoleItems, parseConsoleSearch("gravtiy"));
    expect(results).toEqual([]);
  });

  it("highlights the word of the name", () => {
    const { similar } = searchConsoleItems(consoleItems, parseConsoleSearch("gravtiy"));
    expect(similar[0].nameRanges).toEqual([3, 10]);
  });

  it("needs every word in the name", () => {
    expect(similarNames("gravtiy sv_")).toEqual(["sv_gravity"]);
    expect(similarNames("gravtiy exec")).toEqual([]);
  });

  it("does not look for typos of words shorter than four letters", () => {
    expect(similarNames("exq")).toEqual([]);
    expect(similarNames("exeq")).toEqual(["exec"]);
  });

  it("does not count a typo as a result", () => {
    expect(filterConsoleItems(consoleItems, parseConsoleSearch("gravtiy"))).toEqual([]);
  });
});

describe("searchConsoleResults", () => {
  const searches = [
    "",
    "sv",
    "cheats",
    "sv_ cheats",
    "sv chets",
    "gravtiy",
    "r shadowtile",
    "r shadowtilewaveops",
    "cl uiscale",
    "ui scale",
    "flag:cheat",
    "module:server sv",
    "x_",
  ];

  it("lists the results of searchConsoleItems", () => {
    for (const search of searches) {
      const parsed = parseConsoleSearch(search);
      const results = searchConsoleResults(consoleItems, parsed);
      expect(results).toEqual(searchConsoleItems(consoleItems, parsed).results);
    }
  });

  it("applies the options of searchConsoleItems", () => {
    const parsed = parseConsoleSearch("sv");
    const results = searchConsoleResults(consoleItems, parsed, { kind: "commands" });
    expect(results).toEqual([]);
  });

  it("lists the items filterConsoleItems keeps", () => {
    for (const search of searches) {
      const parsed = parseConsoleSearch(search);
      const kept = filterConsoleItems(consoleItems, parsed).map((item) => item.name);
      const results = searchConsoleResults(consoleItems, parsed).map((match) => match.item.name);
      expect(results.toSorted()).toEqual(kept.toSorted());
    }
  });

  it("finds a name by its joined words when a word only matches fuzzily", () => {
    const results = searchConsoleResults(consoleItems, parseConsoleSearch("r shadowtilewaveops"));
    expect(results.map((match) => match.item.name)).toEqual(["r_shadowtile_waveops"]);
    expect(results[0].tier).toBe(TIER_EXACT);
  });
});

describe("short words and prefixes", () => {
  it("matches a word of two letters or fewer, and one ending in _, at the start of a word", () => {
    expect(names("v_")).toEqual([]);
    expect(names("sv")).toEqual(["sv_cheats", "sv_gravity"]);
    expect(names("r_")).toEqual(["r_shadowtile_waveops"]);
    expect(names("ui_")).toEqual(["cl_ui_scale"]);
    expect(names("ui")).toEqual(["cl_ui_scale"]);
  });

  it("does not match a prefix with an underscore fuzzily", () => {
    expect(searchConsoleItems(consoleItems, parseConsoleSearch("sv_")).similar).toEqual([]);
    expect(searchConsoleItems(consoleItems, parseConsoleSearch("x_")).similar).toEqual([]);
  });
});

describe("moduleFilter", () => {
  const stats = getConsoleStats(consoleItems);
  const names = (search: string) => {
    const filter = moduleFilter(parseConsoleSearch(search), stats);
    return filter ? consoleItems.filter(filter).map((i) => i.name) : null;
  };

  it("is null without module filters", () => {
    expect(names("sv_ flag:cheat")).toBeNull();
  });

  it("matches the same items as filtering by modules", () => {
    for (const search of ["module:server", "-module:engine2", "module:clie -module:server"]) {
      expect(names(search)).toEqual(
        filterConsoleItems(consoleItems, parseConsoleSearch(search)).map((i) => i.name),
      );
    }
  });
});
