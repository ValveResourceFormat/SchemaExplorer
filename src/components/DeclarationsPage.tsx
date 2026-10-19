import { useContext, useMemo, useState } from "react";
import { DeclarationsContext, type GameContext } from "./schema/DeclarationsContext";
import { DeclarationsShow, DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./schema/ContentList";
import { ShowFilterContext } from "./schema/ShowFilterContext";
import { PageProviders, PageShell } from "./layout/PageShell";
import { SearchResultContext } from "./search/SearchResultContext";
import type { ShowFilter } from "../data/show-filters";
import { filterSearchResult } from "../utils/search";

export default function DeclarationsPage({ context }: { context: GameContext }) {
  return (
    <PageProviders context={context} section="schemas">
      <DeclarationsLayout />
    </PageProviders>
  );
}

function DeclarationsLayout() {
  const context = useContext(DeclarationsContext);
  const { result } = useContext(SearchResultContext);
  // Stays on while browsing, and when switching to another game
  const [show, setShow] = useState<ShowFilter>("all");

  // Narrowed once for the sidebar's list and the results list
  const showState = useMemo(() => {
    const shown = result && filterSearchResult(result, show, context);
    return { show, shown };
  }, [result, show, context]);

  const count = result ? result.declarations.size.toLocaleString("en-US") : undefined;

  return (
    <ShowFilterContext.Provider value={showState}>
      <PageShell
        section="schemas"
        count={count}
        show={<DeclarationsShow setShow={setShow} />}
        sidebar={({ onNavigate }) => <DeclarationsSidebar onNavigate={onNavigate} />}
      >
        <ContentList />
      </PageShell>
    </ShowFilterContext.Provider>
  );
}
