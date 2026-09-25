import * as api from "../../data/types";
import React, { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { ColoredSyntax } from "./ColoredSyntax";
import { KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { MetadataDetail, MetadataTags } from "./SchemaType";
import { formatEnumHex, padHex } from "../../utils/format";
import { isFlagEnum, getBaseFlags, decomposeFlags, type BaseFlags } from "../../utils/enum-flags";
import { ReferencedBy, UsedByConVars } from "./ReferencedBy";
import { CrossGameDetail } from "./CrossGameRefs";
import { GitHubFileLink, SearchResultCard, TitledCard } from "./Cards";
import { searchLink, useFieldParam } from "../../utils/filtering";
import { useAnchoredRef } from "./useAnchoredRow";
import { UsedByKeyvalues } from "./EntitySections";
import { AnchorName, PageHeader, PageTitle, Pill, Row, RowNotes, Table, TableHead } from "./styles";
import { DetailsCard } from "./Detail";
import { RowIcon } from "./RowIcon";

const COLUMNS = "fit-content(28em) max-content minmax(0, 1fr)";

const MemberName = styled.div`
  font-weight: 600;
  word-break: break-all;
`;

const MemberHex = styled(Link)`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-decoration: none;

  &:hover {
    color: var(--highlight);
    text-decoration: underline;
  }
`;

const FlagBreakdown = styled.div`
  font-size: 14px;
  color: var(--text-dim);
`;

export const SchemaEnumView: React.FC<{
  declaration: api.SchemaEnum;
  isSearchResult?: boolean;
}> = ({ declaration, isSearchResult }) => {
  const { game } = useContext(DeclarationsContext);
  const declPath = schemaPath(game, declaration.module, declaration.name);

  const typePill = (
    <Pill data-mono title="Underlying type">
      {declaration.alignment}
    </Pill>
  );

  if (isSearchResult) {
    return (
      <SearchResultCard declaration={declaration} pills={typePill}>
        {declaration.members.length > 0 && (
          <MemberTable declaration={declaration} declPath={declPath} />
        )}
      </SearchResultCard>
    );
  }

  return (
    <>
      <PageHeader>
        <PageTitle>
          <KindIcon kind="enum" size="big" />
          {declaration.name}
        </PageTitle>
        {typePill}
        <GitHubFileLink module={declaration.module} name={declaration.name} button />
      </PageHeader>
      <EnumDetails declaration={declaration} />
      {declaration.members.length > 0 && (
        <TitledCard title="Members" icon="enum-member">
          <MemberTable declaration={declaration} declPath={declPath} withHead />
        </TitledCard>
      )}
    </>
  );
};

/** References, metadata and other games, the card hides when there is none */
function EnumDetails({ declaration }: { declaration: api.SchemaEnum }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <DetailsCard>
      <ReferencedBy name={declaration.name} module={declaration.module} />
      <UsedByKeyvalues name={declaration.name} module={declaration.module} />
      <UsedByConVars name={declaration.name} module={declaration.module} />
      <MetadataDetail metadata={declaration.metadata} game={game} />
      <CrossGameDetail declaration={declaration} />
    </DetailsCard>
  );
}

function MemberTable({
  declaration,
  declPath,
  withHead,
}: {
  declaration: api.SchemaEnum;
  declPath: string;
  /** Column names, on the enum page */
  withHead?: boolean;
}) {
  const { game } = useContext(DeclarationsContext);
  const fieldParam = useFieldParam();
  const baseFlags = useMemo(
    () => (isFlagEnum(declaration.members) ? getBaseFlags(declaration.members) : null),
    [declaration.members],
  );
  // Every hex value as wide as the widest, so the column lines up
  const hexes = useMemo(() => {
    const raw = declaration.members.map((m) => formatEnumHex(m.value, declaration.alignment));
    const digits = Math.max(...raw.map((h) => (h?.length ?? 2) - 2));
    return raw.map((h) => h && padHex(h, digits));
  }, [declaration.members, declaration.alignment]);

  return (
    <Table style={{ "--cols": COLUMNS } as React.CSSProperties}>
      {withHead && (
        <TableHead>
          <span>Name</span>
          <span>Value</span>
          <span>Hex</span>
        </TableHead>
      )}
      {declaration.members.map((member, i) => (
        <EnumMemberRow
          key={`${member.name}-${member.value}`}
          member={member}
          baseFlags={baseFlags}
          hex={hexes[i]}
          declPath={declPath}
          game={game}
          anchored={fieldParam === member.name}
        />
      ))}
    </Table>
  );
}

function EnumMemberRow({
  member,
  baseFlags,
  hex,
  declPath,
  game,
  anchored,
}: {
  member: api.SchemaEnumMember;
  baseFlags: BaseFlags | null;
  hex: string | null;
  declPath: string;
  game: string;
  anchored: boolean;
}) {
  const rowRef = useAnchoredRef(anchored);
  const decomposed = baseFlags ? decomposeFlags(member.value, baseFlags) : null;

  return (
    <Row ref={rowRef as React.Ref<HTMLDivElement>} data-anchored={anchored || undefined}>
      <MemberName>
        <RowIcon kind="enum-member" size="small" />
        <AnchorName
          to={{ pathname: declPath, hash: `field=${encodeURIComponent(member.name)}` }}
          replace
          preventScrollReset
        >
          {member.name}
        </AnchorName>
      </MemberName>
      <ColoredSyntax kind="literal">{member.value}</ColoredSyntax>
      <div>
        {hex && <MemberHex to={searchLink(game, `enumvalue:${member.value}`)}>{hex}</MemberHex>}
      </div>
      {(decomposed || member.metadata.length > 0) && (
        <RowNotes>
          {decomposed && <FlagBreakdown>{decomposed.join(" | ")}</FlagBreakdown>}
          <MetadataTags metadata={member.metadata} game={game} />
        </RowNotes>
      )}
    </Row>
  );
}
