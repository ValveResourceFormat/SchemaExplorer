import { preloadedData, preloadErrors } from "./data/preload";
import { GAME_LIST } from "./games-list";

async function hydrate() {
  const { loadGameSchemas } = await import("./data/loader");
  await Promise.all(
    GAME_LIST.map(async (g) => {
      try {
        const data = await loadGameSchemas(g.id);
        preloadedData.set(g.id, data);
      } catch (e) {
        preloadErrors.set(g.id, e instanceof Error ? e.message : String(e));
      }
    }),
  );

  const { hydrateRoot } = await import("react-dom/client");
  const { HydratedRouter } = await import("react-router/dom");
  hydrateRoot(document, <HydratedRouter />);
}

hydrate();
