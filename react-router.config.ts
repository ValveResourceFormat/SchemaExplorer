import type { Config } from "@react-router/dev/config";
import { GAME_LIST } from "./src/games-list.ts";

export default {
  ssr: false,
  appDirectory: "src",
  basename: "/SchemaExplorer/",
  prerender: {
    unstable_concurrency: 8,
    async paths({ getStaticPaths }) {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const { gunzipSync } = await import("node:zlib");

      const paths = [...getStaticPaths()];

      for (const game of GAME_LIST) {
        paths.push(`/${game.id}`);

        const buf = readFileSync(resolve("schemas", `${game.id}.json.gz`));
        const data = JSON.parse(gunzipSync(buf).toString("utf-8"));

        const names = new Map<string, Set<string>>();
        for (const cls of data.classes ?? []) {
          if (!names.has(cls.module)) names.set(cls.module, new Set());
          names.get(cls.module)!.add(cls.name);
        }
        for (const enm of data.enums ?? []) {
          if (!names.has(enm.module)) names.set(enm.module, new Set());
          names.get(enm.module)!.add(enm.name);
        }

        const limit = process.argv.includes("--prerender-all") ? 0 : 10;
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
      }

      return paths;
    },
  },
} satisfies Config;
