import { describe, it, expect } from "vitest";
import {
  parseKV3Defaults,
  parseSchemas,
  diffObject,
  resolveLeafType,
  type SchemasJson,
} from "./schemas";
import type { SchemaClass } from "./types";
import { parseSearch, searchDeclarations } from "../utils/filtering";
import { inheritedBases } from "./derived";
import { parsedSchemas, findDecl, getClass, getField } from "./test-helpers";

// ==================== parseKV3Defaults ====================

describe("parseKV3Defaults", () => {
  it("uses object defaults as-is", () => {
    const value = { m_x: 1, m_inner: { m_y: null } };
    expect(parseKV3Defaults(value)).toBe(value);
  });

  it("returns null for missing values", () => {
    expect(parseKV3Defaults(undefined)).toBeNull();
  });

  it("returns null for the unparseable marker", () => {
    expect(parseKV3Defaults("Could not parse KV3 Defaults")).toBeNull();
  });

  it("returns null for array values", () => {
    expect(parseKV3Defaults([1, 2] as unknown as Record<string, unknown>)).toBeNull();
  });
});

// ==================== diffObject ====================

describe("diffObject", () => {
  it("returns null when objects are identical", () => {
    const obj = { a: 1, b: "hello", c: true };
    expect(diffObject(obj, obj)).toBeNull();
  });

  it("returns changed keys only", () => {
    const embedded = { a: 1, b: 99, c: true };
    const own = { a: 1, b: 2, c: true };
    expect(diffObject(embedded, own)).toEqual({ b: 99 });
  });

  it("includes keys missing from own defaults", () => {
    const embedded = { a: 1, b: 2 };
    const own = { a: 1 };
    expect(diffObject(embedded, own)).toEqual({ b: 2 });
  });

  it("skips _class key", () => {
    const embedded = { _class: "Foo", a: 1 };
    const own = { _class: "Bar", a: 1 };
    expect(diffObject(embedded, own)).toBeNull();
  });

  it("compares nested objects by JSON equality", () => {
    const embedded = { a: { x: 1, y: 2 } };
    const own = { a: { x: 1, y: 3 } };
    expect(diffObject(embedded, own)).toEqual({ a: { x: 1, y: 2 } });
  });

  it("returns null for two empty objects", () => {
    expect(diffObject({}, {})).toBeNull();
  });

  it("ignores keys only in own defaults", () => {
    const embedded = { a: 1 };
    const own = { a: 1, b: 2 };
    expect(diffObject(embedded, own)).toBeNull();
  });
});

// ==================== resolveLeafType ====================

describe("resolveLeafType", () => {
  it("returns builtin types as-is", () => {
    const type = { category: "builtin" as const, name: "int32" };
    expect(resolveLeafType(type)).toBe(type);
  });

  it("returns declared_class as-is", () => {
    const type = { category: "declared_class" as const, name: "Foo", module: "m" };
    expect(resolveLeafType(type)).toBe(type);
  });

  it("unwraps ptr to inner type", () => {
    const inner = { category: "declared_class" as const, name: "Foo", module: "m" };
    const type = { category: "ptr" as const, inner };
    expect(resolveLeafType(type)).toBe(inner);
  });

  it("unwraps fixed_array to inner type", () => {
    const inner = { category: "builtin" as const, name: "float32" };
    const type = { category: "fixed_array" as const, inner, count: 3 };
    expect(resolveLeafType(type)).toBe(inner);
  });

  it("unwraps nested ptr > fixed_array > declared_class", () => {
    const leaf = { category: "declared_class" as const, name: "Bar", module: "m" };
    const arr = { category: "fixed_array" as const, inner: leaf, count: 2 };
    const ptr = { category: "ptr" as const, inner: arr };
    expect(resolveLeafType(ptr)).toBe(leaf);
  });

  it("returns atomic with inner — resolves to inner", () => {
    const inner = { category: "declared_class" as const, name: "Foo", module: "m" };
    const type = { category: "atomic" as const, name: "CUtlVector", inner };
    expect(resolveLeafType(type)).toBe(inner);
  });

  it("returns atomic without inner as-is", () => {
    const type = { category: "atomic" as const, name: "CUtlString" };
    expect(resolveLeafType(type)).toBe(type);
  });

  it("prefers inner2 over inner for atomic types (map value type)", () => {
    const key = { category: "builtin" as const, name: "uint64" };
    const value = { category: "declared_class" as const, name: "Bar", module: "m" };
    const type = { category: "atomic" as const, name: "CUtlHashMap", inner: key, inner2: value };
    expect(resolveLeafType(type)).toBe(value);
  });

  it("returns declared_enum as-is", () => {
    const type = { category: "declared_enum" as const, name: "MyEnum", module: "m" };
    expect(resolveLeafType(type)).toBe(type);
  });

  it("returns bitfield as-is", () => {
    const type = { category: "bitfield" as const, count: 4 };
    expect(resolveLeafType(type)).toBe(type);
  });
});

