import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { DeclarationsContext } from "./schema/DeclarationsContext";
import { Declaration } from "../data/types";
import { compareModuleNames } from "../games-list";
import { DeclarationSidebarElement, SidebarGroupHeader, SidebarWrapper } from "./layout/Sidebar";
import { SidebarFilterContext } from "./layout/SidebarFilterContext";
import { SearchInput } from "./search/SearchBox";
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
  return Array.from(map, ([module, items]) => ({ module, items })).sort((a, b) =>
    compareModuleNames(a.module, b.module),
  );
}

const HEADER_HEIGHT = 28;
const HEADER_GAP = 8;
const ITEM_HEIGHT = 28;

export const DeclarationsSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { declarations, game } = useContext(DeclarationsContext);
  const { filter, setFilter } = useContext(SidebarFilterContext);
  const { module: activeModule = "", scope = "" } = useParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const parentRef = useRef<HTMLUListElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeStickyIndexRef = useRef(0);
  const navigatedFromSidebarRef = useRef(false);

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

  const activeIndex = useMemo(() => {
    if (!scope || !activeModule) return -1;
    return rows.findIndex(
      (r) =>
        r.type === "item" && r.declaration.name === scope && r.declaration.module === activeModule,
    );
  }, [rows, scope, activeModule]);

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

  const didHydrationScroll = useRef(false);
  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  const STATIC_COUNT = 50;
  const staticRows = useMemo(() => {
    if (hydrated) return [];
    const center = activeIndex >= 0 ? activeIndex : 0;
    const half = Math.floor(STATIC_COUNT / 2);
    let start = Math.max(0, center - half);
    const end = Math.min(rows.length, start + STATIC_COUNT);
    start = Math.max(0, end - STATIC_COUNT);

    const slice = rows.slice(start, end);

    // If the first row is an item, prepend its group header
    if (slice.length > 0 && slice[0].type === "item") {
      for (let i = start - 1; i >= 0; i--) {
        if (rows[i].type === "header") {
          slice.unshift(rows[i]);
          break;
        }
      }
    }

    return slice;
  }, [hydrated, rows, activeIndex]);

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

  // Scroll to active item on hydration (before paint)
  useLayoutEffect(() => {
    if (!didHydrationScroll.current && hydrated && activeIndex >= 0) {
      didHydrationScroll.current = true;
      virtualizer.scrollToIndex(activeIndex, { align: "center" });
    }
  }, [hydrated, activeIndex, virtualizer]);

  // Scroll to active item on navigation (skip if the click came from the sidebar)
  useEffect(() => {
    if (!scope || !activeModule) return;
    if (navigatedFromSidebarRef.current) {
      navigatedFromSidebarRef.current = false;
      return;
    }
    if (!didHydrationScroll.current) return; // handled by layoutEffect above
    if (activeIndex >= 0) {
      virtualizer.scrollToIndex(activeIndex, { align: "center" });
    }
    // Reset wrapper scroll in case the browser scrolled it
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = 0;
    }
  }, [activeModule, scope, activeIndex, virtualizer]);

  const handleSidebarNavigate = useCallback(() => {
    navigatedFromSidebarRef.current = true;
    onNavigate?.();
  }, [onNavigate]);

  return (
    <SidebarWrapper ref={wrapperRef} aria-label="Classes and enums">
      <SidebarHeader>
        <SidebarBrandRow>
          <SidebarBrand href="https://s2v.app/">
            <S2VLogo />
            Source 2 Viewer
          </SidebarBrand>
          <GameSwitcher currentGame={game} />
        </SidebarBrandRow>
        <SidebarSearchInput
          type="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter classes and enums"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </SidebarHeader>
      {hydrated ? (
        <SidebarList ref={parentRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isHeader = row.type === "header";
              const isActiveSticky = activeStickyIndexRef.current === virtualRow.index;

              return (
                <li
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
                    <DeclarationSidebarElement
                      declaration={row.declaration}
                      onClick={handleSidebarNavigate}
                    />
                  )}
                </li>
              );
            })}
          </div>
        </SidebarList>
      ) : (
        <SidebarList>
          {staticRows.map((row, i) => {
            if (row.type === "header") {
              return (
                <li
                  key={`h-${row.module}`}
                  style={{
                    height: HEADER_HEIGHT + (i > 0 ? HEADER_GAP : 0),
                    paddingTop: i > 0 ? HEADER_GAP : 0,
                  }}
                >
                  <SidebarGroupHeader>
                    {row.module} ({row.count})
                  </SidebarGroupHeader>
                </li>
              );
            }
            return (
              <li key={`${row.declaration.module}-${row.declaration.name}`}>
                <DeclarationSidebarElement declaration={row.declaration} />
              </li>
            );
          })}
        </SidebarList>
      )}
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

const SidebarList = styled.ul`
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
`;
