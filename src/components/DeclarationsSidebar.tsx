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
import { DeclarationsContext, type GameContext } from "./schema/DeclarationsContext";
import { Declaration } from "../data/types";
import {
  DeclarationSidebarElement,
  SidebarCount,
  SidebarGroupHeader,
  SidebarList,
} from "./layout/Sidebar";
import { allDeclarations } from "../data/derived";
import { countSearchShowFilters } from "../utils/search-show-filters";
import type { SearchResult } from "../utils/search-types";
import { ShowFilterContext } from "./schema/ShowFilterContext";
import { SearchResultContext } from "./search/SearchResultContext";
import {
  SHOW_FILTERS,
  SHOW_FILTER_NAMES,
  countShowFilters,
  type ShowFilter,
} from "../data/show-filters";
import { KindIcon, ModuleLabel, type IconKind } from "./kind-icon/KindIcon";
import { ExclusiveIcon } from "./console/FlagTooltipContent";
import { tip } from "./Tooltip";
import { ShowGroup, ShowRow, ShowRowSpacer } from "./layout/SidebarTop";

type SidebarRow =
  | { type: "header"; module: string; count: number }
  | { type: "item"; declaration: Declaration };

const ROW_HEIGHT = 28;
/** Rows above the active one, which also sets where the hydrated list starts scrolled to */
const STATIC_BEFORE = 19;
/** Every prerendered page carries these rows, enough to fill a tall screen until hydration */
const STATIC_AFTER = 30;

type SidebarRows = { rows: SidebarRow[]; stickyIndexes: number[] };

const SHOW_ICONS: Partial<Record<ShowFilter, IconKind>> = {
  classes: "class",
  enums: "enum",
  entities: "entity",
  components: "inherited-class",
  networked: "meta-broadcast",
  vdata: "meta-folder",
};

type Declarations = GameContext["declarations"];
type ModuleMatches = [module: string, declarations: Declaration[]][];

const unfilteredRowsCache = new WeakMap<Declarations, SidebarRows>();
const unfilteredMatchesCache = new WeakMap<Declarations, ModuleMatches>();
const unfilteredCountsCache = new WeakMap<Declarations, Map<ShowFilter, number>>();

/**
 * Each module with its declarations in declaration order: the ones the search result has, or
 * without a search the ones the show filter keeps. The result is already narrowed to the filter
 */
function listedModules(
  context: GameContext,
  shown: SearchResult | null,
  show: ShowFilter,
): ModuleMatches {
  const { declarations } = context;
  const cacheable = !shown && show === "all";
  if (cacheable) {
    const cached = unfilteredMatchesCache.get(declarations);
    if (cached) return cached;
  }

  const { test } = SHOW_FILTERS[show];
  const modules: ModuleMatches = [];

  for (const [module, moduleMap] of declarations) {
    const items: Declaration[] = [];

    for (const d of moduleMap.values()) {
      const listed = shown ? shown.declarations.has(d) : test(d, context);
      if (listed) items.push(d);
    }

    if (items.length > 0) modules.push([module, items]);
  }

  if (cacheable) unfilteredMatchesCache.set(declarations, modules);
  return modules;
}

/**
 * The modules and their declarations. With no search, nothing collapsed, and everything shown,
 * every page of a game has the same rows. The code caches them instead of rebuilding them per
 * render. Prerendering only ever hits this case, and a game can have tens of thousands of
 * declarations.
 */
function buildModuleRows(
  context: GameContext,
  shown: SearchResult | null,
  collapsed: Set<string>,
  show: ShowFilter,
): SidebarRows {
  const { declarations } = context;
  const cacheable = !shown && collapsed.size === 0 && show === "all";

  if (cacheable) {
    const cached = unfilteredRowsCache.get(declarations);
    if (cached) return cached;
  }

  const rows: SidebarRow[] = [];
  const stickyIndexes: number[] = [];

  for (const [module, items] of listedModules(context, shown, show)) {
    stickyIndexes.push(rows.length);
    rows.push({ type: "header", module, count: items.length });

    if (!collapsed.has(module)) {
      for (const d of items) {
        rows.push({ type: "item", declaration: d });
      }
    }
  }

  const result = { rows, stickyIndexes };
  if (cacheable) unfilteredRowsCache.set(declarations, result);
  return result;
}

/** Of the declarations the search has rows for, how many each show filter keeps */
function showCounts(context: GameContext, result: SearchResult | null): Map<ShowFilter, number> {
  if (result) return countSearchShowFilters(result, context);

  const { declarations } = context;
  const cached = unfilteredCountsCache.get(declarations);
  if (cached) return cached;

  const counts = countShowFilters(allDeclarations(declarations), context);
  unfilteredCountsCache.set(declarations, counts);
  return counts;
}

