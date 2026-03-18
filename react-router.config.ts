import type { Config } from "@react-router/dev/config";
import { GAME_LIST } from "./src/games-list.ts";
import { parseSchemas, type SchemasJson } from "./src/data/schemas.ts";
import { readGzippedJson } from "./scripts/lib/read-gzipped-json.ts";

export default {
  ssr: false,
  appDirectory: "src",
  basename: "/SchemaExplorer/",
  prerender: {
    unstable_concurrency: 8,
    async paths({ getStaticPaths }) {
      const paths = [...getStaticPaths(), "/"];

      for (const game of GAME_LIST) {
        paths.push(`/${game.id}`);

        const data = await readGzippedJson<SchemasJson>(`schemas/${game.id}.json.gz`);
        const { declarations } = parseSchemas(data);

        const names = new Map<string, Set<string>>();
        for (const d of declarations) {
          if (!names.has(d.module)) names.set(d.module, new Set());
          names.get(d.module)!.add(d.name);
        }

        const limit = process.env.PRERENDER_ALL ? 0 : 10;
        let count = 0;

        for (const mod of names.keys()) {
          paths.push(`/${game.id}/${mod}`);
          if (!limit || count < limit) {
            for (const name of names.get(mod) ?? []) {
              if (process.platform === "win32" && name.includes("::")) continue;
              paths.push(`/${game.id}/${mod}/${name}`);
              if (limit && ++count >= limit) break;
            }
          }
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
