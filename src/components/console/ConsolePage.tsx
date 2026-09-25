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
import { useHref, useNavigate } from "react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { styled } from "@linaria/react";
import type { ConsoleItem } from "../../data/types";
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
  setSearchTag,
  stripConsoleFilters,
  withoutFlag,
  type ConsoleKind,
  type FilterTag,
  type ParsedConsoleSearch,
} from "../../utils/console-filtering";
import { DeclarationsContext, consolePath } from "../schema/DeclarationsContext";
import { PageTitle } from "../schema/styles";
import { SearchContext } from "../search/SearchContext";
import { PageProviders, PageShell } from "../layout/PageShell";
import { ContentWrapper, OtherGameHeading, SiteFooter, TextMessage } from "../layout/Content";
import { ConsoleRow, isPlainLeftClick } from "./ConsoleRow";
import { GitHubButton } from "../schema/Cards";
import { ConsoleSidebar } from "./ConsoleSidebar";

// DumpSource2 files with the same entries as the list
const DUMP_FILES = ["convars.txt", "commands.txt"];

export default function ConsolePage({ context }: { context: GameContext }) {
  return (
    <PageProviders context={context}>
      <ConsoleLayout />
    </PageProviders>
  );
}

function ConsoleLayout() {
  const filters = useConsoleFilters();
  return (
    <PageShell section="console" sidebar={() => <ConsoleSidebar filters={filters} />}>
      <ConsoleContent filters={filters} />
    </PageShell>
  );
}

