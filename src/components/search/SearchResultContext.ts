import { createContext, useDeferredValue, useMemo } from "react";
import type { GameContext } from "../../data/derived";
import { parseSearch, type ParsedSearch } from "../../utils/filtering";
import { searchSchemas, type SearchResult } from "../../utils/search";
import { searchForSection, type SearchMode } from "../../utils/section-search";

/** The page's schema search and what it was computed for */
export interface PageSearch {
  /** The search text the result is for, which trails the typed text while the result is computed */
  query: string;
  parsed: ParsedSearch;
  /** Null without a search, and when the page has no use for it */
  result: SearchResult | null;
}

export const SearchResultContext = createContext<PageSearch>({
  query: "",
  parsed: parseSearch(""),
  result: null,
});

/**
 * Searches the game's schemas once for the page. Typing doesn't wait on it. The ConVars page only
 * lists the schemas' results as a link to them, which a search with filters of the ConVars
 * alone doesn't get, so it leaves them out then. It has no use for similar names either
 */
export function useSearchResult(
  context: GameContext,
  search: string,
  section: SearchMode,
): PageSearch {
  const query = useDeferredValue(search);
  return useMemo(() => {
    const parsed = parseSearch(query);
    const needed = section === "schemas" || searchForSection(query, "schemas").complete;
    if (!query || !needed) return { query, parsed, result: null };
    const result = searchSchemas(context, parsed, { similar: section === "schemas" });
    return { query, parsed, result };
  }, [context, query, section]);
}
