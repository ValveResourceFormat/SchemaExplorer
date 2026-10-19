import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { MetaFunction } from "react-router";
import { isGameId, DEFAULT_GAME, getGameDef, canonicalUrl, pageMeta } from "../games-list";
import {
  sameSchemaPage,
  designNameEntity,
  getGameContext,
  type GameContext,
} from "../data/derived";
import {
  declarationTitle,
  describeDeclaration,
  describeGame,
  describeModule,
  describeRoot,
} from "../utils/schema-meta";
import { moduleLabel } from "../data/modules";
import { schemaPath } from "../components/schema/DeclarationsContext";
import DeclarationsPage from "../components/DeclarationsPage";

const SITE_NAME = "Source 2 Schema Explorer";

/**
 * The entity of a design name link, /cs2/logic_relay or /cs2/server/logic_relay, when the URL
 * isn't a module or declaration itself
 */
function linkedEntity(context: GameContext, module?: string, scope?: string) {
  const validModule = module != null && context.declarations.has(module);
  if (scope ? context.declarations.get(module!)?.has(scope) : validModule) return undefined;
  const designName = scope ?? module;
  if (!designName) return undefined;
  return designNameEntity(context, designName, scope && validModule ? module : undefined);
}

export const meta: MetaFunction = ({ params }) => {
  const game = params.game && isGameId(params.game) ? params.game : null;
  if (!game) {
    return pageMeta(SITE_NAME, describeRoot(), canonicalUrl());
  }

  const gameName = getGameDef(game)!.name;
  const context = getGameContext(game);
  // The redirect to the class page only happens in the browser, link previews need its meta
  const entity = linkedEntity(context, params.module, params.scope);
  const module = entity ? entity.classModule : params.module;
  const scope = entity ? entity.class : params.scope;
  const url = canonicalUrl(game, module, scope);

  if (module && scope) {
    const decl = context.declarations.get(module)?.get(scope);
    if (decl) {
      const title = declarationTitle(decl, game, context, entity?.designName);
      return pageMeta(title, describeDeclaration(decl, game, context), url);
    }
    const title = [scope, module, gameName, SITE_NAME].join(" - ");
    const description = `View the ${scope} schema definition in the ${module} module for ${gameName}.`;
    return pageMeta(title, description, url);
  }

  if (module) {
    const title = [moduleLabel(module), gameName, SITE_NAME].join(" - ");
    return pageMeta(title, describeModule(game, module, context), url);
  }

  return pageMeta(`${gameName} - ${SITE_NAME}`, describeGame(game, context), url);
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
    const entity = validGame ? linkedEntity(context, module, scope) : undefined;
    if (entity) {
      navigate(
        { pathname: schemaPath(game, entity.classModule, entity.class), hash: location.hash },
        { replace: true },
      );
      return;
    }

    // The scope in another module of this game, like switching games does
    const page = sameSchemaPage(declarations, module, scope);
    if (page.scope) {
      navigate(schemaPath(game, page.module, page.scope), { replace: true });
      return;
    }

    // A shared link is for the scope, wherever it is: another game that has it
    if (scope) {
      for (const [gameId, lookup] of context.otherGamesLookup) {
        const match = lookup.get(scope);
        if (match) {
          navigate(schemaPath(gameId, match.module, match.name), { replace: true });
          return;
        }
      }
    }

    navigate(schemaPath(game, page.module), { replace: true });
  }, [gameParam, game, declarations, module, scope, navigate, context, location.hash]);

  return <DeclarationsPage context={context} />;
}
