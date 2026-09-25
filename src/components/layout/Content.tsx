import { styled } from "@linaria/react";
import { BASE_PATH, getGameDef, type GameId } from "../../games-list";
import type { SchemaMetadata } from "../../data/schemas";
import { ICONS_URL } from "../kind-icon/KindIcon";
import { subtleUnderline } from "../schema/link-styles";

export const ContentWrapper = styled.main`
  padding-bottom: 24px;
  min-width: 0;

  @media (max-width: 768px) {
    grid-column: 1;
    padding-bottom: 16px;
  }
`;

export const TextMessage = styled.div`
  margin-top: 50px;
  align-self: center;
  font-size: 36px;
  font-weight: 300;
  color: var(--text-dim);
  text-align: center;

  @media (max-width: 768px) {
    margin-top: 20px;
    font-size: 20px;
  }
`;

export const ListItem = styled.div`
  padding: 5px 0;

  /* Cards space themselves, the list already does between items */
  > :last-child {
    margin-bottom: 0;
  }
`;

const PageFooter = styled.footer`
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
  padding: 8px 4px;

  a {
    color: inherit;
    ${subtleUnderline}

    &:hover {
      color: var(--text);
    }
  }
`;

const GameHeadingWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0 4px;
  font-size: 15px;
  color: var(--text-dim);

  svg {
    width: 18px;
    height: 18px;
    border-radius: 3px;
  }
`;

/** Heading above results from another game */
export function OtherGameHeading({ gameId }: { gameId: GameId }) {
  return (
    <GameHeadingWrapper>
      <svg width="24" height="24">
        <use href={`${ICONS_URL}#game-${gameId}`} />
      </svg>
      {getGameDef(gameId)?.name}
    </GameHeadingWrapper>
  );
}

/** Source revision and the llms.txt link, at the bottom of every page */
export function SiteFooter({
  metadata,
  note,
}: {
  /** Without it, the revision line is left out */
  metadata?: SchemaMetadata;
  note?: string;
}) {
  return (
    <PageFooter>
      {metadata && metadata.revision > 0 && (
        <>
          {note && `${note} `}Source revision {metadata.revision} built on {metadata.versionDate}
          .{" "}
        </>
      )}
      Machine-readable data for scripts and AI agents:{" "}
      <a href={`${BASE_PATH}/llms.txt`}>llms.txt</a>.
    </PageFooter>
  );
}
