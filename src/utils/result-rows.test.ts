import { describe, expect, it } from "vitest";
import { buildContext, builtin, cls, field, search } from "../data/test-helpers";
import type { ConsoleItem } from "../data/types";
import {
  buildResultRows,
  formatRowOffsets,
  hitOffset,
  hitDesignNames,
  hitWhy,
  matchedRanges,
  rowDeclarations,
  SIMILAR_SHOWN,
} from "./result-rows";
import type { NameHit, SearchResult } from "./search-types";

function types(result: SearchResult, showAll = false): string[] {
  return buildResultRows(result, showAll).map((row) => row.type);
}

const int = builtin("int32");

const context = buildContext({
  classes: [
    cls("server", "CPlayerPawn", [field("m_iHealth", int, 8)]),
    cls("server", "CHealthBar"),
    cls("server", "CBaseFoo", [field("m_nFoo", int, 8)]),
    cls("client", "C_BaseFoo", [field("m_nFoo", int, 16)]),
  ],
  enums: [],
});

describe("buildResultRows", () => {
  it("lists the sections in order with a header each", () => {
    const rows = buildResultRows(search(context, "health"), false);
    expect(rows.map((row) => row.type)).toEqual(["section", "name", "section", "field"]);
    expect(rows.map((row) => row.key)).toEqual([
      "section:names",
      "name:server/CHealthBar",
      "section:fields",
      "field:server/CPlayerPawn/m_iHealth",
    ]);
  });

  it("heads each section with its id", () => {
    const rows = buildResultRows(search(context, "health"), false);
    expect(rows[0]).toMatchObject({ type: "section", id: "names" });
    expect(rows[2]).toMatchObject({ type: "section", id: "fields" });
  });

  it("leaves out sections without rows", () => {
    expect(types(search(context, "healthbar"))).toEqual(["section", "name"]);
  });

  it("has no rows for a query without a match", () => {
    expect(types(search(context, "zzzzzz"))).toEqual(["empty"]);
  });

  it("puts the empty message above the similar names", () => {
    const rows = buildResultRows(search(context, "cpp"), false);
    expect(rows.map((row) => row.type)).toEqual(["empty", "section", "similar"]);
    expect(rows[2].key).toBe("similar:server/CPlayerPawn");
  });

  it("lists a similar field as a similar row of its own, keyed by the field", () => {
    const rows = buildResultRows(search(context, "healht"), false);
    expect(rows.map((row) => row.type)).toEqual(["empty", "section", "similar", "similar"]);
    const keys = rows.map((row) => row.key);
    expect(keys).toContain("similar:server/CHealthBar");
    expect(keys).toContain("similar:server/CPlayerPawn/m_iHealth");
  });

  it("keys a pair by the side that matched better", () => {
    const rows = buildResultRows(search(context, "basefoo"), false);
    expect(rows.map((row) => row.type)).toEqual(["section", "name"]);
    const row = rows[1];
    expect(row.type === "name" && row.row.paired).toBeTruthy();
    expect(row.key).toBe("name:server/CBaseFoo");
  });
});

describe("inherited fields", () => {
  const inheritedContext = buildContext({
    classes: [
      cls("server", "CBaseEntity", [field("m_iHealth", int, 8)]),
      cls("server", "CPlayerPawn", [], { parents: [{ name: "CBaseEntity", module: "server" }] }),
      cls("server", "CPlayerController", [], {
        parents: [{ name: "CBaseEntity", module: "server" }],
      }),
    ],
    enums: [],
  });
  const result = search(inheritedContext, "player health");

  it("puts the section after the fields and before the convars", () => {
    const item = { kind: "convar", name: "sv_health" } as ConsoleItem;
    const rows = buildResultRows(result, false, {
      convars: { items: [{ item, tier: 0 }], total: 1 },
    });
    expect(rows.map((row) => row.key)).toEqual([
      "section:inherited",
      "inherited:server/CBaseEntity/m_iHealth",
      "section:console",
      "convar/sv_health",
    ]);
  });

  it("heads the rows with the section", () => {
    const rows = buildResultRows(result, false);
    expect(rows[0]).toMatchObject({ type: "section", id: "inherited" });
    expect(rows[1]).toMatchObject({ type: "inherited" });
  });

  it("is not empty with an inherited field alone", () => {
    expect(types(result)).toEqual(["section", "inherited"]);
  });

  it("keys the rows of another game by the game", () => {
    const rows = buildResultRows(search(context, "zzzzzz"), false, {
      otherGames: [{ gameId: "dota2", result }],
    });
    expect(rows.map((row) => row.key)).toEqual([
      "empty",
      "game:dota2",
      "dota2:inherited:server/CBaseEntity/m_iHealth",
    ]);
  });

  it("has none for a query of one word", () => {
    expect(types(search(inheritedContext, "health"))).not.toContain("inherited");
  });
});

