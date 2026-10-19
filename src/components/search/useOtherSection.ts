import { createContext, useContext, useMemo } from "react";
import type { GameContext } from "../../data/derived";
import { buildHash } from "../../utils/filtering";
import { parseConsoleSearch, searchConsoleResults } from "../../utils/console-filtering";
import {
  betterMatches,
  searchForSection,
  type SearchMode,
  type SectionItems,
  type SectionResults,
} from "../../utils/section-search";
import { DeclarationsContext, sectionPath } from "../schema/DeclarationsContext";
import { SearchContext } from "./SearchContext";
import { SearchResultContext, type PageSearch } from "./SearchResultContext";

export const SECTIONS = {
  schemas: { label: "Schemas", icon: "class" },
  console: { label: "ConVars & Commands", icon: "convar" },
} as const satisfies Record<SearchMode, { label: string; icon: string }>;

/**
 * The other section's results for the page's search. The schemas' are the page's own search
 * result, which is for the same search when nothing was dropped from it
 */
function searchOtherSection(
  context: GameContext,
  section: SearchMode,
  pageSearch: PageSearch,
): SectionResults | null {
  const { search: query, complete } = searchForSection(pageSearch.query, section);
  if (!query || !complete || context.consoleItems.length === 0) return null;

  if (section === "console") {
    const parsed = parseConsoleSearch(query);
    const items = searchConsoleResults(context.consoleItems, parsed);
    return { section, items, words: parsed.nameWords };
  }
  if (!pageSearch.result) return null;
  return { section, result: pageSearch.result, words: pageSearch.parsed.nameWords };
}

/** Everything a section lists without a search */
export function sectionTotal(context: GameContext, section: SearchMode): number {
  if (section === "console") return context.consoleItems.length;
  let total = 0;
  for (const moduleMap of context.declarations.values()) total += moduleMap.size;
  return total;
}

export type OtherSection = ReturnType<typeof useOtherSection>;

/**
 * The other section with the current search carried over, and its results there. They are
 * null without a search, or when the search uses filters only this section has. `count` is
 * how many results the other section lists
 */
export function useOtherSection(section: SearchMode) {
  const context = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const pageSearch = useContext(SearchResultContext);
  const other: SearchMode = section === "schemas" ? "console" : "schemas";

  const carried = searchForSection(search, other).search;
  const to = useMemo(
    () => ({ pathname: sectionPath(context.game, other), hash: buildHash({ search: carried }) }),
    [context.game, other, carried],
  );

  const results = useMemo(
    () => searchOtherSection(context, other, pageSearch),
    [context, other, pageSearch],
  );

  let count: number | null = null;
  if (results) {
    count = results.section === "schemas" ? results.result.declarations.size : results.items.length;
  }

  return useMemo(() => ({ section: other, to, results, count }), [other, to, results, count]);
}

/** The page's useOtherSection, computed once for the sidebar and the results */
export const OtherSectionContext = createContext<OtherSection | null>(null);

/**
 * The other section's results that match better than this section's `own`, and how many results
 * it has in all. Null without any results there
 */
export function useBetterMatches(own: SectionItems | null) {
  const { designNamesByDeclaration } = useContext(DeclarationsContext);
  const { results, count } = useContext(OtherSectionContext)!;
  return useMemo(() => {
    if (!results || !own || count === null || count === 0) return null;
    const better = betterMatches({ designNamesByDeclaration }, own, results);
    return { better, count };
  }, [designNamesByDeclaration, own, results, count]);
}
