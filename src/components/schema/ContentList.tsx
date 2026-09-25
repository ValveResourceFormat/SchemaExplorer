import React, { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import { ContentWrapper, OtherGameHeading, SiteFooter, TextMessage } from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData, useParsedSearch, searchDeclarations } from "../../utils/filtering";
import { Declaration } from "../../data/types";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { getGameContext } from "../../data/derived";
import { GameId } from "../../games-list";
import { CardBody, Dim, InlineList, PageHeader, PageTitle } from "./styles";
import { KindIcon } from "../kind-icon/KindIcon";
import { Link } from "../Link";
import { TitledCard } from "./Cards";
import { ClassTree, EntityTree } from "./ClassTree";
import { SchemaHome } from "./SchemaHome";
import { OtherSectionMatches } from "../search/OtherSectionMatches";
import { renderDeclaration, renderSearchResult } from "./renderDeclaration";

/** Below the introduction, with the same space above as the cards there */
const Section = styled.div`
  margin-top: 32px;
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
    <TitledCard title="Modules" icon="module">
      <CardBody>
        <InlineList>
          {[...declarations].map(([mod, moduleMap]) => (
            // The count sits outside the link, so only the name is underlined
            <span key={mod} title={`${moduleMap.size} declarations`}>
              <Link to={schemaPath(game, mod)}>{mod}</Link>
              <Dim>{moduleMap.size}</Dim>
            </span>
          ))}
        </InlineList>
      </CardBody>
    </TitledCard>
  );
}

export function ContentList({ filtered }: { filtered: ReturnType<typeof useFilteredData> }) {
  const { metadata, error } = useContext(DeclarationsContext);
  const { data, isSearching } = filtered;
  const { game: gameParam, module } = useParams();

  return (
    <ContentWrapper>
      {data.length > 0 ? (
        isSearching ? (
          <>
            <OtherSectionMatches section="schemas" own={data} />
            <LazyList data={data} render={renderSearchResult} />
          </>
        ) : (
          <ScrollableList data={data} render={renderDeclaration} />
        )
      ) : isSearching ? (
        <>
          <TextMessage>No results found</TextMessage>
          <OtherSectionMatches section="schemas" own={data} />
          <OtherGamesResults />
        </>
      ) : error ? (
        <TextMessage>{error}</TextMessage>
      ) : (
        <>
          <SchemaHome isRoot={!gameParam} />
          {module ? (
            <Section>
              <PageHeader>
                <PageTitle>
                  <KindIcon kind="module" size="big" />
                  {module}
                </PageTitle>
              </PageHeader>
              <EntityTree module={module} />
              <ClassTree module={module} />
            </Section>
          ) : (
            gameParam && (
              <Section>
                <ModuleList />
              </Section>
            )
          )}
        </>
      )}
      {module !== INTRINSIC_MODULE && (
        <SiteFooter metadata={gameParam ? metadata : undefined} note="Offsets are from Windows." />
      )}
    </ContentWrapper>
  );
}
