import { describe, it, expect } from "vitest";
import { parseEntities, parseSchemas, type SchemasJson } from "./schemas";
import {
  allDeclarations,
  buildEntityLookups,
  declarationKey,
  effectiveEntitySettings,
  entityChain,
  findDeclarationByName,
  sameSchemaPage,
  findEntityByDesignName,
  resolveKeyField,
} from "./derived";
import { parseSearch, searchDeclarations } from "../utils/filtering";
import {
  formatKeyName,
  formatKeyPattern,
  formatKeyType,
  groupByComponent,
  keySchemaType,
} from "../utils/entity-format";

const data: SchemasJson = {
  classes: [
    { name: "CEntityInstance", module: "entity2", size: 8, fields: [] },
    {
      name: "CBaseEntity",
      module: "server",
      size: 16,
      parents: [{ name: "CEntityInstance", module: "entity2" }],
      fields: [{ name: "m_iHealth", offset: 8, type: { category: "builtin", name: "int32" } }],
    },
    {
      name: "CBaseToggle",
      module: "server",
      size: 24,
      parents: [{ name: "CBaseEntity", module: "server" }],
      fields: [{ name: "m_flWait", offset: 16, type: { category: "builtin", name: "float32" } }],
    },
    {
      name: "CTriggerMultiple",
      module: "server",
      size: 24,
      parents: [{ name: "CBaseToggle", module: "server" }],
      fields: [],
    },
    {
      name: "CDerivedDatamap",
      module: "server",
      size: 24,
      parents: [{ name: "CBaseToggle", module: "server" }],
      fields: [],
    },
    { name: "CBodyComponent", module: "server", size: 8, fields: [] },
    { name: "CBodyComponentPoint", module: "server", size: 8, fields: [] },
    { name: "CScriptComponent", module: "server", size: 8, fields: [] },
    {
      name: "CGameSceneNode",
      module: "server",
      size: 16,
      fields: [{ name: "m_vecOrigin", offset: 8, type: { category: "atomic", name: "Vector" } }],
    },
    {
      name: "hudtextparms_t",
      module: "client",
      size: 4,
      fields: [{ name: "x", offset: 0, type: { category: "builtin", name: "float32" } }],
    },
  ],
  enums: [{ name: "RenderMode_t", module: "client", alignment: "uint8", members: [] }],
  entities: [
    {
      class: "CEntityInstance",
      module: "server",
      classModule: "entity2",
      designName: "root",
      spawnable: false,
      // Empty params and returns, and pulseNode when false, are omitted
      inputs: [
        { name: "Kill" },
        { name: "AddOutput", params: [{ name: "p", type: "PVAL_STRING" }] },
      ],
      outputs: [{ name: "OnUser1" }],
    },
    // classModule is omitted when it's module, a key's declaredIn(Module) when it's the class
    {
      class: "CBaseEntity",
      module: "server",
      baseClass: "CEntityInstance",
      spawnable: false,
      // One the class adds itself, one replacing a base class's
      components: [
        { name: "CScriptComponent" },
        { base: "CBodyComponent", override: "CBodyComponentPoint" },
      ],
      keys: [
        { name: "health", type: "FIELD_INT32", field: "m_iHealth" },
        {
          name: "rendermode",
          type: "FIELD_UINT8",
          field: "m_nRenderMode",
          enum: "RenderMode_t",
          enumModule: "client",
        },
        { name: "origin", type: "FIELD_VECTOR", procedural: true },
        // A component key, declaredIn is the component's datamap class
        {
          name: "local.origin",
          type: "FIELD_VECTOR",
          field: "m_vecOrigin",
          path: "m_pSceneNode",
          component: "CBodyComponent",
          declaredIn: "CGameSceneNode",
        },
        { name: "vscripts", type: "FIELD_STRING", field: "m_iHealth", flags: ["ADDED_KEYFIELD"] },
      ],
    },
    {
      class: "CTriggerMultiple",
      module: "server",
      designName: "trigger_multiple",
      baseClass: "CBaseEntity",
      spawnable: true,
      keys: [
        { name: "wait", type: "FIELD_FLOAT32", field: "m_flWait", declaredIn: "CDerivedDatamap" },
        {
          name: "x",
          type: "FIELD_FLOAT32",
          field: "x",
          declaredIn: "hudtextparms_t",
          declaredInModule: "client",
          path: "m_textParms",
        },
      ],
      inputs: [{ name: "Kill", pulseNode: true }],
      outputs: [{ name: "OnTrigger" }],
    },
    {
      class: "CEntityInstance",
      module: "client",
      classModule: "entity2",
      designName: "root",
      spawnable: false,
    },
  ],
};

