import { useContext, useMemo } from "react";
import { styled } from "@linaria/react";
import type { ConsoleItem, Declaration } from "../../data/types";
import { betterMatches, type SearchMode } from "../../utils/section-search";
import { Link } from "../Link";
import { KindIcon } from "../kind-icon/KindIcon";
import { ResultsHeading } from "../layout/Content";
import { ConsoleRowsCard } from "../console/ConsoleRowsCard";
import { DeclarationsContext } from "../schema/DeclarationsContext";
import { highlightLink } from "../schema/link-styles";
import { renderSearchResult } from "../schema/renderDeclaration";
import { OtherSectionContext, SECTIONS, formatSectionCount } from "./useOtherSection";

/**
 * Above a section's search results, the other section's results that match the search better,
 * like the sv_cheats convar when searching schemas. Without results of its own, a link to the
 * other section's when it has any
 */
export function OtherSectionMatches({
  section,
  own,
}: {
  section: SearchMode;
  own: readonly (Declaration | ConsoleItem)[];
}) {
  const context = useContext(DeclarationsContext);
  const { section: other, to, results } = useContext(OtherSectionContext)!;
  const better = useMemo(
    () => results && betterMatches(context, own, results),
    [context, own, results],
  );
  if (!results || !better || results.items.length === 0) return null;

  const total = results.items.length;
  const countText = formatSectionCount(total, other);
  if (better.items.length === 0) {
    if (own.length > 0) return null;
    return (
      <Hint>
        <Link to={to}>
          {countText} result{total !== 1 && "s"} in {SECTIONS[other].label}
        </Link>
      </Hint>
    );
  }

  return (
    <>
      <ResultsHeading>
        <KindIcon kind={SECTIONS[other].icon} size="small" />
        {SECTIONS[other].label}
        {total > better.items.length && <AllLink to={to}>All {countText} results</AllLink>}
      </ResultsHeading>
      {better.section === "console" ? (
        <ConsoleRowsCard gameId={context.game} items={better.items} />
      ) : (
        better.items.map(renderSearchResult)
      )}
      {own.length > 0 && (
        <ResultsHeading>
          <KindIcon kind={SECTIONS[section].icon} size="small" />
          {SECTIONS[section].label}
        </ResultsHeading>
      )}
    </>
  );
}

const Hint = styled.p`
  margin: 12px 0 0;
  text-align: center;
  font-size: 16px;

  a {
    ${highlightLink}
  }
`;

const AllLink = styled(Link)`
  margin-left: auto;
  font-size: 14px;
  ${highlightLink}
`;
