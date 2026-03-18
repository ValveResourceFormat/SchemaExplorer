import { readdir, rename, rm, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * 1. Flatten index.html files to {dir}.html
 * 2. Move SchemaExplorer/* up into build/client/ (to avoid double nesting on GH Pages)
 */
async function flatten(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const folderPath = join(dir, entry.name);

    // Recurse first (depth-first)
    await flatten(folderPath);

    try {
      await rename(join(folderPath, "index.html"), join(dir, `${entry.name}.html`));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    // Remove directory if now empty
    if ((await readdir(folderPath)).length === 0) {
      await rm(folderPath, { recursive: true });
    }
  }
}

const clientDir = join(process.cwd(), "build", "client");
const baseDir = join(clientDir, "SchemaExplorer");

try {
  await stat(baseDir);
} catch (e: any) {
  if (e.code === "ENOENT") process.exit(0);
  throw e;
}

// Flatten index.html → .html inside SchemaExplorer/
await flatten(baseDir);

// Move SchemaExplorer/* up into build/client/
for (const entry of await readdir(baseDir, { withFileTypes: true })) {
  const dest = join(clientDir, entry.name);
  await rm(dest, { recursive: true, force: true });
  await rename(join(baseDir, entry.name), dest);
}
await rm(baseDir, { recursive: true });

// Rename SPA fallback to 404.html for GitHub Pages and add noindex
const spaFallback = join(clientDir, "__spa-fallback.html");
try {
  const html = (await readFile(spaFallback, "utf-8")).replace(
    "<head>",
    '<head>\n<meta name="robots" content="noindex">',
  );
  await writeFile(join(clientDir, "404.html"), html);
  await rm(spaFallback);
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
}

console.log("Flattened prerendered routes and moved to build/client/.");
