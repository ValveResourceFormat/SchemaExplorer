import { describe, it, expect } from "vitest";
import {
  componentOverrides,
  fieldSending,
  getNetworkKeys,
  isSameNetworkType,
  matchesNetworkWords,
  matchingNetworkParts,
  networkTerms,
  type FieldSending,
} from "./network";
import { buildEntityLookups } from "./derived";
import { parseSchemas } from "./schemas";
import type { SchemaClass, SchemaField } from "./types";
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

describe("fieldSending", () => {
  const field = (name: string, userGroups?: string[]) => ({
    name,
    type: { category: "builtin" as const, name: "int32" },
    metadata: [],
    network: { type: "int32", ...(userGroups && { userGroups }) },
  });
  const { declarations } = parseSchemas({
    classes: [
      {
        name: "Base",
        module: "m",
        fields: [
          field("m_iHealth", ["Player"]),
          field("m_iMaxHealth", ["Water"]),
          field("m_iTeam"),
        ],
        network: { excludeByName: ["m_iMaxHealth"], excludeByUserGroup: ["Player"] },
      },
      {
        name: "Pawn",
        module: "m",
        parents: [{ name: "Base", module: "m" }],
        fields: [field("m_iArmor", ["Player"])],
        network: { includeByUserGroup: ["Player"] },
      },
      {
        name: "Hostage",
        module: "m",
        parents: [{ name: "Pawn", module: "m" }],
        fields: [],
        network: { includeByName: ["m_iMaxHealth"], excludeByName: ["m_iHealth"] },
      },
      {
        name: "Beam",
        module: "m",
        parents: [{ name: "Pawn", module: "m" }],
        metadata: [{ name: "MNetworkNoBase" }],
        fields: [field("m_fWidth")],
        network: { includeByName: ["m_iTeam"] },
      },
      {
        name: "Bot",
        module: "m",
        parents: [{ name: "Base", module: "m" }],
        fields: [],
        network: {
          includeByUserGroup: ["Water"],
          overrides: [
            { field: "m_iTeam", kind: "userGroup", value: "Player" },
            { field: "m_iHealth", kind: "userGroup", class: "Base" },
          ],
        },
      },
    ],
    enums: [],
  });
  const sending = (name: string) => {
    const d = declarations.get("m")!.get(name) as SchemaClass;
    return byName(fieldSending(declarations, d));
  };

  it("leaves out the fields no list decides", () => {
    expect(sending("Base")).toEqual({
      m_iHealth: { sent: false, by: "Base", group: "Player" },
      m_iMaxHealth: { sent: false, by: "Base" },
    });
  });

  it("lets a class include what its bases exclude, groups applying to its own fields", () => {
    expect(sending("Pawn")).toEqual({
      m_iHealth: { sent: true, by: "Pawn", group: "Player" },
      m_iMaxHealth: { sent: false, by: "Base" },
      m_iArmor: { sent: true, by: "Pawn", group: "Player" },
    });
  });

  it("applies a class's lists by name after its lists by user group", () => {
    expect(sending("Hostage")).toEqual({
      m_iHealth: { sent: false, by: "Hostage" },
      m_iMaxHealth: { sent: true, by: "Hostage" },
      m_iArmor: { sent: true, by: "Pawn", group: "Player" },
    });
  });

  it("leaves out the fields of bases with MNetworkNoBase, but the ones included by name", () => {
    expect(sending("Beam")).toEqual({
      m_iHealth: { sent: false, by: "Beam", noBase: true },
      m_iMaxHealth: { sent: false, by: "Beam", noBase: true },
      m_iTeam: { sent: true, by: "Beam" },
      m_iArmor: { sent: false, by: "Beam", noBase: true },
    });
  });

  it("lets a class include by user group what its bases exclude by name, ignoring overrides", () => {
    expect(sending("Bot")).toEqual({
      m_iHealth: { sent: false, by: "Base", group: "Player" },
      m_iMaxHealth: { sent: true, by: "Bot", group: "Water" },
    });
  });
});

