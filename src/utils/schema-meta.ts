import type { Declaration, EntityClass, SchemaClass, SchemaEnum } from "../data/types";
import { INTRINSIC_MODULE } from "../data/intrinsics";
import { moduleFile } from "../data/modules";
import {
  allDeclarations,
  declarationKey,
  entityChain,
  getGameContext,
  type EntityLookups,
  type GameContext,
} from "../data/derived";
import { GAME_LIST, getGameDef, type GameId } from "../games-list";
import { buildInheritedGroups, type Entry } from "./entity-format";
import { formatCount, formatHexOffset, plural } from "./format";

/** Search results truncate descriptions longer than this */
const MAX_DESC_LENGTH = 160;

/** How many fields a class description keeps before it drops the entity summary to list more */
const MIN_FIELDS_WITH_SUMMARY = 3;

const SITE_SUFFIX = "Source 2 Schemas";

/** The build and date of the dump, "build 11131657, Oct 14 2026", empty when it has neither */
function buildText(context: GameContext): string {
  const { revision, versionDate } = context.metadata;
  const parts: string[] = [];
  if (revision > 0) parts.push(`build ${revision}`);
  if (versionDate) parts.push(versionDate);
  return parts.join(", ");
}

/** "client.dll (Counter-Strike 2, Oct 14 2026)", where the declaration is */
function locationText(module: string, gameName: string, context: GameContext): string {
  const inside = context.metadata.versionDate
    ? `${gameName}, ${context.metadata.versionDate}`
    : gameName;
  return `${module}.dll (${inside})`;
}

/** The entity of a class. CEntityInstance (entity2) is the root of both client and server */
function classEntity(d: SchemaClass, lookups: EntityLookups): EntityClass | undefined {
  const entities = lookups.entityByClass.get(declarationKey(d.module, d.name));
  return (
    entities?.find((e) => e.module === d.module) ??
    entities?.find((e) => e.module === "server") ??
    entities?.[0]
  );
}

/** Its keyvalues, inputs and outputs, own and inherited as listed on the page */
function entitySummary(entity: EntityClass, lookups: EntityLookups): string {
  const chain = entityChain(lookups, entity);
  const count = (pick: (e: EntityClass) => Entry[], word: string) => {
    const inherited = buildInheritedGroups(entity, chain, pick);
    let n = pick(entity).length;
    for (const group of inherited) n += group.count;
    return plural(n, word);
  };
  const keys = count((e) => e.keys, "keyvalue");
  const inputs = count((e) => e.inputs, "input");
  const outputs = count((e) => e.outputs, "output");
  return `${entity.designName}: ${keys}, ${inputs}, ${outputs}.`;
}

/**
 * The prefix, the tail, and as many items as fit within the length. "…" stands in for the rest.
 * Returns how many items it listed
 */
function fitList(prefix: string, items: string[], tail: string, maxLength: number) {
  let text = prefix;
  for (let i = 0; i < items.length; i++) {
    const next = i === 0 ? text + items[i] : `${text}, ${items[i]}`;
    if (next.length + tail.length > maxLength) {
      const rest = i === 0 ? "…" : ", …";
      return { text: text + rest + tail, count: i };
    }
    text = next;
  }
  return { text: text + tail, count: items.length };
}

/** Lists the items while they fit, then "and N more" */
function truncateList(prefix: string, items: string[], suffix: string): string {
  let desc = prefix;
  for (let i = 0; i < items.length; i++) {
    const sep = i === 0 ? "" : ", ";
    const next = desc + sep + items[i];
    if (next.length + suffix.length > MAX_DESC_LENGTH) {
      const remaining = items.length - i;
      desc += i === 0 ? `${remaining} more${suffix}` : `, and ${remaining} more${suffix}`;
      return desc;
    }
    desc = next;
  }
  return desc + suffix;
}

/** Field names with their offsets, then the base classes, then the entity when there's room */
function describeClass(d: SchemaClass, gameName: string, context: GameContext): string {
  const isIntrinsic = d.module === INTRINSIC_MODULE;
  const hasOffsets = d.fields.some((f) => f.offset != null);
  const fieldsWord = hasOffsets ? "field offsets" : "fields";
  const location = isIntrinsic
    ? `(Source 2 engine type, ${gameName})`
    : `in ${locationText(d.module, gameName, context)}`;
  const tail = d.parents.length > 0 ? `; extends ${d.parents.map((p) => p.name).join(", ")}.` : ".";

  const entity = isIntrinsic ? undefined : classEntity(d, context);
  const summary = entity?.designName ? entitySummary(entity, context) : null;

  if (d.fields.length === 0) {
    const desc = `${d.name} ${location} has no fields${tail}`;
    return summary ? `${desc} ${summary}` : desc;
  }

  const prefix = `${d.name} ${fieldsWord} ${location}: `;
  const fields = d.fields.map((f) =>
    f.offset != null ? `${f.name} ${formatHexOffset(f.offset)}` : f.name,
  );
  if (summary) {
    const withSummary = fitList(prefix, fields, tail, MAX_DESC_LENGTH - summary.length - 1);
    if (withSummary.count >= Math.min(MIN_FIELDS_WITH_SUMMARY, fields.length)) {
      return `${withSummary.text} ${summary}`;
    }
  }
  return fitList(prefix, fields, tail, MAX_DESC_LENGTH).text;
}

