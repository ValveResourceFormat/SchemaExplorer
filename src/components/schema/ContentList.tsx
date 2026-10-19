import { memo, useContext } from "react";
import { useParams } from "react-router";
import { styled } from "@linaria/react";
import { ContentWrapper, SiteFooter, TextMessage } from "../layout/Content";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { CardBody, Dim, InlineList, PageHeader, PageTitle } from "./styles";
import { KindIcon } from "../kind-icon/KindIcon";
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

// Memoized, so state kept above it renders the page again only when the page reads it from a
// context
export const ContentList = memo(function ContentList() {
  const { declarations, metadata, error } = useContext(DeclarationsContext);
  const { search } = useContext(SearchContext);
  const { game: gameParam, module, scope } = useParams();
  const declaration = module && scope ? declarations.get(module)?.get(scope) : undefined;

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
          <SchemaHome isRoot={!gameParam} />
          {module ? (
            <Section>
              <PageHeader>
                <PageTitle>
                  <KindIcon kind="module" size={24} />
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
});
