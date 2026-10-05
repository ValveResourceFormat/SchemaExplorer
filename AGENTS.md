# AGENTS.md

Notes for working on SchemaExplorer. What it is and how to run it are in the [README](README.md).

SchemaExplorer shows the `schemas.json` that [DumpSource2](https://github.com/ValveResourceFormat/DumpSource2) writes for each game: schema classes and enums, convars and commands, entity classes, and the network data. It's a static site: React Router prerenders every page, and the client fetches the gzipped JSON.

## Data

- `schemas/<game>.json` for CS2, Dota 2, and Deadlock are committed by a GitHub Actions bot (`Update <game> schema (revision N)`) after [GameTracking](https://github.com/SteamTracking/GameTracking) runs DumpSource2 on a game update. Don't hand-edit them; a change to the data is a change to DumpSource2.
- `schemas/hlvr.json` (Half-Life: Alyx), `schemas/steamvr.json` (SteamVR Home) and `schemas/steampal.json` (Aperture Desk Job) are one-off dumps from old engines. They have no GameTracking repo or class and type sizes, but they do list static fields and have Source 1 style convar flags. Show what they have as it is, and don't map old-style data onto the new keys.
- Games marked `devOnly` in `src/games-list.ts` (SteamVR Home and Aperture Desk Job) only show up in `npm run dev`. `GAME_LIST` leaves them out everywhere else, and the schema glob in `src/data/loader.ts` names them so the build doesn't emit their `.json.gz`. Add a new dev only game to both.
- Only the latest dump format is supported. When DumpSource2 changes its output, update the types and parsing, with no fallback for older dumps.
- New keys from DumpSource2 arrive with a description of what they mean. When adding them:
  - update `src/data/types.ts`;
  - update the pseudo-schema in `scripts/generate-llms.ts`, which becomes `llms.txt` and has to match the types;
  - update the fixtures in `src/utils/test-schemas.json`;
  - add tests.
- Every game is loaded together, because classes link across games.

## Layout

- `src/data/` turns the JSON into what the pages show:
  - `schemas.ts` parses;
  - `derived.ts` holds what is computed across classes, such as inheritance, entity settings, and keys to fields;
  - `network.ts` works out which fields a class sends;
  - `compare.ts` compares across games;
  - `intrinsics.ts` holds the layout of engine types that have no schema. Keep its entries even when no dump uses them.
- `src/utils/filtering.tsx` parses search and filters (`tag:value` terms). The search text lives in the URL hash (`#search=`), not the query string.
- `src/components/schema/` has the class, enum, entity, and network views. `src/components/console/` has the convars and commands page.
- `scripts/` run at build time: they compress the schemas, flatten the prerendered pages, and write `llms.txt`, the sitemap, and last-modified dates.

## Modelling the engine

Some views model what the engine does with the data, instead of only listing it:
- which fields a class sends (`network.ts`);
- the flags and spawn order an entity class inherits, and its aliases (`derived.ts`);
- which component class an entity gets (`derived.ts`);
- which keyvalues apply to an entity (`derived.ts`).

- These follow the game's binaries: `networksystem.dll`, `engine2.dll`, and the game's `server.dll` and `client.dll`. Find the code through the engine's own strings (log messages, asserts, convar names), never by address.
- When the code depends on how the engine behaves, say so in a comment in plain terms: what the engine does, not where it was found. Mark anything without evidence in the binary as inferred.
- Engine research notes stay out of the repo, because they go out of date with game updates.
- A dump value that looks wrong is often the engine's real layout. Check the binary before calling it a dumper bug.

## UI

- Reduce how much readers have to take in, but never hide real schema data. Show unknown flags and values as they are, like `flag_33`, instead of filtering them out.
- Inherited fields are shown in declaration order, with bases first. An inherited member is only linked in the base class that declares it, so the same thing isn't linked twice.
- Styles are Linaria (`styled`, `css`). Tooltips go through the one shared tooltip host. Long lists, like convars, are virtualized.
- Check changes in the browser, at phone width too. `npm run dev` serves it at `/SchemaExplorer/`.

## Testing

- `npm test` runs tsc, oxlint, vitest, and `oxfmt --check`, and CI runs the same. Format with `npm run fmt`.
- Don't put shell globs in `package.json` scripts. On Windows npm runs scripts through cmd, which doesn't expand them, so `oxfmt *.ts` silently skips `.tsx` files. List files and folders by name instead.
- `npm run build` prerenders 10 pages per game. Set `PRERENDER_ALL=1` for all of them, which is what CI deploys.
- `@wyw-in-js/vite` is pinned to 2.4.4. 2.5 fails builds now and then with `UnknownDependencyGraphResetError` or `AbortError: superseded` ([wyw-in-js#422](https://github.com/wyw-in-js/wyw-in-js/issues/422)). Before upgrading, run the build a few dozen times, since it only fails some of the time.
- After a rebase or fixups, run `npm test` on the newest commit. Test an earlier commit only when a change could plausibly break it.

## Code and commits

- Match the surrounding code. Comments are evergreen: they say what the code does or why, never the history of a change.
- Use the Oxford comma in prose: comments, docs, and commit messages.
- Commit messages are a single plain line saying what changed, with no body and no conventional-commit prefix. Commit per concern.
