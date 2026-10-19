import React, {
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { styled } from "@linaria/react";
import { getGameContext, type GameContext } from "../../data/derived";
import { GAME_LIST, dumpFileUrl, getGameDef, type GameId } from "../../games-list";
import { buildHash, useHashParam, useHydrated } from "../../utils/filtering";
import { countBy } from "../../utils/collections";
import {
  filterConsoleItems,
  getConsoleStats,
  getTagState,
  moduleFilter,
  nextTagState,
  parseConsoleSearch,
  searchConsoleItems,
  searchConsoleResults,
  setSearchTag,
  stripConsoleFilters,
  withoutFlag,
  type ConsoleKind,
  type ConsoleMatch,
  type FilterTag,
  type ParsedConsoleSearch,
} from "../../utils/console-filtering";
import { DeclarationsContext } from "../schema/DeclarationsContext";
import { PageTitle } from "../schema/styles";
import { SearchContext } from "../search/SearchContext";
import { OtherSectionMatches } from "../search/OtherSectionMatches";
import { ShowAllButton } from "../search/ShowAllButton";
import { PageProviders, PageShell } from "../layout/PageShell";
import { ContentWrapper, OtherGameHeading, SiteFooter, TextMessage } from "../layout/Content";
import { useWindowList } from "../useWindowList";
import { ConsoleRow, isPlainLeftClick } from "./ConsoleRow";
import { ConsoleRowsCard } from "./ConsoleRowsCard";
import { GitHubButton } from "../schema/Cards";
import { ListCard } from "./styles";
import { consoleRowKey, SECTION_LABELS, shownSimilar } from "../../utils/result-rows";
import { ConsoleShow, ConsoleSidebar } from "./ConsoleSidebar";

// DumpSource2 files with the same entries as the list
const DUMP_FILES = ["convars.txt", "commands.txt"];

export default function ConsolePage({ context }: { context: GameContext }) {
  return (
    <PageProviders context={context} section="console">
      <ConsoleLayout />
    </PageProviders>
  );
}

function ConsoleLayout() {
  const filters = useConsoleFilters();
  return (
    <PageShell
      section="console"
      count={filters.visible.length.toLocaleString("en-US")}
      show={<ConsoleShow filters={filters} />}
      sidebar={() => <ConsoleSidebar filters={filters} />}
    >
      <ConsoleContent filters={filters} />
    </PageShell>
  );
}

export type ConsoleFilters = ReturnType<typeof useConsoleFilters>;

function inKind(matches: ConsoleMatch[], kind: ConsoleKind): ConsoleMatch[] {
  if (kind === "all") return matches;
  const wantConvars = kind === "convars";
  return matches.filter(({ item }) => (item.kind === "convar") === wantConvars);
}

function inModules(
  matches: ConsoleMatch[],
  matchesModules: ReturnType<typeof moduleFilter>,
): ConsoleMatch[] {
  if (!matchesModules) return matches;
  return matches.filter(({ item }) => matchesModules(item));
}

/** Filter state shared by the sidebar and the list, all of it lives in the URL hash */
function useConsoleFilters() {
  const { consoleItems } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const kindParam = useHashParam("kind");
  const nameParam = useHashParam("name");
  const kind: ConsoleKind = kindParam === "convars" || kindParam === "commands" ? kindParam : "all";

  const navigate = useNavigate();
  const stats = getConsoleStats(consoleItems);

  const deferredSearch = useDeferredValue(search);
  const parsed = useMemo(() => parseConsoleSearch(deferredSearch), [deferredSearch]);

  const { visible, similar, kindCounts, moduleCounts, flagCounts } = useMemo(() => {
    // One scored pass without module filters, which the per-module counts ignore anyway
    const found = searchConsoleItems(consoleItems, parsed, { ignoreModules: true });
    const matchesModules = moduleFilter(parsed, stats);
    const allKinds = inModules(found.results, matchesModules);
    let convars = 0;
    for (const { item } of allKinds) if (item.kind === "convar") convars++;
    const visible = inKind(allKinds, kind);

    // Names that only match fuzzily are listed apart, and none of the counts include them
    const similar = inKind(inModules(found.similar, matchesModules), kind);

    // Every other active flag already narrowed `visible`, so counting flags there gives each
    // unselected flag's count. A flag that's currently included/excluded needs its own filter
    // lifted first, otherwise it would just show 0 or the full visible count right back.
    const flagCounts = countBy(visible, ({ item }) => item.flags);
    for (const flag of [...parsed.flags, ...parsed.notFlags]) {
      let count = 0;
      const others = withoutFlag(parsed, flag);
      for (const item of filterConsoleItems(consoleItems, others, { kind })) {
        if (item.flags.includes(flag)) count++;
      }
      flagCounts.set(flag, count);
    }

    const moduleMatches = matchesModules ? inKind(found.results, kind) : visible;
    return {
      visible,
      similar,
      kindCounts: { all: allKinds.length, convars, commands: allKinds.length - convars },
      moduleCounts: countBy(moduleMatches, ({ item }) => item.modules),
      flagCounts,
    };
  }, [consoleItems, parsed, kind, stats]);

  // Callbacks read the hash through a ref so they stay stable for the memoized rows
  const hashRef = useRef({ search, kindParam });
  useLayoutEffect(() => {
    hashRef.current = { search, kindParam };
  });

  const setHash = useCallback(
    (params: { kind?: string | null; search?: string; name?: string }, replace = false) => {
      navigate({ hash: buildHash(params) }, { replace, preventScrollReset: true });
    },
    [navigate],
  );

  const cycleTag = useCallback(
    (tag: FilterTag, value: string) => {
      const { search, kindParam } = hashRef.current;
      const state = getTagState(parseConsoleSearch(search), tag, value);
      const next = nextTagState(tag, state);
      setHash({ kind: kindParam, search: setSearchTag(search, tag, value, next) });
    },
    [setHash],
  );

  // Row chips only add a filter, cycling there would hide the row that was clicked
  const includeTag = useCallback(
    (tag: FilterTag, value: string) => {
      const { search, kindParam } = hashRef.current;
      setHash({ kind: kindParam, search: setSearchTag(search, tag, value, "include") });
    },
    [setHash],
  );

  const setKind = useCallback(
    (k: ConsoleKind) => {
      setHash({ kind: k === "all" ? null : k, search: hashRef.current.search });
    },
    [setHash],
  );

  const clearFilters = useCallback(
    () => setHash({ search: stripConsoleFilters(hashRef.current.search) }),
    [setHash],
  );

  const selectName = useCallback(
    (name: string) => {
      const { search, kindParam } = hashRef.current;
      setHash({ kind: kindParam, search, name }, true);
    },
    [setHash],
  );

  // Memoized so the sidebar skips the immediate render of a keystroke, its data is deferred
  return useMemo(
    () => ({
      kind,
      nameParam,
      parsed,
      stats,
      visible,
      similar,
      kindCounts,
      moduleCounts,
      flagCounts,
      cycleTag,
      includeTag,
      setKind,
      clearFilters,
      selectName,
    }),
    [
      kind,
      nameParam,
      parsed,
      stats,
      visible,
      similar,
      kindCounts,
      moduleCounts,
      flagCounts,
      cycleTag,
      includeTag,
      setKind,
      clearFilters,
      selectName,
    ],
  );
}

function ConsoleContent({ filters }: { filters: ConsoleFilters }) {
  const { game, metadata } = useContext(DeclarationsContext);
  const { kind, nameParam, parsed, visible, similar, includeTag, selectName } = filters;

  // The similar names asked for, for this list of them only
  const [expandedSimilar, setExpandedSimilar] = useState<ConsoleMatch[] | null>(null);
  const showAllSimilar = expandedSimilar === similar;
  const onShowAllSimilar = useCallback(() => setExpandedSimilar(similar), [similar]);

  // The prerendered page has every row for search engines, hydration has to match it
  // before switching to the virtualized list
  const hydrated = useHydrated();

  // Clicking a name only updates the permalink, the row is already in view. Only a #name=
  // link opened from elsewhere (or back/forward to another name) scrolls to its row
  const clickedRef = useRef<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    const clicked = nameParam != null && nameParam === clickedRef.current;
    clickedRef.current = null;
    setScrollTarget(nameParam && !clicked ? nameParam : null);
  }, [nameParam]);

  const onNavigate = useCallback(
    (name: string, e: React.MouseEvent) => {
      if (!isPlainLeftClick(e)) return;
      e.preventDefault();
      clickedRef.current = name;
      selectName(name);
    },
    [selectName],
  );

  const gameName = getGameDef(game)?.name ?? game;

  const list = (
    <VirtualConsoleList
      items={visible}
      similar={similar}
      showAllSimilar={showAllSimilar}
      onShowAllSimilar={onShowAllSimilar}
      nameParam={nameParam}
      scrollTarget={scrollTarget}
      onNavigate={onNavigate}
      onFilter={includeTag}
      filteredModules={parsed.modules}
    />
  );

  return (
    <ContentWrapper>
      <Header>
        <PageTitle>{gameName} Console Commands &amp; ConVars</PageTitle>
        <HeaderActions>
          {DUMP_FILES.map((file) => {
            const url = dumpFileUrl(game, file);
            return (
              url && (
                <GitHubButton key={file} href={url} title={`View ${file} on GitHub`} label={file} />
              )
            );
          })}
        </HeaderActions>
      </Header>

      {visible.length > 0 && <OtherSectionMatches own={visible} />}
      {visible.length > 0 ? (
        hydrated ? (
          list
        ) : (
          <StaticListCard>
            {visible.map(({ item, nameRanges }, i) =>
              // Only the first screenful needs full rows, the rest is there for search engines
              // and is replaced by the virtual list right after hydration
              i < STATIC_FULL_ROWS ? (
                <ConsoleRow
                  key={consoleRowKey(item)}
                  item={item}
                  nameRanges={nameRanges}
                  anchored={false}
                  onNavigate={onNavigate}
                />
              ) : (
                <li key={consoleRowKey(item)}>
                  <a href={`#name=${encodeURIComponent(item.name)}`}>{item.name}</a>
                  {item.help && ` ${item.help}`}
                </li>
              ),
            )}
          </StaticListCard>
        )
      ) : (
        <>
          <TextMessage>No results found</TextMessage>
          <OtherSectionMatches own={visible} />
          <OtherGamesConsoleResults parsed={parsed} kind={kind} />
          {similar.length > 0 && list}
        </>
      )}

      <SiteFooter metadata={metadata} />
    </ContentWrapper>
  );
}

