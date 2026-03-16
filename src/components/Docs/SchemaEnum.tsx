import * as api from "./api";
import React, { useContext, useMemo } from "react";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "../KindIcon";
import { DeclarationsContext, declarationPath } from "./DeclarationsContext";
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
import { useAnchoredRow } from "./utils/useAnchoredRow";
import {
  AnchorName,
  CollapsedItemsLink,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  DeclarationNameLink,
  GridContent,
  GridIcon,
  MemberSignature,
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

const EnumMemberHex = styled.span`
  font-family: var(--font-mono);
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

  const declPath = declarationPath(root, declaration.module, declaration.name);

  return (
    <CommonGroupWrapper>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="enum" size="big" />
          <DeclarationNameLink to={declPath}>{declaration.name}</DeclarationNameLink>
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
              fieldUrlBase={declPath}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(member.name, searchWords)) ||
                (searchMetadata.length > 0 && matchesMetadataKeys(member.metadata, searchMetadata))
              }
              anchored={fieldParam === member.name}
            />
          ))}
          {hiddenCount > 0 && (
            <CollapsedItemsLink to={declPath}>
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
  const { rowRef, copyAnchorLink } = useAnchoredRow(fieldUrlBase, member.name, anchored);

  return (
    <EnumMemberWrapper
      ref={rowRef}
      data-highlighted={highlighted || undefined}
      data-anchored={anchored || undefined}
    >
      <GridIcon>
        <KindIcon kind="enum-member" size="small" />
      </GridIcon>
      <GridContent>
        <MemberSignature>
          <AnchorName onClick={copyAnchorLink} title="Copy link to member">
            {member.name}
          </AnchorName>{" "}
          = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
          <EnumMemberHex>{formatHexOffset(member.value)}</EnumMemberHex>
        </MemberSignature>
        <MetadataTags metadata={member.metadata} />
      </GridContent>
    </EnumMemberWrapper>
  );
}
