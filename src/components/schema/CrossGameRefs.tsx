import React, { useContext, useMemo } from "react";
import { Link } from "../Link";
import type { Declaration } from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { getGameDef, GameId } from "../../games-list";
import { GameIcon, KindIcon } from "../kind-icon/KindIcon";
import { InlineList, Pill, PillDot } from "./styles";
import { Detail } from "./Detail";
import { tip } from "../Tooltip";
import { compareDeclarations, type DiffStatus } from "../../data/compare";
import { getGameContext } from "../../data/derived";

interface CrossGameRefs {
  /** The same class in the other of client and server */
  crossModuleMatch?: Declaration;
  gameMatches: { gameId: GameId; gameName: string; status: DiffStatus; module: string }[];
}

/** Where else a declaration exists, or null when nowhere */
function useCrossGameRefs(declaration: Declaration): CrossGameRefs | null {
  const { hasNetwork, otherGamesLookup, crossModuleLookup } = useContext(DeclarationsContext);
  return useMemo(() => {
    const crossModuleMatch = crossModuleLookup.get(
      declarationKey(declaration.module, declaration.name),
    );
    const gameMatches: CrossGameRefs["gameMatches"] = [];
    for (const [gameId, lookup] of otherGamesLookup) {
      const match = lookup.get(declaration.name);
      if (match && match.kind === declaration.kind) {
        gameMatches.push({
          gameId,
          gameName: getGameDef(gameId)?.name ?? gameId,
          status: compareDeclarations(
            declaration,
            match,
            hasNetwork && getGameContext(gameId).hasNetwork,
          ),
          module: match.module,
        });
      }
    }
    if (!crossModuleMatch && gameMatches.length === 0) return null;
    return { crossModuleMatch, gameMatches };
  }, [declaration, hasNetwork, otherGamesLookup, crossModuleLookup]);
}

const STATUS: Record<
  Exclude<DiffStatus, "identical">,
  { text: string; title: string; dot: string }
> = {
  offsets_only: {
    text: "offsets differ",
    title: "Only offsets, size or alignment differ, the fields are the same.",
    dot: "var(--cross-game-offsets)",
  },
  differs: {
    text: "differs",
    title: "Its fields, members, base classes, flags, metadata or network data differ.",
    dot: "var(--cross-game-differs)",
  },
};

/** The same declaration in the other module and in other games, nothing when there is none */
export function CrossGameDetail({ declaration }: { declaration: Declaration }) {
  const { game } = useContext(DeclarationsContext);
  const refs = useCrossGameRefs(declaration);
  if (!refs) return null;
  const { crossModuleMatch, gameMatches } = refs;

  return (
    <Detail label="Also in">
      <InlineList>
        {crossModuleMatch && (
          <Link
            to={schemaPath(game, crossModuleMatch.module, crossModuleMatch.name)}
            title={`${crossModuleMatch.name} in ${crossModuleMatch.module}`}
          >
            <KindIcon kind="module" />
            {crossModuleMatch.module}
          </Link>
        )}
        {gameMatches.map(({ gameId, gameName, status, module: otherModule }) => {
          const info = status === "identical" ? null : STATUS[status];
          // The pill sits next to the link, a link underlines everything inside it
          return (
            <span key={gameId}>
              <Link
                to={schemaPath(gameId, otherModule, declaration.name)}
                {...(info ? {} : tip("Identical in this game."))}
              >
                <GameIcon game={gameId} />
                {gameName}
              </Link>
              {info && (
                <Pill
                  style={{ "--dot": info.dot } as React.CSSProperties}
                  {...tip(info.title, info.dot)}
                >
                  <PillDot />
                  {info.text}
                </Pill>
              )}
            </span>
          );
        })}
      </InlineList>
    </Detail>
  );
}
