import * as api from "./api";
import React, { useContext, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "../KindIcon";
import { DeclarationsContext } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import { formatHexOffset } from "./utils/format";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { ModuleBadge, GitHubFileLink } from "./SchemaClass";
import {
  matchesWords,
  matchesMetadataKeys,
  useSearchWords,
  useSearchMetadata,
  useFieldParam,
} from "./utils/filtering";
import {
  AnchorName,
  CollapsedItemsLink,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  DeclarationNameLink,
} from "./utils/styles";

const EnumTypeWrapper = styled.span`
  font-size: 16px;
  font-weight: normal;
  color: var(--text-dim);
  margin-left: 8px;
`;

const EnumMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 2px;
  }
`;

const EnumMemberWrapper = styled.div`
  padding: 3px 8px;
  background-color: transparent;
  border-radius: 6px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 6px;

  &[data-highlighted] {
    background-color: var(--search-highlight);
  }

  &[data-anchored] {
    background-color: var(--search-highlight);
  }
`;

const EnumMemberIcon = styled.div`
  grid-column: 1;
  grid-row: 1 / -1;
`;

const EnumMemberContent = styled.div`
  grid-column: 2;
  min-width: 0;
`;

const EnumMemberSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
`;

const EnumMemberHex = styled.span`
  font-family:
    ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
`;

export const SchemaEnumView: React.FC<{
  declaration: api.SchemaEnum;
}> = ({ declaration }) => {
  const { root } = useContext(DeclarationsContext);
  const searchWords = useSearchWords();
  const searchMetadata = useSearchMetadata();
  const fieldParam = useFieldParam();

  const isSearching = searchWords.length > 0 || searchMetadata.length > 0;
  const nameMatches = searchWords.length > 0 && matchesWords(declaration.name, searchWords);
  const collapseNonMatching = isSearching && !nameMatches;

  const { matchingMembers, hiddenCount } = useMemo(() => {
    if (!collapseNonMatching) {
      return { matchingMembers: declaration.members, hiddenCount: 0 };
    }
    const matching = declaration.members.filter(
      (m) =>
        (searchWords.length > 0 && matchesWords(m.name, searchWords)) ||
        (searchMetadata.length > 0 && matchesMetadataKeys(m.metadata, searchMetadata)),
    );
    return { matchingMembers: matching, hiddenCount: declaration.members.length - matching.length };
  }, [declaration.members, searchWords, searchMetadata, collapseNonMatching]);

  return (
    <CommonGroupWrapper>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="enum" size="big" />
          <DeclarationNameLink to={`${root}/${declaration.module}/${declaration.name}`}>
            {declaration.name}
          </DeclarationNameLink>
          <EnumTypeWrapper>: {declaration.alignment}</EnumTypeWrapper>
          <ModuleBadge module={declaration.module} />
          <GitHubFileLink module={declaration.module} name={declaration.name} />
        </CommonGroupSignature>
      </DeclarationHeader>
      {(!collapseNonMatching ||
        (searchMetadata.length > 0 &&
          matchesMetadataKeys(declaration.metadata, searchMetadata))) && (
        <MetadataTags metadata={declaration.metadata} />
      )}
      {(matchingMembers.length > 0 || hiddenCount > 0) && (
        <EnumMembers>
          {matchingMembers.map((member) => (
            <EnumMemberView
              key={`${member.name}-${member.value}`}
              member={member}
              fieldUrlBase={`${root}/${declaration.module}/${declaration.name}`}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(member.name, searchWords)) ||
                (searchMetadata.length > 0 && matchesMetadataKeys(member.metadata, searchMetadata))
              }
              anchored={fieldParam === member.name}
            />
          ))}
          {hiddenCount > 0 && (
            <CollapsedItemsLink to={`${root}/${declaration.module}/${declaration.name}`}>
              {hiddenCount} more member{hiddenCount !== 1 ? "s" : ""}…
            </CollapsedItemsLink>
          )}
        </EnumMembers>
      )}
      {!collapseNonMatching && <ReferencedBy name={declaration.name} module={declaration.module} />}
      {!collapseNonMatching && <CrossGameRefs declaration={declaration} />}
    </CommonGroupWrapper>
  );
};

function EnumMemberView({
  member,
  fieldUrlBase,
  highlighted,
  anchored,
}: {
  member: api.SchemaEnumMember;
  fieldUrlBase: string;
  highlighted: boolean;
  anchored: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchored && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [anchored]);

  const navigate = useNavigate();
  const copyAnchorLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const fieldUrl = `${fieldUrlBase}?field=${encodeURIComponent(member.name)}`;
    const fullUrl = `${window.location.origin}${window.location.pathname}#${fieldUrl}`;
    navigator.clipboard.writeText(fullUrl);
    navigate(fieldUrl, { replace: true });
  };

  return (
    <EnumMemberWrapper
      ref={rowRef}
      data-highlighted={highlighted || undefined}
      data-anchored={anchored || undefined}
    >
      <EnumMemberIcon>
        <KindIcon kind="enum-member" size="small" />
      </EnumMemberIcon>
      <EnumMemberContent>
        <EnumMemberSignature>
          <AnchorName onClick={copyAnchorLink} title="Copy link to member">
            {member.name}
          </AnchorName>{" "}
          = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
          <EnumMemberHex>{formatHexOffset(member.value)}</EnumMemberHex>
        </EnumMemberSignature>
        {member.metadata && <MetadataTags metadata={member.metadata} />}
      </EnumMemberContent>
    </EnumMemberWrapper>
  );
}