// ==================== parseSchemas + assignDefaults (integration) ====================

describe("assignDefaults via parseSchemas", () => {
  it("assigns scalar defaults to fields", () => {
    const cls = getClass("TestSimpleDefaults");
    expect(getField(cls, "m_flValue").defaultValue).toBe("1.5");
    expect(getField(cls, "m_nCount").defaultValue).toBe("42");
    expect(getField(cls, "m_bEnabled").defaultValue).toBe("true");
    expect(getField(cls, "m_szName").defaultValue).toBe('"hello"');
  });

  it("skips builtin zero-value defaults (0, empty string, false, null)", () => {
    const cls = getClass("TestSimpleDefaults");
    // m_hTarget is builtin CHandle with value null — should be skipped
    expect(getField(cls, "m_hTarget").defaultValue).toBeUndefined();
  });

  it("skips hidden values entirely", () => {
    const cls = getClass("TestHiddenValues");
    expect(getField(cls, "m_nSeed").defaultValue).toBeUndefined();
    expect(getField(cls, "m_flRate").defaultValue).toBe("0.5");
  });

  it("does not mutate parent field defaults from child class", () => {
    const base = parsedSchemas.declarations.get("test")?.get("TestBaseClass") as SchemaClass;
    expect(getField(base, "m_flB").defaultValue).toBe("20");
  });

  it("puts inherited field overrides into unconsumed metadata", () => {
    const cls = getClass("TestChildClass");
    // TestChildClass overrides parent's m_flB from 20 to 99
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults");
    expect(meta).toBeDefined();
    const value = meta!.value as Record<string, unknown>;
    expect(value.m_flB).toBe(99);
    // m_flA is the same as the parent's, the dump leaves it out
    expect(value.m_flA).toBeUndefined();
  });

  it("assigns own field defaults on child class", () => {
    const cls = getClass("TestChildClass");
    expect(getField(cls, "m_flC").defaultValue).toBe("5");
  });

  it("diffs nested object against target class defaults", () => {
    const cls = getClass("TestObjectDiff");
    // TestBaseClass defaults: m_flA=10, m_flB=20. Embedded: m_flA=10, m_flB=77
    // Diff should be {"m_flB":77}
    expect(getField(cls, "m_data").defaultValue).toBe('{"m_flB":77}');
  });

  it("omits nested object when identical to target defaults", () => {
    const cls = getClass("TestObjectRedundant");
    expect(getField(cls, "m_data").defaultValue).toBeUndefined();
  });

  it("stores atomic object defaults as-is", () => {
    const cls = getClass("TestAtomicObject");
    expect(getField(cls, "m_curve").defaultValue).toBe('{"m_spline":[],"m_tangents":[]}');
  });

  it("handles 'Could not parse' metadata gracefully", () => {
    const cls = getClass("TestBrokenDefaults");
    expect(getField(cls, "m_flX").defaultValue).toBeUndefined();
  });

  it("skips null values", () => {
    const cls = getClass("TestNanDefaults");
    expect(getField(cls, "m_flVal").defaultValue).toBeUndefined();
  });

  it("shows NaN and infinite float defaults unquoted, like the engine prints them", () => {
    const cls = getClass("TestNanDefaults");
    expect(getField(cls, "m_flNan").defaultValue).toBe("-nan");
    expect(getField(cls, "m_flInf").defaultValue).toBe("inf");
    // Only floats, a string field keeps its quotes
    expect(getField(cls, "m_szNan").defaultValue).toBe('"nan"');
  });

  it("assigns non-empty arrays, skips empty and all-zero arrays", () => {
    const cls = getClass("TestArrayDefaults");
    expect(getField(cls, "m_items").defaultValue).toBe("[1,2,3]");
    expect(getField(cls, "m_empty").defaultValue).toBeUndefined();
    // Vector [0,0,0] is all-zero — skip
    expect(getField(cls, "m_vecZero").defaultValue).toBeUndefined();
    // Vector [1,0,0] has a non-zero element — show
    expect(getField(cls, "m_vecNonZero").defaultValue).toBe("[1,0,0]");
    // Color [255,128,0,255] — show
    expect(getField(cls, "m_color").defaultValue).toBe("[255,128,0,255]");
  });

  it("skips all-hidden fields entirely", () => {
    const cls = getClass("TestAllHidden");
    expect(getField(cls, "m_id").defaultValue).toBeUndefined();
    expect(getField(cls, "m_name").defaultValue).toBeUndefined();
  });

  it("stores object for missing target class as-is", () => {
    const cls = getClass("TestMissingTarget");
    expect(getField(cls, "m_inner").defaultValue).toBe('{"m_x":5}');
  });

  it("skips null ptr fields as zero-value", () => {
    const cls = getClass("TestPtrField");
    expect(getField(cls, "m_ptr").defaultValue).toBeUndefined();
  });

  it("assigns non-zero enum default, skips zero enum default", () => {
    const cls = getClass("TestEnumDefaults");
    expect(getField(cls, "m_eColor").defaultValue).toBe("2");
    expect(getField(cls, "m_eTeam").defaultValue).toBeUndefined();
  });

  it("skips zero-values on non-builtin types", () => {
    const cls = getClass("TestZeroNonBuiltin");
    expect(getField(cls, "m_szLabel").defaultValue).toBeUndefined();
    expect(getField(cls, "m_nZero").defaultValue).toBeUndefined();
    expect(getField(cls, "m_bOff").defaultValue).toBeUndefined();
  });

  it("puts truly unknown keys into unconsumed metadata", () => {
    const cls = getClass("TestUnknownKeys");
    expect(getField(cls, "m_flX").defaultValue).toBe("3");
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults");
    expect(meta).toBeDefined();
    const value = meta!.value as Record<string, unknown>;
    expect(value.m_unknown).toBe(77);
    expect(value.m_extra).toBe("data");
    // Consumed fields should not appear
    expect(value.m_flX).toBeUndefined();
  });

  it("removes metadata entirely when no unconsumed keys", () => {
    const cls = getClass("TestBaseClass");
    expect(cls.metadata.some((m) => m.name === "MGetKV3ClassDefaults")).toBe(false);
  });

  it("keeps MGetKV3ClassDefaults for unparseable entries", () => {
    const cls = getClass("TestBrokenDefaults");
    expect(cls.metadata.some((m) => m.name === "MGetKV3ClassDefaults")).toBe(true);
  });

  it("assigns correct defaults when same-name class exists in different modules", () => {
    const classA = parsedSchemas.declarations.get("modA")?.get("TestSameNameClass") as SchemaClass;
    const classB = parsedSchemas.declarations.get("modB")?.get("TestSameNameClass") as SchemaClass;
    expect(classA).toBeDefined();
    expect(classB).toBeDefined();
    expect(getField(classA, "m_flVal").defaultValue).toBe("100");
    expect(getField(classB, "m_flVal").defaultValue).toBe("200");
  });

  it("diffs nested object using inner2 (map value type) for target defaults", () => {
    const cls = getClass("TestMapInner2");
    // TestBaseClass defaults: m_flA=10, m_flB=20. Embedded: m_flA=10, m_flB=77
    // inner2 resolves to TestBaseClass, diff should be {"m_flB":77}
    expect(getField(cls, "m_map").defaultValue).toBe('{"m_flB":77}');
  });
});

