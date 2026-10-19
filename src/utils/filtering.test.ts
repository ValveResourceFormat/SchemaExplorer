import { describe, it, expect } from "vitest";
import {
  buildHash,
  parseSearch,
  parseIntValue,
  isFilterPrefix,
  matchesMetadataKeys,
  matchesMetadataValues,
} from "./filtering";

// -- parseIntValue --

describe("parseIntValue", () => {
  it("parses decimal", () => {
    expect(parseIntValue("128")).toBe(128);
  });
  it("parses hex", () => {
    expect(parseIntValue("0x80")).toBe(128);
  });
  it("returns null for empty string", () => {
    expect(parseIntValue("")).toBeNull();
  });
  it("returns null for non-numeric", () => {
    expect(parseIntValue("abc")).toBeNull();
  });
  it("trims whitespace", () => {
    expect(parseIntValue(" 42 ")).toBe(42);
  });
});

// -- isFilterPrefix --

describe("isFilterPrefix", () => {
  it("recognizes module:", () => {
    expect(isFilterPrefix("module:client")).toBe(true);
  });
  it("recognizes offset:", () => {
    expect(isFilterPrefix("offset:5")).toBe(true);
  });
  it("recognizes metadata:", () => {
    expect(isFilterPrefix("metadata:key")).toBe(true);
  });
  it("recognizes enumvalue:", () => {
    expect(isFilterPrefix("enumvalue:4")).toBe(true);
  });
  it("recognizes metadatavalue:", () => {
    expect(isFilterPrefix("metadatavalue:val")).toBe(true);
  });
  it("recognizes network:", () => {
    expect(isFilterPrefix("network:")).toBe(true);
  });
  it("rejects plain words", () => {
    expect(isFilterPrefix("foo")).toBe(false);
    expect(isFilterPrefix("moduleName")).toBe(false);
  });
});

// -- Tags written alone and punctuation --

describe("parseSearch with a tag written alone", () => {
  it("takes the next word as the value", () => {
    expect(parseSearch("entity: weapon").entityWords).toEqual(["weapon"]);
    expect(parseSearch("network: health").networkWords).toEqual(["health"]);
    expect(parseSearch("metadata: min").metadataKeys).toEqual(["min"]);
    expect(parseSearch("metadatavalue: min").metadataValues).toEqual(["min"]);
    expect(parseSearch("module: client").moduleWords).toEqual(["client"]);
    expect(parseSearch("input: kill").inputWords).toEqual(["kill"]);
    expect(parseSearch("output: ontrigger").outputWords).toEqual(["ontrigger"]);
    expect(parseSearch("offset: 0x10").offsets).toEqual(new Set([16]));
    expect(parseSearch("enumvalue: 4").enumValues).toEqual(new Set([4]));
    expect(parseSearch("entity: weapon").nameWords).toEqual([]);
  });

  it("keeps the other words as name words", () => {
    const parsed = parseSearch("health entity: weapon armor");
    expect(parsed.nameWords).toEqual(["health", "armor"]);
    expect(parsed.entityWords).toEqual(["weapon"]);
  });

  it("gives a tag followed by a tag, or by nothing, no value", () => {
    const parsed = parseSearch("module: offset:4 entity:");
    expect(parsed.moduleWords).toEqual([]);
    expect(parsed.entityWords).toEqual([]);
    expect(parsed.offsets).toEqual(new Set([4]));
    expect(parsed.nameWords).toEqual([]);
  });

  it("does not join a word that is not a whole tag", () => {
    expect(parseSearch("entityx: weapon").nameWords).toEqual(["entityx", "weapon"]);
  });
});

