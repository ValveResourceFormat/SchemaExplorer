import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { styled } from "@linaria/react";
import { AppContext } from "./components/AppContext";
import { Declaration } from "./components/Docs/api";
import { isGameId, GameId, GAMES, getGame } from "./games";
import { loadGameSchemas, type SchemaMetadata } from "./components/data";
import DeclarationsPage from "./components/DeclarationsPage";
import "./global.css";

const AppWrapper = styled.div`
  display: flex;
  flex-flow: column;
  min-height: 100dvh;
  max-width: 1440px;
  margin: 0 auto;
  background-color: var(--background);
  color: var(--text);
`;

const EMPTY_DECLARATIONS: Declaration[] = [];
const EMPTY_OTHER_GAMES = new Map<GameId, Declaration[]>();

function SchemasPage() {
  const { game, module, scope } = useParams<{ game: string; module: string; scope: string }>();
  const [declarations, setDeclarations] = useState<Declaration[] | null>(null);
  const [metadata, setMetadata] = useState<SchemaMetadata>({
    revision: 0,
    versionDate: "",
    versionTime: "",
  });
  const [otherGames, setOtherGames] = useState<Map<GameId, Declaration[]>>(EMPTY_OTHER_GAMES);
  const [error, setError] = useState<string | null>(null);
  const validGame = game && isGameId(game) ? game : null;

  useEffect(() => {
    if (!validGame) return;
    let stale = false;

    setDeclarations(null);
    setMetadata({ revision: 0, versionDate: "", versionTime: "" });
    setOtherGames(EMPTY_OTHER_GAMES);
    setError(null);

    loadGameSchemas(validGame)
      .then((result) => {
        if (stale) return;
        setDeclarations(result.declarations);
        setMetadata(result.metadata);

        // Load other games in background for cross-game refs
        for (const g of GAMES) {
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

  useEffect(() => {
    const gameName = validGame ? getGame(validGame)?.name : null;
    const parts = [scope, module, gameName, "Source 2 Schema Explorer"].filter(Boolean);
    document.title = parts.join(" - ");

    const desc = scope
      ? `${scope} in ${module} module for ${gameName} Source 2 schemas.`
      : module
        ? `All classes and enums in the ${module} module for ${gameName} Source 2 schemas.`
        : gameName
          ? `Browse Source 2 engine schemas for ${gameName}.`
          : undefined;
    if (desc) {
      document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
    }
  }, [validGame, module, scope]);

  const resolvedDeclarations = declarations ?? EMPTY_DECLARATIONS;
  const loading = !declarations && !error;

  const context = useMemo(
    () => ({
      game: validGame ?? "cs2",
      root: `/${validGame ?? "cs2"}`,
      declarations: resolvedDeclarations,
      metadata,
      otherGames,
      loading,
      error,
    }),
    [validGame, resolvedDeclarations, metadata, otherGames, loading, error],
  );

  if (!validGame) {
    return <Navigate to="/cs2" replace />;
  }

  return <DeclarationsPage context={context} />;
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function App() {
  const [darkmode, setDarkmode] = React.useState(() => {
    const themeName = window.localStorage.getItem("theme");
    return (
      themeName === "dark" ||
      (themeName !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  const appContext = useMemo(
    () => ({
      darkmode,
      setDarkmode(dark: boolean) {
        window.localStorage.setItem("theme", dark ? "dark" : "light");
        applyTheme(dark);
        setDarkmode(dark);
      },
    }),
    [darkmode],
  );

  return (
    <AppContext.Provider value={appContext}>
      <AppWrapper>
        <HashRouter>
          <Routes>
            <Route path="/:game/:module?/:scope?" element={<SchemasPage />} />
            <Route path="*" element={<Navigate to="/cs2" replace />} />
          </Routes>
        </HashRouter>
      </AppWrapper>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