const parsed = parseSchemas(structuredClone(data));
const lookups = buildEntityLookups(parsed.entities, parsed.declarations);
const trigger = lookups.entityByModuleClass.get("server/CTriggerMultiple")!;

describe("parseEntities", () => {
  it("fills in omitted fields", () => {
    const [e] = parseEntities([{ class: "C", module: "m", classModule: "m", spawnable: true }]);
    expect(e).toMatchObject({
      flags: [],
      spawnOrder: 0,
      components: [],
      keys: [],
      inputs: [],
      outputs: [],
    });
  });

  it("fills in omitted params, returns and pulseNode", () => {
    expect(trigger.outputs[0].params).toEqual([]);
    const [e] = parseEntities([
      {
        class: "C",
        module: "m",
        classModule: "m",
        spawnable: true,
        inputs: [{ name: "A" }],
      },
    ]);
    expect(e.inputs[0]).toMatchObject({ params: [], returns: [], pulseNode: false });
  });

  it("fills in classModule and a key's declaredIn and declaredInModule", () => {
    expect(trigger.classModule).toBe("server");
    expect(trigger.keys.map((k) => `${k.declaredInModule}/${k.declaredIn}`)).toEqual([
      "server/CDerivedDatamap",
      "client/hudtextparms_t",
    ]);
    const base = lookups.entityByModuleClass.get("server/CBaseEntity")!;
    expect(base.keys[0]).toMatchObject({ declaredIn: "CBaseEntity", declaredInModule: "server" });
    const root = lookups.entityByModuleClass.get("server/CEntityInstance")!;
    expect(root.classModule).toBe("entity2");
  });

  it("keeps a key's component and flags", () => {
    const base = lookups.entityByModuleClass.get("server/CBaseEntity")!;
    expect(base.keys[3]).toMatchObject({ component: "CBodyComponent", declaredInModule: "server" });
    expect(base.keys[4].flags).toEqual(["ADDED_KEYFIELD"]);
    expect(base.keys[0].flags).toBeUndefined();
  });

  it("tolerates a dump without entities", () => {
    expect(parseSchemas({ classes: [], enums: [] }).entities).toEqual([]);
  });
});

describe("entity lookups", () => {
  it("maps the root to both client and server entities", () => {
    const root = lookups.entityByClass.get(declarationKey("entity2", "CEntityInstance"));
    expect(root?.map((e) => e.module).sort()).toEqual(["client", "server"]);
    expect(
      lookups.designNamesByDeclaration.get(
        parsed.declarations.get("entity2")!.get("CEntityInstance")!,
      ),
    ).toEqual(["root"]);
    expect(lookups.designNames).toEqual(["root", "trigger_multiple"]);
  });

  it("keys entities and design names by the schema class object", () => {
    const cls = parsed.declarations.get("server")!.get("CTriggerMultiple")!;
    expect(lookups.entitiesByDeclaration.get(cls)).toEqual([trigger]);
    expect(lookups.designNamesByDeclaration.get(cls)).toEqual(["trigger_multiple"]);
    const base = parsed.declarations.get("server")!.get("CBaseEntity")!;
    expect(lookups.designNamesByDeclaration.has(base)).toBe(false);
  });

  it("walks baseClass within the entity module", () => {
    expect(entityChain(lookups, trigger).map((e) => e.class)).toEqual([
      "CBaseEntity",
      "CEntityInstance",
    ]);
    const clientRoot = lookups.entityByModuleClass.get("client/CEntityInstance")!;
    expect(entityChain(lookups, clientRoot)).toEqual([]);
  });

  it("finds entities by design name, in the preferred module, then the server", () => {
    expect(findEntityByDesignName(lookups, "trigger_multiple")?.class).toBe("CTriggerMultiple");
    expect(findEntityByDesignName(lookups, "root")?.module).toBe("server");
    expect(findEntityByDesignName(lookups, "root", "client")?.module).toBe("client");
    expect(findEntityByDesignName(lookups, "trigger_multiple", "client")?.module).toBe("server");
    expect(findEntityByDesignName(lookups, "missing")).toBeUndefined();
  });

  it("resolves keys to the schema class that owns the field", () => {
    const owner = (name: string) =>
      lookups.keyOwners.get(lookups.entities.flatMap((e) => e.keys).find((k) => k.name === name)!);
    expect(owner("health")).toEqual({ module: "server", name: "CBaseEntity" });
    // declaredIn only inherits m_flWait, so it resolves to the parent that declares it
    expect(owner("wait")).toEqual({ module: "server", name: "CBaseToggle" });
    // Embedded structs may only exist in another module, declaredInModule says which
    expect(owner("x")).toEqual({ module: "client", name: "hudtextparms_t" });
    // A component key's field is in the component's datamap class, not the entity's
    expect(owner("local.origin")).toEqual({ module: "server", name: "CGameSceneNode" });
  });

  it("keeps the resolved owner of every bound key", () => {
    const wait = trigger.keys.find((k) => k.name === "wait")!;
    expect(lookups.keyOwners.get(wait)).toEqual({ module: "server", name: "CBaseToggle" });
    const origin = lookups.entityByModuleClass.get("server/CBaseEntity")!.keys[2];
    expect(lookups.keyOwners.has(origin)).toBe(false);
  });

  it("resolves procedural keys to nothing", () => {
    const origin = lookups.entityByModuleClass.get("server/CBaseEntity")!.keys[2];
    expect(resolveKeyField(parsed.declarations, origin)).toBeNull();
  });

  it("indexes the entities using a class as a component", () => {
    const users = (name: string) =>
      lookups.componentOf
        .get(declarationKey("server", name))
        ?.map((r) => `${r.entity.class}${r.replaced ? " replaced" : ""}`);
    expect(users("CBodyComponent")).toEqual(["CBaseEntity replaced"]);
    expect(users("CBodyComponentPoint")).toEqual(["CBaseEntity"]);
    // Added by the entity, nothing replaced
    expect(users("CScriptComponent")).toEqual(["CBaseEntity"]);
  });

  it("indexes enum keyvalue references", () => {
    expect(lookups.enumKeyRefs.get("client/RenderMode_t")?.map((r) => r.key.name)).toEqual([
      "rendermode",
    ]);
  });
});