/**
 * Which declarations the sidebar lists. It lists only the filters that keep something, and the
 * filter that is on even when it keeps nothing
 */
export function DeclarationsShow({ setShow }: { setShow: (filter: ShowFilter) => void }) {
  const context = useContext(DeclarationsContext);
  const { show } = useContext(ShowFilterContext);
  const { result } = useContext(SearchResultContext);
  const counts = useMemo(() => showCounts(context, result), [context, result]);
  if (counts.get("all") === 0) return null;

  return (
    <ShowGroup>
      {SHOW_FILTER_NAMES.map((filter) => {
        const count = counts.get(filter)!;
        if (count === 0 && filter !== show) return null;
        const { label, title } = SHOW_FILTERS[filter];
        const icon = SHOW_ICONS[filter];

        let rowIcon = <ShowRowSpacer />;
        if (filter === "exclusive") {
          rowIcon = <ExclusiveIcon />;
        } else if (icon) {
          rowIcon = <KindIcon kind={icon} />;
        }

        return (
          <ShowRow
            key={filter}
            aria-pressed={filter === show}
            {...tip(title)}
            onClick={() => setShow(filter)}
          >
            {rowIcon}
            <span>{label}</span>
            <SidebarCount>{count.toLocaleString("en-US")}</SidebarCount>
          </ShowRow>
        );
      })}
    </ShowGroup>
  );
}

const VirtualizedList = ({
  rows,
  stickyIndexes,
  collapsed,
  toggleModule,
  activeIndex,
  activeModule,
  scope,
  onNavigate,
}: {
  rows: SidebarRow[];
  stickyIndexes: number[];
  collapsed: Set<string>;
  toggleModule: (module: string) => void;
  activeIndex: number;
  activeModule: string;
  scope: string;
  onNavigate?: () => void;
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const activeStickyIndexRef = useRef(0);
  const navigatedFromSidebarRef = useRef(false);
  const isInitialMount = useRef(true);

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
      if (result[0] > active) result.unshift(active);

      return result;
    },
    [stickyIndexes],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    rangeExtractor,
    initialOffset,
  });

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
    const wrapper = parentRef.current?.parentElement;
    if (wrapper) wrapper.scrollTop = 0;
  }, [activeModule, scope, activeIndex, virtualizer]);

  const handleSidebarNavigate = useCallback(() => {
    navigatedFromSidebarRef.current = true;
    onNavigate?.();
  }, [onNavigate]);

  return (
    <SidebarList ref={setParentRef}>
      <SidebarUl style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
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
              {row.type === "header" ? (
                <SidebarGroupHeader
                  data-collapsed={collapsed.has(row.module) || undefined}
                  aria-expanded={!collapsed.has(row.module)}
                  onClick={() => toggleModule(row.module)}
                >
                  <ModuleLabel module={row.module} />
                  <SidebarCount>{row.count.toLocaleString("en-US")}</SidebarCount>
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
  );
};

export const DeclarationsSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const context = useContext(DeclarationsContext);
  const { show, shown } = useContext(ShowFilterContext);
  const { module: activeModule = "", scope = "" } = useParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  const { rows, stickyIndexes } = useMemo(
    () => buildModuleRows(context, shown, collapsed, show),
    [context, shown, collapsed, show],
  );

  const activeIndex = useMemo(() => {
    if (!scope || !activeModule) return -1;
    return rows.findIndex(
      (r) =>
        r.type === "item" && r.declaration.name === scope && r.declaration.module === activeModule,
    );
  }, [rows, scope, activeModule]);

  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  const staticRows = useMemo(() => {
    if (hydrated) return [];
    const start = Math.max(0, (activeIndex >= 0 ? activeIndex : 0) - STATIC_BEFORE);
    const end = Math.min(rows.length, start + STATIC_BEFORE + STATIC_AFTER + 1);
    return rows.slice(start, end);
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

  return (
    <>
      {hydrated ? (
        <VirtualizedList
          rows={rows}
          stickyIndexes={stickyIndexes}
          collapsed={collapsed}
          toggleModule={toggleModule}
          activeIndex={activeIndex}
          activeModule={activeModule}
          scope={scope}
          onNavigate={onNavigate}
        />
      ) : (
        <SidebarList>
          <SidebarUl>
            {staticRows.map((row) =>
              row.type === "header" ? (
                <li key={`h-${row.module}`} style={{ height: ROW_HEIGHT }}>
                  <SidebarGroupHeader>
                    <ModuleLabel module={row.module} />
                    <SidebarCount>{row.count.toLocaleString("en-US")}</SidebarCount>
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
    </>
  );
};

const SidebarUl = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;
