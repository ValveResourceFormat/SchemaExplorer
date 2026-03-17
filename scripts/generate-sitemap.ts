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

function toIsoDate(date: string, time?: string): string {
  const d = new Date(`${date} ${time ?? "00:00:00"} UTC`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
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

interface HtmlPageOptions {
  isoDate?: string;
  canonicalUrl?: string;
  schemaType?: string;
}

function htmlPage(
  title: string,
  description: string,
  body: string,
  options: HtmlPageOptions = {},
): string {
  const { isoDate, canonicalUrl, schemaType = "WebPage" } = options;
  let head = "";
  if (isoDate) head += `\n<meta name="date" content="${isoDate}" itemprop="dateModified">`;
  if (canonicalUrl) {
    head += `\n<link rel="canonical" href="${canonicalUrl}">`;
    head += `\n<meta property="og:url" content="${canonicalUrl}">`;
  }
  head += `\n<link rel="sitemap" href="${basePath}/sitemap.xml">`;
  head += `\n<meta property="og:type" content="website">`;
  head += `\n<meta property="og:site_name" content="Source 2 Schema Explorer">`;
  head += `\n<meta property="og:title" content="${escapeHtml(title)}">`;
  head += `\n<meta property="og:description" content="${escapeHtml(description)}">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Sitemap - Source 2 Schema Explorer</title>
<meta name="description" content="${escapeHtml(description)}" itemprop="description">
<meta name="color-scheme" content="light dark">${head}
<style>
body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; overflow-wrap: break-word; word-break: break-all; }
.note { position: sticky; top: 0; background: Canvas; margin: 0 -20px; padding: 8px 20px; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); z-index: 1; }
dt { margin-top: 0.5em; }
dd { margin-left: 1.5em; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 0 1.5em; }
th, td { text-align: left; padding: 2px 8px; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); font-family: monospace; }
th { font-weight: normal; opacity: 0.6; }
</style>
</head>
<body itemscope itemtype="https://schema.org/${schemaType}">
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
const sitemapXmlUrls: { url: string; lastmod?: string }[] = [];

const appRoot = "..";

function banner(root: string, revision?: number, versionDate?: string, isoDate?: string): string {
  let html = `<p class="note" role="note"><strong>This is a static listing page for search engines.</strong> Click on a type name to open it in the <a href="${root}/">Schema Explorer</a> with full search, cross-references, and inheritance views.`;
  if (revision && versionDate) {
    html += `<br><small>Revision ${revision} &middot; <time datetime="${isoDate}">${escapeHtml(versionDate)}</time></small>`;
  }
  html += `</p>`;
  return html;
}

function breadcrumb(items: { name: string; href?: string }[]): string {
  const lis = items
    .map(
      (item, i) =>
        `<span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">${
          item.href
            ? `<a itemprop="item" href="${item.href}"><span itemprop="name">${escapeHtml(item.name)}</span></a>`
            : `<span itemprop="name">${escapeHtml(item.name)}</span>`
        }<meta itemprop="position" content="${i + 1}"></span>`,
    )
    .join(" &rsaquo; ");
  return `<nav aria-label="Breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList">${lis}</nav>`;
}

function moduleNav(moduleFiles: { mod: string; fileName: string }[], currentMod: string): string {
  if (moduleFiles.length <= 1) return "";
  const links = moduleFiles.map(({ mod, fileName }) =>
    mod === currentMod
      ? `<strong>${escapeHtml(mod)}</strong>`
      : `<a href="./${fileName}">${escapeHtml(mod)}</a>`,
  );
  return `<nav aria-label="Modules"><p><small>${links.join(" &middot; ")}</small></p></nav>\n`;
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
  isoDate: string;
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

  const isoDate = metadata.versionDate ? toIsoDate(metadata.versionDate, metadata.versionTime) : "";
  const indexModules: IndexModuleEntry[] = [];

  const modAppRoot = "../..";
  const gameDir = resolve(sitemapDir, game.id);
  mkdirSync(gameDir, { recursive: true });

  // First pass: compute fragments and chunks for all modules
  interface ModuleChunkData {
    mod: string;
    itemCount: number;
    chunks: string[][];
  }
  const moduleChunks: ModuleChunkData[] = [];

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

    indexModules.push({ mod, count: items.length, chunkCount: chunks.length });
    moduleChunks.push({ mod, itemCount: items.length, chunks });
  }

  // Build sibling module nav links
  const moduleFiles = moduleChunks.map(({ mod, chunks }) => ({
    mod,
    fileName: chunks.length > 1 ? `${mod}_1.html` : `${mod}.html`,
  }));

  // Second pass: write HTML files with sibling nav
  for (const { mod, itemCount, chunks } of moduleChunks) {
    const needsChunking = chunks.length > 1;

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

      const bc = breadcrumb([
        { name: "Sitemap", href: "../" },
        { name: game.name, href: `${modAppRoot}/#/${game.id}` },
        { name: mod },
      ]);

      let body = `${bc}
${banner(modAppRoot, metadata.revision, metadata.versionDate, isoDate)}
<header>
<h1 itemprop="name"><a href="${modAppRoot}/#/${game.id}/${mod}">${escapeHtml(mod)}</a></h1>
<p><small>${itemCount} declarations in ${escapeHtml(game.name)}${pageNum}</small></p>
</header>
${pagination}<main>
<dl>
${chunks[i].join("")}</dl>
</main>
${pagination}${moduleNav(moduleFiles, mod)}`;

      const canonicalUrl = `${siteOrigin}${basePath}/sitemap/${game.id}/${fileName}`;
      const moduleHtml = htmlPage(
        `${mod}${pageNum} - ${game.name}`,
        `All classes and enums in the ${mod} module for ${game.name} Source 2 schemas.`,
        body,
        { isoDate: isoDate || undefined, canonicalUrl, schemaType: "TechArticle" },
      );
      writeFileSync(resolve(gameDir, fileName), moduleHtml);
      totalFiles++;
      sitemapXmlUrls.push({ url: canonicalUrl, lastmod: isoDate || undefined });
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
    isoDate,
    modules: indexModules,
  });
}

