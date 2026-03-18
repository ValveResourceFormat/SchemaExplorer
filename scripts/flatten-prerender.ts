import { readdirSync, existsSync, renameSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 1. Flatten index.html files to {dir}.html
 * 2. Move SchemaExplorer/* up into build/client/ (to avoid double nesting on GH Pages)
 */
function flatten(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const folderPath = join(dir, entry.name);

    // Recurse first (depth-first)
    flatten(folderPath);

    const indexPath = join(folderPath, "index.html");
    if (existsSync(indexPath)) {
      renameSync(indexPath, join(dir, `${entry.name}.html`));
    }

    // Remove directory if now empty
    if (readdirSync(folderPath).length === 0) {
      rmSync(folderPath, { recursive: true });
    }
  }
}

const clientDir = join(process.cwd(), "build", "client");
const baseDir = join(clientDir, "SchemaExplorer");

if (existsSync(baseDir)) {
  // Flatten index.html → .html inside SchemaExplorer/
  flatten(baseDir);

  // Move SchemaExplorer/* up into build/client/
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    const dest = join(clientDir, entry.name);
    if (existsSync(dest)) rmSync(dest, { recursive: true });
    renameSync(join(baseDir, entry.name), dest);
  }
  rmSync(baseDir, { recursive: true });

  // Rename SPA fallback to 404.html for GitHub Pages and add noindex
  const spaFallback = join(clientDir, "__spa-fallback.html");
  if (existsSync(spaFallback)) {
    const html = readFileSync(spaFallback, "utf-8").replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">',
    );
    const dest404 = join(clientDir, "404.html");
    writeFileSync(dest404, html);
    rmSync(spaFallback);
  }

  console.log("Flattened prerendered routes and moved to build/client/.");
}
