import React, { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import {
  ContentWrapper,
  ListItem,
  OtherGameHeading,
  SiteFooter,
  TextMessage,
} from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData, useParsedSearch, searchDeclarations } from "../../utils/filtering";
import { DeclarationBreadcrumb } from "./Breadcrumb";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";
import { Declaration } from "../../data/types";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { getGameContext } from "../../data/derived";
import { GameId } from "../../games-list";
import { CardBlock, SectionLink } from "./styles";
import { ClassTree, EntityTree } from "./ClassTree";
import { SchemaHome } from "./SchemaHome";

const ModuleChipsBlock = styled(CardBlock)`
  margin-top: 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

function OtherGamesResults() {
  const ctx = useContext(DeclarationsContext);
  const parsed = useParsedSearch();

  const gameResults = useMemo(() => {
    const result: { gameId: GameId; found: Declaration[] }[] = [];
    for (const [gameId, lookup] of ctx.otherGamesLookup) {
      if (gameId === ctx.game) continue;
      const found = searchDeclarations(lookup.values(), parsed, getGameContext(gameId));
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
        return (
          <React.Fragment key={gameId}>
            <OtherGameHeading gameId={gameId} />
            <DeclarationsContext.Provider value={getGameContext(gameId)}>
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
  const context = useContext(DeclarationsContext);
  const { metadata, error } = context;
  const { data, isSearching } = useFilteredData(context);
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
          {module ? (
            <>
              <EntityTree module={module} />
              <ClassTree module={module} />
            </>
          ) : (
            gameParam && <ModuleList />
          )}
        </>
      )}
      {module !== INTRINSIC_MODULE && (
        <SiteFooter metadata={gameParam ? metadata : undefined} note="Offsets are from Windows." />
      )}
    </ContentWrapper>
  );
}