function describeEnum(d: SchemaEnum, gameName: string, context: GameContext): string {
  let prefix = `${d.name} is an enum`;
  if (d.alignment) prefix += ` (${d.alignment})`;
  const location =
    d.module === INTRINSIC_MODULE
      ? `the Source 2 engine (${gameName})`
      : locationText(d.module, gameName, context);
  prefix += ` in ${location} with ${plural(d.members.length, "value")}`;
  if (d.members.length === 0) return `${prefix}.`;
  return truncateList(
    `${prefix}: `,
    d.members.map((m) => m.name),
    ".",
  );
}

export function describeDeclaration(d: Declaration, game: GameId, context: GameContext): string {
  const gameName = getGameDef(game).name;
  if (d.kind === "class") return describeClass(d, gameName, context);
  return describeEnum(d, gameName, context);
}

export function declarationTitle(
  d: Declaration,
  game: GameId,
  context: GameContext,
  linkedDesignName?: string,
): string {
  const { shortName, repo } = getGameDef(game);
  const isIntrinsic = d.module === INTRINSIC_MODULE;
  const where = moduleFile(d.module);
  if (d.kind === "enum") return `${d.name} values - ${shortName} ${where} | ${SITE_SUFFIX}`;

  // The title of an entity class uses the design name that opened the page, or else its first one
  const designName = linkedDesignName ?? context.designNamesByDeclaration.get(d)?.[0];
  if (designName) {
    return `${designName} (${d.name}) - ${shortName} entity keyvalues, inputs & outputs`;
  }
  // Dumps without a GameTracking repository are one-off and have no offsets. The intrinsics do
  const what = repo || isIntrinsic ? "offsets & fields" : "fields";
  return `${d.name} ${what} - ${shortName} ${where} | ${SITE_SUFFIX}`;
}

interface DeclarationCounts {
  classes: number;
  enums: number;
}

function countDeclarations(declarations: Iterable<Declaration>): DeclarationCounts {
  let classes = 0;
  let enums = 0;
  for (const d of declarations) {
    if (d.kind === "class") classes++;
    else enums++;
  }
  return { classes, enums };
}

const gameCountsCache = new WeakMap<GameContext["declarations"], DeclarationCounts>();

/**
 * Counts every declaration of the game, including the intrinsic types, because they have pages
 * too. The result is cached, because the description of the root page counts every game
 */
function countGameDeclarations(context: GameContext): DeclarationCounts {
  let counts = gameCountsCache.get(context.declarations);
  if (!counts) {
    counts = countDeclarations(allDeclarations(context.declarations));
    gameCountsCache.set(context.declarations, counts);
  }
  return counts;
}

function countsText({ classes, enums }: DeclarationCounts): string {
  const classWord = classes === 1 ? "class" : "classes";
  const enumWord = enums === 1 ? "enum" : "enums";
  return `${formatCount(classes)} ${classWord} and ${formatCount(enums)} ${enumWord}`;
}

export function describeGame(game: GameId, context: GameContext): string {
  const def = getGameDef(game);
  const build = buildText(context);
  let desc = `${def.name} schema dump`;
  if (build) desc += ` (${build})`;
  desc += `: ${countsText(countGameDeclarations(context))}`;
  // Dumps without a GameTracking repository are one-off and have no offsets
  if (def.repo) desc += " with field offsets, updated every game update";
  return `${desc}.`;
}

export function describeModule(game: GameId, module: string, context: GameContext): string {
  const def = getGameDef(game);
  const declarations = context.declarations.get(module)?.values() ?? [];
  const counts = countDeclarations(declarations);
  if (module === INTRINSIC_MODULE) {
    const types = counts.classes + counts.enums;
    return `${plural(types, "Source 2 engine type")} that ${def.name} schemas refer to, with their fields and sizes.`;
  }
  const build = buildText(context);
  let desc = `${module}.dll schema dump for ${def.name}`;
  if (build) desc += ` (${build})`;
  desc += `: ${countsText(counts)}`;
  if (def.repo) desc += " with field offsets";
  return `${desc}.`;
}

export function describeRoot(): string {
  const total: DeclarationCounts = { classes: 0, enums: 0 };
  for (const g of GAME_LIST) {
    const counts = countGameDeclarations(getGameContext(g.id));
    total.classes += counts.classes;
    total.enums += counts.enums;
  }
  const gameList = new Intl.ListFormat("en", { type: "conjunction" }).format(
    GAME_LIST.map((g) => g.name),
  );
  return `Valve Source 2 schema dumps for ${gameList}: ${countsText(total)} with field offsets, updated every game update.`;
}
