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
import { formatCount } from "../../utils/format";
import {
  consoleCountsText,
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
import { PageProviders, PageShell } from "../layout/PageShell";
import { ContentWrapper, OtherGameHeading, SiteFooter, TextMessage } from "../layout/Content";
import { isPlainLeftClick } from "./ConsoleRow";
import { ConsoleRowsCard } from "./ConsoleRowsCard";
import { GitHubButton } from "../schema/Cards";
import { ConsoleShow, ConsoleSidebar } from "./ConsoleSidebar";
import { StaticConsoleList } from "./StaticConsoleList";
import { useFirstInteraction } from "./useFirstInteraction";
import { VirtualConsoleList } from "./VirtualConsoleList";

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

/** Filter state shared by the sidebar and the list. All of it lives in the URL hash */
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

    // Names that only match fuzzily are listed apart. None of the counts include them
    const similar = inKind(inModules(found.similar, matchesModules), kind);

    // Every other active flag already narrowed `visible`, so counting flags there gives each
    // unselected flag's count. A flag that is included or excluded needs its own filter lifted
    // first. Otherwise it shows 0 or the full visible count
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

  // Row chips only add a filter. Cycling there would hide the row that was clicked
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

  // Memoized so the sidebar skips the immediate render of a keystroke. Its data is deferred
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

function ConsoleIntro() {
  const { game, metadata, consoleItems } = useContext(DeclarationsContext);
  const gameName = getGameDef(game).name;
  const stats = getConsoleStats(consoleItems);

  let text = `${gameName} has ${consoleCountsText(stats)}`;
  if (metadata.revision > 0) text += ` in build ${metadata.revision} (${metadata.versionDate})`;
  text += ", run from the developer console.";

  const cheats = stats.flags.get("cheat") ?? 0;
  const hasSvCheats = consoleItems.some((item) => item.name === "sv_cheats");
  if (cheats > 0 && hasSvCheats) {
    text += ` ${formatCount(cheats)} of them are flagged cheat and need sv_cheats 1.`;
  }
  return <Intro>{text}</Intro>;
}

function ConsoleContent({ filters }: { filters: ConsoleFilters }) {
  const { game, metadata } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const { kind, nameParam, parsed, visible, similar, includeTag, selectName } = filters;

  // The similar names asked for, for this list of them only
  const [expandedSimilar, setExpandedSimilar] = useState<ConsoleMatch[] | null>(null);
  const showAllSimilar = expandedSimilar === similar;
  const onShowAllSimilar = useCallback(() => setExpandedSimilar(similar), [similar]);

  // The prerendered page has every row for search engines. It keeps them after hydration until
  // the reader does something, so a crawler that renders the page sees all of them too
  const unfiltered = search === "" && kind === "all";
  const hydrated = useHydrated();
  const staticListRef = useRef<HTMLUListElement>(null);
  const interaction = useFirstInteraction(hydrated, staticListRef);
  const virtual = hydrated && (interaction != null || !unfiltered || nameParam != null);
  const restorePosition = unfiltered ? (interaction?.position ?? null) : null;

  // Clicking a name only updates the permalink. The row is already in view. Only a #name=
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

  const gameName = getGameDef(game).name;

  const list = (
    <VirtualConsoleList
      items={visible}
      similar={similar}
      showAllSimilar={showAllSimilar}
      onShowAllSimilar={onShowAllSimilar}
      restorePosition={restorePosition}
      nameParam={nameParam}
      scrollTarget={scrollTarget}
      onNavigate={onNavigate}
      onFilter={includeTag}
      filteredModules={parsed.modules}
    />
  );

  let body: React.ReactNode;
  if (visible.length === 0) {
    body = (
      <>
        <TextMessage>No results found</TextMessage>
        <OtherSectionMatches own={visible} />
        <OtherGamesConsoleResults parsed={parsed} kind={kind} />
        {similar.length > 0 && list}
      </>
    );
  } else if (virtual) {
    body = list;
  } else {
    body = <StaticConsoleList listRef={staticListRef} items={visible} onNavigate={onNavigate} />;
  }

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
      <ConsoleIntro />

      {visible.length > 0 && <OtherSectionMatches own={visible} />}
      {body}

      <SiteFooter metadata={metadata} />
    </ContentWrapper>
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

const Intro = styled.p`
  margin: 8px 0 0 4px;
  font-size: 15px;
  color: var(--text-dim);
`;