describe("parseSearch with punctuation around words", () => {
  it("trims it from name words", () => {
    const words = ["health,", '"health"', "*health", "health?", "(health)", "health.", "health="];
    for (const word of words) {
      expect(parseSearch(word).nameWords).toEqual(["health"]);
    }
    expect(parseSearch("m_iHealth;").nameWords).toEqual(["m_ihealth"]);
  });

  it("drops a word with nothing else in it", () => {
    expect(parseSearch("-- ?? health ::").nameWords).toEqual(["health"]);
  });

  it("keeps :: and . inside a word", () => {
    expect(parseSearch("CFoo::Bar_t").nameWords).toEqual(["cfoo::bar_t"]);
    expect(parseSearch("CFoo.m_x,").nameWords).toEqual(["cfoo.m_x"]);
  });

  it("keeps the colon of a tag", () => {
    expect(parseSearch("module:client,").moduleWords).toEqual(["client,"]);
    expect(parseSearch("health: module:client").nameWords).toEqual(["health"]);
  });
});

// -- parseSearch --

describe("parseSearch", () => {
  it("returns empty for empty string", () => {
    const result = parseSearch("");
    expect(result.nameWords).toEqual([]);
    expect(result.moduleWords).toEqual([]);
    expect(result.offsets.size).toBe(0);
    expect(result.enumValues.size).toBe(0);
    expect(result.metadataKeys).toEqual([]);
    expect(result.metadataValues).toEqual([]);
  });

  it("parses simple name words", () => {
    const result = parseSearch("foo bar");
    expect(result.nameWords).toEqual(["foo", "bar"]);
  });

  it("parses module filter", () => {
    const result = parseSearch("module:client");
    expect(result.moduleWords).toEqual(["client"]);
    expect(result.nameWords).toEqual([]);
  });

  it("parses decimal offset", () => {
    const result = parseSearch("offset:128");
    expect(result.offsets).toEqual(new Set([128]));
  });

  it("parses hex offset", () => {
    const result = parseSearch("offset:0x1A");
    expect(result.offsets).toEqual(new Set([26]));
  });

  it("ignores invalid offset", () => {
    const result = parseSearch("offset:abc");
    expect(result.offsets.size).toBe(0);
  });

  it("parses metadata key filter", () => {
    const result = parseSearch("metadata:MNotSaved");
    expect(result.metadataKeys).toEqual(["mnotsaved"]);
  });

  it("does not treat metadatavalue: as metadata:", () => {
    const result = parseSearch("metadatavalue:foo");
    expect(result.metadataValues).toEqual(["foo"]);
    expect(result.metadataKeys).toEqual([]);
  });

  it("parses mixed query", () => {
    const result = parseSearch("CPlayer module:server offset:0x10 metadata:MNotSaved");
    expect(result.nameWords).toEqual(["cplayer"]);
    expect(result.moduleWords).toEqual(["server"]);
    expect(result.offsets).toEqual(new Set([16]));
    expect(result.metadataKeys).toEqual(["mnotsaved"]);
  });

  it("lowercases everything", () => {
    const result = parseSearch("FOO Module:SERVER");
    expect(result.nameWords).toEqual(["foo"]);
    expect(result.moduleWords).toEqual(["server"]);
  });

  it("order of words and filters does not matter", () => {
    const a = parseSearch(
      "C_Fish module:client metadata:MNotSaved offset:0x10 enumvalue:4 metadatavalue:coord",
    );
    const b = parseSearch(
      "metadatavalue:coord enumvalue:4 metadata:MNotSaved offset:0x10 module:client C_Fish",
    );
    expect(a.nameWords).toEqual(b.nameWords);
    expect(a.moduleWords).toEqual(b.moduleWords);
    expect(a.offsets).toEqual(b.offsets);
    expect(a.enumValues).toEqual(b.enumValues);
    expect(a.metadataKeys).toEqual(b.metadataKeys);
    expect(a.metadataValues).toEqual(b.metadataValues);
  });

  it("parses decimal enumvalue", () => {
    const result = parseSearch("enumvalue:4");
    expect(result.enumValues).toEqual(new Set([4]));
  });

  it("parses hex enumvalue", () => {
    const result = parseSearch("enumvalue:0xFF");
    expect(result.enumValues).toEqual(new Set([255]));
  });

  it("parses multiple enumvalues", () => {
    const result = parseSearch("enumvalue:1 enumvalue:2");
    expect(result.enumValues).toEqual(new Set([1, 2]));
  });

  it("ignores invalid enumvalue", () => {
    const result = parseSearch("enumvalue:abc");
    expect(result.enumValues.size).toBe(0);
  });

  it("ignores empty enumvalue:", () => {
    const result = parseSearch("enumvalue:");
    expect(result.enumValues.size).toBe(0);
  });

  it("parses multiple offsets", () => {
    const result = parseSearch("offset:0x10 offset:0x14");
    expect(result.offsets).toEqual(new Set([16, 20]));
  });

  it("parses multiple module words", () => {
    const result = parseSearch("module:client module:server");
    expect(result.moduleWords).toEqual(["client", "server"]);
  });

  it("parses multiple metadata keys", () => {
    const result = parseSearch("metadata:MNotSaved metadata:MPropertyFriendlyName");
    expect(result.metadataKeys).toEqual(["mnotsaved", "mpropertyfriendlyname"]);
  });

  it("ignores empty metadata: value", () => {
    const result = parseSearch("metadata:");
    expect(result.metadataKeys).toEqual([]);
  });

  it("ignores empty metadatavalue: value", () => {
    const result = parseSearch("metadatavalue:");
    expect(result.metadataValues).toEqual([]);
  });

  it("ignores empty module: value", () => {
    const result = parseSearch("module:");
    expect(result.moduleWords).toEqual([]);
  });

  it("parses network: words", () => {
    expect(parseSearch("C_Fish network:posX").networkWords).toEqual(["posx"]);
  });

  it("parses entity:, input: and output: words", () => {
    const result = parseSearch("entity:Trigger input:Kill output:OnTrigger");
    expect(result.entityWords).toEqual(["trigger"]);
    expect(result.inputWords).toEqual(["kill"]);
    expect(result.outputWords).toEqual(["ontrigger"]);
    expect(result.nameWords).toEqual([]);
  });
});

