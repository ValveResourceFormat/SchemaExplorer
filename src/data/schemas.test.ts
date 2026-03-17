import { describe, it, expect } from "vitest";
import {
  parseSchemas,
  parseKV3Defaults,
  diffObject,
  resolveLeafType,
  HIDDEN_SENTINEL,
  type SchemasJson,
} from "./schemas";
import type { SchemaClass } from "./types";
import testData from "../utils/test-schemas.json";

function getClass(name: string): SchemaClass {
  const result = parseSchemas(testData as SchemasJson);
  const decl = result.declarations.find((d) => d.name === name && d.kind === "class");
  if (!decl || decl.kind !== "class") throw new Error(`Class ${name} not found`);
  return decl;
}

function getField(cls: SchemaClass, name: string) {
  const field = cls.fields.find((f) => f.name === name);
  if (!field) throw new Error(`Field ${name} not found on ${cls.name}`);
  return field;
}

// ==================== parseKV3Defaults ====================

describe("parseKV3Defaults", () => {
  it("parses simple JSON object", () => {
    const result = parseKV3Defaults('{\n\t"m_x": 1,\n\t"m_y": "hello"\n}');
    expect(result).toEqual({ m_x: 1, m_y: "hello" });
  });

  it("returns null for 'Could not parse' strings", () => {
    expect(parseKV3Defaults("Could not parse KV3 Defaults")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseKV3Defaults("")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseKV3Defaults("[1, 2, 3]")).toBeNull();
    expect(parseKV3Defaults('"hello"')).toBeNull();
    expect(parseKV3Defaults("42")).toBeNull();
  });

  it("replaces <HIDDEN FOR DIFF> with sentinel string", () => {
    const result = parseKV3Defaults('{\n\t"m_id": <HIDDEN FOR DIFF>,\n\t"m_name": "test"\n}');
    expect(result).toEqual({ m_id: HIDDEN_SENTINEL, m_name: "test" });
  });

  it("handles multiple <HIDDEN FOR DIFF> tokens", () => {
    const result = parseKV3Defaults('{\n\t"a": <HIDDEN FOR DIFF>,\n\t"b": <HIDDEN FOR DIFF>\n}');
    expect(result).toEqual({ a: HIDDEN_SENTINEL, b: HIDDEN_SENTINEL });
  });

  it("handles trailing comma before closing brace", () => {
    const result = parseKV3Defaults('{\n\t"m_id": <HIDDEN FOR DIFF>,\n}');
    expect(result).not.toBeNull();
    expect(result!.m_id).toBe(HIDDEN_SENTINEL);
  });

  it("handles trailing comma before closing bracket", () => {
    const result = parseKV3Defaults('{\n\t"arr": [1, 2,\n]\n}');
    expect(result).toEqual({ arr: [1, 2] });
  });

  it("replaces -nan with null", () => {
    const result = parseKV3Defaults('{\n\t"m_val": -nan\n}');
    expect(result).toEqual({ m_val: null });
  });

  it("does not replace -nan inside strings", () => {
    const result = parseKV3Defaults('{\n\t"m_name": "urban-nancy"\n}');
    expect(result).toEqual({ m_name: "urban-nancy" });
  });

  it("handles nested objects with hidden tokens and trailing commas", () => {
    const input = '{\n\t"m_outer": {\n\t\t"m_id": <HIDDEN FOR DIFF>,\n\t},\n\t"m_val": 5\n}';
    const result = parseKV3Defaults(input);
    expect(result).not.toBeNull();
    expect(result!.m_val).toBe(5);
    expect((result!.m_outer as Record<string, unknown>).m_id).toBe(HIDDEN_SENTINEL);
  });

  it("returns null for completely broken JSON", () => {
    expect(parseKV3Defaults("{not valid json at all}")).toBeNull();
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

  it("skips hidden sentinel values", () => {
    const embedded = { a: HIDDEN_SENTINEL, b: 1 };
    const own = { a: 5, b: 1 };
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
    const result = parseSchemas(testData as SchemasJson);
    const base = result.declarations.find(
      (d) => d.name === "TestBaseClass" && d.kind === "class",
    ) as SchemaClass;
    expect(getField(base, "m_flB").defaultValue).toBe("20");
  });

  it("puts inherited field overrides into unconsumed metadata", () => {
    const cls = getClass("TestChildClass");
    // TestChildClass overrides parent's m_flB from 20 to 99
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults");
    expect(meta).toBeDefined();
    const value = JSON.parse(meta!.value!);
    expect(value.m_flB).toBe(99);
    // m_flA is same as parent (10), should NOT be in unconsumed
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

  it("handles -nan values (treated as null, skipped as zero)", () => {
    const cls = getClass("TestNanDefaults");
    expect(getField(cls, "m_flVal").defaultValue).toBeUndefined();
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
    const value = JSON.parse(meta!.value!);
    expect(value._class).toBe("TestUnknownKeys");
    expect(value.m_unknown).toBe(77);
    expect(value.m_extra).toBe("data");
    // Consumed field should not appear
    expect(value.m_flX).toBeUndefined();
  });

  it("rewrites metadata to contain only unconsumed keys like _class", () => {
    const cls = getClass("TestSimpleDefaults");
    const meta = cls.metadata.find((m) => m.name === "MGetKV3ClassDefaults");
    expect(meta).toBeDefined();
    const value = JSON.parse(meta!.value!);
    expect(value._class).toBe("TestSimpleDefaults");
    // Field keys should not be in unconsumed
    expect(value.m_flValue).toBeUndefined();
  });

  it("removes metadata entirely when no unconsumed keys", () => {
    const cls = getClass("TestBaseClass");
    expect(cls.metadata.some((m) => m.name === "MGetKV3ClassDefaults")).toBe(false);
  });

  it("keeps MGetKV3ClassDefaults for unparseable entries", () => {
    const cls = getClass("TestBrokenDefaults");
    expect(cls.metadata.some((m) => m.name === "MGetKV3ClassDefaults")).toBe(true);
  });
});

// ==================== parseSchemas basics ====================

describe("parseSchemas", () => {
  it("deduplicates classes by module/name", () => {
    const result = parseSchemas(testData as SchemasJson);
    const effectDataCount = result.declarations.filter((d) => d.name === "CEffectData").length;
    // CEffectData appears in both client and server modules — both should exist
    expect(effectDataCount).toBe(2);
    // But exact duplicates (same module+name) should be deduped
    const skyCount = result.declarations.filter((d) => d.name === "sky3dparams_t");
    const modules = new Set(skyCount.map((d) => d.module));
    expect(modules.size).toBe(skyCount.length);
  });

  it("sorts declarations alphabetically by name", () => {
    const result = parseSchemas(testData as SchemasJson);
    for (let i = 1; i < result.declarations.length; i++) {
      expect(
        result.declarations[i].name.localeCompare(result.declarations[i - 1].name),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("fills in missing metadata arrays", () => {
    const result = parseSchemas(testData as SchemasJson);
    for (const d of result.declarations) {
      expect(Array.isArray(d.metadata)).toBe(true);
      if (d.kind === "class") {
        for (const f of d.fields) {
          expect(Array.isArray(f.metadata)).toBe(true);
        }
      }
    }
  });

  it("parses metadata fields", () => {
    const result = parseSchemas(testData as SchemasJson);
    expect(result.metadata).toEqual({ revision: 0, versionDate: "test", versionTime: "test" });
  });

  it("defaults missing metadata fields to zero values", () => {
    const result = parseSchemas({ classes: [], enums: [] });
    expect(result.metadata).toEqual({ revision: 0, versionDate: "", versionTime: "" });
  });

  it("parses enum declarations with members and metadata", () => {
    const result = parseSchemas(testData as SchemasJson);
    const decl = result.declarations.find(
      (d) => d.name === "PulseTestEnumColor_t" && d.kind === "enum",
    );
    expect(decl).toBeDefined();
    if (decl?.kind !== "enum") throw new Error("Expected enum");
    expect(decl.alignment).toBe("uint32_t");
    expect(decl.members).toHaveLength(5);
    expect(decl.members[0].name).toBe("BLACK");
    expect(decl.members[0].value).toBe(0);
    expect(decl.members[0].metadata).toEqual([{ name: "MPropertyFriendlyName", value: '"Black"' }]);
  });

  it("parses enums without metadata on members", () => {
    const result = parseSchemas(testData as SchemasJson);
    const decl = result.declarations.find(
      (d) => d.name === "DOTA_UNIT_TARGET_TEAM" && d.kind === "enum",
    );
    expect(decl).toBeDefined();
    if (decl?.kind !== "enum") throw new Error("Expected enum");
    // Members without metadata should get empty array
    expect(decl.members[0].metadata).toEqual([]);
    // Enum-level metadata should be preserved
    expect(decl.metadata).toEqual([{ name: "MEnumFlagsWithOverlappingBits" }]);
  });
});