// ==================== parseSchemas basics ====================

describe("parseSchemas", () => {
  it("sorts declarations alphabetically by name within each module", () => {
    for (const moduleMap of parsedSchemas.declarations.values()) {
      const names = [...moduleMap.keys()];
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    }
  });

  it("fills in missing metadata arrays", () => {
    for (const moduleMap of parsedSchemas.declarations.values()) {
      for (const d of moduleMap.values()) {
        expect(Array.isArray(d.metadata)).toBe(true);
        if (d.kind === "class") {
          for (const f of d.fields) {
            expect(Array.isArray(f.metadata)).toBe(true);
          }
        }
      }
    }
  });

  it("parses metadata fields", () => {
    expect(parsedSchemas.metadata).toEqual({
      revision: 0,
      versionDate: "test",
      versionTime: "test",
    });
  });

  it("parses enum declarations with members and metadata", () => {
    const decl = findDecl("PulseTestEnumColor_t");
    expect(decl).toBeDefined();
    if (decl?.kind !== "enum") throw new Error("Expected enum");
    expect(decl.alignment).toBe("uint32_t");
    expect(decl.members).toHaveLength(5);
    expect(decl.members[0].name).toBe("BLACK");
    expect(decl.members[0].value).toBe(0);
    expect(decl.members[0].metadata).toEqual([{ name: "MPropertyFriendlyName", value: '"Black"' }]);
  });

  it("parses enums without metadata on members", () => {
    const decl = findDecl("DOTA_UNIT_TARGET_TEAM");
    expect(decl).toBeDefined();
    if (decl?.kind !== "enum") throw new Error("Expected enum");
    // Members without metadata should get empty array
    expect(decl.members[0].metadata).toEqual([]);
    // Enum-level metadata should be preserved
    expect(decl.metadata).toEqual([{ name: "MEnumFlagsWithOverlappingBits" }]);
  });

  it("parses parent relationships", () => {
    const decl = parsedSchemas.declarations.get("client")?.get("C_RectLight");
    expect(decl).toBeDefined();
    if (decl?.kind !== "class") throw new Error("Expected class");
    expect(decl.parents).toEqual([{ module: "client", name: "C_BarnLight" }]);
  });

  it("parses field types correctly", () => {
    const decl = parsedSchemas.declarations.get("client")?.get("CFuncWater");
    expect(decl).toBeDefined();
    if (decl?.kind !== "class") throw new Error("Expected class");
    const field = decl.fields.find((f) => f.name === "m_BuoyancyHelper");
    expect(field).toBeDefined();
    expect(field!.type).toEqual({
      category: "declared_class",
      module: "client",
      name: "CBuoyancyHelper",
    });
  });

  it("preserves field metadata", () => {
    const decl = parsedSchemas.declarations.get("client")?.get("C_RectLight");
    if (decl?.kind !== "class") throw new Error("Expected class");
    const field = decl.fields.find((f) => f.name === "m_bShowLight");
    expect(field).toBeDefined();
    expect(field!.metadata).toContainEqual({ name: "MNetworkEnable" });
    expect(field!.metadata).toContainEqual({
      name: "MNetworkChangeCallback",
      value: '"RenderingChanged"',
    });
  });

  it("preserves class-level metadata", () => {
    const decl = parsedSchemas.declarations.get("client")?.get("C_RectLight");
    if (decl?.kind !== "class") throw new Error("Expected class");
    expect(decl.metadata).toContainEqual({
      name: "MNetworkVarNames",
      value: '"bool m_bShowLight"',
    });
  });

  it("includes intrinsic declarations", () => {
    const intrinsics = parsedSchemas.declarations.get("_intrinsic");
    expect(intrinsics).toBeDefined();
    expect(intrinsics!.has("Vector")).toBe(true);
    expect(intrinsics!.has("QAngle")).toBe(true);
    expect(intrinsics!.has("CUtlString")).toBe(true);
    expect(intrinsics!.has("CHandle")).toBe(true);
  });

  it("orders modules with client and server first", () => {
    const modules = [...parsedSchemas.declarations.keys()];
    expect(modules.indexOf("client")).toBeLessThan(modules.indexOf("server"));
    // client and server should come before other modules
    for (const m of ["navlib", "particles", "test"]) {
      const idx = modules.indexOf(m);
      if (idx !== -1) {
        expect(modules.indexOf("client")).toBeLessThan(idx);
        expect(modules.indexOf("server")).toBeLessThan(idx);
      }
    }
  });

  it("handles classes with no parents", () => {
    const decl = parsedSchemas.declarations.get("client")?.get("CEffectData");
    if (decl?.kind !== "class") throw new Error("Expected class");
    expect(decl.parents).toEqual([]);
  });

  it("keeps same-named classes in different modules separate", () => {
    const clientSky = parsedSchemas.declarations.get("client")?.get("sky3dparams_t");
    const serverSky = parsedSchemas.declarations.get("server")?.get("sky3dparams_t");
    expect(clientSky).toBeDefined();
    expect(serverSky).toBeDefined();
    expect(clientSky).not.toBe(serverSky);
    expect(clientSky!.module).toBe("client");
    expect(serverSky!.module).toBe("server");
  });
});

