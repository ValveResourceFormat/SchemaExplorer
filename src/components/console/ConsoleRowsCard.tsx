import React, { useCallback } from "react";
import { useHref, useNavigate } from "react-router";
import type { GameId } from "../../games-list";
import type { ConsoleMatch } from "../../utils/console-filtering";
import { buildHash } from "../../utils/filtering";
import { getGameContext } from "../../data/derived";
import { consoleRowKey } from "../../utils/result-rows";
import { DeclarationsContext, consolePath } from "../schema/DeclarationsContext";
import { ConsoleRow, isPlainLeftClick } from "./ConsoleRow";
import { ListCard } from "./styles";

/** Where the rows of a game's convars link to: its convars page, scrolled to the row's name */
export function useConsoleRowLinks(gameId: GameId) {
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
  return { pageHref, onNavigate };
}

/** Rows shown outside their own list, each linking to its row on the game's convars page */
export function ConsoleRowsCard({ gameId, matches }: { gameId: GameId; matches: ConsoleMatch[] }) {
  const { pageHref, onNavigate } = useConsoleRowLinks(gameId);

  // The rows' own game, for its icon on the exclusive flag
  return (
    <DeclarationsContext.Provider value={getGameContext(gameId)}>
      <ListCard>
        {matches.map(({ item, nameRanges }) => (
          <ConsoleRow
            key={consoleRowKey(item)}
            item={item}
            nameRanges={nameRanges}
            anchored={false}
            pageHref={pageHref}
            onNavigate={onNavigate}
          />
        ))}
      </ListCard>
    </DeclarationsContext.Provider>
  );
}
