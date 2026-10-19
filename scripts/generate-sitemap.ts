import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH, GAME_LIST, SITE_ORIGIN } from "../src/games-list.ts";
import { isoVersionDate, parseSchemas, type SchemasJson } from "../src/data/schemas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "../schemas");
const distDir = resolve(__dirname, "../build/client");
const basePath = BASE_PATH;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The later of two ISO dates, which compare as strings */
function latest(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
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
const rootUrl: SitemapUrl = { loc: `${SITE_ORIGIN}${basePath}/` };
const mainUrls: SitemapUrl[] = [rootUrl];
const indexEntries: { file: string; lastmod?: string }[] = [];

for (const game of GAME_LIST) {
  const data: SchemasJson = JSON.parse(
    await readFile(resolve(schemasDir, `${game.id}.json`), "utf-8"),
  );
  const { declarations, consoleItems, metadata } = parseSchemas(data);

  // Pages without a date of their own changed with the dump at the latest. One-off dumps have none
  const versionDate = isoVersionDate(metadata.versionDate) ?? undefined;
  rootUrl.lastmod = latest(rootUrl.lastmod, versionDate);

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

  for (const [mod, inner] of declarations) {
    let moduleMaxDate: string | undefined;
    for (const [name] of inner) {
      const fileName = name.replace(/:/g, "_");
      const date = lastmod[`${mod}/${fileName}`] ?? versionDate;
      moduleMaxDate = latest(moduleMaxDate, date);
      gameUrls.push({
        loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}/${name}`,
        lastmod: date,
      });
    }
    mainUrls.push({
      loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}`,
      lastmod: moduleMaxDate,
    });
    gameMaxDate = latest(gameMaxDate, moduleMaxDate);
  }

  mainUrls.push({ loc: `${SITE_ORIGIN}${basePath}/${game.id}`, lastmod: gameMaxDate });
  if (consoleItems.length > 0) {
    mainUrls.push({ loc: `${SITE_ORIGIN}${basePath}/${game.id}/convars`, lastmod: versionDate });
  }

  const gameFile = `sitemap-${game.id}.xml`;
  await writeFile(resolve(distDir, gameFile), buildUrlset(gameUrls));
  indexEntries.push({ file: gameFile, lastmod: gameMaxDate });
  console.log(`  ${gameFile}: ${gameUrls.length} URLs`);
}

let mainLastmod: string | undefined;
for (const entry of indexEntries) mainLastmod = latest(mainLastmod, entry.lastmod);
rootUrl.lastmod = latest(rootUrl.lastmod, mainLastmod);

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
