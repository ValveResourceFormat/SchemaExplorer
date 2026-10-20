import { useCallback, useContext, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import { getGameContext } from "../../data/derived";
import type { GameId } from "../../games-list";
import type { ParsedSearch } from "../../utils/filtering";
import {
  buildResultRows,
  isCardRow,
  type OtherGameResult,
  type ResultRow,
} from "../../utils/result-rows";
import { hasSchemaHits, searchSchemas } from "../../utils/search";
import { isFuzzyRow } from "../../utils/search-types";
import type { SectionItems } from "../../utils/section-search";
import { OtherGameHeading } from "../layout/Content";
import { DeclarationsContext } from "../schema/DeclarationsContext";
import { ShowFilterContext } from "../schema/ShowFilterContext";
import { useWindowList } from "../useWindowList";
import { SearchResultContext } from "./SearchResultContext";
import { useBetterMatches } from "./useOtherSection";
import {
  ConsoleResultRowView,
  EmptyRowView,
  FieldRowView,
  InheritedRowView,
  NameRowView,
  OtherSectionHeading,
  OtherSectionHint,
  SectionHeader,
  ShowAllRowView,
} from "./ResultRows";

const SECTION_HEIGHT = 40;
const ROW_HEIGHT = 34;
const EMPTY_HEIGHT = 120;

function estimateRowSize(row: ResultRow): number {
  if (row.type === "section" || row.type === "consoleHeader") return SECTION_HEIGHT;
  if (row.type === "empty") return EMPTY_HEIGHT;
  return ROW_HEIGHT;
}

/** The game of another game's result row, undefined for this game's */
function rowGame(row: ResultRow): GameId | undefined {
  if (row.type === "name" || row.type === "field" || row.type === "inherited") return row.game;
  return undefined;
}

const List = styled.div`
  position: relative;
`;

const VirtualRow = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
`;

interface ResultRowViewProps {
  row: ResultRow;
  first: boolean;
  last: boolean;
  onShowAll: () => void;
}

/** A row of another game links to that game */
function ResultRowView(props: ResultRowViewProps) {
  const view = <ResultRowContent {...props} />;
  const game = rowGame(props.row);
  if (game === undefined) return view;
  return <InGame game={game}>{view}</InGame>;
}

function ResultRowContent({ row, first, last, onShowAll }: ResultRowViewProps) {
  switch (row.type) {
    case "section":
      return <SectionHeader section={row} />;
    case "name":
      return <NameRowView hit={row.row.hit} paired={row.row.paired} first={first} last={last} />;
    case "field":
      return <FieldRowView row={row.row} first={first} last={last} />;
    case "inherited":
      return <InheritedRowView row={row.row} first={first} last={last} />;
    case "consoleHeader":
      return <OtherSectionHeading total={row.total} shown={row.shown} />;
    case "console":
      return <ConsoleResultRowView match={row.match} first={first} last={last} />;
    case "consoleHint":
      return <OtherSectionHint total={row.total} />;
    case "game":
      return <OtherGameHeading gameId={row.gameId} />;
    case "similar":
      if (isFuzzyRow(row.row)) {
        return <NameRowView hit={row.row.hit} first={first} last={last} />;
      }
      return <FieldRowView row={row.row} first={first} last={last} />;
    case "showAll":
      return <ShowAllRowView count={row.count} onShowAll={onShowAll} first={first} last={last} />;
    case "empty":
      return <EmptyRowView />;
  }
}

/** Links of another game's rows go to that game */
function InGame({ game, children }: { game: GameId; children: React.ReactNode }) {
  return (
    <DeclarationsContext.Provider value={getGameContext(game)}>
      {children}
    </DeclarationsContext.Provider>
  );
}

/** What other games find for the search, the games without results left out */
function useOtherGameResults(parsed: ParsedSearch, enabled: boolean): OtherGameResult[] {
  const { game, otherGamesLookup } = useContext(DeclarationsContext);
  return useMemo(() => {
    if (!enabled) return [];

    const found: OtherGameResult[] = [];
    for (const gameId of otherGamesLookup.keys()) {
      if (gameId === game) continue;
      const result = searchSchemas(getGameContext(gameId), parsed, { similar: false });
      if (hasSchemaHits(result)) found.push({ gameId, result });
    }
    return found;
  }, [game, otherGamesLookup, parsed, enabled]);
}

/**
 * Lists the results of the schema search in one virtualized list, narrowed to the sidebar's show
 * filter. The list also has the ConVars that match the search better. Without results in this
 * game, it has the results of the other games
 */
export function SchemaResults() {
  const { query, parsed, result: unfiltered } = useContext(SearchResultContext);
  const { shown: result } = useContext(ShowFilterContext);
  // The similar names asked for, for this query only
  const [showAllQuery, setShowAllQuery] = useState<string | null>(null);
  const showAllSimilar = showAllQuery === query;

  const own = useMemo<SectionItems | null>(
    () => (result ? { section: "schemas", result } : null),
    [result],
  );
  const matches = useBetterMatches(own);
  const otherGames = useOtherGameResults(parsed, unfiltered !== null && !hasSchemaHits(unfiltered));

  const rows = useMemo(() => {
    if (!result) return [];

    const better = matches?.better;
    const items = better?.section === "console" ? better.items : [];
    const total = matches?.count ?? 0;
    const convars = { items, total };
    return buildResultRows(result, showAllSimilar, { convars, otherGames });
  }, [result, showAllSimilar, matches, otherGames]);

  const onShowAll = useCallback(() => setShowAllQuery(query), [query]);
  return <ResultsList rows={rows} query={query} onShowAll={onShowAll} />;
}

function ResultsList({
  rows,
  query,
  onShowAll,
}: {
  rows: ResultRow[];
  query: string;
  onShowAll: () => void;
}) {
  // These stay the same for one row list. The virtualizer recomputes every measurement when they
  // change
  const estimateSize = useCallback((i: number) => estimateRowSize(rows[i]), [rows]);
  const getItemKey = useCallback((i: number) => rows[i].key, [rows]);

  // Scrolls back to the top for another query, but not when only the rows change
  const { listRef, virtualizer, itemTop } = useWindowList<HTMLDivElement>({
    listKey: query,
    count: rows.length,
    estimateSize,
    getItemKey,
  });

  return (
    <List ref={listRef} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index];
        const first = !isCardRow(rows[item.index - 1]);
        const last = !isCardRow(rows[item.index + 1]);
        return (
          <VirtualRow
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            style={{ transform: `translateY(${itemTop(item)}px)` }}
          >
            <ResultRowView row={row} first={first} last={last} onShowAll={onShowAll} />
          </VirtualRow>
        );
      })}
    </List>
  );
}
