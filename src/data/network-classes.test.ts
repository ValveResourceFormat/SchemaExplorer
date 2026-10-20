import { describe, it, expect } from "vitest";
import {
  compareCaseless,
  isConstructible,
  isEntityClass,
  networkClassIds,
  polymorphicTypes,
} from "./network-classes";
import { parseSchemas, type SchemasJson } from "./schemas";
import { buildContext } from "./test-helpers";
import type { SchemaClass, SchemaClassFlag } from "./types";
import cs2 from "./test-network-classes.json";

describe("compareCaseless", () => {
  it("ignores case, putting _ before letters and after digits", () => {
    expect(compareCaseless("CFoo_Bar", "CFooBar")).toBeLessThan(0);
    expect(compareCaseless("CBaseCSGrenade", "CBaseCombatCharacter")).toBeGreaterThan(0);
    // A case-sensitive order puts uppercase letters before _
    expect(compareCaseless("C_Foo", "CBar")).toBeLessThan(0);
    expect(["C_Foo", "CBar"].toSorted()).toEqual(["CBar", "C_Foo"]);
    // localeCompare puts _ before digits
    expect(compareCaseless("CFoo2", "CFoo_")).toBeLessThan(0);
    expect("CFoo2".localeCompare("CFoo_")).toBeGreaterThan(0);
    expect(compareCaseless("cfoo", "CFOO")).toBe(0);
    expect(compareCaseless("CFoo", "CFooBar")).toBeLessThan(0);
  });

  it("orders the classes the CS2 server sent in a demo's class info", () => {
    expect(cs2.classIds.toSorted(compareCaseless)).toEqual(cs2.classIds);
  });
});

describe("isConstructible", () => {
  const cls = (flags: SchemaClassFlag[], alignment?: number) =>
    ({ flags, alignment }) as SchemaClass;

  it("is true for a class with an alignment, whatever its flags", () => {
    expect(isConstructible(cls([], 8))).toBe(true);
    expect(isConstructible(cls(["abstract"], 8))).toBe(true);
  });

  it("needs construct_allowed without abstract or construct_disallowed otherwise", () => {
    expect(isConstructible(cls(["construct_allowed"]))).toBe(true);
    expect(isConstructible(cls(["abstract", "construct_allowed"]))).toBe(false);
    expect(isConstructible(cls(["construct_allowed", "construct_disallowed"]))).toBe(false);
    expect(isConstructible(cls(["trivial_destructor"]))).toBe(false);
    expect(isConstructible(cls([]))).toBe(false);
  });
});