const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;

const SIMILAR_HEADING = "similarHeading";
const SHOW_ALL = "showAll";

/** The results, then the similar names under their heading, then the control for the rest */
type ListRow = ConsoleMatch | typeof SIMILAR_HEADING | typeof SHOW_ALL;

const GROUP_ROW_HEIGHT = 36;

function buildListRows(
  items: readonly ConsoleMatch[],
  similar: readonly ConsoleMatch[],
  showAllSimilar: boolean,
): ListRow[] {
  const rows: ListRow[] = [...items];
  if (similar.length === 0) return rows;

  rows.push(SIMILAR_HEADING);
  const shown = shownSimilar(similar, showAllSimilar);
  rows.push(...shown);
  if (shown.length < similar.length) rows.push(SHOW_ALL);
  return rows;
}

function listRowKey(row: ListRow): string {
  if (typeof row === "string") return row;
  return consoleRowKey(row.item);
}

function VirtualConsoleList({
  items,
  similar,
  showAllSimilar,
  onShowAllSimilar,
  nameParam,
  scrollTarget,
  onNavigate,
  onFilter,
  filteredModules,
}: {
  items: ConsoleMatch[];
  /** Items that only match by name fuzzily, listed after the results */
  similar: ConsoleMatch[];
  showAllSimilar: boolean;
  onShowAllSimilar: () => void;
  nameParam: string | null;
  scrollTarget: string | null;
  onNavigate: (name: string, e: React.MouseEvent) => void;
  onFilter: (tag: FilterTag, value: string) => void;
  filteredModules: string[];
}) {
  const rows = useMemo(
    () => buildListRows(items, similar, showAllSimilar),
    [items, similar, showAllSimilar],
  );

  // Stable per row list, the virtualizer recomputes every measurement when these change
  const estimateSize = useCallback(
    (i: number) => {
      const row = rows[i];
      if (typeof row === "string") return GROUP_ROW_HEIGHT;
      return row.item.help ? 52 : 34;
    },
    [rows],
  );
  const getItemKey = useCallback((i: number) => listRowKey(rows[i]), [rows]);

  // Back to the top of the list when the filters change while scrolled down
  const { listRef, virtualizer, itemTop } = useWindowList<HTMLUListElement>({
    listKey: items,
    count: rows.length,
    estimateSize,
    getItemKey,
  });

  const nameIndex = useMemo(
    () => (scrollTarget ? items.findIndex((match) => match.item.name === scrollTarget) : -1),
    [items, scrollTarget],
  );
  // Rows above are estimates until measured and scroll restoration runs after mount, so a
  // single scrollToIndex can land off target; retry briefly until the row stays in place.
  // Rows near either end can't be centered, and any user scroll input stops it
  useEffect(() => {
    if (nameIndex < 0) return;
    let attempts = 0;
    let lastTop: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      clearTimeout(timer);
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
    };
    const scroll = () => {
      const rect = listRef.current
        ?.querySelector(`[data-index="${nameIndex}"]`)
        ?.getBoundingClientRect();
      const centered =
        rect != null && Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) < 50;
      const settled = rect != null && lastTop != null && Math.abs(rect.top - lastTop) < 1;
      lastTop = rect?.top ?? null;
      const done = centered || settled;
      if (!done) virtualizer.scrollToIndex(nameIndex, { align: "center" });
      if (++attempts < 15 && (!done || attempts < 6)) timer = setTimeout(scroll, 100);
      else stop();
    };
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
    timer = setTimeout(scroll, 0);
    return stop;
  }, [nameIndex, virtualizer]);

  return (
    <ListCard ref={listRef} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        const top = itemTop(virtualRow);
        if (typeof row === "string") {
          return (
            <GroupRow
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{ transform: `translateY(${top}px)` }}
            >
              {row === SIMILAR_HEADING ? (
                SECTION_LABELS.similar
              ) : (
                <ShowAllButton count={similar.length} onClick={onShowAllSimilar} />
              )}
            </GroupRow>
          );
        }
        return (
          <ConsoleRow
            key={virtualRow.key}
            rowRef={virtualizer.measureElement}
            index={virtualRow.index}
            top={top}
            item={row.item}
            nameRanges={row.nameRanges}
            anchored={nameParam === row.item.name}
            onNavigate={onNavigate}
            onFilter={onFilter}
            filteredModules={filteredModules}
          />
        );
      })}
    </ListCard>
  );
}

