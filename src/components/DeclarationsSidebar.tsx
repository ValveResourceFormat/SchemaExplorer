import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { styled } from "@linaria/react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { DeclarationsContext } from "./Docs/DeclarationsContext";
import { Declaration } from "./Docs/api";
import { DeclarationSidebarElement, SidebarGroupHeader, SidebarWrapper } from "./layout/Sidebar";
import { SidebarFilterContext } from "./layout/SidebarFilterContext";
import { SearchInput } from "./Search";
import { GameSwitcher, S2VLogo } from "./layout/NavBar";

type SidebarRow =
  | { type: "header"; module: string; count: number }
  | { type: "item"; declaration: Declaration };

interface ModuleGroup {
  module: string;
  items: Declaration[];
}

function groupByModule(declarations: Declaration[]): ModuleGroup[] {
  const map = new Map<string, Declaration[]>();
  for (const d of declarations) {
    let items = map.get(d.module);
    if (!items) {
      items = [];
      map.set(d.module, items);
    }
    items.push(d);
  }
  const priority = ["client", "server"];
  return Array.from(map, ([module, items]) => ({ module, items })).sort((a, b) => {
    const ai = priority.indexOf(a.module);
    const bi = priority.indexOf(b.module);
    if (ai !== bi) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    return a.module.localeCompare(b.module);
  });
}

const HEADER_HEIGHT = 28;
const HEADER_GAP = 8;
const ITEM_HEIGHT = 28;

export const DeclarationsSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { declarations } = useContext(DeclarationsContext);
  const { filter, setFilter } = useContext(SidebarFilterContext);
  const { module: activeModule = "", scope = "" } = useParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const parentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeStickyIndexRef = useRef(0);

  const groups = useMemo(() => {
    let filtered = declarations;
    if (filter) {
      const lower = filter.toLowerCase();
      filtered = declarations.filter((d) => d.name.toLowerCase().includes(lower));
    }
    return groupByModule(filtered);
  }, [declarations, filter]);

  const rows = useMemo(() => {
    const result: SidebarRow[] = [];
    for (const g of groups) {
      result.push({ type: "header", module: g.module, count: g.items.length });
      if (!collapsed.has(g.module)) {
        for (const d of g.items) {
          result.push({ type: "item", declaration: d });
        }
      }
    }
    return result;
  }, [groups, collapsed]);

  const stickyIndexes = useMemo(
    () =>
      rows.reduce<number[]>((acc, row, i) => {
        if (row.type === "header") acc.push(i);
        return acc;
      }, []),
    [rows],
  );

  const rangeExtractor = useCallback(
    (range: Range) => {
      let active = 0;
      for (let i = stickyIndexes.length - 1; i >= 0; i--) {
        if (range.startIndex >= stickyIndexes[i]) {
          active = stickyIndexes[i];
          break;
        }
      }
      activeStickyIndexRef.current = active;

      const next = new Set([active, ...defaultRangeExtractor(range)]);

      return [...next].sort((a, b) => a - b);
    },
    [stickyIndexes],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (rows[index].type === "header") {
        return HEADER_HEIGHT + (index > 0 ? HEADER_GAP : 0);
      }
      return ITEM_HEIGHT;
    },
    overscan: 20,
    rangeExtractor,
  });

  const toggleModule = useCallback((module: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  }, []);

  // Auto-expand collapsed module when navigating to one of its items
  useEffect(() => {
    if (!scope || !activeModule) return;
    setCollapsed((prev) => {
      if (prev.has(activeModule)) {
        const next = new Set(prev);
        next.delete(activeModule);
        return next;
      }
      return prev;
    });
  }, [activeModule, scope]);

  // Scroll to active item on navigation
  useEffect(() => {
    if (!scope || !activeModule) return;
    const idx = rows.findIndex(
      (r) =>
        r.type === "item" && r.declaration.name === scope && r.declaration.module === activeModule,
    );
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: "center" });
    }
    // Reset wrapper scroll in case the browser scrolled it
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = 0;
    }
  }, [activeModule, scope, rows, virtualizer]);

  const { game } = useContext(DeclarationsContext);

  return (
    <SidebarWrapper ref={wrapperRef}>
      <SidebarHeader>
        <SidebarBrandRow>
          <SidebarBrand href="https://s2v.app/">
            <S2VLogo />
            Source 2 Viewer
          </SidebarBrand>
          {game && <GameSwitcher currentGame={game} />}
        </SidebarBrandRow>
        <SidebarSearchInput
          type="search"
          placeholder="Filter sidebar..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter sidebar"
        />
      </SidebarHeader>
      <div ref={parentRef} style={{ flex: 1, overflow: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const isHeader = row.type === "header";
            const isActiveSticky = activeStickyIndexRef.current === virtualRow.index;

            return (
              <div
                key={virtualRow.key}
                style={{
                  ...(isActiveSticky
                    ? { position: "sticky", zIndex: 1 }
                    : { position: "absolute", transform: `translateY(${virtualRow.start}px)` }),
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                }}
              >
                {isHeader ? (
                  <div
                    style={{
                      paddingTop: virtualRow.index > 0 && !isActiveSticky ? HEADER_GAP : 0,
                      background: "inherit",
                    }}
                  >
                    <SidebarGroupHeader
                      data-collapsed={collapsed.has(row.module) || undefined}
                      onClick={() => toggleModule(row.module)}
                    >
                      {row.module} ({row.count})
                    </SidebarGroupHeader>
                  </div>
                ) : (
                  <DeclarationSidebarElement declaration={row.declaration} onClick={onNavigate} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SidebarWrapper>
  );
};

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  flex-shrink: 0;
`;

const SidebarBrandRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SidebarBrand = styled.a`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 16px;
  text-decoration: none;
  color: var(--text);
  white-space: nowrap;
`;

const SidebarSearchInput = styled(SearchInput)`
  background: var(--background);
`;