// -- matchesMetadataKeys --

describe("matchesMetadataKeys", () => {
  it("matches when key present", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["mnot"])).toBe(true);
  });
  it("fails when key absent", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["other"])).toBe(false);
  });
  it("returns false for undefined metadata", () => {
    expect(matchesMetadataKeys(undefined, ["key"])).toBe(false);
  });
  it("returns false for empty metadata", () => {
    expect(matchesMetadataKeys([], ["key"])).toBe(false);
  });
  it("returns false for empty keys", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], [])).toBe(false);
  });
  it("partial match works (uses includes)", () => {
    expect(matchesMetadataKeys([{ name: "MNotSaved" }], ["saved"])).toBe(true);
  });
});

// -- matchesMetadataValues --

describe("matchesMetadataValues", () => {
  it("matches when value present", () => {
    expect(matchesMetadataValues([{ name: "key", value: "true" }], ["true"])).toBe(true);
  });
  it("fails when value absent", () => {
    expect(matchesMetadataValues([{ name: "key", value: "true" }], ["false"])).toBe(false);
  });
  it("returns false for undefined metadata", () => {
    expect(matchesMetadataValues(undefined, ["val"])).toBe(false);
  });
  it("skips entries with undefined value", () => {
    expect(matchesMetadataValues([{ name: "key" }], ["val"])).toBe(false);
  });
  it("partial value match works", () => {
    expect(matchesMetadataValues([{ name: "key", value: "water_surface" }], ["water"])).toBe(true);
  });
});

describe("buildHash", () => {
  it("joins params and encodes values", () => {
    expect(buildHash({ kind: "convars", search: "sv_ flag:cheat" })).toBe(
      "kind=convars&search=sv_%20flag%3Acheat",
    );
  });

  it("skips empty params", () => {
    expect(buildHash({ kind: null, search: "", name: undefined })).toBe("");
    expect(buildHash({ kind: null, name: "sv_gravity" })).toBe("name=sv_gravity");
  });
});
