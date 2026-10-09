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
import { matchesModule, matchesWords, useParsedSearch } from "../utils/filtering";
import {
  SHOW_FILTERS,
  SHOW_FILTER_NAMES,
  countShowFilters,
  type ShowFilter,
} from "../data/show-filters";
import { KindIcon, type IconKind } from "./kind-icon/KindIcon";
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
/** The last search's matches, which the list and the show filters' counts both ask for */
let lastMatches: { declarations: Declarations; key: string; matches: ModuleMatches } | null = null;

function matchesDeclaration(
  d: Declaration,
  nameWords: string[],
  designNamesByDeclaration: GameContext["designNamesByDeclaration"],
): boolean {
  if (matchesWords(d.name, nameWords)) return true;
  const names = designNamesByDeclaration.get(d);
  return !!names?.some((n) => matchesWords(n, nameWords));
}

/** Each module the search matches, with its declarations the search matches */
function searchMatches(
  context: GameContext,
  nameWords: string[],
  moduleWords: string[],
): ModuleMatches {
  const { declarations, designNamesByDeclaration } = context;
  const searching = nameWords.length > 0 || moduleWords.length > 0;
  const key = `${nameWords.join(" ")}|${moduleWords.join(" ")}`;
  if (!searching) {
    const cached = unfilteredMatchesCache.get(declarations);
    if (cached) return cached;
  } else if (lastMatches?.declarations === declarations && lastMatches.key === key) {
    return lastMatches.matches;
  }

  const matches: ModuleMatches = [];
  for (const [module, moduleMap] of declarations) {
    if (!matchesModule(module, moduleWords)) continue;
    const items: Declaration[] = [];
    for (const d of moduleMap.values()) {
      if (nameWords.length === 0 || matchesDeclaration(d, nameWords, designNamesByDeclaration)) {
        items.push(d);
      }
    }
    if (items.length > 0) matches.push([module, items]);
  }

  if (searching) lastMatches = { declarations, key, matches };
  else unfilteredMatchesCache.set(declarations, matches);
  return matches;
}

/**
 * The modules and their declarations. With no search, nothing collapsed, and everything shown,
 * the rows are the same for every page of a game, so they're cached instead of rebuilt per
 * render. Prerendering only ever hits this case, and a game can have tens of thousands of
 * declarations.
 */
function buildModuleRows(
  context: GameContext,
  nameWords: string[],
  moduleWords: string[],
  collapsed: Set<string>,
  show: ShowFilter,
): SidebarRows {
  const { declarations } = context;
  const cacheable =
    nameWords.length === 0 && moduleWords.length === 0 && collapsed.size === 0 && show === "all";

  if (cacheable) {
    const cached = unfilteredRowsCache.get(declarations);
    if (cached) return cached;
  }

  const rows: SidebarRow[] = [];
  const stickyIndexes: number[] = [];
  const { test } = SHOW_FILTERS[show];
  for (const [module, matched] of searchMatches(context, nameWords, moduleWords)) {
    const items = show === "all" ? matched : matched.filter((d) => test(d, context));
    if (items.length === 0) continue;
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

/** Of the declarations the search matches, how many each show filter keeps */
function showCounts(
  context: GameContext,
  nameWords: string[],
  moduleWords: string[],
): Map<ShowFilter, number> {
  const { declarations } = context;
  const cacheable = nameWords.length === 0 && moduleWords.length === 0;
  if (cacheable) {
    const cached = unfilteredCountsCache.get(declarations);
    if (cached) return cached;
  }
  const matches = searchMatches(context, nameWords, moduleWords);
  const counts = countShowFilters(
    matches.flatMap(([, items]) => items),
    context,
  );
  if (cacheable) unfilteredCountsCache.set(declarations, counts);
  return counts;
}

/**
 * Which declarations the sidebar lists. Only the filters that keep something are listed, and
 * the one that's on even when it keeps nothing
 */
export function DeclarationsShow({
  show,
  setShow,
}: {
  show: ShowFilter;
  setShow: (filter: ShowFilter) => void;
}) {
  const context = useContext(DeclarationsContext);
  const { nameWords, moduleWords } = useParsedSearch();
  const counts = useMemo(
    () => showCounts(context, nameWords, moduleWords),
    [context, nameWords, moduleWords],
  );
  if (counts.get("all") === 0) return null;

  return (
    <ShowGroup>
      {SHOW_FILTER_NAMES.map((filter) => {
        const count = counts.get(filter)!;
        if (count === 0 && filter !== show) return null;
        const { label, title } = SHOW_FILTERS[filter];
        const icon = SHOW_ICONS[filter];
        return (
          <ShowRow
            key={filter}
            aria-pressed={filter === show}
            {...tip(title)}
            onClick={() => setShow(filter)}
          >
            {filter === "exclusive" ? (
              <ExclusiveIcon />
            ) : icon ? (
              <KindIcon kind={icon} />
            ) : (
              <ShowRowSpacer />
            )}
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
  sidebarOpen,
  onNavigate,
}: {
  rows: SidebarRow[];
  stickyIndexes: number[];
  collapsed: Set<string>;
  toggleModule: (module: string) => void;
  activeIndex: number;
  activeModule: string;
  scope: string;
  sidebarOpen?: boolean;
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
      if (result[0] > active) {
        result.unshift(active);
      }
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
                  {row.module}
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

export const DeclarationsSidebar = ({
  show,
  onNavigate,
  sidebarOpen,
}: {
  show: ShowFilter;
  onNavigate?: () => void;
  sidebarOpen?: boolean;
}) => {
  const context = useContext(DeclarationsContext);
  const { nameWords, moduleWords } = useParsedSearch();
  const { module: activeModule = "", scope = "" } = useParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  const { rows, stickyIndexes } = useMemo(
    () => buildModuleRows(context, nameWords, moduleWords, collapsed, show),
    [context, nameWords, moduleWords, collapsed, show],
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
          sidebarOpen={sidebarOpen}
          onNavigate={onNavigate}
        />
      ) : (
        <SidebarList>
          <SidebarUl>
            {staticRows.map((row) =>
              row.type === "header" ? (
                <li key={`h-${row.module}`} style={{ height: ROW_HEIGHT }}>
                  <SidebarGroupHeader>
                    {row.module}
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