describe("other rows of the list", () => {
  const convar = (name: string, kind = "convar") => ({
    item: { kind, name } as ConsoleItem,
    tier: 0,
  });

  it("puts the convars after the fields and before the similar names", () => {
    const result = search(context, "health");
    const rows = buildResultRows(result, false, {
      convars: { items: [convar("sv_health")], total: 4 },
    });
    expect(rows.map((row) => row.key)).toEqual([
      "section:names",
      "name:server/CHealthBar",
      "section:fields",
      "field:server/CPlayerPawn/m_iHealth",
      "section:console",
      "convar/sv_health",
    ]);
    expect(rows[4]).toMatchObject({ type: "consoleHeader", total: 4 });
  });

  it("keys a convar and a command of the same name apart", () => {
    const command = convar("sv_health", "command");
    const rows = buildResultRows(search(context, "zzzzzz"), false, {
      convars: { items: [convar("sv_health"), command], total: 2 },
    });
    const keys = rows.filter((row) => row.type === "console").map((row) => row.key);
    expect(keys).toEqual(["convar/sv_health", "command/sv_health"]);
  });

  it("puts the hint under the empty message when there are no convars to list", () => {
    const rows = buildResultRows(search(context, "zzzzzz"), false, {
      convars: { items: [], total: 4 },
    });
    expect(rows.map((row) => row.type)).toEqual(["empty", "consoleHint"]);
  });

  it("has no hint when this game has results", () => {
    const rows = buildResultRows(search(context, "health"), false, {
      convars: { items: [], total: 4 },
    });
    expect(rows.map((row) => row.type)).not.toContain("consoleHint");
  });

  it("lists another game's results after the convars", () => {
    const rows = buildResultRows(search(context, "zzzzzz"), false, {
      otherGames: [{ gameId: "dota2", result: search(context, "health") }],
    });
    expect(rows.map((row) => row.key)).toEqual([
      "empty",
      "game:dota2",
      "dota2:name:server/CHealthBar",
      "dota2:field:server/CPlayerPawn/m_iHealth",
    ]);
    expect(rows[2]).toMatchObject({ type: "name", game: "dota2" });
  });
});