describe("networkClassIds", () => {
  const networkClass = { networkClass: true };
  const { declarations } = parseSchemas({
    classes: [
      { name: "CEntityInstance", module: "entity2", alignment: 8 },
      {
        name: "CBaseEntity",
        module: "server",
        alignment: 8,
        parents: [{ name: "CEntityInstance", module: "entity2" }],
        network: networkClass,
      },
      {
        name: "CFoo_Bar",
        module: "server",
        alignment: 8,
        parents: [{ name: "CBaseEntity", module: "server" }],
        network: networkClass,
      },
      {
        name: "CFooBar",
        module: "server",
        flags: ["construct_allowed"],
        parents: [{ name: "CBaseEntity", module: "server" }],
        network: networkClass,
      },
      {
        name: "CAbstract",
        module: "server",
        flags: ["abstract", "construct_allowed"],
        parents: [{ name: "CBaseEntity", module: "server" }],
        network: networkClass,
      },
      { name: "IMixin", module: "server", alignment: 8 },
      {
        name: "CMixed",
        module: "server",
        alignment: 8,
        parents: [
          { name: "IMixin", module: "server" },
          { name: "CFoo_Bar", module: "server" },
        ],
        network: networkClass,
      },
      { name: "CNotEntity", module: "server", alignment: 8, network: networkClass },
      {
        name: "CNotRegistered",
        module: "server",
        alignment: 8,
        parents: [{ name: "CBaseEntity", module: "server" }],
      },
    ],
    enums: [],
  });
  const cls = (name: string) => declarations.get("server")!.get(name) as SchemaClass;

  it("numbers the constructible entity classes with networkClass in caseless order", () => {
    const { ids, bits } = networkClassIds(declarations);
    const names = [...ids.entries()].map(([c, id]) => [c.name, id]);
    expect(names).toEqual([
      ["CBaseEntity", 0],
      ["CFoo_Bar", 1],
      ["CFooBar", 2],
      ["CMixed", 3],
    ]);
    expect(bits).toBe(3);
  });

  it("follows every base to CBaseEntity", () => {
    expect(isEntityClass(declarations, cls("CMixed"))).toBe(true);
    expect(isEntityClass(declarations, cls("CNotEntity"))).toBe(false);
  });

  it("caches per game", () => {
    expect(networkClassIds(declarations)).toBe(networkClassIds(declarations));
  });

  it("matches the class ids of a CS2 demo", () => {
    const parsed = parseSchemas(structuredClone(cs2.schemas) as SchemasJson);
    const { ids, bits } = networkClassIds(parsed.declarations);
    const names = [...ids.keys()].map((c) => c.name);
    expect(names).toEqual(cs2.classIds);
    expect(bits).toBe(8);
  });

  it("sends ids in floor(log2(count)) + 1 bits", () => {
    function bitsFor(count: number) {
      const classes: SchemasJson["classes"] = [
        { name: "CBaseEntity", module: "server", alignment: 8, network: networkClass },
      ];
      for (let i = 1; i < count; i++) {
        classes.push({
          name: `C${i}`,
          module: "server",
          alignment: 8,
          parents: [{ name: "CBaseEntity", module: "server" }],
          network: networkClass,
        });
      }

      return networkClassIds(parseSchemas({ classes, enums: [] }).declarations).bits;
    }

    expect(bitsFor(1)).toBe(1);
    expect(bitsFor(2)).toBe(2);
    expect(bitsFor(3)).toBe(2);
    expect(bitsFor(4)).toBe(3);
    expect(bitsFor(222)).toBe(8);
    expect(bitsFor(882)).toBe(10);
    expect(bitsFor(3229)).toBe(12);
  });
});

describe("polymorphicTypes", () => {
  const rules = (module: string) => ({
    category: "declared_class" as const,
    name: "CRules",
    module,
  });
  const context = buildContext({
    classes: [
      {
        name: "CGame",
        module: "server",
        fields: [
          {
            name: "m_pRules",
            type: { category: "ptr", inner: rules("server") },
            network: { type: "CRules *", polymorphic: true },
          },
          {
            name: "m_pPlain",
            type: { category: "ptr", inner: rules("server") },
            network: { type: "CRules *" },
          },
        ],
      },
      { name: "CRules", module: "server" },
      { name: "CRules_Noop", module: "server", parents: [{ name: "CRules", module: "server" }] },
      { name: "CRulesArms", module: "server", parents: [{ name: "CRules", module: "server" }] },
      {
        name: "CRules_Deep",
        module: "server",
        parents: [{ name: "CRulesArms", module: "server" }],
      },
      { name: "CRules_Other", module: "client", parents: [{ name: "CRules", module: "server" }] },
    ],
    enums: [],
  });
  const game = context.declarations.get("server")!.get("CGame") as SchemaClass;

  it("numbers the field's class 0, then its direct children in the module in caseless order", () => {
    const types = polymorphicTypes(context.references, game.fields[0]);
    expect(types.map((t) => [t.id, t.name])).toEqual([
      [0, "CRules"],
      [1, "CRules_Noop"],
      [2, "CRulesArms"],
    ]);
  });

  it("is empty for fields that aren't polymorphic", () => {
    expect(polymorphicTypes(context.references, game.fields[1])).toEqual([]);
  });
});
