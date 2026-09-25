import { createContext, useContext, useDeferredValue, useMemo } from "react";
import { allDeclarations, type GameContext } from "../../data/derived";
import {
  MAX_SEARCH_RESULTS,
  buildHash,
  parseSearch,
  searchDeclarations,
} from "../../utils/filtering";
import { filterConsoleItems, parseConsoleSearch } from "../../utils/console-filtering";
import { searchForSection, type SearchMode, type SectionResults } from "../../utils/section-search";
import { DeclarationsContext, sectionPath } from "../schema/DeclarationsContext";
import { SearchContext } from "./SearchContext";

export const SECTIONS = {
  schemas: { label: "Schemas", icon: "class" },
  console: { label: "ConVars & Commands", icon: "convar" },
} as const satisfies Record<SearchMode, { label: string; icon: string }>;

function searchOtherSection(
  context: GameContext,
  section: SearchMode,
  search: string,
): SectionResults | null {
  const { search: query, complete } = searchForSection(search, section);
  if (!query || !complete || context.consoleItems.length === 0) return null;

  if (section === "console") {
    const parsed = parseConsoleSearch(query);
    const items = filterConsoleItems(context.consoleItems, parsed);
    return { section, items, words: parsed.nameWords };
  }
  const parsed = parseSearch(query);
  const items = searchDeclarations(allDeclarations(context.declarations), parsed, context);
  return { section, items, words: parsed.nameWords };
}

/** Everything a section lists without a search */
export function sectionTotal(context: GameContext, section: SearchMode): number {
  if (section === "console") return context.consoleItems.length;
  let total = 0;
  for (const moduleMap of context.declarations.values()) total += moduleMap.size;
  return total;
}

/** A section's result count, a schema search stops at MAX_SEARCH_RESULTS */
export function formatSectionCount(count: number, section?: SearchMode): string {
  return section === "schemas" && count >= MAX_SEARCH_RESULTS
    ? `${MAX_SEARCH_RESULTS}+`
    : count.toLocaleString("en-US");
}

export type OtherSection = ReturnType<typeof useOtherSection>;

/**
 * The other section with the current search carried over, and its results there. They are
 * null without a search, or when the search uses filters only this section has
 */
export function useOtherSection(section: SearchMode) {
  const context = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const other: SearchMode = section === "schemas" ? "console" : "schemas";

  const carried = searchForSection(search, other).search;
  const to = useMemo(
    () => ({ pathname: sectionPath(context.game, other), hash: buildHash({ search: carried }) }),
    [context.game, other, carried],
  );

  // This runs the other section's whole search, typing shouldn't wait on it
  const deferredSearch = useDeferredValue(search);
  const results = useMemo(
    () => searchOtherSection(context, other, deferredSearch),
    [context, other, deferredSearch],
  );

  return useMemo(() => ({ section: other, to, results }), [other, to, results]);
}

/** The page's useOtherSection, computed once for the sidebar and the results */
export const OtherSectionContext = createContext<OtherSection | null>(null);