function OtherGamesConsoleResults({
  parsed,
  kind,
}: {
  parsed: ParsedConsoleSearch;
  kind: ConsoleKind;
}) {
  const { game } = useContext(DeclarationsContext);

  const results = useMemo(() => {
    const out: { gameId: GameId; found: ConsoleMatch[] }[] = [];
    if (parsed.nameWords.length === 0 && parsed.flags.length === 0 && parsed.types.length === 0) {
      return out;
    }
    for (const g of GAME_LIST) {
      if (g.id === game) continue;
      const { consoleItems } = getGameContext(g.id);
      const found = searchConsoleResults(consoleItems, parsed, { kind });
      if (found.length > 0) out.push({ gameId: g.id, found: found.slice(0, 100) });
    }
    return out;
  }, [game, parsed, kind]);

  return (
    <>
      {results.map(({ gameId, found }) => (
        <React.Fragment key={gameId}>
          <OtherGameHeading gameId={gameId} />
          <ConsoleRowsCard gameId={gameId} matches={found} />
        </React.Fragment>
      ))}
    </>
  );
}

// -- Styles --

const Header = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 4px 0 0 4px;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-left: auto;
`;

/** A heading or control between the virtualized rows */
const GroupRow = styled.li`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-bottom: 1px solid var(--row-line);
  font-size: 15px;
  color: var(--text-dim);
`;

const STATIC_FULL_ROWS = 40;

const StaticListCard = styled(ListCard)`
  > li {
    content-visibility: auto;
    contain-intrinsic-size: auto 52px;
  }

  > li:not([class]) {
    padding: 6px 12px 6px 36px;
    border-bottom: 1px solid var(--row-line);
    font-size: 14px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    > a {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
      text-decoration: none;
    }
  }
`;
