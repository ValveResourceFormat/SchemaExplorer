import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Declaration, SchemaMetadataEntry } from "../src/components/Docs/api.ts";
import { parseSchemas, type SchemasJson } from "../src/components/schemas.ts";
import { GAME_LIST } from "../src/gamesList.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");
const distDir = resolve(__dirname, "../dist");
const sitemapDir = resolve(distDir, "sitemap");

const siteOrigin = "https://s2v.app";
const basePath = "/SchemaExplorer";

function loadSchema(gameId: string): SchemasJson {
  const buf = readFileSync(resolve(schemasDir, `${gameId}.json.gz`));
  return JSON.parse(gunzipSync(buf).toString("utf-8"));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMetadata(metadata: SchemaMetadataEntry[] | undefined): string {
  if (!metadata || metadata.length === 0) return "";
  const parts = metadata.map((m) => (m.value !== undefined ? `${m.name}=${m.value}` : m.name));
  return parts.map(escapeHtml).join(", ");
}

function renderTable(headers: string[], rows: string[][]): string {
  let html = `<dd><table>\n<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>\n`;
  for (const row of rows) {
    html += `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>\n`;
  }
  html += `</table></dd>\n`;
  return html;
}

function htmlPage(title: string, description: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Sitemap - Source 2 Schema Explorer</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="light dark">
<style>
body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
dt { margin-top: 0.5em; }
dd { margin-left: 1.5em; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 0 1.5em; }
th, td { text-align: left; padding: 2px 8px; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); font-family: monospace; }
th { font-weight: normal; opacity: 0.6; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

try {
  rmSync(sitemapDir, { recursive: true, force: true });
} catch {
  //
}

let totalFiles = 0;
const sitemapXmlUrls: string[] = [];

const appRoot = "..";

function banner(root: string): string {
  return `<p role="note"><strong>This is a static listing page for search engines.</strong> Click on a type name to open it in the <a href="${root}/">Schema Explorer</a> with full search, cross-references, and inheritance views.</p>`;
}

// Collect index entries as data, render at the end
interface IndexModuleEntry {
  mod: string;
  count: number;
  chunkCount: number;
}
interface IndexGameEntry {
  game: { id: string; name: string };
  classCount: number;
  enumCount: number;
  fieldCount: number;
  moduleCount: number;
  revision: number;
  versionDate: string;
  modules: IndexModuleEntry[];
}
const indexEntries: IndexGameEntry[] = [];

for (const game of GAME_LIST) {
  const schema = loadSchema(game.id);
  const { declarations, metadata } = parseSchemas(schema);

  const byModule = new Map<string, Declaration[]>();
  for (const d of declarations) {
    if (!byModule.has(d.module)) byModule.set(d.module, []);
    byModule.get(d.module)!.push(d);
  }
  const modules = [...byModule.keys()].sort();

  let classCount = 0;
  let enumCount = 0;
  let fieldCount = 0;
  for (const d of declarations) {
    if (d.kind === "class") {
      classCount++;
      fieldCount += d.fields.length;
    } else {
      enumCount++;
      fieldCount += d.members.length;
    }
  }

  const indexModules: IndexModuleEntry[] = [];

  const modAppRoot = "../..";
  const gameDir = resolve(sitemapDir, game.id);
  mkdirSync(gameDir, { recursive: true });

  for (const mod of modules) {
    const items = byModule.get(mod)!;

    const fragments: string[] = [];
    for (const d of items) {
      const href = `${modAppRoot}/#/${game.id}/${d.module}/${encodeURIComponent(d.name)}`;

      let frag = "";

      let extra = "";
      if (d.kind === "class" && d.parents.length > 0) {
        extra = ` extends ${d.parents.map((p) => escapeHtml(p.name)).join(", ")}`;
      } else if (d.kind === "enum" && d.alignment) {
        extra = ` : ${escapeHtml(d.alignment)}`;
      }

      frag += `<dt><a href="${href}"><code>${escapeHtml(d.name)}</code></a> <small>${d.kind}${extra}</small></dt>\n`;

      if (d.metadata.length > 0) {
        frag += `<dd>${formatMetadata(d.metadata)}</dd>\n`;
      }

      if (d.kind === "class" && d.fields.length > 0) {
        frag += renderTable(
          ["name", "metadata"],
          d.fields.map((f) => [escapeHtml(f.name), formatMetadata(f.metadata)]),
        );
      } else if (d.kind === "enum" && d.members.length > 0) {
        frag += renderTable(
          ["value", "name", "metadata"],
          d.members.map((m) => [String(m.value), escapeHtml(m.name), formatMetadata(m.metadata)]),
        );
      }

      fragments.push(frag);
    }

    // Split fragments into chunks of ~1 MB
    const MAX_CHUNK_BYTES = 1_000_000;
    const chunks: string[][] = [[]];
    let chunkSize = 0;
    for (const frag of fragments) {
      const fragSize = Buffer.byteLength(frag);
      if (chunks[chunks.length - 1].length > 0 && chunkSize + fragSize > MAX_CHUNK_BYTES) {
        chunks.push([]);
        chunkSize = 0;
      }
      chunks[chunks.length - 1].push(frag);
      chunkSize += fragSize;
    }

    const needsChunking = chunks.length > 1;
    indexModules.push({ mod, count: items.length, chunkCount: chunks.length });

    for (let i = 0; i < chunks.length; i++) {
      const suffix = needsChunking ? `_${i + 1}` : "";
      const fileName = `${mod}${suffix}.html`;
      const pageNum = needsChunking ? ` (part ${i + 1}/${chunks.length})` : "";

      let pagination = "";
      if (needsChunking) {
        const links: string[] = [];
        for (let j = 0; j < chunks.length; j++) {
          const pageName = `${mod}_${j + 1}.html`;
          if (j === i) {
            links.push(`<strong>${j + 1}</strong>`);
          } else {
            links.push(`<a href="./${pageName}">${j + 1}</a>`);
          }
        }
        pagination = `<nav aria-label="Pagination">Pages: ${links.join(" ")}</nav>\n`;
      }

      let body = `<nav aria-label="Breadcrumb"><a href="../">Sitemap</a> &rsaquo; <a href="${modAppRoot}/#/${game.id}">${escapeHtml(game.name)}</a> &rsaquo; ${escapeHtml(mod)}</nav>
<header>
<h1><a href="${modAppRoot}/#/${game.id}/${mod}">${escapeHtml(mod)}</a></h1>
<p><small>${items.length} declarations in ${escapeHtml(game.name)}${pageNum}</small></p>
${banner(modAppRoot)}
</header>
${pagination}<main>
<dl>
${chunks[i].join("")}</dl>
</main>
${pagination}`;

      const moduleHtml = htmlPage(
        `${mod}${pageNum} - ${game.name}`,
        `All classes and enums in the ${mod} module for ${game.name} Source 2 schemas.`,
        body,
      );
      writeFileSync(resolve(gameDir, fileName), moduleHtml);
      totalFiles++;
      sitemapXmlUrls.push(`${siteOrigin}${basePath}/sitemap/${game.id}/${fileName}`);
    }
  }

  indexEntries.push({
    game,
    classCount,
    enumCount,
    fieldCount,
    moduleCount: modules.length,
    revision: metadata.revision,
    versionDate: metadata.versionDate,
    modules: indexModules,
  });
}

// --- Render index page from collected data ---
let indexBody = `<header>
<h1><a href="${appRoot}/">Source 2 Schema Explorer</a></h1>
${banner(appRoot)}
</header>
<main>
`;

for (const entry of indexEntries) {
  indexBody += `<section>
<h2><a href="${appRoot}/#/${entry.game.id}">${escapeHtml(entry.game.name)}</a></h2>
<p><small>${entry.classCount.toLocaleString()} classes, ${entry.enumCount.toLocaleString()} enums, ${entry.fieldCount.toLocaleString()} fields/members across ${entry.moduleCount} modules`;
  if (entry.revision) indexBody += ` &middot; Revision ${entry.revision}`;
  if (entry.versionDate) indexBody += ` &middot; ${escapeHtml(entry.versionDate)}`;
  indexBody += `</small></p>
<ul>
`;

  for (const { mod, count, chunkCount } of entry.modules) {
    if (chunkCount > 1) {
      const chunkLinks = Array.from(
        { length: chunkCount },
        (_, j) => `<a href="./${entry.game.id}/${mod}_${j + 1}.html">${j + 1}</a>`,
      ).join(" ");
      indexBody += `<li>${escapeHtml(mod)} <small>(${count})</small> ${chunkLinks}</li>\n`;
    } else {
      indexBody += `<li><a href="./${entry.game.id}/${mod}.html">${escapeHtml(mod)}</a> <small>(${count})</small></li>\n`;
    }
  }
  indexBody += `</ul>
</section>
`;
}

indexBody += `</main>`;

mkdirSync(sitemapDir, { recursive: true });
const indexHtml = htmlPage(
  "Sitemap",
  "Complete index of all Source 2 engine schema classes and enums for Counter-Strike 2, Dota 2, and Deadlock.",
  indexBody,
);
writeFileSync(resolve(sitemapDir, "index.html"), indexHtml);
totalFiles++;
sitemapXmlUrls.unshift(`${siteOrigin}${basePath}/sitemap/`);

// --- sitemap.xml ---
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
xml += `<url><loc>${siteOrigin}${basePath}/</loc></url>\n`;
for (const url of sitemapXmlUrls) {
  xml += `<url><loc>${escapeHtml(url)}</loc></url>\n`;
}
xml += `</urlset>\n`;
writeFileSync(resolve(distDir, "sitemap.xml"), xml);

console.log(
  `Generated ${totalFiles} sitemap HTML files + sitemap.xml (${sitemapXmlUrls.length + 1} URLs)`,
);