describe("entity search", () => {
  const decls = [...allDeclarations(parsed.declarations)];
  const search = (q: string) =>
    searchDeclarations(decls, parseSearch(q), lookups).map((d) => d.name);

  it("matches design names", () => {
    expect(search("trigger_multiple")).toEqual(["CTriggerMultiple"]);
  });

  it("filters by entity:", () => {
    expect(search("entity:trigger")).toEqual(["CTriggerMultiple"]);
    expect(search("entity:root")).toEqual(["CEntityInstance"]);
  });

  it("filters by own inputs and outputs only", () => {
    expect(search("output:OnTrigger")).toEqual(["CTriggerMultiple"]);
    // Kill is on the root and redeclared on the trigger, AddOutput only on the root
    expect(search("input:addoutput")).toEqual(["CEntityInstance"]);
    expect(search("input:kill").sort()).toEqual(["CEntityInstance", "CTriggerMultiple"]);
  });

  it("needs every input: tag to match one of the inputs", () => {
    expect(search("input:kill input:addoutput")).toEqual(["CEntityInstance"]);
    expect(search("input:kill input:missing")).toEqual([]);
    const [root] = searchDeclarations(decls, parseSearch("input:kill input:addoutput"), lookups);
    expect(root.kind === "class" && root.entityMatches?.inputs.map((i) => i.name)).toEqual([
      "AddOutput",
      "Kill",
    ]);
  });

  it("carries the matching inputs and outputs", () => {
    const [result] = searchDeclarations(decls, parseSearch("output:ontrig"), lookups);
    expect(result.kind === "class" && result.entityMatches?.outputs.map((o) => o.name)).toEqual([
      "OnTrigger",
    ]);
  });

  it("ignores a bare entity: tag", () => {
    expect(search("entity:")).toEqual([]);
  });
});

describe("key formatting", () => {
  it("strips FIELD_ from types", () => {
    expect(formatKeyType("FIELD_FLOAT32")).toBe("float32");
  });

  it("maps field types to the schema types they stand for", () => {
    expect(keySchemaType("FIELD_BOOLEAN")).toEqual({ category: "builtin", name: "bool" });
    expect(keySchemaType("FIELD_QANGLE")).toEqual({ category: "atomic", name: "QAngle" });
    expect(keySchemaType("FIELD_TICK")?.name).toBe("GameTick_t");
    // Worldspace and resource types have no single schema type
    expect(keySchemaType("FIELD_POSITION_VECTOR")).toBeUndefined();
    expect(keySchemaType("FIELD_SOUNDNAME")).toBeUndefined();
  });

  it("groups the keys of a component together, after the others", () => {
    const keys = [
      { name: "a", component: "CBodyComponent" },
      { name: "b" },
      { name: "c", component: "CLightComponent" },
      { name: "d", component: "CBodyComponent" },
      { name: "e" },
    ];
    const entries = keys.map((entry) => ({ entry }));
    expect(groupByComponent(entries, (e) => e.entry).map((e) => e.entry.name)).toEqual([
      "b",
      "e",
      "a",
      "d",
      "c",
    ]);
    // Without components the list is kept as is
    const plain = [{ entry: { name: "x" } }, { entry: { name: "y" } }];
    expect(groupByComponent(plain, (e) => e.entry)).toBe(plain);
  });

  it("expands array patterns", () => {
    expect(formatKeyPattern("Case%02d", 1)).toBe("Case01");
    expect(formatKeyPattern("position%d", 7)).toBe("position7");
    expect(formatKeyName({ name: "Case%02d", arrayStart: 1, arrayCount: 16 })).toBe(
      "Case01 … Case16",
    );
    expect(formatKeyName({ name: "weapon%d", procedural: true })).toBe("weapon%d");
  });
});

