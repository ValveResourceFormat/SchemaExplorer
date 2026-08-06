import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, gzip } from "node:zlib";
import { promisify } from "node:util";
import { GAME_LIST } from "../src/games-list.ts";

const gzipAsync = promisify(gzip);
const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");

await Promise.all(
  GAME_LIST.map(async (game) => {
    const json = await readFile(resolve(schemasDir, `${game.id}.json`));
    const compressed = await gzipAsync(json, { level: constants.Z_BEST_COMPRESSION });
    await writeFile(resolve(schemasDir, `${game.id}.json.gz`), compressed);
    console.log(`${game.id}: ${json.length} -> ${compressed.length} bytes`);
  }),
);
