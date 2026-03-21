import { buildAllGameContexts } from "./data/derived";
import { GAME_LIST, type GameId } from "./games-list";

async function hydrate() {
  const { loadGameSchemas } = await import("./data/loader");
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

  const { hydrateRoot } = await import("react-dom/client");
  const { HydratedRouter } = await import("react-router/dom");
  hydrateRoot(document, <HydratedRouter />);
}

hydrate();
