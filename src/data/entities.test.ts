import { describe, it, expect } from "vitest";
import { parseEntities, parseSchemas, type SchemasJson } from "./schemas";
import {
  buildEntityLookups,
  declarationKey,
  entityChain,
  findDeclarationByName,
  findEntityByDesignName,
  keyFieldKey,
  resolveKeyField,
} from "./derived";

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

  it("finds entities by design name, preferring the server", () => {
    expect(findEntityByDesignName(lookups, "trigger_multiple")?.class).toBe("CTriggerMultiple");
    expect(findEntityByDesignName(lookups, "root")?.module).toBe("server");
    expect(findEntityByDesignName(lookups, "root", "client")?.module).toBe("client");
    expect(findEntityByDesignName(lookups, "trigger_multiple", "client")).toBeUndefined();
  });

  it("indexes keys by the schema class that owns the field", () => {
    expect(
      lookups.keyByField.get(keyFieldKey("server", "CBaseEntity", "m_iHealth"))?.[0].key.name,
    ).toBe("health");
    // declaredIn only inherits m_flWait, so it resolves to the parent that declares it
    expect(
      lookups.keyByField.get(keyFieldKey("server", "CBaseToggle", "m_flWait"))?.[0].key.name,
    ).toBe("wait");
    // Embedded structs may only exist in another module, declaredInModule says which
    expect(lookups.keyByField.get(keyFieldKey("client", "hudtextparms_t", "x"))?.[0].key.name).toBe(
      "x",
    );
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

  it("indexes enum keyvalue references", () => {
    expect(lookups.enumKeyRefs.get("client/RenderMode_t")?.map((r) => r.key.name)).toEqual([
      "rendermode",
    ]);
  });
});

describe("findDeclarationByName", () => {
  it("finds a declaration in any module, optionally by kind", () => {
    expect(findDeclarationByName(parsed.declarations, "hudtextparms_t")?.module).toBe("client");
    expect(findDeclarationByName(parsed.declarations, "RenderMode_t", "enum")?.kind).toBe("enum");
    expect(findDeclarationByName(parsed.declarations, "RenderMode_t", "class")).toBeUndefined();
    expect(findDeclarationByName(parsed.declarations, "Missing")).toBeUndefined();
  });
});