describe("fieldSending of nested serializers", () => {
  const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
    name,
    type: { category: "builtin" as const, name: type },
    metadata: [],
    network: { type, ...extra },
  });
  const parsed = parseSchemas({
    classes: [
      {
        name: "CGameSceneNode",
        module: "m",
        fields: [field("m_hParent", "CGameSceneNodeHandle"), field("m_angRotation", "QAngle")],
      },
      {
        name: "CBodyComponent",
        module: "m",
        fields: [],
      },
      {
        name: "CBodyComponentPoint",
        module: "m",
        parents: [{ name: "CBodyComponent", module: "m" }],
        fields: [field("m_sceneNode", "CGameSceneNode")],
      },
      {
        name: "CLayer",
        module: "m",
        fields: [field("m_hSequence", "HSequence"), field("m_flCycle", "float32")],
      },
      {
        name: "CScaleNode",
        module: "m",
        fields: [field("m_flScale", "float32")],
        network: { excludeByName: ["m_flScale"] },
      },
      {
        name: "CEntity",
        module: "m",
        fields: [
          field("m_CBodyComponent", "CBodyComponent::Storage_t", {
            class: "CBodyComponent",
            alias: "CBodyComponent",
          }),
          field("m_vecServerVelocity", "Vector", { alias: "m_vecVelocity" }),
          field("m_baseLayer", "CLayer"),
          field("m_otherLayer", "CLayer"),
          field("m_scale", "CScaleNode"),
          field("m_custom", "CLayer", { serializer: "custom" }),
        ],
      },
      {
        name: "CBeam",
        module: "m",
        parents: [{ name: "CEntity", module: "m" }],
        metadata: [{ name: "MNetworkNoBase" }],
        fields: [],
        network: { includeByName: ["CGameSceneNode::m_hParent", "m_vecVelocity", "m_flScale"] },
      },
      {
        name: "CProp",
        module: "m",
        parents: [{ name: "CEntity", module: "m" }],
        fields: [],
        metadata: [{ name: "MNetworkNoBase" }],
        network: {
          includeByName: [
            "m_baseLayer.m_hSequence",
            "CScaleNode::m_hParent",
            "CGameSceneNode::m_angRotation",
          ],
        },
      },
    ],
    enums: [],
    entities: [
      {
        class: "CEntity",
        module: "m",
        classModule: "m",
        spawnable: false,
        components: [{ base: "CBodyComponent", override: "CBodyComponentPoint" }],
      },
      { class: "CBeam", module: "m", classModule: "m", spawnable: true, baseClass: "CEntity" },
    ],
  });
  const { declarations } = parsed;
  const lookups = buildEntityLookups(parsed.entities, declarations);
  const sending = (name: string) => {
    const d = declarations.get("m")!.get(name) as SchemaClass;
    return byName(fieldSending(declarations, d, componentOverrides(lookups, declarations, d)));
  };

  it("finds the entity's component classes", () => {
    const beam = declarations.get("m")!.get("CBeam") as SchemaClass;
    expect(componentOverrides(lookups, declarations, beam)).toEqual(
      new Map([["CBodyComponent", "CBodyComponentPoint"]]),
    );
  });

  it("keeps a field for an included field nested under it, matching by alias and class", () => {
    expect(sending("CBeam")).toEqual({
      m_CBodyComponent: { sent: true, via: "m_sceneNode.m_hParent" },
      m_vecServerVelocity: { sent: true, by: "CBeam" },
      m_baseLayer: { sent: false, by: "CBeam", noBase: true },
      m_otherLayer: { sent: false, by: "CBeam", noBase: true },
      // Its own class excluded m_flScale first, so including it again finds nothing
      m_scale: { sent: false, by: "CBeam", noBase: true },
      m_custom: { sent: false, by: "CBeam", noBase: true },
    });
  });

  it("matches paths by their end, and names by the class of their serializer", () => {
    const noBase = { sent: false, by: "CProp", noBase: true };
    expect(sending("CProp")).toEqual({
      m_CBodyComponent: { sent: true, via: "m_sceneNode.m_angRotation" },
      m_vecServerVelocity: noBase,
      m_baseLayer: { sent: true, via: "m_hSequence" },
      m_otherLayer: noBase,
      m_scale: noBase,
      m_custom: noBase,
    });
  });

  it("leaves out fields with nothing nested under them sent", () => {
    // Its own field excluded, CScaleNode has nothing to send, but it isn't left out for that
    const entity = declarations.get("m")!.get("CEntity") as SchemaClass;
    expect(byName(fieldSending(declarations, entity))).toEqual({});
  });
});

function byName(sending: Map<SchemaField, FieldSending>) {
  return Object.fromEntries([...sending].map(([f, s]) => [f.name, s]));
}

describe("getNetworkKeys", () => {
  it("collects class and field network properties, sorted", () => {
    const keys = getNetworkKeys(parsedSchemas.declarations);
    expect(keys).toContain("varsAtomic");
    expect(keys).toContain("replayCompatFields");
    expect(keys).toContain("changeCallbacks");
    expect(keys).toEqual(keys.toSorted());
  });

  it("is empty for dumps without network data, like the old games' dumps, which only have MNetwork* metadata", () => {
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
