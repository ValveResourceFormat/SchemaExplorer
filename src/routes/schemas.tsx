import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import type { MetaFunction } from "react-router";
import { Declaration } from "../data/types";
import { isGameId, DEFAULT_GAME, GAME_LIST, getGameDef, SITE_ORIGIN } from "../games-list";
import { preloadedData, preloadErrors } from "../data/preload";
import { intrinsicDeclarations, INTRINSIC_MODULE } from "../data/intrinsics";
import { getDerivedGameData } from "../data/derived";
import type { DeclarationsContextType } from "../components/schema/DeclarationsContext";
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

function describeDeclaration(d: Declaration, gameName: string): string {
  if (d.module === INTRINSIC_MODULE) {
    if (d.kind === "class" && d.fields.length > 0) {
      return truncateList(
        `${d.name} is an intrinsic Source 2 engine type with ${d.fields.length} field${d.fields.length !== 1 ? "s" : ""}: `,
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
      prefix += ` with ${d.fields.length} field${d.fields.length !== 1 ? "s" : ""}: `;
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
  prefix += ` in ${location} with ${d.members.length} value${d.members.length !== 1 ? "s" : ""}`;
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

  const parts = [scope, module, gameName, "Source 2 Schema Explorer"].filter(Boolean);
  const title = parts.join(" - ");

  let description: string;
  if (scope && gameName) {
    const schema = preloadedData.get(params.game!);
    const decl =
      schema?.declarations.find((d) => d.module === module && d.name === scope) ??
      intrinsicDeclarations.find((d) => d.module === module && d.name === scope);
    description = decl
      ? describeDeclaration(decl, gameName)
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

  const canonicalPath = [params.game, params.module, params.scope].filter(Boolean).join("/");
  const canonicalUrl = `${SITE_ORIGIN}/SchemaExplorer/${canonicalPath}`;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonicalUrl },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
  ];
};

const EMPTY_DECLARATIONS: Declaration[] = [];
const EMPTY_METADATA = { revision: 0, versionDate: "", versionTime: "" };

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
  const schema = preloadedData.get(game);
  const declarations = useMemo(
    () => [...(schema?.declarations ?? EMPTY_DECLARATIONS), ...intrinsicDeclarations],
    [schema],
  );
  const metadata = schema?.metadata ?? EMPTY_METADATA;
  const error = preloadErrors.get(game) ?? null;

  const context: DeclarationsContextType = useMemo(() => {
    const derived = getDerivedGameData(game);
    return {
      game,
      declarations,
      metadata,
      classesByKey: derived?.classesByKey ?? new Map(),
      references: derived?.references ?? new Map(),
      otherGamesLookup: derived?.otherGamesLookup ?? new Map(),
      crossModuleLookup: derived?.crossModuleLookup ?? new Map(),
      error,
    };
  }, [game, declarations, metadata, error]);

  const navigate = useNavigate();

  // Redirect invalid URLs: try to find the scope in any game, otherwise strip invalid segments
  useEffect(() => {
    const validGame = gameParam && isGameId(gameParam);
    const validModule = validGame && module && declarations.some((d) => d.module === module);
    const validScope =
      validModule && scope && declarations.some((d) => d.module === module && d.name === scope);

    if (validScope || (validModule && !scope) || (!module && (!gameParam || validGame))) return;

    if (scope) {
      // Check if the scope exists in another module of the current game
      const sameGameMatch = declarations.find((d) => d.name === scope);
      if (sameGameMatch) {
        navigate(schemaPath(game, sameGameMatch.module, sameGameMatch.name), { replace: true });
        return;
      }

      // Check if the scope exists in another game
      const derived = getDerivedGameData(game);
      for (const [gameId, lookup] of derived.otherGamesLookup) {
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
  }, [gameParam, game, declarations, module, scope, navigate]);

  return <DeclarationsPage context={context} />;
}
