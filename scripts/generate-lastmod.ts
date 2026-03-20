import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { GAME_LIST } from "../src/games-list.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");
const DUMP_PREFIX = "DumpSource2/schemas/";

function runGit(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "ignore", "inherit"] });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`git exited ${code}`))));
  });
}

function extractLastModified(repoDir: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["log", "--format=COMMIT %aI", "--name-only", "--", DUMP_PREFIX], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "inherit"],
    });

    let currentDate = "";
    let exitCode: number | null = null;
    const rl = createInterface({ input: proc.stdout });

    rl.on("line", (line) => {
      if (line.startsWith("COMMIT ")) {
        currentDate = line.slice(7);
      } else if (line.length > 0 && line.endsWith(".h")) {
        const key = line.slice(DUMP_PREFIX.length, -2);
        if (!(key in map)) map[key] = currentDate;
      }
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      exitCode = code;
    });
    rl.on("close", () => {
      if (exitCode !== 0) reject(new Error(`git log exited ${exitCode}`));
      else resolve(map);
    });
  });
}

async function processGame(game: (typeof GAME_LIST)[number]): Promise<void> {
  const repoUrl = `https://github.com/${game.repo}.git`;
  const repoDir = resolve(tmpdir(), `lastmod-${game.id}-${Date.now()}`);

  try {
    console.log(`${game.id}: cloning ${game.repo}...`);
    await runGit(["clone", "--filter=blob:none", "--bare", "--single-branch", repoUrl, repoDir]);

    console.log(`${game.id}: extracting last-modified dates...`);
    const map = await extractLastModified(repoDir);
    const count = Object.keys(map).length;

    const outPath = resolve(schemasDir, `${game.id}-lastmod.json`);
    await writeFile(outPath, JSON.stringify(map, null, "\t") + "\n");
    console.log(`${game.id}: wrote ${count} entries to ${game.id}-lastmod.json`);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
}

await mkdir(schemasDir, { recursive: true });
await Promise.all(GAME_LIST.map(processGame));
