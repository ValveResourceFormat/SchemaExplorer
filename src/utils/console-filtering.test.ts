import { describe, it, expect } from "vitest";
import {
  filterConsoleItems,
  getConsoleStats,
  nextTagState,
  getTagState,
  moduleFilter,
  parseConsoleSearch,
  setSearchTag,
  stripConsoleFilters,
} from "./console-filtering";
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
  return filterConsoleItems(consoleItems, parseConsoleSearch(search), { kind }).map((i) => i.name);
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
