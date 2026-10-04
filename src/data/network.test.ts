import { describe, it, expect } from "vitest";
import {
  getNetworkKeys,
  isSameNetworkType,
  matchesNetworkWords,
  matchingNetworkParts,
  networkTerms,
} from "./network";
import { parseSchemas } from "./schemas";
import { parsedSchemas } from "./test-helpers";

describe("networkTerms", () => {
  it("lists property names and values, lowercased", () => {
    expect(
      networkTerms({ type: "uint16", changeCallbacks: ["OnCellChanged"], priority: 31 }),
    ).toEqual(["type", "uint16", "changecallbacks", "oncellchanged", "priority", "31"]);
  });

  it("names the parts of overrides, and varTypeOverrides by field", () => {
    expect(
      networkTerms({
        overrides: [{ field: "m_vecX", kind: "bitCount", class: "CFoo", value: "32" }],
        varTypeOverrides: { m_pCameraServices: "CCSObserver_CameraServices" },
        varsAtomic: true,
      }),
    ).toEqual([
      "overrides",
      "field",
      "m_vecx",
      "kind",
      "bitcount",
      "class",
      "cfoo",
      "value",
      "32",
      "vartypeoverrides",
      "m_pcameraservices",
      "ccsobserver_cameraservices",
      "varsatomic",
      "true",
    ]);
  });

  it("caches per object", () => {
    const network = { type: "int" };
    expect(networkTerms(network)).toBe(networkTerms(network));
  });
});

describe("matchingNetworkParts", () => {
  const network = {
    includeByUserGroup: ["Player", "LocalPlayerExclusive"],
    excludeByUserGroup: ["FogController"],
    overrides: [
      { field: "m_lifeState", kind: "changeCallback", value: "OnLifeStateChanged" },
      { field: "m_nNextThinkTick", kind: "userGroup", value: "LocalPlayerExclusive" },
    ],
    varTypeOverrides: { m_pCameraServices: "CCSObserver_CameraServices", m_pOther: "COther" },
    outOfPVSUpdates: 4,
    varsAtomic: true,
  };

  it("keeps only the entries with a word", () => {
    expect(matchingNetworkParts(network, ["localplayer"])).toEqual({
      includeByUserGroup: ["LocalPlayerExclusive"],
      overrides: [{ field: "m_nNextThinkTick", kind: "userGroup", value: "LocalPlayerExclusive" }],
    });
    expect(matchingNetworkParts(network, ["camera"])).toEqual({
      varTypeOverrides: { m_pCameraServices: "CCSObserver_CameraServices" },
    });
  });

  it("keeps a property whole when its name has a word", () => {
    expect(matchingNetworkParts(network, ["excludebyusergroup", "atomic"])).toEqual({
      excludeByUserGroup: ["FogController"],
      varsAtomic: true,
    });
  });

  it("matches values that aren't strings", () => {
    expect(matchingNetworkParts(network, ["4"])).toEqual({ outOfPVSUpdates: 4 });
  });

  it("keeps whole values with =, and a property's with key=", () => {
    expect(matchingNetworkParts(network, ["=player"])).toEqual({ includeByUserGroup: ["Player"] });
    expect(matchingNetworkParts(network, ["value=localplayerexclusive"])).toEqual({
      overrides: [{ field: "m_nNextThinkTick", kind: "userGroup", value: "LocalPlayerExclusive" }],
    });
    expect(matchingNetworkParts(network, ["vartypeoverrides=cother"])).toEqual({
      varTypeOverrides: { m_pOther: "COther" },
    });
  });
});

describe("matchesNetworkWords", () => {
  const network = {
    type: "int32",
    userGroups: ["LocalPlayerExclusive"],
    changeCallbacks: ["OnPlayerChanged"],
  };

  it("matches text anywhere in a name or value", () => {
    expect(matchesNetworkWords(network, ["player"])).toBe(true);
    expect(matchesNetworkWords(network, ["usergroup", "onplayer"])).toBe(true);
    expect(matchesNetworkWords(network, ["water"])).toBe(false);
  });

  it("matches a whole name or value with =", () => {
    expect(matchesNetworkWords(network, ["=player"])).toBe(false);
    expect(matchesNetworkWords(network, ["=localplayerexclusive"])).toBe(true);
    expect(matchesNetworkWords(network, ["=usergroups"])).toBe(true);
  });

  it("matches a property's whole value with key=", () => {
    expect(matchesNetworkWords(network, ["usergroups=localplayerexclusive"])).toBe(true);
    expect(matchesNetworkWords(network, ["changecallbacks=localplayerexclusive"])).toBe(false);
    expect(matchesNetworkWords(network, ["usergroups=localplayer"])).toBe(false);
  });
});

describe("getNetworkKeys", () => {
  it("collects class and field network properties, sorted", () => {
    const keys = getNetworkKeys(parsedSchemas.declarations);
    expect(keys).toContain("varsAtomic");
    expect(keys).toContain("replayCompatFields");
    expect(keys).toContain("changeCallbacks");
    expect(keys).toEqual(keys.toSorted());
  });

  it("is empty for dumps without network data, like ones with only MNetwork* metadata", () => {
    const { declarations } = parseSchemas({
      classes: [
        {
          name: "C",
          module: "m",
          fields: [
            {
              name: "m_x",
              type: { category: "builtin", name: "int32" },
              metadata: [{ name: "MNetworkEnable" }],
            },
          ],
        },
      ],
      enums: [],
    });
    expect(getNetworkKeys(declarations)).toEqual([]);
  });
});

describe("isSameNetworkType", () => {
  it("ignores spellings and spaces", () => {
    expect(isSameNetworkType("int32", "int")).toBe(true);
    expect(isSameNetworkType("float32", "float")).toBe(true);
    expect(isSameNetworkType("CUtlSymbolLarge", "string_t")).toBe(true);
    expect(isSameNetworkType("CHandle< C_BaseEntity >", "EHANDLE")).toBe(true);
    expect(isSameNetworkType("CHandle< C_BasePlayerPawn >", "CHandle< CBasePlayerPawn>")).toBe(
      true,
    );
    expect(isSameNetworkType("char[128]", "char")).toBe(true);
  });

  it("compares network vectors by their elements", () => {
    expect(isSameNetworkType("C_NetworkUtlVectorBase< CUtlString >", "CUtlString")).toBe(true);
    expect(
      isSameNetworkType(
        "C_UtlVectorEmbeddedNetworkVar< CEconItemAttribute >",
        "CEconItemAttribute",
      ),
    ).toBe(true);
  });

  it("tells other types apart", () => {
    expect(isSameNetworkType("uint16", "item_definition_index_t")).toBe(false);
    expect(isSameNetworkType("CBodyComponent*", "CBodyComponent::Storage_t")).toBe(false);
  });
});