// ==================== class layout ====================

describe("class layout and bases", () => {
  const int = { category: "builtin", name: "int32" } as const;
  const { declarations } = parseSchemas({
    classes: [
      { name: "CRoot", module: "m", size: 8, fields: [{ name: "m_root", offset: 0, type: int }] },
      {
        name: "CBase",
        module: "m",
        size: 16,
        alignment: 8,
        flags: ["abstract"],
        parents: [{ name: "CRoot", module: "m" }],
        fields: [{ name: "m_base", offset: 8, type: int }],
      },
      { name: "IAttrBase", module: "m", size: 8, fields: [{ name: "m_vt", offset: 0, type: int }] },
      {
        name: "IAttr",
        module: "m",
        size: 16,
        parents: [{ name: "IAttrBase", module: "m" }],
        fields: [{ name: "m_attr", offset: 8, type: int }],
      },
      {
        name: "CDerived",
        module: "m",
        size: 48,
        parents: [
          { name: "CBase", module: "m" },
          { name: "IAttr", module: "m", offset: 32 },
        ],
      },
    ],
    enums: [],
  });
  const cls = (name: string) => declarations.get("m")!.get(name) as SchemaClass;

  it("keeps size, alignment and flags, flags default to none", () => {
    expect(cls("CBase")).toMatchObject({ size: 16, alignment: 8, flags: ["abstract"] });
    expect(cls("CRoot").flags).toEqual([]);
    expect(cls("CRoot").alignment).toBeUndefined();
  });

  it("places a later base and everything it inherits at its offset", () => {
    const bases = inheritedBases(declarations, cls("CDerived").parents);
    expect(bases.map((b) => [b.parent.name, b.offset])).toEqual([
      ["CRoot", 0],
      ["CBase", 0],
      ["IAttrBase", 32],
      ["IAttr", 32],
    ]);
    expect(bases[3].fields.map((f) => f.name)).toEqual(["m_attr"]);
  });
});

