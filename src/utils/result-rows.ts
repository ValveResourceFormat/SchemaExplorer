import type { ConsoleItem, Declaration } from "../data/types";
import type { GameId } from "../games-list";
import type { ConsoleMatch } from "./console-filtering";
import { formatHexOffset, metadataValueText } from "./format";
import { mergeRanges } from "./highlight";
import { declarationKey } from "../data/derived";
import { hasSchemaHits } from "./search";
import {
  itemName,
  type FieldHit,
  type InheritedSide,
  type MatchSource,
  type MemberHit,
  type NameHit,
  type PairableHit,
  type SearchResult,
  type SearchRow,
  type SimilarHit,
  type SimilarRow,
  type TagMatch,
  type WordMatch,
} from "./search-types";

/** How many similar names are listed before the rest is asked for */
export const SIMILAR_SHOWN = 50;

/** The similar names that are listed, all of them once asked for */
export function shownSimilar<T>(similar: readonly T[], showAll: boolean): readonly T[] {
  return showAll ? similar : similar.slice(0, SIMILAR_SHOWN);
}

/** The most names a why label lists per kind of tag */
const WHY_NAMES_SHOWN = 3;

export type SectionId = "names" | "fields" | "inherited" | "similar";

export const SECTION_LABELS: Record<SectionId, string> = {
  names: "Classes & enums",
  fields: "Fields & members",
  inherited: "Inherited fields",
  similar: "Similar names",
};

export interface SectionRow {
  type: "section";
  key: string;
  id: SectionId;
}

export interface NameResultRow {
  type: "name";
  key: string;
  row: SearchRow<NameHit>;
  /** Set for another game's result, which links to that game */
  game?: GameId;
}

export interface FieldResultRow {
  type: "field";
  key: string;
  row: SearchRow<FieldHit | MemberHit>;
  game?: GameId;
}

/** A field that classes have from a base class */
export interface InheritedResultRow {
  type: "inherited";
  key: string;
  row: SearchRow<InheritedSide>;
  game?: GameId;
}

/** Heads the other section's better matches, which `total` results of it are behind */
export interface ConsoleHeaderRow {
  type: "consoleHeader";
  key: string;
  total: number;
  /** How many of them are listed */
  shown: number;
}

export interface ConsoleResultRow {
  type: "console";
  key: string;
  match: ConsoleMatch;
}

/** A link to the other section's results, in place of its better matches */
export interface ConsoleHintRow {
  type: "consoleHint";
  key: string;
  total: number;
}

/** Heads the results of another game */
export interface GameHeadingRow {
  type: "game";
  key: string;
  gameId: GameId;
}

export interface SimilarResultRow {
  type: "similar";
  key: string;
  row: SimilarRow;
}

/** Lists the similar names that are left out */
export interface ShowAllRow {
  type: "showAll";
  key: string;
  count: number;
}

/** Stands in for the results when nothing matched but similar names */
export interface EmptyRow {
  type: "empty";
  key: string;
}

export type ResultRow =
  | SectionRow
  | NameResultRow
  | FieldResultRow
  | InheritedResultRow
  | ConsoleHeaderRow
  | ConsoleResultRow
  | ConsoleHintRow
  | GameHeadingRow
  | SimilarResultRow
  | ShowAllRow
  | EmptyRow;

function sectionRow(id: SectionId): SectionRow {
  return { type: "section", key: `section:${id}`, id };
}

export function nameRowKey(hit: NameHit): string {
  const { module, name } = hit.declaration;
  return `name:${declarationKey(module, name)}`;
}

export function fieldRowKey(hit: FieldHit | MemberHit): string {
  const { module, name } = hit.declaration;
  return `field:${declarationKey(module, name)}/${itemName(hit)}`;
}

function inheritedRowKey(side: InheritedSide): string {
  const { module, name } = side.declaration;
  return `inherited:${declarationKey(module, name)}/${side.field.name}`;
}

function similarRowKey(hit: SimilarHit): string {
  const { module, name } = hit.declaration;
  const key = `similar:${declarationKey(module, name)}`;
  if (hit.kind === "fuzzy") return key;
  return `${key}/${itemName(hit)}`;
}

/** The key includes the kind, because a convar and a command can share a name */
export function consoleRowKey(item: ConsoleItem): string {
  return `${item.kind}/${item.name}`;
}

/** The results of another game, listed when this game has none */
export interface OtherGameResult {
  gameId: GameId;
  result: SearchResult;
}

/** What the list shows besides the schema search of the game */
export interface ResultExtras {
  /** The other section's better matches, and how many results it has in all */
  convars?: { items: readonly ConsoleMatch[]; total: number } | null;
  otherGames?: readonly OtherGameResult[];
}

/**
 * The class, enum, field, member and inherited field rows of a result. The rows of another game
 * have that game, which keys them. They have no section headers, because the game heading stands
 * for them
 */
function pushHitRows(rows: ResultRow[], result: SearchResult, game?: GameId) {
  const keyPrefix = game === undefined ? "" : `${game}:`;
  const headers = game === undefined;

  if (headers && result.names.length > 0) rows.push(sectionRow("names"));
  for (const row of result.names) {
    rows.push({ type: "name", key: keyPrefix + nameRowKey(row.hit), row, game });
  }

  if (headers && result.fields.length > 0) rows.push(sectionRow("fields"));
  for (const row of result.fields) {
    rows.push({ type: "field", key: keyPrefix + fieldRowKey(row.hit), row, game });
  }

  if (headers && result.inherited.length > 0) rows.push(sectionRow("inherited"));
  for (const row of result.inherited) {
    rows.push({ type: "inherited", key: keyPrefix + inheritedRowKey(row.hit), row, game });
  }
}

