import React, { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import { ContentWrapper, ListItem, TextMessage } from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData, useParsedSearch, searchDeclarations } from "../../utils/filtering";
import { DeclarationBreadcrumb } from "./Breadcrumb";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";
import { Declaration } from "../../data/types";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { GameId, getGameDef } from "../../games-list";
import { ICONS_URL } from "../kind-icon/KindIcon";
import { CardBlock, SectionLink } from "./styles";
import { ClassTree } from "./ClassTree";
import { SchemaHome } from "./SchemaHome";

const ModuleChipsBlock = styled(CardBlock)`
  margin-top: 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const OffsetsNote = styled.footer`
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
    const result: { gameId: GameId; found: Declaration[] }[] = [];
    for (const [gameId, lookup] of ctx.otherGamesLookup) {
      if (gameId === ctx.game) continue;
      const found = searchDeclarations(lookup.values(), parsed);
      if (found.length > 0) {
        result.push({ gameId, found });
      }
    }
    return result;
  }, [ctx.game, ctx.otherGamesLookup, parsed]);

  if (gameResults.length === 0) return null;

  return (
    <>
      {gameResults.map(({ gameId, found }) => {
        const gameInfo = getGameDef(gameId);
        return (
          <React.Fragment key={gameId}>
            <OtherGameHeader>
              <svg width="24" height="24">
                <use href={`${ICONS_URL}#game-${gameId}`} />
              </svg>
              {gameInfo?.name}
            </OtherGameHeader>
            <DeclarationsContext.Provider value={{ ...ctx, game: gameId }}>
              <LazyList data={found} render={renderSearchResult} />
            </DeclarationsContext.Provider>
          </React.Fragment>
        );
      })}
    </>
  );
}

function ModuleList() {
  const { game, declarations } = useContext(DeclarationsContext);

  return (
    <ModuleChipsBlock>
      {[...declarations].map(([mod, moduleMap]) => (
        <SectionLink key={mod} to={schemaPath(game, mod)}>
          {mod} ({moduleMap.size})
        </SectionLink>
      ))}
    </ModuleChipsBlock>
  );
}

function renderItem(declaration: Declaration, isSearchResult?: boolean) {
  return (
    <ListItem key={declarationKey(declaration.module, declaration.name)}>
      {!isSearchResult && (
        <DeclarationBreadcrumb
          module={declaration.module}
          name={declaration.name}
          parent={declaration.kind === "class" ? declaration.parents[0] : undefined}
        />
      )}
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
  const { declarations, metadata, error } = useContext(DeclarationsContext);
  const { data, isSearching } = useFilteredData(declarations);
  const { game: gameParam, module } = useParams();

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
        <TextMessage>{error}</TextMessage>
      ) : (
        <>
          <SchemaHome isRoot={!gameParam} />
          {module ? <ClassTree module={module} /> : gameParam && <ModuleList />}
        </>
      )}
      {data.length > 0 && metadata.revision > 0 && module !== INTRINSIC_MODULE && (
        <OffsetsNote>
          Offsets are from Windows. Source revision {metadata.revision} built on{" "}
          {metadata.versionDate}.
        </OffsetsNote>
      )}
    </ContentWrapper>
  );
}
