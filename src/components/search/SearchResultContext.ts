import { createContext, useDeferredValue, useMemo } from "react";
import type { GameContext } from "../../data/derived";
import { parseSearch, type ParsedSearch } from "../../utils/filtering";
import { searchSchemas } from "../../utils/search";
import type { SearchResult } from "../../utils/search-types";
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
 * Searches the game's schemas once for the page. Typing does not wait for the search. The ConVars
 * page lists the schemas' results only as a link to them. A search with filters of the ConVars
 * alone does not get that link, so the page leaves the schemas' results out then. The ConVars
 * page has no use for similar names either
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
