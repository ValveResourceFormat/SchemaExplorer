import { readFile } from "node:fs/promises";
import type { Config } from "@react-router/dev/config";
import { GAME_LIST } from "./src/games-list.ts";
import { parseSchemas, type SchemasJson } from "./src/data/schemas.ts";

const isDev = process.argv.includes("dev");

export default {
  ssr: false,
  appDirectory: "src",
  basename: "/SchemaExplorer/",
  prerender: isDev
    ? false
    : {
        concurrency: 8,
        async paths({ getStaticPaths }) {
          const paths = [...getStaticPaths(), "/"];

          for (const game of GAME_LIST) {
            paths.push(`/${game.id}`);

            const data: SchemasJson = JSON.parse(
              await readFile(`schemas/${game.id}.json`, "utf-8"),
            );
            const { declarations, consoleItems, entities } = parseSchemas(data);

            if (consoleItems.length > 0) paths.push(`/${game.id}/convars`);

            const limit = process.env.PRERENDER_ALL ? 0 : 10;
            let count = 0;

            for (const [mod, moduleMap] of declarations) {
              paths.push(`/${game.id}/${mod}`);
              if (!limit || count < limit) {
                for (const name of moduleMap.keys()) {
                  if (process.platform === "win32" && name.includes("::")) continue;
                  paths.push(`/${game.id}/${mod}/${name}`);
                  if (limit && ++count >= limit) break;
                }
              }
            }

            // Design name links like /cs2/logic_relay redirect in the browser, a page of their own
            // gives link previews the entity's title and description
            const designNames = new Set<string>();
            for (const entity of entities) {
              const { designName } = entity;
              if (!designName || declarations.has(designName)) continue;
              if (!declarations.get(entity.classModule)?.has(entity.class)) continue;
              if (process.platform === "win32" && /[<>:"|?*]/.test(designName)) continue;
              designNames.add(designName);
            }
            for (const designName of [...designNames].slice(0, limit || undefined)) {
              paths.push(`/${game.id}/${designName}`);
            }

            if (limit) {
              console.log(
                `Prerender limited to ${limit} pages per game, set PRERENDER_ALL=1 to generate all pages`,
              );
            }
          }

          return paths;
        },
      },
} satisfies Config;