// --- Render index page from collected data ---
const indexBc = breadcrumb([{ name: "Schema Explorer", href: `${appRoot}/` }, { name: "Sitemap" }]);
let indexBody = `${indexBc}
${banner(appRoot)}
<header>
<h1 itemprop="name"><a href="${appRoot}/">Source 2 Schema Explorer</a></h1>
</header>
<main>
`;

for (const entry of indexEntries) {
  indexBody += `<section>
<h2><a href="${appRoot}/#/${entry.game.id}">${escapeHtml(entry.game.name)}</a></h2>
<p><small>${entry.classCount.toLocaleString()} classes, ${entry.enumCount.toLocaleString()} enums, ${entry.fieldCount.toLocaleString()} fields/members across ${entry.moduleCount} modules`;
  if (entry.revision) indexBody += ` &middot; Revision ${entry.revision}`;
  if (entry.versionDate)
    indexBody += ` &middot; <time datetime="${entry.isoDate}">${escapeHtml(entry.versionDate)}</time>`;
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
const latestIsoDate = indexEntries.reduce(
  (latest, e) => (e.isoDate > latest ? e.isoDate : latest),
  "",
);
const indexCanonical = `${siteOrigin}${basePath}/sitemap/`;
const indexHtml = htmlPage(
  "Sitemap",
  "Complete index of all Source 2 engine schema classes and enums for Counter-Strike 2, Dota 2, and Deadlock.",
  indexBody,
  { isoDate: latestIsoDate || undefined, canonicalUrl: indexCanonical },
);
writeFileSync(resolve(sitemapDir, "index.html"), indexHtml);
totalFiles++;
sitemapXmlUrls.unshift({ url: `${siteOrigin}${basePath}/sitemap/` });

// --- sitemap.xml ---
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
xml += `<url><loc>${siteOrigin}${basePath}/</loc></url>\n`;
for (const { url, lastmod } of sitemapXmlUrls) {
  xml += `<url><loc>${escapeHtml(url)}</loc>`;
  if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
  xml += `</url>\n`;
}
xml += `</urlset>\n`;
writeFileSync(resolve(distDir, "sitemap.xml"), xml);

console.log(
  `Generated ${totalFiles} sitemap HTML files + sitemap.xml (${sitemapXmlUrls.length + 1} URLs)`,
);