describe("similar names", () => {
  const classes: ReturnType<typeof cls>[] = [];
  for (let i = 0; i < SIMILAR_SHOWN + 10; i++) classes.push(cls("server", `AxBxC${i}`));
  const many = search(buildContext({ classes, enums: [] }), "abc");

  it("lists the first ones and a row for the rest", () => {
    expect(many.similar.length).toBe(SIMILAR_SHOWN + 10);
    const rows = buildResultRows(many, false);
    expect(rows.filter((row) => row.type === "similar").length).toBe(SIMILAR_SHOWN);
    expect(rows[rows.length - 1]).toMatchObject({ type: "showAll", count: SIMILAR_SHOWN + 10 });
  });

  it("lists them all once asked", () => {
    const rows = buildResultRows(many, true);
    expect(rows.filter((row) => row.type === "similar").length).toBe(SIMILAR_SHOWN + 10);
    expect(rows.some((row) => row.type === "showAll")).toBe(false);
  });

  it("has no row for the rest when everything is listed", () => {
    const few = search(buildContext({ classes: classes.slice(0, 5), enums: [] }), "abc");
    expect(types(few)).not.toContain("showAll");
  });

  it("keeps keys unique", () => {
    const rows = buildResultRows(many, true);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe("row details", () => {
  it("lists the server first for a pair", () => {
    const { names } = search(context, "basefoo");
    const { hit, paired } = names[0];
    const modules = rowDeclarations(hit.declaration, paired?.declaration).map((d) => d.module);
    expect(modules).toEqual(["server", "client"]);
    const swapped = rowDeclarations(paired!.declaration, hit.declaration);
    expect(swapped.map((d) => d.module)).toEqual(["server", "client"]);
  });

  it("lists a single declaration alone", () => {
    const { names } = search(context, "healthbar");
    expect(rowDeclarations(names[0].hit.declaration).map((d) => d.name)).toEqual(["CHealthBar"]);
  });

  it("joins the ranges of the words that matched a name", () => {
    const { names } = search(context, "health bar");
    const { hit } = names[0];
    expect(matchedRanges(hit.nameWords, "name", "CHealthBar")).toEqual([1, 10]);
    expect(matchedRanges(hit.nameWords, "name", "Other")).toEqual([]);
    expect(matchedRanges(hit.nameWords, "designName", "CHealthBar")).toEqual([]);
  });

  it("shows offsets only for an offset search", () => {
    expect(formatRowOffsets(search(context, "foo").fields[0])).toBeNull();

    const result = search(context, "offset:8");
    expect(result.fields.length).toBeGreaterThan(0);
    expect(hitOffset(result.fields[0].hit)).toBe(8);
    expect(formatRowOffsets(result.fields[0])).toBe("0x08");
  });

  it("shows both offsets of a pair that differ", () => {
    const { fields } = search(context, "nfoo");
    const row = fields.find((r) => r.paired);
    expect(row).toBeDefined();
    // Offsets are only a tag for an offset search, so this checks the formatting alone
    const tagged = {
      hit: { ...row!.hit, tags: [{ kind: "offset" as const, offset: 8 }] },
      paired: { ...row!.paired!, tags: [{ kind: "offset" as const, offset: 16 }] },
    };
    expect(formatRowOffsets(tagged)).toBe("0x08 · 0x10");
    tagged.paired.tags = [{ kind: "offset", offset: 8 }];
    expect(formatRowOffsets(tagged)).toBe("0x08");
  });
});

describe("hitWhy", () => {
  const base: NameHit = {
    kind: "name",
    declaration: search(context, "healthbar").names[0].hit.declaration,
    tier: 0,
    score: 0,
    nameWords: [],
    tags: [],
  };

  it("has nothing for a hit explained by its name", () => {
    expect(hitWhy(base)).toEqual([]);
  });

  it("labels network words and inputs", () => {
    const hit: NameHit = {
      ...base,
      tags: [
        { kind: "network", words: ["changecallback", "priority"] },
        { kind: "io", inputs: [{ name: "Kill" }, { name: "Enable" }] as never, outputs: [] },
      ],
    };
    expect(hitWhy(hit)).toEqual(["network: changecallback priority", "input: Kill, Enable"]);
  });

  it("labels metadata entries with their values", () => {
    const hit: NameHit = {
      ...base,
      tags: [
        {
          kind: "metadata",
          entries: [{ name: "MNetworkEnable" }, { name: "MPropertyDescription", value: "Text" }],
        },
      ],
    };
    expect(hitWhy(hit)).toEqual(["metadata: MNetworkEnable, MPropertyDescription: Text"]);
  });

  it("cuts a long list of names", () => {
    const outputs = ["A", "B", "C", "D", "E"].map((name) => ({ name }));
    const hit: NameHit = { ...base, tags: [{ kind: "io", inputs: [], outputs: outputs as never }] };
    expect(hitWhy(hit)).toEqual(["output: A, B, C +2"]);
  });

  it("leaves entity names to the pills", () => {
    const hit: NameHit = { ...base, tags: [{ kind: "entity", designNames: ["prop"] }] };
    expect(hitWhy(hit)).toEqual([]);
  });
});

describe("hitDesignNames", () => {
  const field = search(context, "health").fields[0].hit;

  it("has none for a hit found by its own name", () => {
    expect(hitDesignNames(field)).toEqual([]);
  });

  it("gives the names an entity filter matched", () => {
    const hit = { ...field, tags: [{ kind: "entity" as const, designNames: ["prop", "prop"] }] };
    expect(hitDesignNames(hit)).toEqual(["prop"]);
  });

  it("gives the names the words of its class matched", () => {
    const word = {
      word: "player",
      text: "player",
      source: "designName" as const,
      tier: 0,
      score: 0,
      ranges: [0, 6],
    };
    expect(hitDesignNames({ ...field, nameWords: [word] })).toEqual(["player"]);
  });
});
