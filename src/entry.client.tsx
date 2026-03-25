import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { buildAllGameContexts } from "./data/derived";
import { loadGameSchemas } from "./data/loader";
import { GAME_LIST, type GameId } from "./games-list";

async function hydrate() {
  const loaded = new Map<GameId, Awaited<ReturnType<typeof loadGameSchemas>>>();
  const errors = new Map<GameId, string>();
  await Promise.all(
    GAME_LIST.map(async (g) => {
      try {
        loaded.set(g.id, await loadGameSchemas(g.id));
      } catch (e) {
        errors.set(g.id, e instanceof Error ? e.message : String(e));
      }
    }),
  );
  buildAllGameContexts(loaded, errors);

  hydrateRoot(document, <HydratedRouter />);
}

hydrate();
