import { declarationKey, pushTo, serverClassName } from "../data/derived";
import { compareModuleNames } from "../data/modules";
import { compareNames } from "../data/schemas";
import type { Declaration, SchemaField } from "../data/types";
import { formatFieldType } from "./format";
import type { SearchIndex } from "./search-index";
import {
  rowSides,
  itemName,
  type FieldHit,
  type FuzzyHit,
  type InheritedSide,
  type MemberHit,
  type NameHit,
  type PairableHit,
  type SearchRow,
  type SimilarHit,
  type SimilarRow,
  type TagMatch,
  type WordMatch,
} from "./search-types";

/** The type of a field as text with C_Foo and CFoo the same, also inside template arguments */
export function pairedTypeText(index: SearchIndex, field: SchemaField): string {
  let text = index.pairedTypes.get(field);
  if (text === undefined) {
    text = serverClassName(formatFieldType(field.type));
    index.pairedTypes.set(field, text);
  }
  return text;
}

/** The client class of a server class and the other way around, if it has one */
export function partnerOf(
  crossModuleLookup: Map<string, Declaration>,
  declaration: Declaration,
): Declaration | undefined {
  return crossModuleLookup.get(declarationKey(declaration.module, declaration.name));
}

/** Whether two lists of words are the same words, matched in the same way when `bySource` is set */
function sameWords(a: readonly WordMatch[], b: readonly WordMatch[], bySource: boolean): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].word !== b[i].word) return false;
    if (bySource && a[i].source !== b[i].source) return false;
  }
  return true;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Whether two tags are the same reason for a hit: the same kind, with the same content */
function sameTag(a: TagMatch, b: TagMatch): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "entity" && b.kind === "entity") {
    return sameStrings(a.designNames, b.designNames);
  }
  if (a.kind === "io" && b.kind === "io") {
    return a.inputs.length === b.inputs.length && a.outputs.length === b.outputs.length;
  }
  if (a.kind === "metadata" && b.kind === "metadata") {
    return sameStrings(
      a.entries.map((e) => e.name),
      b.entries.map((e) => e.name),
    );
  }
  if (a.kind === "enumValue" && b.kind === "enumValue") return a.value === b.value;
  return true;
}

/**
 * Whether two hits were made by the same words and tags, apart from the names that differ between
 * the client and the server class. A word on the class side counts the same whichever of the
 * class's names it matched
 */
function sameReason(a: PairableHit, b: PairableHit): boolean {
  if (!sameWords(a.nameWords, b.nameWords, false)) return false;
  if (a.kind !== "name" && b.kind !== "name") {
    if (!sameWords(a.fieldWords, b.fieldWords, true)) return false;
  }
  if (a.tags.length !== b.tags.length) return false;
  for (let i = 0; i < a.tags.length; i++) {
    if (!sameTag(a.tags[i], b.tags[i])) return false;
  }
  return true;
}

/** The name that pairs a hit with the other side's: the field or member name, none for classes */
function pairedItemName(hit: PairableHit): string {
  return hit.kind === "name" ? "" : itemName(hit);
}

function canPair(index: SearchIndex, a: PairableHit, b: PairableHit): boolean {
  if (a.kind !== b.kind) return false;
  if (!sameReason(a, b)) return false;
  if (a.kind === "field" && b.kind === "field") {
    return pairedTypeText(index, a.field) === pairedTypeText(index, b.field);
  }
  if (a.kind === "member" && b.kind === "member") return a.member.value === b.member.value;
  return true;
}

/** The side whose name matched better, the server on a tie */
function betterSide<T extends { declaration: Declaration; tier: number; score: number }>(
  a: T,
  b: T,
): T {
  if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
  if (a.score !== b.score) return a.score < b.score ? a : b;
  return b.declaration.module === "server" ? b : a;
}

/**
 * Puts the hits of a client class and its server class in one row each time both hit the same
 * way, a class's hits are matched to the other's by field or member name. The rest stay alone
 */