export type ConsoleFilters = ReturnType<typeof useConsoleFilters>;

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

  const { visible, kindCounts, moduleCounts, flagCounts } = useMemo(() => {
    // One scored pass without module filters, which the per-module counts ignore anyway
    const base = filterConsoleItems(consoleItems, parsed, { ignoreModules: true });
    const matchesModules = moduleFilter(parsed, stats);
    const ofKind = (i: ConsoleItem) =>
      kind === "all" || (kind === "convars") === (i.kind === "convar");
    const allKinds = matchesModules ? base.filter(matchesModules) : base;
    let convars = 0;
    for (const item of allKinds) if (item.kind === "convar") convars++;
    const visible = kind === "all" ? allKinds : allKinds.filter(ofKind);

    // Every other active flag already narrowed `visible`, so counting flags there gives each
    // unselected flag's count. A flag that's currently included/excluded needs its own filter
    // lifted first, otherwise it would just show 0 or the full visible count right back.
    const flagCounts = countBy(visible, (i) => i.flags);
    for (const flag of [...parsed.flags, ...parsed.notFlags]) {
      let count = 0;
      const others = withoutFlag(parsed, flag);
      for (const item of filterConsoleItems(consoleItems, others, { kind })) {
        if (item.flags.includes(flag)) count++;
      }
      flagCounts.set(flag, count);
    }

    return {
      visible,
      kindCounts: { all: allKinds.length, convars, commands: allKinds.length - convars },
      moduleCounts: countBy(matchesModules ? base.filter(ofKind) : visible, (i) => i.modules),
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
  const { kind, nameParam, parsed, visible, includeTag, selectName } = filters;

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

  return (
    <ContentWrapper>
      <Header>
        <PageTitle>{gameName} Console Commands &amp; ConVars</PageTitle>
        <ResultCount>
          {visible.length.toLocaleString("en-US")} result{visible.length !== 1 && "s"}
        </ResultCount>
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

      {visible.length > 0 ? (
        hydrated ? (
          <VirtualConsoleList
            items={visible}
            nameParam={nameParam}
            scrollTarget={scrollTarget}
            onNavigate={onNavigate}
            onFilter={includeTag}
          />
        ) : (
          <StaticListCard>
            {visible.map((item, i) =>
              // Only the first screenful needs full rows, the rest is there for search engines
              // and is replaced by the virtual list right after hydration
              i < STATIC_FULL_ROWS ? (
                <ConsoleRow
                  key={`${item.kind}/${item.name}`}
                  item={item}
                  anchored={false}
                  onNavigate={onNavigate}
                />
              ) : (
                <li key={`${item.kind}/${item.name}`}>
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
          <OtherGamesConsoleResults parsed={parsed} kind={kind} />
        </>
      )}

      <SiteFooter metadata={metadata} />
    </ContentWrapper>
  );
}

const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;

function VirtualConsoleList({
  items,
  nameParam,
  scrollTarget,
  onNavigate,
  onFilter,
}: {
  items: ConsoleItem[];
  nameParam: string | null;
  scrollTarget: string | null;
  onNavigate: (name: string, e: React.MouseEvent) => void;
  onFilter: (tag: FilterTag, value: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [offset, setOffset] = useState(0);

  // The header card above changes height as the filter chips change or wrap
  useLayoutEffect(() => {
    const measure = () => {
      const el = listRef.current;
      if (el) setOffset(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [items]);

  // Stable per item list, the virtualizer recomputes every measurement when these change
  const estimateSize = useCallback((i: number) => (items[i].help ? 52 : 34), [items]);
  const getItemKey = useCallback((i: number) => `${items[i].kind}/${items[i].name}`, [items]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize,
    getItemKey,
    overscan: 10,
    scrollMargin: offset,
  });

  // Back to the top of the list when the filters change while scrolled down
  const prevItemsRef = useRef(items);
  useEffect(() => {
    if (prevItemsRef.current === items) return;
    prevItemsRef.current = items;
    if (window.scrollY > offset) window.scrollTo(0, Math.max(0, offset - 80));
  }, [items, offset]);

  const nameIndex = useMemo(
    () => (scrollTarget ? items.findIndex((i) => i.name === scrollTarget) : -1),
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
      {virtualizer.getVirtualItems().map((row) => {
        const item = items[row.index];
        return (
          <ConsoleRow
            key={row.key}
            rowRef={virtualizer.measureElement}
            index={row.index}
            top={row.start - offset}
            item={item}
            anchored={nameParam === item.name}
            onNavigate={onNavigate}
            onFilter={onFilter}
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
    const out: { gameId: GameId; found: ConsoleItem[] }[] = [];
    if (parsed.nameWords.length === 0 && parsed.flags.length === 0 && parsed.types.length === 0) {
      return out;
    }
    for (const g of GAME_LIST) {
      if (g.id === game) continue;
      const found = filterConsoleItems(getGameContext(g.id).consoleItems, parsed, { kind });
      if (found.length > 0) out.push({ gameId: g.id, found: found.slice(0, 100) });
    }
    return out;
  }, [game, parsed, kind]);

  return (
    <>
      {results.map(({ gameId, found }) => (
        <OtherGameConsoleRows key={gameId} gameId={gameId} items={found} />
      ))}
    </>
  );
}

function OtherGameConsoleRows({ gameId, items }: { gameId: GameId; items: ConsoleItem[] }) {
  const navigate = useNavigate();
  const pageHref = useHref(consolePath(gameId));
  const onNavigate = useCallback(
    (name: string, e: React.MouseEvent) => {
      if (!isPlainLeftClick(e)) return;
      e.preventDefault();
      navigate({ pathname: consolePath(gameId), hash: buildHash({ name }) });
    },
    [navigate, gameId],
  );

  return (
    <>
      <OtherGameHeading gameId={gameId} />
      {/* The rows' own game, for its icon on the exclusive flag */}
      <DeclarationsContext.Provider value={getGameContext(gameId)}>
        <ListCard>
          {items.map((item) => (
            <ConsoleRow
              key={`${item.kind}/${item.name}`}
              item={item}
              anchored={false}
              pageHref={pageHref}
              onNavigate={onNavigate}
            />
          ))}
        </ListCard>
      </DeclarationsContext.Provider>
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

const ResultCount = styled.span`
  font-size: 14px;
  color: var(--text-dim);
`;

const ListCard = styled.ul`
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  box-shadow: var(--group-shadow);
  overflow: hidden;
  position: relative;
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
