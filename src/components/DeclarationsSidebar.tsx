import {
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

const ROW_HEIGHT = 28;
const STATIC_BEFORE = 19;
const STATIC_AFTER = 60;

export const DeclarationsSidebar = ({
  onNavigate,
  sidebarOpen,
}: {
  onNavigate?: () => void;
  sidebarOpen?: boolean;
}) => {
  const { declarations, game } = useContext(DeclarationsContext);
  const { filter, setFilter } = useContext(SidebarFilterContext);
  const { module: activeModule = "", scope = "" } = useParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeStickyIndexRef = useRef(0);
  const navigatedFromSidebarRef = useRef(false);
  const isInitialMount = useRef(true);

  const groups = useMemo(() => {
    let filtered = declarations;
    if (filter) {
      const lower = filter.toLowerCase();
      filtered = declarations.filter((d) => d.name.toLowerCase().includes(lower));
    }
    return groupByModule(filtered);
  }, [declarations, filter]);

  const { rows, stickyIndexes } = useMemo(() => {
    const rows: SidebarRow[] = [];
    const stickyIndexes: number[] = [];
    for (const g of groups) {
      stickyIndexes.push(rows.length);
      rows.push({ type: "header", module: g.module, count: g.items.length });
      if (!collapsed.has(g.module)) {
        for (const d of g.items) {
          rows.push({ type: "item", declaration: d });
        }
      }
    }
    return { rows, stickyIndexes };
  }, [groups, collapsed]);

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

      const result = defaultRangeExtractor(range);
      if (result[0] > active) {
        result.unshift(active);
      }
      return result;
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

  const [initialOffset] = useState(() => {
    const target = activeIndex >= 0 ? activeIndex : 0;
    return Math.max(0, target - STATIC_BEFORE) * ROW_HEIGHT;
  });

  const setParentRef = useCallback(
    (el: HTMLDivElement | null) => {
      parentRef.current = el;
      if (el && initialOffset > 0) {
        el.scrollTop = initialOffset;
      }
    },
    [initialOffset],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    rangeExtractor,
    initialOffset,
  });

  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  const staticRows = useMemo(() => {
    if (hydrated) return [];
    const start = initialOffset / ROW_HEIGHT;
    const end = Math.min(rows.length, start + STATIC_BEFORE + STATIC_AFTER + 1);
    return rows.slice(start, end);
  }, [hydrated, rows, initialOffset]);

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

  // Scroll to active item on navigation (skip if the click came from the sidebar)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!scope || !activeModule) return;
    if (navigatedFromSidebarRef.current) {
      navigatedFromSidebarRef.current = false;
      return;
    }
    if (activeIndex >= 0) {
      virtualizer.scrollToIndex(activeIndex, { align: "center" });
    }
    // Reset wrapper scroll in case the browser scrolled it
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = 0;
    }
  }, [activeModule, scope, activeIndex, virtualizer]);

  // When the mobile sidebar opens, the virtualizer's scroll element transitions
  // from display:none to display:flex. The element had zero dimensions while hidden,
  // so the virtualizer rendered no items and scrollTop was lost. Re-measure and
  // scroll to the active item.
  useEffect(() => {
    if (!sidebarOpen || !parentRef.current) return;
    const raf = requestAnimationFrame(() => {
      virtualizer.measure();
      if (activeIndex >= 0) {
        virtualizer.scrollToIndex(activeIndex, { align: "center" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [sidebarOpen]);

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
          id="sidebar-filter"
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
        <SidebarList ref={setParentRef}>
          <SidebarUl style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
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
                    height: ROW_HEIGHT,
                  }}
                >
                  {isHeader ? (
                    <SidebarGroupHeader
                      data-collapsed={collapsed.has(row.module) || undefined}
                      onClick={() => toggleModule(row.module)}
                    >
                      {row.module} ({row.count})
                    </SidebarGroupHeader>
                  ) : (
                    <DeclarationSidebarElement
                      declaration={row.declaration}
                      onClick={handleSidebarNavigate}
                    />
                  )}
                </li>
              );
            })}
          </SidebarUl>
        </SidebarList>
      ) : (
        <SidebarList>
          <SidebarUl>
            {staticRows.map((row) =>
              row.type === "header" ? (
                <li key={`h-${row.module}`} style={{ height: ROW_HEIGHT }}>
                  <SidebarGroupHeader>
                    {row.module} ({row.count})
                  </SidebarGroupHeader>
                </li>
              ) : (
                <li key={`${row.declaration.module}-${row.declaration.name}`}>
                  <DeclarationSidebarElement declaration={row.declaration} />
                </li>
              ),
            )}
          </SidebarUl>
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

const SidebarList = styled.div`
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
`;

const SidebarUl = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;