export function pairHits<T extends PairableHit>(
  index: SearchIndex,
  groups: Map<Declaration, T[]>,
  crossModuleLookup: Map<string, Declaration>,
): SearchRow<T>[] {
  const rows: SearchRow<T>[] = [];
  const handled = new Set<Declaration>();

  for (const [declaration, hits] of groups) {
    if (handled.has(declaration)) continue;
    handled.add(declaration);

    const partner = partnerOf(crossModuleLookup, declaration);
    const partnerHits = partner && !handled.has(partner) ? groups.get(partner) : undefined;
    if (!partner || !partnerHits) {
      for (const hit of hits) rows.push({ hit });
      continue;
    }

    handled.add(partner);

    const partnerByName = new Map<string, T>();
    for (const hit of partnerHits) partnerByName.set(pairedItemName(hit), hit);

    const paired = new Set<T>();
    for (const hit of hits) {
      const other = partnerByName.get(pairedItemName(hit));
      if (!other || !canPair(index, hit, other)) {
        rows.push({ hit });
        continue;
      }

      paired.add(other);
      const better = betterSide(hit, other);
      rows.push({ hit: better, paired: better === hit ? other : hit });
    }

    for (const hit of partnerHits) {
      if (!paired.has(hit)) rows.push({ hit });
    }
  }

  return rows;
}

/** The field, member or declaration a hit is named by */
function namedBy(hit: PairableHit): { name: string } {
  if (hit.kind === "name") return hit.declaration;
  if (hit.kind === "field") return hit.field;
  return hit.member;
}

/** Whether some name words matched the declaration and the others the field or member */
function isSplit(hit: PairableHit): boolean {
  return hit.kind !== "name" && hit.nameWords.length > 0 && hit.fieldWords.length > 0;
}

/**
 * Whether the class side of a hit matched an entity design name only: every word matched it, and
 * the class name matches no word as well
 */
function viaDesignNameOnly(hit: PairableHit): boolean {
  if (hit.nameWords.length === 0) return false;

  for (const w of hit.nameWords) {
    if (w.source !== "designName") return false;
    if (w.nameTier !== undefined && w.nameTier <= w.tier) return false;
  }
  return true;
}

const NUMBERED_NAME = /_\d+$/;

function isNetworkedHit(hit: PairableHit): boolean {
  return hit.kind === "field" && hit.field.network != null;
}

function isMemberField(hit: PairableHit): boolean {
  return hit.kind === "field" && hit.field.name.startsWith("m_");
}

/** Compares two flags, the one that has it first */
function compareFlags(a: boolean, b: boolean): number {
  if (a === b) return 0;
  return a ? -1 : 1;
}

/** What a row sorts by before its names, worked out once per row */
interface RowRank<T extends PairableHit> {
  row: SearchRow<T>;
  split: boolean;
  designNameOnly: boolean;
  numbered: boolean;
  paired: boolean;
  networked: boolean;
  importance: number;
  memberField: boolean;
}

function rankRow<T extends PairableHit>(index: SearchIndex, row: SearchRow<T>): RowRank<T> {
  const { hit } = row;
  return {
    row,
    split: isSplit(hit),
    designNameOnly: viaDesignNameOnly(hit),
    numbered: NUMBERED_NAME.test(hit.declaration.name),
    paired: row.paired !== undefined,
    networked: isNetworkedHit(hit),
    importance: importanceOf(index, hit.declaration),
    memberField: isMemberField(hit),
  };
}

/**
 * Orders by these keys in turn. Split hits go after the ones with every word in one name. Then
 * tier, with a class name match before an entity name only one. A numbered class name (like
 * Foo_2) goes after the others. Then score. After that come the signs of a more relevant hit:
 * both client and server, a networked field, a class with many subclasses or an entity name,
 * and a field with the m_ prefix. The name and module are last
 */
