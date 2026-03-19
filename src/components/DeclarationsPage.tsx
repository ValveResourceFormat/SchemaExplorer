import React, { useCallback, useEffect, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import { DeclarationsContext, DeclarationsContextType } from "./schema/DeclarationsContext";
import { DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./schema/ContentList";
import { SidebarFilterContext } from "./layout/SidebarFilterContext";
import { SearchContext } from "./search/SearchContext";
import { useHashParam } from "../utils/filtering";
import { NavBar } from "./layout/NavBar";

export default function DeclarationsPage({ context }: { context: DeclarationsContextType }) {
  const [filter, setFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const search = useHashParam("search") ?? "";

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      const mainSearch = document.getElementById("main-search");
      const sidebarFilter = document.getElementById("sidebar-filter");

      if (active === mainSearch) {
        e.preventDefault();
        sidebarFilter?.focus();
      } else if (active === sidebarFilter) {
        // Explicit check before the HTMLInputElement guard below,
        // otherwise "/" would just type into the filter input.
        e.preventDefault();
        mainSearch?.focus();
      } else if (!(active instanceof HTMLInputElement)) {
        e.preventDefault();
        mainSearch?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  const searchCtx = useMemo(() => ({ search }), [search]);
  const filterCtx = useMemo(() => ({ filter, setFilter }), [filter]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  return (
    <DeclarationsContext.Provider value={context}>
      <SearchContext.Provider value={searchCtx}>
        <SidebarFilterContext.Provider value={filterCtx}>
          <PageGrid>
            <MobileSidebarOverlay data-open={sidebarOpen || undefined} onClick={closeSidebar} />
            <SidebarPanel data-open={sidebarOpen || undefined}>
              <DeclarationsSidebar onNavigate={closeSidebar} sidebarOpen={sidebarOpen} />
            </SidebarPanel>
            <ContentColumn>
              <NavBar onMenuClick={openSidebar} />
              <ContentList />
            </ContentColumn>
          </PageGrid>
        </SidebarFilterContext.Provider>
      </SearchContext.Provider>
    </DeclarationsContext.Provider>
  );
}

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
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
