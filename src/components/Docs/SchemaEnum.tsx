import * as api from "./api";
import React, { useContext, useMemo } from "react";
import styled from "styled-components";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "./utils/components";
import { DeclarationsContext } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { ModuleBadge } from "./SchemaClass";
import { matchesWords, useSearchWords } from "./utils/filtering";
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
  color: ${(props) => props.theme.textDim};
  margin-left: 8px;
`;

const EnumMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 2px;
  }
`;

const EnumMemberWrapper = styled.div<{ $highlighted?: boolean }>`
  padding: 3px 8px;
  background-color: ${(props) =>
    props.$highlighted ? props.theme.searchHighlight : "transparent"};
  border-radius: 6px;
`;

const EnumMemberSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
`;

export const SchemaEnumView: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  declaration: api.SchemaEnum;
}> = ({ className, style, declaration }) => {
  const { root } = useContext(DeclarationsContext);
  const searchWords = useSearchWords();

  const isSearching = searchWords.length > 0;
  const nameMatches = isSearching && matchesWords(declaration.name, searchWords);
  const collapseNonMatching = isSearching && !nameMatches;

  const { matchingMembers, hiddenCount } = useMemo(() => {
    if (!collapseNonMatching) {
      return { matchingMembers: declaration.members, hiddenCount: 0 };
    }
    const matching = declaration.members.filter((m) => matchesWords(m.name, searchWords));
    return { matchingMembers: matching, hiddenCount: declaration.members.length - matching.length };
  }, [declaration.members, searchWords, collapseNonMatching]);

  return (
    <CommonGroupWrapper className={className} style={style}>
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
                collapseNonMatching || (isSearching && matchesWords(member.name, searchWords))
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
  return (
    <EnumMemberWrapper $highlighted={highlighted}>
      <EnumMemberSignature>
        <KindIcon kind="enum-member" size="small" />
        {member.name} = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
      </EnumMemberSignature>
      {member.metadata && <MetadataTags metadata={member.metadata} />}
    </EnumMemberWrapper>
  );
}