function compareRanks(a: RowRank<PairableHit>, b: RowRank<PairableHit>): number {
  const aHit = a.row.hit;
  const bHit = b.row.hit;
  const bySplit = compareFlags(!a.split, !b.split);
  if (bySplit !== 0) return bySplit;
  if (aHit.tier !== bHit.tier) return aHit.tier - bHit.tier;
  const byDesign = compareFlags(!a.designNameOnly, !b.designNameOnly);
  if (byDesign !== 0) return byDesign;
  const byNumbered = compareFlags(!a.numbered, !b.numbered);
  if (byNumbered !== 0) return byNumbered;
  if (aHit.score !== bHit.score) return aHit.score - bHit.score;

  const byPair = compareFlags(a.paired, b.paired);
  if (byPair !== 0) return byPair;
  const byNetwork = compareFlags(a.networked, b.networked);
  if (byNetwork !== 0) return byNetwork;
  if (a.importance !== b.importance) return b.importance - a.importance;
  const byPrefix = compareFlags(a.memberField, b.memberField);
  if (byPrefix !== 0) return byPrefix;

  const byName = compareNames(namedBy(aHit), namedBy(bHit));
  if (byName !== 0) return byName;
  const byDeclaration = compareNames(aHit.declaration, bHit.declaration);
  if (byDeclaration !== 0) return byDeclaration;
  return compareModuleNames(aHit.declaration.module, bHit.declaration.module);
}

/** The rows in compareRanks order */
export function sortRows<T extends PairableHit>(
  index: SearchIndex,
  rows: SearchRow<T>[],
): SearchRow<T>[] {
  const ranks = rows.map((row) => rankRow(index, row));
  ranks.sort(compareRanks);
  return ranks.map((rank) => rank.row);
}

function importanceOf(index: SearchIndex, declaration: Declaration): number {
  if (declaration.kind !== "class") return 0;
  return index.importance.get(declaration) ?? 0;
}

export function compareSimilarRows(aRow: SimilarRow, bRow: SimilarRow): number {
  const a = aRow.hit;
  const b = bRow.hit;
  if (a.score !== b.score) return a.score - b.score;
  const byName = compareNames(a.declaration, b.declaration);
  if (byName !== 0) return byName;
  const byModule = compareModuleNames(a.declaration.module, b.declaration.module);
  if (byModule !== 0) return byModule;
  if (a.kind === "fuzzy" || b.kind === "fuzzy") return 0;
  return compareNames(namedBy(a), namedBy(b));
}

/** Fuzzy hits of a client and a server class are one hit, a field or member's are paired rows */
export function pairSimilarHits(
  index: SearchIndex,
  hits: SimilarHit[],
  crossModuleLookup: Map<string, Declaration>,
): SimilarRow[] {
  const fuzzyHits: FuzzyHit[] = [];
  const itemGroups = new Map<Declaration, (FieldHit | MemberHit)[]>();
  for (const hit of hits) {
    if (hit.kind === "fuzzy") fuzzyHits.push(hit);
    else pushTo(itemGroups, hit.declaration, hit);
  }

  const rows: SimilarRow[] = [];
  for (const hit of dropFuzzyTwins(fuzzyHits, crossModuleLookup)) rows.push({ hit });
  for (const row of pairHits(index, itemGroups, crossModuleLookup)) rows.push(row);
  return rows;
}

/** Leaves one of the client and the server hit of a class, the better side */
function dropFuzzyTwins(hits: FuzzyHit[], crossModuleLookup: Map<string, Declaration>): FuzzyHit[] {
  const byKey = new Map<string, FuzzyHit>();
  for (const hit of hits) {
    const { module, name } = hit.declaration;
    byKey.set(declarationKey(module, name), hit);
  }

  const dropped = new Set<FuzzyHit>();
  for (const hit of hits) {
    const partner = partnerOf(crossModuleLookup, hit.declaration);
    if (!partner || dropped.has(hit)) continue;
    const other = byKey.get(declarationKey(partner.module, partner.name));
    if (!other || other === hit || dropped.has(other)) continue;
    dropped.add(betterSide(hit, other) === hit ? other : hit);
  }

  return hits.filter((hit) => !dropped.has(hit));
}

/** The declarations of the rows, each once, with the classes of the inherited fields */
export function resultDeclarations(
  names: SearchRow<NameHit>[],
  fields: SearchRow<FieldHit | MemberHit>[],
  inherited: SearchRow<InheritedSide>[],
): Set<Declaration> {
  const declarations = new Set<Declaration>();
  for (const row of names) {
    for (const hit of rowSides(row)) declarations.add(hit.declaration);
  }
  for (const row of fields) {
    for (const hit of rowSides(row)) declarations.add(hit.declaration);
  }
  for (const row of inherited) {
    for (const side of rowSides(row)) {
      for (const inheritedClass of side.classes) declarations.add(inheritedClass);
    }
  }

  return declarations;
}
