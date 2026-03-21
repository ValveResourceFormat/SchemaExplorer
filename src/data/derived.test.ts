import { describe, it, expect } from "vitest";
import {
  crossModuleName,
  declarationKey,
  allDeclarations,
  buildAllGameContexts,
  getGameContext,
} from "./derived";
import type { ParsedSchemas } from "./schemas";
import type { Declaration } from "./types";
import type { GameId } from "../games-list";
import { parsedSchemas, buildTestContext } from "./test-helpers";

const ctx = buildTestContext();

// ==================== crossModuleName ====================

describe("crossModuleName", () => {
  it("maps C_ prefix to C (client → server)", () => {
    expect(crossModuleName("C_AK47")).toBe("CAK47");
    expect(crossModuleName("C_BaseEntity")).toBe("CBaseEntity");
    expect(crossModuleName("C_Fish")).toBe("CFish");
  });

  it("maps C prefix to C_ (server → client)", () => {
    expect(crossModuleName("CAK47")).toBe("C_AK47");
    expect(crossModuleName("CBaseEntity")).toBe("C_BaseEntity");
    expect(crossModuleName("CFish")).toBe("C_Fish");
  });

  it("returns null for names without C/C_ prefix", () => {
    expect(crossModuleName("BaseEntity")).toBeNull();
    expect(crossModuleName("sky3dparams_t")).toBeNull();
    expect(crossModuleName("")).toBeNull();
  });

  it("handles single-letter C_ name", () => {
    expect(crossModuleName("C_X")).toBe("CX");
    expect(crossModuleName("CX")).toBe("C_X");
  });

  it("handles C_ alone (edge case)", () => {
    expect(crossModuleName("C_")).toBe("C");
  });

  it("is case sensitive — lowercase c is not mapped", () => {
    expect(crossModuleName("c_BaseEntity")).toBeNull();
    expect(crossModuleName("cBaseEntity")).toBeNull();
  });
});

// ==================== declarationKey ====================

describe("declarationKey", () => {
  it("joins module and name with slash", () => {
    expect(declarationKey("client", "C_BaseEntity")).toBe("client/C_BaseEntity");
    expect(declarationKey("server", "CBaseEntity")).toBe("server/CBaseEntity");
  });
});

// ==================== allDeclarations ====================

describe("allDeclarations", () => {
  it("yields all declarations across modules", () => {
    const all = [...allDeclarations(parsedSchemas.declarations)];
    expect(all.length).toBeGreaterThan(0);

    const modules = new Set(all.map((d) => d.module));
    expect(modules.has("client")).toBe(true);
    expect(modules.has("server")).toBe(true);
  });

  it("yields nothing for empty map", () => {
    const empty = new Map<string, Map<string, Declaration>>();
    expect([...allDeclarations(empty)]).toEqual([]);
  });
});

// ==================== buildAllGameContexts with test-schemas.json ====================

describe("references", () => {
  it("records parent class references", () => {
    // C_RectLight extends C_BarnLight
    const refs = ctx.references.get(declarationKey("client", "C_BarnLight"));
    expect(refs).toBeDefined();
    const match = refs!.find((r) => r.declarationName === "C_RectLight" && r.relation === "class");
    expect(match).toBeDefined();
    expect(match!.declarationModule).toBe("client");
  });

  it("records field type references", () => {
    // CFuncWater has field m_BuoyancyHelper of type client/CBuoyancyHelper
    const refs = ctx.references.get(declarationKey("client", "CBuoyancyHelper"));
    expect(refs).toBeDefined();
    const match = refs!.find(
      (r) => r.declarationName === "CFuncWater" && r.fieldName === "m_BuoyancyHelper",
    );
    expect(match).toBeDefined();
    expect(match!.relation).toBe("field");
  });

  it("does not include self-references", () => {
    for (const [key, entries] of ctx.references) {
      for (const entry of entries) {
        const entryKey = declarationKey(entry.declarationModule, entry.declarationName);
        if (entry.relation === "field") {
          expect(entryKey).not.toBe(key);
        }
      }
    }
  });

  it("records references across modules", () => {
    // C_Hostage has fields of type entity2/GameTime_t
    const refs = ctx.references.get(declarationKey("entity2", "GameTime_t"));
    expect(refs).toBeDefined();
    const match = refs!.find(
      (r) => r.declarationName === "C_Hostage" && r.declarationModule === "client",
    );
    expect(match).toBeDefined();
  });
});

