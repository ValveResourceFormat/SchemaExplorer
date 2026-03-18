import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_LIST, SITE_ORIGIN } from "../src/games-list.ts";

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

function toIsoDate(date: string, time?: string): string {
  const d = new Date(`${date} ${time ?? "00:00:00"} UTC`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

function writeUrlset(path: string, urls: SitemapUrl[]): void {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const { loc, lastmod } of urls) {
    xml += `<url><loc>${escapeXml(loc)}</loc>`;
    if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
    xml += `</url>\n`;
  }
  xml += `</urlset>\n`;
  writeFileSync(path, xml);
}

mkdirSync(distDir, { recursive: true });

// Main sitemap: root + game pages + module pages
const mainUrls: SitemapUrl[] = [{ loc: `${SITE_ORIGIN}${basePath}/` }];
const indexEntries: { file: string; lastmod?: string }[] = [];

for (const game of GAME_LIST) {
  const buf = readFileSync(resolve(schemasDir, `${game.id}.json.gz`));
  const data = JSON.parse(gunzipSync(buf).toString("utf-8"));

  const isoDate = data.version_date ? toIsoDate(data.version_date, data.version_time) : undefined;

  mainUrls.push({ loc: `${SITE_ORIGIN}${basePath}/${game.id}`, lastmod: isoDate });

  const byModule = new Map<string, string[]>();
  for (const cls of data.classes ?? []) {
    if (!byModule.has(cls.module)) byModule.set(cls.module, []);
    byModule.get(cls.module)!.push(cls.name);
  }
  for (const enm of data.enums ?? []) {
    if (!byModule.has(enm.module)) byModule.set(enm.module, []);
    byModule.get(enm.module)!.push(enm.name);
  }

  for (const mod of byModule.keys()) {
    mainUrls.push({ loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}`, lastmod: isoDate });
  }

  // Per-game sitemap: all declarations
  const gameUrls: SitemapUrl[] = [];
  for (const [mod, names] of byModule) {
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      gameUrls.push({
        loc: `${SITE_ORIGIN}${basePath}/${game.id}/${mod}/${name}`,
      });
    }
  }

  const gameFile = `sitemap-${game.id}.xml`;
  writeUrlset(resolve(distDir, gameFile), gameUrls);
  indexEntries.push({ file: gameFile, lastmod: isoDate });
  console.log(`  ${gameFile}: ${gameUrls.length} URLs`);
}

const mainFile = "sitemap-main.xml";
writeUrlset(resolve(distDir, mainFile), mainUrls);
indexEntries.unshift({ file: mainFile });
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
writeFileSync(resolve(distDir, "sitemap.xml"), indexXml);

console.log(`Generated sitemap.xml index with ${indexEntries.length} sitemaps`);
