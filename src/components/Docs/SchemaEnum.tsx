import * as api from "./api";
import React, { useContext, useMemo } from "react";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "./utils/components";
import { DeclarationsContext } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { ModuleBadge } from "./SchemaClass";
import {
  matchesWords,
  matchesMetadataKeys,
  useSearchWords,
  useSearchMetadata,
} from "./utils/filtering";
import {
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

  &[data-highlighted] {
    background-color: var(--search-highlight);
  }
`;

const EnumMemberSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
`;

const EnumMemberHex = styled.span`
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
        </CommonGroupSignature>
      </DeclarationHeader>
      {!collapseNonMatching && <MetadataTags metadata={declaration.metadata} />}
      {(matchingMembers.length > 0 || hiddenCount > 0) && (
        <EnumMembers>
          {matchingMembers.map((member) => (
            <EnumMemberView
              key={`${member.name}-${member.value}`}
              member={member}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(member.name, searchWords)) ||
                (searchMetadata.length > 0 && matchesMetadataKeys(member.metadata, searchMetadata))
              }
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
  highlighted,
}: {
  member: api.SchemaEnumMember;
  highlighted: boolean;
}) {
  const hexDigits = member.value.toString(16).toUpperCase();
  const paddedHex = hexDigits.length % 2 !== 0 ? `0${hexDigits}` : hexDigits;
  return (
    <EnumMemberWrapper data-highlighted={highlighted || undefined}>
      <EnumMemberSignature>
        <KindIcon kind="enum-member" size="small" />
        {member.name} = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
        <EnumMemberHex>0x{paddedHex}</EnumMemberHex>
      </EnumMemberSignature>
      {member.metadata && <MetadataTags metadata={member.metadata} />}
    </EnumMemberWrapper>
  );
}
