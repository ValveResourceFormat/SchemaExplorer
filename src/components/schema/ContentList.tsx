import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { ContentWrapper, ListItem, TextMessage } from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData, useParsedSearch, searchDeclarations } from "../../utils/filtering";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";
import { ClassTree } from "./ClassTree";
import { Declaration } from "../../data/types";
import {
  DeclarationsContext,
  DeclarationsContextType,
  declarationKey,
} from "./DeclarationsContext";
import { GAMES, GameId } from "../../games";
import { SEARCH_TAGS } from "../search/SearchBox";
import { KindIcon } from "../kind-icon/KindIcon";

const CardBlock = styled.div`
  max-width: 560px;
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1.6;
`;

const InfoBlock = styled(CardBlock)`
  margin-top: 24px;

  p {
    margin: 0;
  }

  p + p {
    margin-top: 8px;
  }
`;

const GameChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font: inherit;
  background: var(--group-members);
  border: 1px solid var(--group-border);
  color: var(--text);
  cursor: pointer;
  vertical-align: middle;
  transition: border-color 0.1s;

  &:hover {
    border-color: var(--highlight);
  }

  svg {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }
`;

function GameList() {
  const navigate = useNavigate();
  return (
    <>
      {GAMES.map((g, i) => (
        <React.Fragment key={g.id}>
          {i > 0 && " "}
          <GameChip onClick={() => navigate(`/${g.id}`)}>
            {g.icon} {g.name}
          </GameChip>
        </React.Fragment>
      ))}
    </>
  );
}

const InfoLink = styled.a`
  color: var(--highlight);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const SearchFiltersBlock = styled(CardBlock)`
  dt {
    font-weight: 600;
    color: var(--text);
  }

  dd {
    margin: 0 0 8px 12px;
  }

  dd:last-child {
    margin-bottom: 0;
  }

  code {
    background: var(--group-members);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 15px;
  }
`;

const TreeToggle = styled.button`
  display: block;
  max-width: 560px;
  margin: 16px auto 0;
  padding: 10px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  font: inherit;
  font-size: 15px;
  color: var(--text);
  cursor: pointer;
  text-align: center;
  width: 100%;

  &:hover {
    border-color: var(--highlight);
  }
`;

const OffsetsNote = styled.div`
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
  padding: 8px 4px;
`;

const OtherGameHeader = styled.div`
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

function OtherGamesResults() {
  const ctx = useContext(DeclarationsContext);
  const parsed = useParsedSearch();

  const gameResults = useMemo(() => {
    const result: { gameId: GameId; declarations: Declaration[] }[] = [];
    for (const [gameId, lookup] of ctx.otherGamesLookup) {
      if (gameId === ctx.game) continue;
      const decls = Array.from(lookup.values());
      const found = searchDeclarations(decls, parsed);
      if (found.length > 0) {
        result.push({ gameId, declarations: found });
      }
    }
    return result;
  }, [ctx.game, ctx.otherGamesLookup, parsed]);

  if (gameResults.length === 0) return null;

  return (
    <>
      {gameResults.map(({ gameId, declarations }) => {
        const gameInfo = GAMES.find((g) => g.id === gameId);
        const overrideCtx: DeclarationsContextType = {
          ...ctx,
          game: gameId,
          root: `/${gameId}`,
          declarations,
        };
        return (
          <React.Fragment key={gameId}>
            <OtherGameHeader>
              {gameInfo?.icon} {gameInfo?.name}
            </OtherGameHeader>
            <DeclarationsContext.Provider value={overrideCtx}>
              <LazyList data={declarations} render={renderSearchResult} />
            </DeclarationsContext.Provider>
          </React.Fragment>
        );
      })}
    </>
  );
}

function renderItem(declaration: Declaration, isSearchResult?: boolean) {
  return (
    <ListItem key={declarationKey(declaration.module, declaration.name)}>
      {declaration.kind === "class" ? (
        <SchemaClassView declaration={declaration} isSearchResult={isSearchResult} />
      ) : (
        <SchemaEnumView declaration={declaration} isSearchResult={isSearchResult} />
      )}
    </ListItem>
  );
}

const renderSearchResult = (declaration: Declaration) => renderItem(declaration, true);

export function ContentList() {
  const { declarations, metadata, loading, error } = useContext(DeclarationsContext);
  const { data, isSearching } = useFilteredData(declarations);
  const [showTree, setShowTree] = useState(
    () => /bot|crawl|spider|slurp/i.test(navigator.userAgent) || navigator.webdriver,
  );

  return (
    <ContentWrapper>
      {data.length > 0 ? (
        isSearching ? (
          <LazyList data={data} render={renderSearchResult} />
        ) : (
          <ScrollableList data={data} render={renderItem} />
        )
      ) : isSearching ? (
        <>
          <TextMessage>No results found</TextMessage>
          <OtherGamesResults />
        </>
      ) : error ? (
        <TextMessage>{`Failed to load schemas: ${error}`}</TextMessage>
      ) : loading ? (
        <TextMessage>Loading schemas...</TextMessage>
      ) : (
        <>
          <TextMessage>Choose a class or enum from the sidebar, or use search...</TextMessage>
          <InfoBlock>
            <p>
              Source 2 includes a schema system that describes the engine's classes, fields, and
              enumerations along with their types, offsets, and metadata. These schemas
              comprehensively map engine internals, making them useful for modding and reverse
              engineering.
            </p>
            <p>
              Currently tracking: <GameList />
            </p>
            <p>
              The schemas displayed here are generated by{" "}
              <InfoLink href="https://github.com/ValveResourceFormat/DumpSource2">
                DumpSource2
              </InfoLink>{" "}
              and automatically updated by{" "}
              <InfoLink href="https://github.com/SteamTracking/GameTracking">GameTracking</InfoLink>
              . The code for this site is on{" "}
              <InfoLink href="https://github.com/ValveResourceFormat/SchemaExplorer">
                GitHub
              </InfoLink>
              .
            </p>
          </InfoBlock>
          <SearchFiltersBlock>
            <dl>
              <dt>Search by name</dt>
              <dd>Type any text to match class, field, or enum names.</dd>
              {SEARCH_TAGS.map((t) => (
                <React.Fragment key={t.tag}>
                  <dt>
                    <KindIcon kind={t.icon} size="small" /> <code>{t.tag}</code> —{" "}
                    {t.description.toLowerCase()}
                  </dt>
                  <dd>{t.example}</dd>
                </React.Fragment>
              ))}
            </dl>
            Filters can be combined.
          </SearchFiltersBlock>
          {showTree ? (
            <ClassTree />
          ) : (
            <TreeToggle onClick={() => setShowTree(true)}>View class inheritance tree</TreeToggle>
          )}
        </>
      )}
      {data.length > 0 && metadata.revision > 0 && (
        <OffsetsNote>
          Offsets are from Windows. Source revision {metadata.revision} built on{" "}
          {metadata.versionDate}.
        </OffsetsNote>
      )}
    </ContentWrapper>
  );
}
