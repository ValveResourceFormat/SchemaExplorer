import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { styled } from "@linaria/react";
import type { ConsoleMatch, FilterTag } from "../../utils/console-filtering";
import { consoleRowKey, SECTION_LABELS, shownSimilar } from "../../utils/result-rows";
import { ShowAllButton } from "../search/ShowAllButton";
import { useWindowList } from "../useWindowList";
import { ConsoleRow } from "./ConsoleRow";
import { ListCard } from "./styles";
import type { RowPosition } from "./useFirstInteraction";
import { useScrollToRow } from "./useScrollToRow";

const SIMILAR_HEADING = "similarHeading";
const SHOW_ALL = "showAll";

/** The results, then the similar names under their heading, then the control for the rest */
type ListRow = ConsoleMatch | typeof SIMILAR_HEADING | typeof SHOW_ALL;

const GROUP_ROW_HEIGHT = 36;
const ROW_HEIGHT = 34;
const ROW_HEIGHT_WITH_HELP = 52;

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

export function VirtualConsoleList({
  items,
  similar,
  showAllSimilar,
  onShowAllSimilar,
  restorePosition,
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
  /** The row of the static list this one replaces that was at the top of the window */
  restorePosition: RowPosition | null;
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

  // These stay the same for one row list. The virtualizer recomputes every measurement when they
  // change
  const estimateSize = useCallback(
    (i: number) => {
      const row = rows[i];
      if (typeof row === "string") return GROUP_ROW_HEIGHT;
      return row.item.help ? ROW_HEIGHT_WITH_HELP : ROW_HEIGHT;
    },
    [rows],
  );
  const getItemKey = useCallback((i: number) => listRowKey(rows[i]), [rows]);

  // Scrolls back to the top of the list when the filters change while the list is scrolled down
  const { listRef, virtualizer, itemTop } = useWindowList<HTMLUListElement>({
    listKey: items,
    count: rows.length,
    estimateSize,
    getItemKey,
  });

  // Restores where the static list was. The same rows above it are estimated alike before any is
  // measured
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!restorePosition || !list || restoredRef.current) return;
    restoredRef.current = true;
    let offset = 0;
    for (let i = 0; i < restorePosition.index; i++) offset += estimateSize(i);
    const listTop = list.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, listTop + offset - restorePosition.top);
  }, [restorePosition, estimateSize, listRef]);

  const nameIndex = useMemo(() => {
    if (!scrollTarget) return -1;
    return rows.findIndex((row) => typeof row !== "string" && row.item.name === scrollTarget);
  }, [rows, scrollTarget]);
  useScrollToRow(listRef, virtualizer, nameIndex);

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