// ==================== object defaults ====================

describe("assignDefaults with object defaults", () => {
  const float = { category: "builtin", name: "float32" } as const;
  const data: SchemasJson = {
    classes: [
      {
        name: "ObjBase",
        module: "m",
        size: 8,
        fields: [
          { name: "m_flA", offset: 0, type: float },
          { name: "m_flB", offset: 4, type: float },
        ],
        metadata: [{ name: "MGetKV3ClassDefaults", value: { m_flA: 10, m_flB: 20 } }],
      },
      {
        name: "ObjChild",
        module: "m",
        size: 16,
        parents: [{ name: "ObjBase", module: "m" }],
        fields: [
          { name: "m_flC", offset: 8, type: float },
          { name: "m_flNull", offset: 12, type: float },
        ],
        // Only keys that differ from the parent's full defaults, nulls are skipped
        metadata: [
          {
            name: "MGetKV3ClassDefaults",
            value: { m_flB: 99, m_flC: 5, m_flNull: null, m_extra: "x" },
          },
        ],
      },
      {
        name: "ObjHolder",
        module: "m",
        size: 32,
        fields: [
          {
            name: "m_same",
            offset: 0,
            type: { category: "declared_class", module: "m", name: "ObjChild" },
          },
          {
            name: "m_diff",
            offset: 16,
            type: { category: "declared_class", module: "m", name: "ObjChild" },
          },
        ],
        metadata: [
          {
            name: "MGetKV3ClassDefaults",
            value: {
              m_diff: { m_flA: 1, m_flB: 99, m_flC: 5 },
              m_same: { m_flA: 10, m_flB: 99, m_flC: 5 },
            },
          },
        ],
      },
      {
        name: "ObjBroken",
        module: "m",
        size: 4,
        fields: [{ name: "m_flX", offset: 0, type: float }],
        metadata: [{ name: "MGetKV3ClassDefaults", value: "Could not parse KV3 Defaults" }],
      },
      {
        name: "ObjNoDefaults",
        module: "m",
        size: 4,
        fields: [{ name: "m_flX", offset: 0, type: float }],
        metadata: [{ name: "MGetKV3ClassDefaults" }, { name: "MNotSaved" }],
      },
    ],
    enums: [],
  };
  const parsed = parseSchemas(structuredClone(data));
  const cls = (name: string) => parsed.declarations.get("m")!.get(name) as SchemaClass;
  const field = (c: SchemaClass, name: string) => c.fields.find((f) => f.name === name)!;
  const defaults = (c: SchemaClass) =>
    c.metadata.find((m) => m.name === "MGetKV3ClassDefaults")?.value;

  it("assigns own field defaults", () => {
    expect(field(cls("ObjBase"), "m_flA").defaultValue).toBe("10");
    expect(field(cls("ObjChild"), "m_flC").defaultValue).toBe("5");
  });

  it("skips null values", () => {
    expect(field(cls("ObjChild"), "m_flNull").defaultValue).toBeUndefined();
  });

  it("keeps unconsumed keys and inherited overrides as an object", () => {
    expect(defaults(cls("ObjChild"))).toEqual({ m_flB: 99, m_extra: "x" });
    expect(defaults(cls("ObjBase"))).toBeUndefined();
  });

  it("diffs an embedded class against its defaults merged with its parents'", () => {
    // ObjChild's full defaults are m_flA 10 from ObjBase, m_flB 99 and m_flC 5
    expect(field(cls("ObjHolder"), "m_same").defaultValue).toBeUndefined();
    expect(field(cls("ObjHolder"), "m_diff").defaultValue).toBe('{"m_flA":1}');
  });

  it("keeps unparseable defaults as text", () => {
    expect(defaults(cls("ObjBroken"))).toBe("Could not parse KV3 Defaults");
    expect(field(cls("ObjBroken"), "m_flX").defaultValue).toBeUndefined();
  });

  it("keeps MGetKV3ClassDefaults without defaults as a tag", () => {
    expect(cls("ObjNoDefaults").metadata).toEqual([
      { name: "MGetKV3ClassDefaults" },
      { name: "MNotSaved" },
    ]);
    expect(field(cls("ObjNoDefaults"), "m_flX").defaultValue).toBeUndefined();
  });

  it("searches object values as their JSON text", () => {
    const found = searchDeclarations(
      parsed.declarations.get("m")!.values(),
      parseSearch("metadatavalue:m_extra"),
    );
    expect(found.map((d) => d.name)).toEqual(["ObjChild"]);
  });
});
