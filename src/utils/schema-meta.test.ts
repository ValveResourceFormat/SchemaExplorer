import { describe, it, expect } from "vitest";
import { isoVersionDate, type SchemasJson } from "../data/schemas";
import { buildContext, cls, field } from "../data/test-helpers";
import { INTRINSIC_MODULE } from "../data/intrinsics";
import { declarationTitle, describeDeclaration, describeGame } from "./schema-meta";

const data: SchemasJson = {
  revision: 11131657,
  version_date: "Oct 14 2026",
  version_time: "16:57:53",
  classes: [
    cls("server", "CBaseTrigger", [field("m_bDisabled", undefined, 0x10)]),
    cls("server", "CBuyZone", [field("m_nTeam", undefined, 0x9a0)], {
      parents: [{ name: "CBaseTrigger", module: "server" }],
    }),
    cls(
      "client",
      "C_CSPlayerPawn",
      Array.from({ length: 30 }, (_, i) => field(`m_nField${i}`, undefined, 0x1570 + i * 8)),
      { parents: [{ name: "C_CSPlayerPawnBase", module: "client" }] },
    ),
  ],
  enums: [{ name: "ETeam", module: "server", alignment: "uint8", members: [] }],
  entities: [
    {
      module: "server",
      class: "CBuyZone",
      designName: "func_buyzone",
      keys: [],
      inputs: [],
      outputs: [],
    },
  ] as unknown as SchemasJson["entities"],
};

describe("isoVersionDate", () => {
  it("turns the dump's date into a sitemap date", () => {
    expect(isoVersionDate("Oct 14 2026")).toBe("2026-10-14");
    expect(isoVersionDate("Mar  3 2025")).toBe("2025-03-03");
  });

  it("returns null when the dump has no date", () => {
    expect(isoVersionDate("")).toBeNull();
    expect(isoVersionDate("Foo 1 2026")).toBeNull();
  });
});

describe("page meta", () => {
  const context = buildContext(data);
  const get = (module: string, name: string) => context.declarations.get(module)!.get(name)!;

  it("titles a class by its offsets", () => {
    expect(declarationTitle(get("client", "C_CSPlayerPawn"), "cs2", context)).toBe(
      "C_CSPlayerPawn offsets & fields - CS2 client.dll | Source 2 Schemas",
    );
  });

  it("titles an entity by its design name", () => {
    expect(declarationTitle(get("server", "CBuyZone"), "cs2", context)).toBe(
      "func_buyzone (CBuyZone) - CS2 entity keyvalues, inputs & outputs",
    );
  });

  it("titles an enum by its values", () => {
    expect(declarationTitle(get("server", "ETeam"), "cs2", context)).toBe(
      "ETeam values - CS2 server.dll | Source 2 Schemas",
    );
  });

  it("leads a class description with field offsets and stays short", () => {
    const desc = describeDeclaration(get("client", "C_CSPlayerPawn"), "cs2", context);
    expect(desc).toMatch(
      /^C_CSPlayerPawn field offsets in client\.dll \(Counter-Strike 2, Oct 14 2026\): m_nField0 0x1570, m_nField1 0x1578, .*, …; extends C_CSPlayerPawnBase\.$/,
    );
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("adds the entity summary when there is room", () => {
    expect(describeDeclaration(get("server", "CBuyZone"), "cs2", context)).toBe(
      "CBuyZone field offsets in server.dll (Counter-Strike 2, Oct 14 2026): m_nTeam 0x09A0; extends CBaseTrigger. func_buyzone: 0 keyvalues, 0 inputs, 0 outputs.",
    );
  });

  it("describes a game with its build and counts, intrinsic types included", () => {
    const intrinsics = context.declarations.get(INTRINSIC_MODULE)?.size ?? 0;
    expect(describeGame("cs2", context)).toBe(
      `Counter-Strike 2 schema dump (build 11131657, Oct 14 2026): ${3 + intrinsics} classes and 1 enum with field offsets, updated every game update.`,
    );
  });
});
