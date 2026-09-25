import type { GameContext } from "../data/derived";
import type { ConsoleItem, Declaration } from "../data/types";
import { isFilterPrefix, nameMatchTier } from "./filtering";
import { isConsoleFilterWord } from "./console-filtering";

export type SearchMode = "schemas" | "console";

/**
 * The search as a section understands it, the other section's filter tags dropped.
 * `complete` is false when something was dropped, its results aren't for the same search then
 */
export function searchForSection(
  search: string,
  section: SearchMode,
): { search: string; complete: boolean } {
  const words = search.split(" ").filter(Boolean);
  const kept = words.filter((word) => {
    const lower = word.toLowerCase();
    const schemaTag = isFilterPrefix(lower);
    const consoleTag = isConsoleFilterWord(lower);
    if (!schemaTag && !consoleTag) return true;
    return section === "schemas" ? schemaTag : consoleTag;
  });
  return { search: kept.join(" "), complete: kept.length === words.length };
}

type Lookups = Pick<GameContext, "declarations" | "designNamesByDeclaration">;

/** A result's name, and for a class its entities' design names, which the search matches too */
function resultNames(lookups: Lookups, result: Declaration | ConsoleItem): string[] {
  if (result.kind === "convar" || result.kind === "command") return [result.name];
  // Search results are copies with only the matching fields, the lookups have the original
  const original = lookups.declarations.get(result.module)?.get(result.name);
  const designNames = original && lookups.designNamesByDeclaration.get(original);
  return designNames ? [result.name, ...designNames] : [result.name];
}

/** A section's search results, and the name words they were matched by */
export type SectionResults =
  | { section: "console"; items: ConsoleItem[]; words: string[] }
  | { section: "schemas"; items: Declaration[]; words: string[] };

const MAX_BETTER_MATCHES = 5;
/** This section's first results, the best of which the other section's have to beat */
const OWN_COMPARED = 5;
/** Results are ranked by their summed score, so a better tier can sit a little further down */
const OTHER_SCANNED = 50;

/**
 * The other section's results that match by name better than any of this section's first
 * results, like the sv_cheats convar when searching schemas. Any result is better than none
 */
export function betterMatches(
  lookups: Lookups,
  own: readonly (Declaration | ConsoleItem)[],
  other: SectionResults,
): SectionResults {
  const { words } = other;
  const tierOf = (result: Declaration | ConsoleItem) =>
    nameMatchTier(resultNames(lookups, result), words);

  const better: (Declaration | ConsoleItem)[] = [];
  if (words.length > 0) {
    // Worse than any tier, when there are no own results
    let ownTier = Infinity;
    for (const result of own.slice(0, OWN_COMPARED)) ownTier = Math.min(ownTier, tierOf(result));
    for (const result of other.items.slice(0, OTHER_SCANNED)) {
      if (better.length === MAX_BETTER_MATCHES) break;
      if (tierOf(result) < ownTier) better.push(result);
    }
  }
  // Only other's own items, so they keep its section's type
  return { ...other, items: better } as SectionResults;
}
