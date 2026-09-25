import type { ConsoleItem } from "../data/types";
import { fuzzyScore } from "./filtering";
import { countBy } from "./collections";

export type ConsoleKind = "all" | "convars" | "commands";

/** Tags that have filter chips */
export type FilterTag = "module:" | "flag:";

export type TagState = "off" | "include" | "exclude";

export interface ParsedConsoleSearch {
  nameWords: string[];
  modules: string[];
  notModules: string[];
  types: string[];
  notTypes: string[];
  flags: string[];
  notFlags: string[];
}

const CONSOLE_TAGS = ["module:", "type:", "flag:"] as const;

function isConsoleFilterWord(word: string): boolean {
  const w = word.startsWith("-") ? word.slice(1) : word;
  return CONSOLE_TAGS.some((t) => w.startsWith(t));
}

export function parseConsoleSearch(search: string): ParsedConsoleSearch {
  const parsed: ParsedConsoleSearch = {
    nameWords: [],
    modules: [],
    notModules: [],
    types: [],
    notTypes: [],
    flags: [],
    notFlags: [],
  };

  for (const word of search.toLowerCase().split(" ")) {
    if (!word) continue;
    const negated = word.startsWith("-") && isConsoleFilterWord(word);
    const w = negated ? word.slice(1) : word;
    const colon = w.indexOf(":");
    const tag = colon >= 0 ? w.slice(0, colon + 1) : "";
    const value = w.slice(colon + 1);

    if (tag === "module:") {
      if (value) (negated ? parsed.notModules : parsed.modules).push(value);
    } else if (tag === "flag:") {
      if (value) (negated ? parsed.notFlags : parsed.flags).push(value);
    } else if (tag === "type:") {
      if (value) (negated ? parsed.notTypes : parsed.types).push(value);
    } else {
      parsed.nameWords.push(word);
    }
  }

  return parsed;
}

/** Keys most used first, then by name */
function keysByCount(counts: Map<string, number>): string[] {
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : 1));
}

/** Every module, flag and value type with its item count, and the keys most used first */
export interface ConsoleStats {
  modules: Map<string, number>;
  flags: Map<string, number>;
  types: Map<string, number>;
  sorted: { modules: string[]; flags: string[]; types: string[] };
  convars: number;
  commands: number;
}

const statsCache = new WeakMap<ConsoleItem[], ConsoleStats>();

/** Cached per game, the item list is built once when the schemas are loaded */
export function getConsoleStats(items: ConsoleItem[]): ConsoleStats {
  let stats = statsCache.get(items);
  if (stats) return stats;
  const convars = items.filter((i) => i.kind === "convar").length;
  const modules = countBy(items, (i) => i.modules);
  const flags = countBy(items, (i) => i.flags);
  const types = countBy(items, (i) => (i.kind === "convar" ? [i.type] : []));
  stats = {
    modules,
    flags,
    types,
    sorted: { modules: keysByCount(modules), flags: keysByCount(flags), types: keysByCount(types) },
    convars,
    commands: items.length - convars,
  };
  statsCache.set(items, stats);
  return stats;
}

type Predicate = (value: string) => boolean;

/**
 * A tag value matches exactly when it is a known name, so module:client does not also
 * match panoramauiclient, otherwise as a substring while it's still being typed.
 */
function valuePredicates(values: string[], known: Map<string, number>): Predicate[] {
  return values.map((v): Predicate => (known.has(v) ? (x) => x === v : (x) => x.includes(v)));
}

/** module: (any of) and -module: (none of), or null without module filters */
export function moduleFilter(
  parsed: ParsedConsoleSearch,
  stats: ConsoleStats,
): ((item: ConsoleItem) => boolean) | null {
  const include = valuePredicates(parsed.modules, stats.modules);
  const exclude = valuePredicates(parsed.notModules, stats.modules);
  if (include.length === 0 && exclude.length === 0) return null;
  return (item) =>
    (include.length === 0 || item.modules.some((m) => include.some((p) => p(m)))) &&
    !item.modules.some((m) => exclude.some((p) => p(m)));
}

