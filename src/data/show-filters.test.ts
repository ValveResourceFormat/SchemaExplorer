import { describe, it, expect } from "vitest";
import { allDeclarations, buildAllGameContexts, getGameContext } from "./derived";
import { parseSchemas, type SchemasJson } from "./schemas";
import { SHOW_FILTERS, countShowFilters, type ShowFilter } from "./show-filters";
import type { GameId } from "../games-list";
import { INTRINSIC_MODULE } from "./intrinsics";

const cs2: SchemasJson = {
  classes: [
    { name: "CEntityInstance", module: "entity2", fields: [] },
    {
      name: "CBaseEntity",
      module: "server",
      parents: [{ name: "CEntityInstance", module: "entity2" }],
      fields: [
        {
          name: "m_iHealth",
          offset: 8,
          type: { category: "builtin", name: "int32" },
          network: { type: "int32" },
        },
      ],
    },
    { name: "CScriptComponent", module: "server", fields: [] },
    {
      name: "CWeaponVData",
      module: "server",
      fields: [],
      metadata: [{ name: "MVDataRoot" }],
    },
  ],
  enums: [{ name: "RenderMode_t", module: "client", alignment: "uint8", members: [] }],
  entities: [
    {
      class: "CBaseEntity",
      module: "server",
      spawnable: false,
      components: [{ name: "CScriptComponent" }],
    },
  ],
};

// Has everything but the weapon VData
const dota2: SchemasJson = {
  ...cs2,
  classes: cs2.classes!.filter((c) => c.name !== "CWeaponVData"),
  entities: [],
};

buildAllGameContexts(
  new Map([
    ["cs2", parseSchemas(structuredClone(cs2))],
    ["dota2", parseSchemas(structuredClone(dota2))],
  ]),
  new Map(),
);
const context = getGameContext("cs2" as GameId);
// Without the intrinsic types every game gets
const declarations = [...allDeclarations(context.declarations)].filter(
  (d) => d.module !== INTRINSIC_MODULE,
);

function shown(filter: ShowFilter) {
  const { test } = SHOW_FILTERS[filter];
  return declarations.filter((d) => test(d, context)).map((d) => d.name);
}

describe("show filters", () => {
  it("keeps the declarations of their kind", () => {
    expect(shown("all")).toHaveLength(5);
    expect(shown("classes")).toHaveLength(4);
    expect(shown("enums")).toEqual(["RenderMode_t"]);
  });

  it("keeps entity, component, networked, VData, and exclusive classes", () => {
    expect(shown("entities")).toEqual(["CBaseEntity"]);
    expect(shown("components")).toEqual(["CScriptComponent"]);
    expect(shown("networked")).toEqual(["CBaseEntity"]);
    expect(shown("vdata")).toEqual(["CWeaponVData"]);
    expect(shown("exclusive")).toEqual(["CWeaponVData"]);
  });

  it("counts what each filter keeps", () => {
    const counts = countShowFilters(declarations, context);
    expect(Object.fromEntries(counts)).toEqual({
      all: 5,
      classes: 4,
      enums: 1,
      entities: 1,
      components: 1,
      networked: 1,
      vdata: 1,
      exclusive: 1,
    });
  });
});
