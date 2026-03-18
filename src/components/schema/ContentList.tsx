import React, { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { ContentWrapper, ListItem, TextMessage } from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData, useParsedSearch, searchDeclarations } from "../../utils/filtering";
import { DeclarationBreadcrumb } from "./Breadcrumb";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";
import { ClassTree } from "./ClassTree";
import { Declaration } from "../../data/types";
import {
  DeclarationsContext,
  DeclarationsContextType,
  declarationKey,
  schemaPath,
} from "./DeclarationsContext";
import { GAME_LIST, GameId, getGameDef, compareModuleNames } from "../../games-list";
import { SEARCH_TAGS } from "../search/SearchBox";
import { KindIcon, ICONS_URL } from "../kind-icon/KindIcon";
import { SectionLink } from "./styles";

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

const GameChip = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--group-members);
  border: 1px solid var(--group-border);
  color: var(--text);
  text-decoration: none;
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
  return (
    <>
      {GAME_LIST.map((g, i) => (
        <React.Fragment key={g.id}>
          {i > 0 && " "}
          <GameChip to={schemaPath(g.id)}>
            <svg width="24" height="24">
              <use href={`${ICONS_URL}#game-${g.id}`} />
            </svg>{" "}
            {g.name}
          </GameChip>
        </React.Fragment>
      ))}
    </>
  );
}

const InfoLink = styled.a`
  color: var(--highlight);

  &:hover {
    color: var(--text);
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

const ModuleChipsBlock = styled(CardBlock)`
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
        const gameInfo = getGameDef(gameId);
        const overrideCtx: DeclarationsContextType = {
          ...ctx,
          game: gameId,
          declarations,
        };
        return (
          <React.Fragment key={gameId}>
            <OtherGameHeader>
              <svg width="24" height="24">
                <use href={`${ICONS_URL}#game-${gameId}`} />
              </svg>{" "}
              {gameInfo?.name}
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

function ModuleList() {
  const { game, declarations } = useContext(DeclarationsContext);

  const modules = useMemo(() => {
    const moduleMap = new Map<string, number>();
    for (const d of declarations) {
      moduleMap.set(d.module, (moduleMap.get(d.module) ?? 0) + 1);
    }
    return Array.from(moduleMap.entries()).sort(([a], [b]) => compareModuleNames(a, b));
  }, [declarations]);

  return (
    <ModuleChipsBlock>
      {modules.map(([mod, count]) => (
        <SectionLink key={mod} to={schemaPath(game, mod)}>
          {mod} ({count})
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
  const { module } = useParams();

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
          {module ? <ClassTree module={module} /> : <ModuleList />}
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
