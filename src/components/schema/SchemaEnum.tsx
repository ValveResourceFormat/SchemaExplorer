import * as api from "../../data/types";
import React, { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "./ColoredSyntax";
import { KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext, declarationPath } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import { formatEnumHex } from "../../utils/format";
import { isFlagEnum, getBaseFlags, decomposeFlags, type BaseFlags } from "../../utils/enum-flags";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { ModuleBadge, GitHubFileLink } from "./SchemaClass";
import { searchLink, useFieldParam } from "../../utils/filtering";
import { useAnchoredRef } from "./useAnchoredRow";
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
  SectionBadge,
} from "./styles";

const AlignmentBadge = styled(SectionBadge)`
  color: var(--syntax-literal);
`;

const EnumMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 2px;
  }
`;

const EnumMemberWrapper = styled.li`
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

const EnumMemberHex = styled(Link)`
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-decoration: none;
  margin-left: auto;

  &:hover {
    color: var(--highlight);
  }
`;

const FlagBreakdown = styled.div`
  font-size: 13px;
  color: var(--text-dim);
`;

export const SchemaEnumView: React.FC<{
  declaration: api.SchemaEnum;
  isSearchResult?: boolean;
}> = ({ declaration, isSearchResult }) => {
  const { game } = useContext(DeclarationsContext);
  const fieldParam = useFieldParam();

  const declPath = declarationPath(game, declaration.module, declaration.name);
  const baseFlags = useMemo(
    () => (isFlagEnum(declaration.members) ? getBaseFlags(declaration.members) : null),
    [declaration.members],
  );

  return (
    <CommonGroupWrapper>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="enum" size="big" />
          <h2>
            <DeclarationNameLink to={declPath} title={`enum in ${declaration.module}`}>
              {declaration.name}
            </DeclarationNameLink>
          </h2>
          <AlignmentBadge>{declaration.alignment}</AlignmentBadge>
          <ModuleBadge module={declaration.module} />
          <GitHubFileLink module={declaration.module} name={declaration.name} />
        </CommonGroupSignature>
      </DeclarationHeader>
      <MetadataTags metadata={declaration.metadata} game={game} />
      {declaration.members.length > 0 && (
        <EnumMembers>
          {declaration.members.map((member) => (
            <EnumMemberView
              key={`${member.name}-${member.value}`}
              member={member}
              baseFlags={baseFlags}
              alignment={declaration.alignment}
              fieldUrlBase={declPath}
              game={game}
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
  baseFlags,
  alignment,
  fieldUrlBase,
  game,
  anchored,
}: {
  member: api.SchemaEnumMember;
  baseFlags: BaseFlags | null;
  alignment: string;
  fieldUrlBase: string;
  game: string;
  anchored: boolean;
}) {
  const rowRef = useAnchoredRef(anchored);
  const hex = formatEnumHex(member.value, alignment);
  const decomposed = baseFlags ? decomposeFlags(member.value, baseFlags) : null;

  return (
    <EnumMemberWrapper
      ref={rowRef as React.Ref<HTMLLIElement>}
      data-anchored={anchored || undefined}
    >
      <GridIcon>
        <KindIcon kind="enum-member" size="small" />
      </GridIcon>
      <GridContent>
        <MemberSignature>
          <AnchorName
            to={{ pathname: fieldUrlBase, hash: `field=${encodeURIComponent(member.name)}` }}
            replace
            preventScrollReset
          >
            {member.name}
          </AnchorName>{" "}
          = <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
          {hex && (
            <EnumMemberHex to={searchLink(game, `enumvalue:${member.value}`)}>{hex}</EnumMemberHex>
          )}
        </MemberSignature>
        {decomposed && <FlagBreakdown>{decomposed.join(" | ")}</FlagBreakdown>}
        <MetadataTags metadata={member.metadata} game={game} />
      </GridContent>
    </EnumMemberWrapper>
  );
}
