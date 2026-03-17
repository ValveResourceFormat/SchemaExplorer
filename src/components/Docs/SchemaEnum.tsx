import * as api from "./api";
import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "../KindIcon";
import { DeclarationsContext, declarationPath } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import { formatEnumHex } from "./utils/format";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { ModuleBadge, GitHubFileLink } from "./SchemaClass";
import { useFieldParam } from "./utils/filtering";
import { useAnchoredRow } from "./utils/useAnchoredRow";
import {
  AnchorName,
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
  isSearchResult?: boolean;
}> = ({ declaration, isSearchResult }) => {
  const { root } = useContext(DeclarationsContext);
  const navigate = useNavigate();
  const fieldParam = useFieldParam();

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
      <MetadataTags metadata={declaration.metadata} root={root} navigate={navigate} />
      {declaration.members.length > 0 && (
        <EnumMembers>
          {declaration.members.map((member) => (
            <EnumMemberView
              key={`${member.name}-${member.value}`}
              member={member}
              alignment={declaration.alignment}
              fieldUrlBase={declPath}
              root={root}
              navigate={navigate}
              anchored={fieldParam === member.name}
            />
          ))}
        </EnumMembers>
      )}
      {!isSearchResult && <ReferencedBy name={declaration.name} module={declaration.module} />}
      {!isSearchResult && <CrossGameRefs declaration={declaration} />}
    </CommonGroupWrapper>
  );
};

function EnumMemberView({
  member,
  alignment,
  fieldUrlBase,
  root,
  navigate,
  anchored,
}: {
  member: api.SchemaEnumMember;
  alignment: string;
  fieldUrlBase: string;
  root: string;
  navigate: ReturnType<typeof useNavigate>;
  anchored: boolean;
}) {
  const { rowRef, copyAnchorLink } = useAnchoredRow(navigate, fieldUrlBase, member.name, anchored);
  const hex = formatEnumHex(member.value, alignment);

  return (
    <EnumMemberWrapper ref={rowRef} data-anchored={anchored || undefined}>
      <GridIcon>
        <KindIcon kind="enum-member" size="small" />
      </GridIcon>
      <GridContent>
        <MemberSignature>
          <AnchorName onClick={copyAnchorLink} title="Copy link to member">
            {member.name}
          </AnchorName>{" "}
          = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
          {hex && <EnumMemberHex>{hex}</EnumMemberHex>}
        </MemberSignature>
        <MetadataTags metadata={member.metadata} root={root} navigate={navigate} />
      </GridContent>
    </EnumMemberWrapper>
  );
}
