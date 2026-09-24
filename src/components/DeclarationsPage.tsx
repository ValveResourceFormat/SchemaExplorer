import { type GameContext } from "./schema/DeclarationsContext";
import { DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./schema/ContentList";
import { PageProviders, PageShell } from "./layout/PageShell";

export default function DeclarationsPage({ context }: { context: GameContext }) {
  return (
    <PageProviders context={context}>
      <PageShell
        section="schemas"
        sidebar={({ onNavigate, sidebarOpen }) => (
          <DeclarationsSidebar onNavigate={onNavigate} sidebarOpen={sidebarOpen} />
        )}
      >
        <ContentList />
      </PageShell>
    </PageProviders>
  );
}