/**
 * The rows of the results list in the order they are shown: classes and enums, fields and
 * members, the other section's better matches, other games' results and similar names. The list
 * omits sections without rows. It lists at most SIMILAR_SHOWN similar names unless
 * `showAllSimilar` is set
 */
export function buildResultRows(
  result: SearchResult,
  showAllSimilar: boolean,
  extras: ResultExtras = {},
): ResultRow[] {
  const rows: ResultRow[] = [];
  pushHitRows(rows, result);

  const hasHits = hasSchemaHits(result);
  if (!hasHits) rows.push({ type: "empty", key: "empty" });

  const { convars, otherGames } = extras;
  if (convars && convars.items.length > 0) {
    const { items, total } = convars;
    rows.push({ type: "consoleHeader", key: "section:console", total, shown: items.length });
    for (const match of items) {
      rows.push({ type: "console", key: consoleRowKey(match.item), match });
    }
  } else if (convars && convars.total > 0 && !hasHits) {
    // Without results here, a link tells that the other section has some
    rows.push({ type: "consoleHint", key: "hint:console", total: convars.total });
  }

  for (const other of otherGames ?? []) {
    rows.push({ type: "game", key: `game:${other.gameId}`, gameId: other.gameId });
    pushHitRows(rows, other.result, other.gameId);
  }

  const { similar } = result;
  if (similar.length > 0) {
    rows.push(sectionRow("similar"));
    const shown = shownSimilar(similar, showAllSimilar);
    for (const row of shown) {
      rows.push({ type: "similar", key: similarRowKey(row.hit), row });
    }
    if (shown.length < similar.length) {
      rows.push({ type: "showAll", key: "showAll:similar", count: similar.length });
    }
  }

  return rows;
}

/** Rows that are drawn in the card of their section */
export function isCardRow(row: ResultRow | undefined): boolean {
  switch (row?.type) {
    case "name":
    case "field":
    case "inherited":
    case "console":
    case "similar":
    case "showAll":
      return true;
    default:
      return false;
  }
}

/** The ranges of the name words that matched this text of this source, joined */
export function matchedRanges(
  words: readonly WordMatch[],
  source: MatchSource,
  text: string,
): number[] {
  const lists: number[][] = [];
  for (const word of words) {
    if (word.source === source && word.text === text) lists.push(word.ranges);
  }
  return mergeRanges(lists);
}

/** The declarations of a row, the server's first */
export function rowDeclarations(declaration: Declaration, paired?: Declaration): Declaration[] {
  if (!paired) return [declaration];
  if (declaration.module !== "server" && paired.module === "server") return [paired, declaration];
  return [declaration, paired];
}

function listNames(label: string, names: string[]): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, WHY_NAMES_SHOWN).join(", ");
  const hidden = unique.length - WHY_NAMES_SHOWN;
  return hidden > 0 ? `${label}: ${shown} +${hidden}` : `${label}: ${shown}`;
}

function tagWhy(tag: TagMatch): string[] {
  switch (tag.kind) {
    case "io": {
      const labels: string[] = [];
      if (tag.inputs.length > 0) {
        const inputNames = tag.inputs.map((i) => i.name);
        labels.push(listNames("input", inputNames));
      }

      if (tag.outputs.length > 0) {
        const outputNames = tag.outputs.map((o) => o.name);
        labels.push(listNames("output", outputNames));
      }

      return labels;
    }
    case "metadata": {
      const entries = tag.entries.map((entry) => {
        const value = metadataValueText(entry.value);
        return value === undefined ? entry.name : `${entry.name}: ${value}`;
      });
      return entries.length > 0 ? [listNames("metadata", entries)] : [];
    }
    case "network":
      return [`network: ${tag.words.join(" ")}`];
    case "entity":
    case "offset":
    case "enumValue":
      return [];
  }
}

/**
 * Short labels for what made a hit besides its name: metadata, network words, inputs, and
 * outputs. Entity names are pills. The row itself shows offsets and enum values
 */
export function hitWhy(hit: PairableHit | SimilarHit): string[] {
  const labels: string[] = [];
  for (const tag of hit.tags) labels.push(...tagWhy(tag));
  return labels;
}

/**
 * The entity design names a field or member hit matched, by an `entity:` filter or by the words
 * of its class. Class and enum rows show all of their design names instead
 */
export function hitDesignNames(hit: PairableHit | SimilarHit): string[] {
  const names = new Set<string>();
  for (const tag of hit.tags) {
    if (tag.kind !== "entity") continue;
    for (const name of tag.designNames) names.add(name);
  }
  for (const word of hit.nameWords) {
    if (word.source === "designName") names.add(word.text);
  }
  return [...names];
}

/** The offset an `offset:` search found a field at, undefined for any other hit */
export function hitOffset(hit: PairableHit): number | undefined {
  for (const tag of hit.tags) {
    if (tag.kind === "offset") return tag.offset;
  }
  return undefined;
}

/**
 * The offsets of a row's sides as text, one when both sides have the same. Paired sides have the
 * same kinds of tags, so both have an offset or neither does
 */
export function formatRowOffsets(row: SearchRow<PairableHit>): string | null {
  const offset = hitOffset(row.hit);
  if (offset === undefined) return null;

  const text = formatHexOffset(offset);
  const pairedOffset = row.paired ? hitOffset(row.paired) : undefined;
  if (pairedOffset === undefined || pairedOffset === offset) return text;
  return `${text} · ${formatHexOffset(pairedOffset)}`;
}
