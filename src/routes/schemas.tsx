import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, href } from "react-router";
import type { MetaFunction } from "react-router";
import { Declaration } from "../data/types";
import { isGameId, GameId, GAME_LIST, getGameDef, SITE_ORIGIN } from "../games-list";
import { loadGameSchemas, type SchemaMetadata } from "../data/loader";
import { preloadedData } from "../data/preload";
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

export const meta: MetaFunction = ({ params, location }) => {
  const gameName = params.game && isGameId(params.game) ? getGameDef(params.game)?.name : null;
  const { module, scope } = params;

  const parts = [scope, module, gameName, "Source 2 Schema Explorer"].filter(Boolean);
  const title = parts.join(" - ");

  let description: string;
  if (scope && gameName) {
    const schema = preloadedData.get(params.game!);
    const decl = schema?.declarations.find((d) => d.module === module && d.name === scope);
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

  const path = location.pathname.replace(/\/$/, "");
  const canonicalUrl = `${SITE_ORIGIN}/SchemaExplorer${path}`;

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
const EMPTY_OTHER_GAME_LIST = new Map<GameId, Declaration[]>();

export default function SchemasPage() {
  const { game, module, scope } = useParams<{ game: string; module: string; scope: string }>();
  const validGame = game && isGameId(game) ? game : null;
  const preloaded = useRef(preloadedData.get(validGame ?? ""));
  const loadedGame = useRef<string | null>(validGame);

  const [declarations, setDeclarations] = useState<Declaration[] | null>(
    () => preloaded.current?.declarations ?? null,
  );
  const [metadata, setMetadata] = useState<SchemaMetadata>(
    () =>
      preloaded.current?.metadata ?? {
        revision: 0,
        versionDate: "",
        versionTime: "",
      },
  );
  const [otherGames, setOtherGames] = useState<Map<GameId, Declaration[]>>(() => {
    if (!validGame) return EMPTY_OTHER_GAME_LIST;
    const map = new Map<GameId, Declaration[]>();
    for (const g of GAME_LIST) {
      if (g.id === validGame) continue;
      const other = preloadedData.get(g.id);
      if (other) map.set(g.id, other.declarations);
    }
    return map.size > 0 ? map : EMPTY_OTHER_GAME_LIST;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validGame) return;
    let stale = false;

    if (preloaded.current) {
      preloaded.current = undefined;
      return;
    }

    // Subsequent navigations — clear and fetch
    loadedGame.current = null;
    setDeclarations(null);
    setMetadata({ revision: 0, versionDate: "", versionTime: "" });
    setOtherGames(EMPTY_OTHER_GAME_LIST);
    setError(null);

    loadGameSchemas(validGame)
      .then((result) => {
        if (stale) return;
        loadedGame.current = validGame;
        setDeclarations(result.declarations);
        setMetadata(result.metadata);

        for (const g of GAME_LIST) {
          if (g.id === validGame) continue;
          loadGameSchemas(g.id)
            .then((result) => {
              if (!stale) setOtherGames((prev) => new Map(prev).set(g.id, result.declarations));
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if (!stale) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      stale = true;
    };
  }, [validGame]);

  const resolvedDeclarations = declarations ?? EMPTY_DECLARATIONS;
  const loading = !declarations && !error;

  const context = useMemo(
    () => ({
      game: validGame ?? "cs2",
      declarations: resolvedDeclarations,
      metadata,
      otherGames,
      loading,
      error,
    }),
    [validGame, resolvedDeclarations, metadata, otherGames, loading, error],
  );

  const navigate = useNavigate();

  // Redirect if module or scope doesn't exist in the loaded data
  useEffect(() => {
    if (!validGame || !declarations || loadedGame.current !== validGame) return;

    const modules = new Set(declarations.map((d) => d.module));
    const validModule = module && modules.has(module);
    const validScope =
      scope && validModule && declarations.some((d) => d.module === module && d.name === scope);

    if (scope && !validScope) {
      navigate(
        href("/:game/:module?/:scope?", {
          game: validGame,
          module: validModule ? module : undefined,
        }),
        { replace: true },
      );
    } else if (module && !validModule) {
      navigate(href("/:game/:module?/:scope?", { game: validGame }), { replace: true });
    }
  }, [validGame, declarations, module, scope, navigate]);

  if (!validGame) {
    return <Navigate to="/cs2" replace />;
  }

  return <DeclarationsPage context={context} />;
}
