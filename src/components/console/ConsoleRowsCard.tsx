import React, { useCallback } from "react";
import { useHref, useNavigate } from "react-router";
import type { ConsoleItem } from "../../data/types";
import type { GameId } from "../../games-list";
import { buildHash } from "../../utils/filtering";
import { getGameContext } from "../../data/derived";
import { DeclarationsContext, consolePath } from "../schema/DeclarationsContext";
import { ConsoleRow, isPlainLeftClick } from "./ConsoleRow";
import { ListCard } from "./styles";

/** Rows shown outside their own list, each linking to its row on the game's convars page */
export function ConsoleRowsCard({ gameId, items }: { gameId: GameId; items: ConsoleItem[] }) {
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

  // The rows' own game, for its icon on the exclusive flag
  return (
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
  );
}