describe("cross-module lookup", () => {
  it("maps C_ client classes to server counterparts bidirectionally", () => {
    // C_PathParticleRope (client) <-> CPathParticleRope (server)
    const clientDecl = ctx.declarations.get("client")?.get("C_PathParticleRope");
    const serverDecl = ctx.declarations.get("server")?.get("CPathParticleRope");
    expect(clientDecl).toBeDefined();
    expect(serverDecl).toBeDefined();

    expect(ctx.crossModuleLookup.get(declarationKey("client", "C_PathParticleRope"))).toBe(
      serverDecl,
    );
    expect(ctx.crossModuleLookup.get(declarationKey("server", "CPathParticleRope"))).toBe(
      clientDecl,
    );
  });

  it("maps multiple C_ pairs", () => {
    // C_SoundAreaEntitySphere <-> CSoundAreaEntitySphere
    expect(ctx.crossModuleLookup.get(declarationKey("client", "C_SoundAreaEntitySphere"))).toBe(
      ctx.declarations.get("server")?.get("CSoundAreaEntitySphere"),
    );
    expect(ctx.crossModuleLookup.get(declarationKey("server", "CSoundAreaEntitySphere"))).toBe(
      ctx.declarations.get("client")?.get("C_SoundAreaEntitySphere"),
    );

    // C_SoundEventSphereEntity <-> CSoundEventSphereEntity
    expect(ctx.crossModuleLookup.get(declarationKey("client", "C_SoundEventSphereEntity"))).toBe(
      ctx.declarations.get("server")?.get("CSoundEventSphereEntity"),
    );
    expect(ctx.crossModuleLookup.get(declarationKey("server", "CSoundEventSphereEntity"))).toBe(
      ctx.declarations.get("client")?.get("C_SoundEventSphereEntity"),
    );
  });

  it("maps same-named classes across modules", () => {
    // CFuncWater exists in both client and server with the same name
    const clientDecl = ctx.declarations.get("client")?.get("CFuncWater");
    const serverDecl = ctx.declarations.get("server")?.get("CFuncWater");
    expect(clientDecl).toBeDefined();
    expect(serverDecl).toBeDefined();

    expect(ctx.crossModuleLookup.get(declarationKey("client", "CFuncWater"))).toBe(serverDecl);
    expect(ctx.crossModuleLookup.get(declarationKey("server", "CFuncWater"))).toBe(clientDecl);
  });

  it("maps same-named classes without C prefix (sky3dparams_t)", () => {
    const clientDecl = ctx.declarations.get("client")?.get("sky3dparams_t");
    const serverDecl = ctx.declarations.get("server")?.get("sky3dparams_t");
    expect(clientDecl).toBeDefined();
    expect(serverDecl).toBeDefined();

    expect(ctx.crossModuleLookup.get(declarationKey("client", "sky3dparams_t"))).toBe(serverDecl);
    expect(ctx.crossModuleLookup.get(declarationKey("server", "sky3dparams_t"))).toBe(clientDecl);
  });

  it("does not map client-only classes", () => {
    // C_Fish is only in client, no server counterpart CFish
    expect(ctx.declarations.get("server")?.has("CFish")).toBeFalsy();
    expect(ctx.crossModuleLookup.get(declarationKey("client", "C_Fish"))).toBeUndefined();
  });

  it("does not map server-only classes", () => {
    // CPointHurt is only in server, no client counterpart C_PointHurt
    expect(ctx.declarations.get("client")?.has("C_PointHurt")).toBeFalsy();
    expect(ctx.crossModuleLookup.get(declarationKey("server", "CPointHurt"))).toBeUndefined();
  });

  it("does not map classes from non-client/server modules", () => {
    expect(ctx.crossModuleLookup.get(declarationKey("navlib", "CNavVolumeSphere"))).toBeUndefined();
    expect(
      ctx.crossModuleLookup.get(declarationKey("particles", "C_OP_RenderTreeShake")),
    ).toBeUndefined();
  });
});

describe("context structure", () => {
  it("stores declarations grouped by module", () => {
    expect(ctx.declarations.has("client")).toBe(true);
    expect(ctx.declarations.has("server")).toBe(true);
    expect(ctx.declarations.get("client")?.has("C_BaseEntity")).toBe(true);
  });

  it("stores metadata from parsed schemas", () => {
    expect(ctx.metadata).toEqual({ revision: 0, versionDate: "test", versionTime: "test" });
  });

  it("stores error as null when no error", () => {
    expect(ctx.error).toBeNull();
  });

  it("stores error message when provided", () => {
    const loaded = new Map<GameId, ParsedSchemas>();
    loaded.set("cs2", parsedSchemas);
    const errors = new Map<GameId, string>();
    errors.set("cs2", "something went wrong");
    buildAllGameContexts(loaded, errors);

    const ctx = getGameContext("cs2");
    expect(ctx.error).toBe("something went wrong");
  });

  it("creates contexts for games without loaded data", () => {
    const loaded = new Map<GameId, ParsedSchemas>();
    loaded.set("cs2", parsedSchemas);
    buildAllGameContexts(loaded, new Map());

    const dota = getGameContext("dota2");
    expect(dota).toBeDefined();
    expect(dota.declarations.size).toBe(0);
    expect(dota.crossModuleLookup.size).toBe(0);
  });
});

describe("otherGamesLookup", () => {
  it("maps declarations from other games by name", () => {
    const loaded = new Map<GameId, ParsedSchemas>();
    loaded.set("cs2", parsedSchemas);
    loaded.set("dota2", parsedSchemas);
    buildAllGameContexts(loaded, new Map());

    const cs2 = getGameContext("cs2");
    const dota2Lookup = cs2.otherGamesLookup.get("dota2");
    expect(dota2Lookup).toBeDefined();
    expect(dota2Lookup!.has("C_BaseEntity")).toBe(true);
  });

  it("does not include same game in lookup", () => {
    expect(ctx.otherGamesLookup.has("cs2")).toBe(false);
  });
});