describe("findDeclarationByName", () => {
  it("finds a declaration in any module, optionally by kind", () => {
    expect(findDeclarationByName(parsed.declarations, "hudtextparms_t")?.module).toBe("client");
    expect(findDeclarationByName(parsed.declarations, "RenderMode_t", "enum")?.kind).toBe("enum");
    expect(findDeclarationByName(parsed.declarations, "RenderMode_t", "class")).toBeUndefined();
    expect(findDeclarationByName(parsed.declarations, "Missing")).toBeUndefined();
  });

  it("looks in the preferred module first", () => {
    const find = (module: string) =>
      findDeclarationByName(parsed.declarations, "CEntityInstance", "class", module)?.module;
    expect(find("entity2")).toBe("entity2");
    // Not in that module, any module
    expect(find("client")).toBe("entity2");
  });
});

describe("sameSchemaPage", () => {
  it("keeps the declaration, in whichever module has it", () => {
    const page = (module?: string, scope?: string) =>
      sameSchemaPage(parsed.declarations, module, scope);
    expect(page("client", "hudtextparms_t")).toEqual({ module: "client", scope: "hudtextparms_t" });
    expect(page("server", "hudtextparms_t")).toEqual({ module: "client", scope: "hudtextparms_t" });
  });

  it("falls back to the module, then the game's start", () => {
    const page = (module?: string, scope?: string) =>
      sameSchemaPage(parsed.declarations, module, scope);
    expect(page("client", "Missing")).toEqual({ module: "client" });
    expect(page("missing", "Missing")).toEqual({ module: undefined });
    expect(page("client")).toEqual({ module: "client" });
    expect(page()).toEqual({ module: undefined });
  });
});

describe("entity registration rules", () => {
  const cls = (name: string, parent?: string) => ({
    name,
    module: "server",
    size: 8,
    fields: [],
    ...(parent && { parents: [{ name: parent, module: "server" }] }),
  });
  const parsedAliases = parseSchemas({
    classes: [cls("CBase"), cls("CAnimGraph", "CBase"), cls("CAnimGraphAlias_anim", "CAnimGraph")],
    enums: [],
    entities: [
      {
        class: "CBase",
        module: "server",
        spawnable: false,
        flags: ["ECF_NOT_NETWORKED", "ECF_HAS_REQUIRED_ENTITY_HANDLE"],
        spawnOrder: 5,
      },
      {
        class: "CAnimGraph",
        module: "server",
        designName: "anim_graph",
        baseClass: "CBase",
        spawnable: true,
      },
      {
        class: "CAnimGraphAlias_anim",
        module: "server",
        designName: "anim",
        baseClass: "CAnimGraph",
        spawnable: true,
        flags: ["ECF_ALIAS"],
      },
    ],
  });
  const aliasLookups = buildEntityLookups(parsedAliases.entities, parsedAliases.declarations);
  const animGraph = aliasLookups.entityByModuleClass.get("server/CAnimGraph")!;
  const alias = aliasLookups.entityByModuleClass.get("server/CAnimGraphAlias_anim")!;

  it("creates the aliased class for an alias's design name", () => {
    expect(findEntityByDesignName(aliasLookups, "anim")).toBe(animGraph);
    expect(aliasLookups.aliasesByEntity.get(animGraph)).toEqual([alias]);
    const decl = parsedAliases.declarations.get("server")!.get("CAnimGraph")!;
    expect(aliasLookups.designNamesByDeclaration.get(decl)).toEqual(["anim_graph", "anim"]);
  });

  it("copies some flags and the spawn order from the bases", () => {
    expect(effectiveEntitySettings(aliasLookups, animGraph)).toEqual({
      flags: [{ flag: "ECF_NOT_NETWORKED", from: "CBase" }],
      spawnOrder: { value: 5, from: "CBase" },
    });
  });
});
