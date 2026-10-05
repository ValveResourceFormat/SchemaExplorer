import { useContext, useState } from "react";
import { DeclarationsContext, type GameContext } from "./schema/DeclarationsContext";
import { DeclarationsShow, DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./schema/ContentList";
import { PageProviders, PageShell } from "./layout/PageShell";
import { formatSectionCount } from "./search/useOtherSection";
import { useFilteredData } from "../utils/filtering";
import type { ShowFilter } from "../data/show-filters";

export default function DeclarationsPage({ context }: { context: GameContext }) {
  return (
    <PageProviders context={context}>
      <DeclarationsLayout />
    </PageProviders>
  );
}

function DeclarationsLayout() {
  const filtered = useFilteredData(useContext(DeclarationsContext));
  const { data, isSearching } = filtered;
  // Stays on while browsing, and when switching to another game
  const [show, setShow] = useState<ShowFilter>("all");

  return (
    <PageShell
      section="schemas"
      count={isSearching ? formatSectionCount(data.length, "schemas") : undefined}
      show={<DeclarationsShow show={show} setShow={setShow} />}
      sidebar={({ onNavigate, sidebarOpen }) => (
        <DeclarationsSidebar show={show} onNavigate={onNavigate} sidebarOpen={sidebarOpen} />
      )}
    >
      <ContentList filtered={filtered} />
    </PageShell>
  );
}
