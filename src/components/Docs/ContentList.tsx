import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { ContentWrapper, ListItem, TextMessage } from "../layout/Content";
import { LazyList, ScrollableList } from "../Lists";
import { useFilteredData } from "./utils/filtering";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";
import { ClassTree } from "./ClassTree";
import { Declaration } from "./api";
import { DeclarationsContext, declarationKey } from "./DeclarationsContext";
import { SearchContext } from "../Search/SearchContext";
import { GAMES } from "../../games";

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

const SearchExampleButton = styled.button`
  background: var(--group-members);
  padding: 1px 5px;
  border-radius: 4px;
  font: inherit;
  font-size: 15px;
  border: 1px solid transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    border-color: var(--highlight);
  }
`;

function SearchExample({ query }: { query: string }) {
  const { root } = useContext(DeclarationsContext);
  const navigate = useNavigate();
  return (
    <SearchExampleButton onClick={() => navigate(`${root}?search=${encodeURIComponent(query)}`)}>
      {query}
    </SearchExampleButton>
  );
}

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

function renderItem(declaration: Declaration) {
  let children: React.JSX.Element;
  switch (declaration.kind) {
    case "class":
      children = <SchemaClassView declaration={declaration} />;
      break;
    case "enum":
      children = <SchemaEnumView declaration={declaration} />;
      break;
  }

  return <ListItem key={declarationKey(declaration.module, declaration.name)}>{children}</ListItem>;
}

export function ContentList() {
  const { declarations, metadata, loading, error } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const { data, isSearching } = useFilteredData(declarations);
  const [showTree, setShowTree] = useState(
    () => /bot|crawl|spider|slurp/i.test(navigator.userAgent) || navigator.webdriver,
  );

  return (
    <ContentWrapper>
      {data.length > 0 ? (
        isSearching ? (
          <LazyList key={search} data={data} render={renderItem} />
        ) : (
          <ScrollableList data={data} render={renderItem} />
        )
      ) : isSearching ? (
        <TextMessage>No results found</TextMessage>
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
              <dd>
                Type any text to match class, field, or enum names. Example:{" "}
                <SearchExample query="m_vecOrigin" />
              </dd>
              <dt>
                <code>module:</code> — filter by module
              </dt>
              <dd>
                Example: <SearchExample query="module:client" />
              </dd>
              <dt>
                <code>offset:</code> — find fields at a byte offset
              </dt>
              <dd>
                Hex or decimal. Example: <SearchExample query="offset:0x100" />
              </dd>
              <dt>
                <code>metadata:</code> — find by metadata key
              </dt>
              <dd>
                Matches classes, fields, or enum members that have a metadata key. Example:{" "}
                <SearchExample query="metadata:MNetworkEnable" />
              </dd>
            </dl>
            Filters can be combined: <SearchExample query="module:client metadata:MNetworkEnable" />
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
