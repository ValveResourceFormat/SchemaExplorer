import { createContext } from "react";
import type { ShowFilter } from "../../data/show-filters";
import type { SearchResult } from "../../utils/search-types";

/**
 * The sidebar's show filter, and the page's search result after the filter narrows it. The
 * sidebar's list and the results list both show that result. `shown` is null without a search
 */
export interface ShowFilterState {
  show: ShowFilter;
  shown: SearchResult | null;
}

export const ShowFilterContext = createContext<ShowFilterState>({ show: "all", shown: null });
