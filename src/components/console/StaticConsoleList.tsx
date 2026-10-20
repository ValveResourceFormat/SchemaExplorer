import React from "react";
import { styled } from "@linaria/react";
import type { ConsoleMatch } from "../../utils/console-filtering";
import { consoleRowKey } from "../../utils/result-rows";
import { ConsoleRow } from "./ConsoleRow";
import { ListCard } from "./styles";

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
      font-weight: 600;
      font-size: 15px;
      color: var(--text);
      text-decoration: none;
    }
  }
`;

/**
 * Every row in the page itself, as prerendered. Only the first screenful has full rows. The rest
 * is there for search engines until the virtualized list takes over
 */
export function StaticConsoleList({
  listRef,
  items,
  onNavigate,
}: {
  listRef: React.RefObject<HTMLUListElement | null>;
  items: ConsoleMatch[];
  onNavigate: (name: string, e: React.MouseEvent) => void;
}) {
  return (
    <StaticListCard ref={listRef}>
      {items.map(({ item, nameRanges }, i) =>
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
  );
}
