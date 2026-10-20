import { memo, useContext } from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import { ContentWrapper, SiteFooter, TextMessage } from "../layout/Content";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { moduleLabel } from "../../data/modules";
import { getGameDef } from "../../games-list";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { CardBody, Dim, InlineList, PageHeader, PageTitle } from "./styles";
import { ModuleIcon, ModuleLabel } from "../kind-icon/KindIcon";
import { Link } from "../Link";
import { SearchContext } from "../search/SearchContext";
import { TitledCard } from "./Cards";
import { ClassTree, EntityTree } from "./ClassTree";
import { SchemaHome } from "./SchemaHome";
import { SchemaResults } from "../search/SchemaResults";
import { renderDeclaration } from "./renderDeclaration";

/** Below the introduction, with the same space above as the cards there */
const Section = styled.div`
  margin-top: 32px;
`;

/** Lines up with the cards of the introduction below it */
const GameHeader = styled(PageHeader)`
  max-width: 1140px;
  margin: 32px auto 0;
`;

const ModuleIntro = styled.p`
  margin: -8px 0 16px;
  color: var(--text-dim);
`;

function ModuleList() {
  const { game, declarations } = useContext(DeclarationsContext);

  return (
    <TitledCard title="Modules" icon="module">
      <CardBody>
        <InlineList>
          {[...declarations].map(([mod, moduleMap]) => (
            // The count sits outside the link, so only the name is underlined
            <span key={mod} title={`${moduleMap.size} declarations`}>
              <Link to={schemaPath(game, mod)}>
                <ModuleLabel module={mod} />
              </Link>
              <Dim>{moduleMap.size}</Dim>
            </span>
          ))}
        </InlineList>
      </CardBody>
    </TitledCard>
  );
}

// Memoized. State kept above it renders the page again only when the page reads that state from a
// context
export const ContentList = memo(function ContentList() {
  const { game, declarations, metadata, error } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const { game: gameParam, module, scope } = useParams();
  const declaration = module && scope ? declarations.get(module)?.get(scope) : undefined;
  const gameName = getGameDef(game).name;
  const isIntrinsic = module === INTRINSIC_MODULE;
  const moduleTitle = isIntrinsic
    ? moduleLabel(INTRINSIC_MODULE)
    : `${module}.dll classes and enums`;

  return (
    <ContentWrapper>
      {search ? (
        <SchemaResults />
      ) : declaration ? (
        <div>{renderDeclaration(declaration)}</div>
      ) : error ? (
        <TextMessage>{error}</TextMessage>
      ) : (
        <>
          {gameParam && !module && (
            <GameHeader>
              <PageTitle>{gameName} schemas: classes, enums and offsets</PageTitle>
            </GameHeader>
          )}
          <SchemaHome isRoot={!gameParam} />
          {module ? (
            <Section>
              <PageHeader>
                <PageTitle>
                  <ModuleIcon module={module} size={24} />
                  <span>
                    {moduleTitle} <Dim>– {gameName}</Dim>
                  </span>
                </PageTitle>
              </PageHeader>
              {isIntrinsic && (
                <ModuleIntro>
                  Engine types that schema fields use, but the schemas don't describe. Their fields
                  are laid out by this site, and their sizes come from the dump where it has them.
                </ModuleIntro>
              )}
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
      {!isIntrinsic && (
        <SiteFooter metadata={gameParam ? metadata : undefined} note="Offsets are from Windows." />
      )}
    </ContentWrapper>
  );
});
