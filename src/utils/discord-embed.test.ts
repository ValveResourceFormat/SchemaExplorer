import { describe, it, expect } from "vitest";
import { buildComponentEmbed, formatFieldType, type EmbedPage } from "./discord-embed";
import { declarations } from "../data/test-helpers";
import type { SchemaClass } from "../data/types";
import { canonicalUrl } from "../games-list";

const PAGE: EmbedPage = {
  siteName: "Source 2 Schema Explorer",
  gameName: "Counter-Strike 2",
  url: canonicalUrl("cs2", "client", "Test"),
  imageUrl: canonicalUrl("assets", "logo.png"),
};

describe("formatFieldType", () => {
  it("formats nested types", () => {
    expect(
      formatFieldType({
        category: "atomic",
        name: "CUtlVector",
        inner: { category: "ptr", inner: { category: "declared_class", name: "Foo", module: "m" } },
      }),
    ).toBe("CUtlVector< Foo* >");
    expect(
      formatFieldType({
        category: "fixed_array",
        inner: { category: "builtin", name: "float32" },
        count: 4,
      }),
    ).toBe("float32[4]");
  });
});

describe("buildComponentEmbed", () => {
  it("produces a valid payload under the size limit for every declaration", () => {
    for (const d of declarations) {
      const json = buildComponentEmbed(d, PAGE);
      expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(3000);
      expect(json).not.toContain("<");

      const { component } = JSON.parse(json);
      expect(component.type).toBe(17);
      const [section, code] = component.components;
      expect(section.components[0].content).toContain(`[${d.name}](${PAGE.url})`);
      expect(section.accessory.media.url).toBe(PAGE.imageUrl);
      expect(code.content).toContain(`${d.kind} ${d.name}`);
    }
  });

  it("truncates large classes", () => {
    const big: SchemaClass = {
      kind: "class",
      name: "CBig",
      module: "client",
      parents: [],
      metadata: [],
      fields: Array.from({ length: 500 }, (_, i) => ({
        name: `m_nSomeLongFieldName${i}`,
        offset: i * 4,
        type: { category: "builtin", name: "int32" },
        metadata: [],
      })),
    };

    const json = buildComponentEmbed(big, PAGE);
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(3000);

    const content: string = JSON.parse(json).component.components[1].content;
    expect(content).toContain("m_nSomeLongFieldName14;");
    expect(content).not.toContain("m_nSomeLongFieldName15;");
    expect(content).toMatch(/…and 485 more fields$/);
  });
});