export interface ConsoleFilterOptions {
  kind?: ConsoleKind;
  /** Skip module:/-module: filters, for per-module chip counts */
  ignoreModules?: boolean;
  /** Lowercase names to leave out, like the ones other games have too */
  hideNames?: ReadonlySet<string>;
}

export function filterConsoleItems(
  items: ConsoleItem[],
  parsed: ParsedConsoleSearch,
  { kind = "all", ignoreModules = false, hideNames }: ConsoleFilterOptions = {},
): ConsoleItem[] {
  const stats = getConsoleStats(items);
  const { nameWords } = parsed;
  const types = valuePredicates(parsed.types, stats.types);
  const notTypes = valuePredicates(parsed.notTypes, stats.types);
  const flags = valuePredicates(parsed.flags, stats.flags);
  const notFlags = valuePredicates(parsed.notFlags, stats.flags);
  const matchesModules = ignoreModules ? null : moduleFilter(parsed, stats);

  const results: { item: ConsoleItem; score: number }[] = [];

  for (const item of items) {
    if (kind === "convars" && item.kind !== "convar") continue;
    if (kind === "commands" && item.kind !== "command") continue;
    if (hideNames?.has(item.name.toLowerCase())) continue;

    if (types.length > 0 && (item.kind !== "convar" || !types.some((p) => p(item.type)))) continue;
    // Commands have no type, -type: only hides convars
    if (item.kind === "convar" && notTypes.some((p) => p(item.type))) continue;
    if (matchesModules && !matchesModules(item)) continue;
    // Every flag: must be on the item, no -flag: may be
    if (flags.length > 0 && !flags.every((p) => item.flags.some(p))) continue;
    if (notFlags.length > 0 && item.flags.some((x) => notFlags.some((p) => p(x)))) continue;

    let score = 0;
    let matched = true;
    for (const w of nameWords) {
      const s = fuzzyScore(w, item.name);
      if (s === null) {
        matched = false;
        break;
      }
      score += s;
    }
    if (!matched) continue;

    results.push({ item, score });
  }

  // Items are already sorted by name, and the sort is stable
  if (nameWords.length > 0) results.sort((a, b) => a.score - b.score);

  return results.map((r) => r.item);
}

/** Parsed search with one flag's own include/exclude lifted, every other filter untouched */
export function withoutFlag(parsed: ParsedConsoleSearch, flag: string): ParsedConsoleSearch {
  if (!parsed.flags.includes(flag) && !parsed.notFlags.includes(flag)) return parsed;
  return {
    ...parsed,
    flags: parsed.flags.filter((f) => f !== flag),
    notFlags: parsed.notFlags.filter((f) => f !== flag),
  };
}

/** Adds, removes or negates a tag:value word in a search string */
export function setSearchTag(search: string, tag: string, value: string, state: TagState): string {
  const lowerValue = value.toLowerCase();
  const words = search
    .split(" ")
    .filter((w) => {
      const lower = w.toLowerCase();
      return lower !== `${tag}${lowerValue}` && lower !== `-${tag}${lowerValue}`;
    })
    .filter(Boolean);
  if (state === "include") words.push(`${tag}${value}`);
  else if (state === "exclude") words.push(`-${tag}${value}`);
  return words.join(" ");
}

/** Removes every module:, flag: and type: tag, keeping the name words */
export function stripConsoleFilters(search: string): string {
  return search
    .split(" ")
    .filter((w) => w && !isConsoleFilterWord(w.toLowerCase()))
    .join(" ");
}

export function getTagState(parsed: ParsedConsoleSearch, tag: FilterTag, value: string): TagState {
  const lower = value.toLowerCase();
  const [include, exclude] =
    tag === "module:" ? [parsed.modules, parsed.notModules] : [parsed.flags, parsed.notFlags];
  if (include.includes(lower)) return "include";
  if (exclude.includes(lower)) return "exclude";
  return "off";
}

// Flag chips cycle off → include → exclude, module chips only toggle
const NEXT_TAG_STATE: Record<FilterTag, Record<TagState, TagState>> = {
  "flag:": { off: "include", include: "exclude", exclude: "off" },
  "module:": { off: "include", include: "off", exclude: "off" },
};

export function nextTagState(tag: FilterTag, state: TagState): TagState {
  return NEXT_TAG_STATE[tag][state];
}
