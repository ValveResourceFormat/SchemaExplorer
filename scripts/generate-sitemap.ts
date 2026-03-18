import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_LIST, SITE_ORIGIN } from "../src/games-list.ts";
import { parseSchemas, type SchemasJson } from "../src/data/schemas.ts";
import { readGzippedJson } from "./lib/read-gzipped-json.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");
const distDir = resolve(__dirname, "../build/client");
const basePath = "/SchemaExplorer";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

function buildUrlset(urls: SitemapUrl[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const { loc, lastmod } of urls) {
    xml += `<url><loc>${escapeXml(loc)}</loc>`;
    if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
    xml += `</url>\n`;
  }
  xml += `</urlset>\n`;
  return xml;
}

await mkdir(distDir, { recursive: true });

// Main sitemap: root + game pages + module pages
const mainUrls: SitemapUrl[] = [{ loc: `${SITE_ORIGIN}${basePath}/` }];
const indexEntries: { file: string; lastmod?: string }[] = [];

for (const game of GAME_LIST) {
  const data = await readGzippedJson<SchemasJson>(resolve(schemasDir, `${game.id}.json.gz`));
  const { declarations } = parseSchemas(data);

  const byModule = new Map<string, string[]>();
  for (const d of declarations) {
    if (!byModule.has(d.module)) byModule.set(d.module, []);
    byModule.get(d.module)!.push(d.name);
  }

  // Load per-class lastmod data if available
  let lastmod: Record<string, string> = {};
  try {
    lastmod = JSON.parse(await readFile(resolve(schemasDir, `${game.id}-lastmod.json`), "utf-8"));
  } catch {
    // lastmod data is optional
  }

  // Per-game sitemap: all declarations, tracking max date per module
  const gameUrls: SitemapUrl[] = [];
  let gameMaxDate: string | undefined;

  for (const [mod, names] of byModule) {
    let moduleMaxDate: string | undefined;
    for (const name of names) {
      const fileName = name.replace(/:/g, "_");
      const date = lastmod[`${mod}/${fileName}`];
      if (date && (!moduleMaxDate || date > moduleMaxDate)) moduleMaxDate = date;
      gameUrls.push({
        loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}/${name}`,
        lastmod: date,
      });
    }
    mainUrls.push({
      loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}`,
      lastmod: moduleMaxDate,
    });
    if (moduleMaxDate && (!gameMaxDate || moduleMaxDate > gameMaxDate)) gameMaxDate = moduleMaxDate;
  }

  mainUrls.push({ loc: `${SITE_ORIGIN}${basePath}/${game.id}`, lastmod: gameMaxDate });

  const gameFile = `sitemap-${game.id}.xml`;
  await writeFile(resolve(distDir, gameFile), buildUrlset(gameUrls));
  indexEntries.push({ file: gameFile, lastmod: gameMaxDate });
  console.log(`  ${gameFile}: ${gameUrls.length} URLs`);
}

const mainLastmod = indexEntries.reduce<string | undefined>(
  (max, e) => (e.lastmod && (!max || e.lastmod > max) ? e.lastmod : max),
  undefined,
);

const mainFile = "sitemap-main.xml";
await writeFile(resolve(distDir, mainFile), buildUrlset(mainUrls));
indexEntries.unshift({ file: mainFile, lastmod: mainLastmod });
console.log(`  ${mainFile}: ${mainUrls.length} URLs`);

// Sitemap index
let indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
indexXml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const { file, lastmod } of indexEntries) {
  indexXml += `<sitemap><loc>${SITE_ORIGIN}${basePath}/${file}</loc>`;
  if (lastmod) indexXml += `<lastmod>${lastmod}</lastmod>`;
  indexXml += `</sitemap>\n`;
}
indexXml += `</sitemapindex>\n`;
await writeFile(resolve(distDir, "sitemap.xml"), indexXml);

console.log(`Generated sitemap.xml index with ${indexEntries.length} sitemaps`);
