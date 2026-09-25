import { useContext } from "react";
import { DeclarationsContext, type GameContext } from "./schema/DeclarationsContext";
import { DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./schema/ContentList";
import { PageProviders, PageShell } from "./layout/PageShell";
import { formatSectionCount } from "./search/useOtherSection";
import { useFilteredData } from "../utils/filtering";

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

  return (
    <PageShell
      section="schemas"
      count={isSearching ? formatSectionCount(data.length, "schemas") : undefined}
      sidebar={({ onNavigate, sidebarOpen }) => (
        <DeclarationsSidebar onNavigate={onNavigate} sidebarOpen={sidebarOpen} />
      )}
    >
      <ContentList filtered={filtered} />
    </PageShell>
  );
}
