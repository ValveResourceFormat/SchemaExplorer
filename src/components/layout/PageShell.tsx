import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@linaria/react";
import { NavBar } from "./NavBar";
import type { SearchMode } from "../../utils/section-search";
import { SearchContext } from "../search/SearchContext";
import { OtherSectionContext, useOtherSection } from "../search/useOtherSection";
import { DeclarationsContext, type GameContext } from "../schema/DeclarationsContext";
import { useHashParam } from "../../utils/filtering";
import { closeOnEscape } from "../useDismiss";

/** The game's data and the #search= text, for everything on a page */
export function PageProviders({
  context,
  children,
}: {
  context: GameContext;
  children: React.ReactNode;
}) {
  const search = useHashParam("search") ?? "";
  const searchCtx = useMemo(() => ({ search }), [search]);
  return (
    <DeclarationsContext.Provider value={context}>
      <SearchContext.Provider value={searchCtx}>{children}</SearchContext.Provider>
    </DeclarationsContext.Provider>
  );
}

/**
 * Sidebar on the left, navbar and content on the right. On mobile the sidebar
 * becomes a drawer opened from the navbar menu button.
 */
export function PageShell({
  section,
  sidebar,
  children,
}: {
  section: SearchMode;
  sidebar: (drawer: { onNavigate: () => void; sidebarOpen: boolean }) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const otherSection = useOtherSection(section);

  // While the mobile drawer is open, arm a CloseWatcher so the back gesture,
  // Escape, and other close requests dismiss it instead of navigating away.
  // Focus moves into the drawer and back to where it was when it closes.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    let watcher: CloseWatcher | undefined;
    const onKeyDown = closeOnEscape(closeSidebar);
    if (typeof CloseWatcher !== "undefined") {
      watcher = new CloseWatcher();
      watcher.onclose = closeSidebar;
    } else {
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      watcher?.destroy();
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [sidebarOpen, closeSidebar]);

  return (
    <OtherSectionContext.Provider value={otherSection}>
      <PageGrid>
        <MobileSidebarOverlay data-open={sidebarOpen || undefined} onClick={closeSidebar} />
        <SidebarPanel
          ref={panelRef}
          data-open={sidebarOpen || undefined}
          tabIndex={sidebarOpen ? -1 : undefined}
          role={sidebarOpen ? "dialog" : undefined}
          aria-modal={sidebarOpen || undefined}
          aria-label={sidebarOpen ? "Sidebar" : undefined}
        >
          {sidebar({ onNavigate: closeSidebar, sidebarOpen })}
        </SidebarPanel>
        <ContentColumn>
          <NavBar onMenuClick={openSidebar} section={section} />
          {children}
        </ContentColumn>
      </PageGrid>
    </OtherSectionContext.Provider>
  );
}

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding-right: 32px;

  @media (max-width: 768px) {
    padding: 0 8px;
  }
`;

const MobileSidebarOverlay = styled.div`
  display: none;

  @media (max-width: 768px) {
    &[data-open] {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 300;
    }
  }
`;

const SidebarPanel = styled.div`
  display: contents;

  &:focus {
    outline: none;
  }

  @media (max-width: 768px) {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    z-index: 301;
    background: var(--sidebar);

    &[data-open] {
      display: flex;
    }
  }
`;

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: 372px 1fr;
  min-height: 100dvh;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;
