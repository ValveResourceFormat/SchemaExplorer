import { describe, it, expect } from "vitest";
import { compareDeclarations } from "./compare";
import type { SchemaClass, SchemaField } from "./types";

const int = { category: "builtin", name: "int32" } as const;

function cls(fields: Partial<SchemaField>[], network?: SchemaClass["network"]): SchemaClass {
  return {
    kind: "class",
    name: "C",
    module: "client",
    size: 8,
    flags: [],
    parents: [],
    metadata: [],
    network,
    fields: fields.map((f) => ({ name: "m_x", offset: 0, type: int, metadata: [], ...f })),
  };
}

describe("compareDeclarations network data", () => {
  it("is identical when the network data is the same", () => {
    const a = cls([{ network: { type: "int", priority: 32 } }], { varsAtomic: true });
    const b = cls([{ network: { priority: 32, type: "int" } }], { varsAtomic: true });
    expect(compareDeclarations(a, b, true)).toBe("identical");
  });

  it("differs when a field's network data differs", () => {
    const a = cls([{ network: { type: "int", bitCount: 8 } }]);
    const b = cls([{ network: { type: "int" } }]);
    expect(compareDeclarations(a, b, true)).toBe("differs");
    // Networked in one game only
    expect(compareDeclarations(a, cls([{}]), true)).toBe("differs");
  });

  it("differs when the class's network data differs", () => {
    const a = cls([], { includeByName: ["m_x"] });
    expect(compareDeclarations(a, cls([]), true)).toBe("differs");
  });

  it("ignores network data when a game has none", () => {
    const a = cls([{ network: { type: "int" } }], { varsAtomic: true });
    expect(compareDeclarations(a, cls([{}]), false)).toBe("identical");
  });
});
