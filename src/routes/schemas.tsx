import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { MetaFunction } from "react-router";
import type { Declaration, EntityClass } from "../data/types";
import {
  isGameId,
  DEFAULT_GAME,
  GAME_LIST,
  getGameDef,
  canonicalUrl,
  pageMeta,
} from "../games-list";
import { INTRINSIC_MODULE } from "../data/intrinsics";
import { buildInheritedGroups, type Entry } from "../utils/entity-format";
import { plural } from "../utils/format";
import {
  declarationKey,
  entityChain,
  findDeclarationByName,
  findEntityByDesignName,
  getGameContext,
  type EntityLookups,
  type GameContext,
} from "../data/derived";
import { schemaPath } from "../components/schema/DeclarationsContext";
import DeclarationsPage from "../components/DeclarationsPage";

const MAX_DESC_LENGTH = 200;

function truncateList(prefix: string, items: string[], suffix: string): string {
  let desc = prefix;
  for (let i = 0; i < items.length; i++) {
    const sep = i === 0 ? "" : ", ";
    const next = desc + sep + items[i];
    if (next.length + suffix.length > MAX_DESC_LENGTH) {
      const remaining = items.length - i;
      desc += i === 0 ? `${remaining} more${suffix}` : `, and ${remaining} more${suffix}`;
      return desc;
    }
    desc = next;
  }
  return desc + suffix;
}

function designNamesFor(context: GameContext, module: string, scope: string) {
  const decl = context.declarations.get(module)?.get(scope);
  return decl && context.designNamesByDeclaration.get(decl);
}

function describeEntity(d: Declaration, gameName: string, lookups: EntityLookups): string | null {
  if (d.kind !== "class") return null;
  const entities = lookups.entityByClass.get(declarationKey(d.module, d.name));
  // CEntityInstance (entity2) is the root of both client and server, prefer server
  const entity =
    entities?.find((e) => e.module === d.module) ??
    entities?.find((e) => e.module === "server") ??
    entities?.[0];
  if (!entity?.designName) return null;
  const chain = entityChain(lookups, entity);
  // Own and inherited, as listed on the page
  const count = (pick: (e: EntityClass) => Entry[], word: string) => {
    const n =
      pick(entity).length +
      buildInheritedGroups(entity, chain, pick).reduce((sum, g) => sum + g.count, 0);
    return plural(n, word);
  };
  let desc = `${d.name} is the ${entity.designName} entity in ${entity.module}.dll (${gameName}) with ${count((e) => e.keys, "keyvalue")}, ${count((e) => e.inputs, "input")} and ${count((e) => e.outputs, "output")}`;
  if (entity.baseClass) desc += `; extends ${entity.baseClass}`;
  return desc + ".";
}

function describeDeclaration(d: Declaration, gameName: string): string {
  if (d.module === INTRINSIC_MODULE) {
    if (d.kind === "class" && d.fields.length > 0) {
      return truncateList(
        `${d.name} is an intrinsic Source 2 engine type with ${plural(d.fields.length, "field")}: `,
        d.fields.map((f) => f.name),
        ".",
      );
    }
    return `${d.name} is an intrinsic Source 2 engine type.`;
  }
  const location = `${d.module}.dll (${gameName})`;
  if (d.kind === "class") {
    let prefix = `${d.name} is a class in ${location}`;
    if (d.parents.length > 0) {
      prefix += ` extending ${d.parents.map((p) => p.name).join(", ")}`;
    }
    if (d.fields.length > 0) {
      prefix += ` with ${plural(d.fields.length, "field")}: `;
      return truncateList(
        prefix,
        d.fields.map((f) => f.name),
        ".",
      );
    }
    return `${prefix}.`;
  }

  let prefix = `${d.name} is an enum`;
  if (d.alignment) prefix += ` (${d.alignment})`;
  prefix += ` in ${location} with ${plural(d.members.length, "value")}`;
  if (d.members.length > 0) {
    prefix += `: `;
    return truncateList(
      prefix,
      d.members.map((m) => m.name),
      ".",
    );
  }
  return `${prefix}.`;
}

export const meta: MetaFunction = ({ params }) => {
  const gameName = params.game && isGameId(params.game) ? getGameDef(params.game)?.name : null;
  const { module, scope } = params;

  const context = params.game && isGameId(params.game) ? getGameContext(params.game) : null;
  const designNames = (context && module && scope && designNamesFor(context, module, scope)) || [];
  const scopeTitle =
    scope && designNames.length > 0 ? `${scope} (${designNames.join(", ")})` : scope;
  const parts = [scopeTitle, module, gameName, "Source 2 Schema Explorer"].filter(Boolean);
  const title = parts.join(" - ");

  let description: string;
  if (scope && gameName && context) {
    const decl = context.declarations.get(module!)?.get(scope!);
    description = decl
      ? (describeEntity(decl, gameName, context) ?? describeDeclaration(decl, gameName))
      : `View the ${scope} schema definition in the ${module} module for ${gameName}.`;
  } else if (module && gameName) {
    description = `Browse all classes and enums in the ${module} module for ${gameName} Source 2 engine schemas.`;
  } else if (gameName) {
    description = `Explore all Source 2 engine schemas for ${gameName} — browse classes, enums, fields, and types across every module.`;
  } else {
    const gameList = new Intl.ListFormat("en", { type: "conjunction" }).format(
      GAME_LIST.map((g) => g.name),
    );
    description = `Browse and explore Valve Source 2 engine schemas, classes, enums, and types for ${gameList}.`;
  }

  return pageMeta(title, description, canonicalUrl(params.game, params.module, params.scope));
};

export default function SchemasPage() {
  const {
    game: gameParam,
    module,
    scope,
  } = useParams<{
    game: string;
    module: string;
    scope: string;
  }>();
  const game = gameParam && isGameId(gameParam) ? gameParam : DEFAULT_GAME;
  const context = getGameContext(game);
  const { declarations } = context;

  const navigate = useNavigate();
  const location = useLocation();

  // Redirect invalid URLs: try to find the scope in any game, otherwise strip invalid segments
  useEffect(() => {
    const validGame = gameParam && isGameId(gameParam);
    const validModule = validGame && module && declarations.has(module);
    const validScope = validModule && scope && declarations.get(module)!.has(scope);

    if (validScope || (validModule && !scope) || (!module && (!gameParam || validGame))) return;

    // Entity design names: /cs2/server/trigger_multiple and /cs2/trigger_multiple
    const designName = scope ?? (validGame && !validModule ? module : undefined);
    if (designName) {
      const entity = findEntityByDesignName(
        context,
        designName,
        scope && validModule ? module : undefined,
      );
      if (entity && context.declarations.get(entity.classModule)?.has(entity.class)) {
        navigate(
          { pathname: schemaPath(game, entity.classModule, entity.class), hash: location.hash },
          { replace: true },
        );
        return;
      }
    }

    if (scope) {
      // Check if the scope exists in another module of the current game
      const other = findDeclarationByName(declarations, scope);
      if (other) {
        navigate(schemaPath(game, other.module, scope), { replace: true });
        return;
      }

      // Check if the scope exists in another game
      for (const [gameId, lookup] of context.otherGamesLookup) {
        const match = lookup.get(scope);
        if (match) {
          navigate(schemaPath(gameId, match.module, match.name), { replace: true });
          return;
        }
      }
    }

    navigate(schemaPath(validGame ? game : DEFAULT_GAME, validModule ? module : undefined), {
      replace: true,
    });
  }, [gameParam, game, declarations, module, scope, navigate, context, location.hash]);

  return <DeclarationsPage context={context} />;
}
