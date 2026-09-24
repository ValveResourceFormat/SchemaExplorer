import React, { useContext, useMemo, useState } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import * as api from "../../data/types";
import { SchemaTypeView, MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { KindIcon, ICONS_URL } from "../kind-icon/KindIcon";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { inheritedBases, type InheritedBase } from "../../data/derived";
import { dumpFileUrl } from "../../games-list";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { searchLink, useFieldParam } from "../../utils/filtering";
import { formatHexOffset } from "../../utils/format";
import { computeBitfieldInfo, type BitfieldInfo } from "../../utils/bitfields";
import { useAnchoredRef } from "./useAnchoredRow";
import {
  AnchorName,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  DeclarationHeading,
  DeclarationNameLink,
  GridContent,
  GridIcon,
  MemberSignature,
  SectionBadge,
  SectionLink,
  SectionList,
  SectionTitle,
  SectionToggle,
  SectionWrapper,
} from "./styles";

const ClassMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 6px;
  }
`;

const FieldRow = styled.li`
  padding: 6px 10px;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 10px;

  &[data-anchored] {
    background-color: var(--search-highlight);
    border-color: var(--highlight);
  }
`;

const FieldOffset = styled(Link)`
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

export const ModuleBadge: React.FC<{ module: string }> = ({ module }) => {
  const { game } = useContext(DeclarationsContext);
  return (
    <SectionLink to={schemaPath(game, module)}>
      <svg width="16" height="16" aria-hidden="true">
        <use href={`${ICONS_URL}#ki-module`} />
      </svg>
      {module}
    </SectionLink>
  );
};

const GitHubIcon = styled.a`
  display: inline-flex;
  align-items: center;
  color: var(--text-dim);
  margin-left: auto;

  &:hover {
    color: var(--highlight);
  }
`;

const INTRINSIC_SOURCE_URL =
  "https://github.com/ValveResourceFormat/SchemaExplorer/blob/master/src/data/intrinsics.ts";

export const GitHubFileLink: React.FC<{ module: string; name: string }> = ({ module, name }) => {
  const { game } = useContext(DeclarationsContext);

  if (module === INTRINSIC_MODULE) {
    return (
      <GitHubIcon
        href={INTRINSIC_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="View intrinsic type definitions"
      >
        <svg width="16" height="16" aria-hidden="true">
          <use href={`${ICONS_URL}#ki-github`} />
        </svg>
      </GitHubIcon>
    );
  }

  const url = dumpFileUrl(game, `schemas/${module}/${name.replace(/:/g, "_")}.h`);
  if (!url) return null;
  return (
    <GitHubIcon
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`View ${name}.h on GitHub`}
    >
      <svg width="16" height="16" aria-hidden="true">
        <use href={`${ICONS_URL}#ki-github`} />
      </svg>
    </GitHubIcon>
  );
};

export const SchemaClassView: React.FC<{
  declaration: api.SchemaClass;
  isSearchResult?: boolean;
}> = ({ declaration, isSearchResult }) => {
  const { game, declarations } = useContext(DeclarationsContext);
  const fieldParam = useFieldParam();

  const inheritedGroups = useMemo(
    () => (isSearchResult ? [] : inheritedBases(declarations, declaration.parents)),
    [declaration.parents, declarations, isSearchResult],
  );

  const bitfieldInfo = useMemo(() => computeBitfieldInfo(declaration.fields), [declaration.fields]);
  const declPath = schemaPath(game, declaration.module, declaration.name);

  return (
      <CommonGroupWrapper>
        <DeclarationHeader>
          <CommonGroupSignature>
            <KindIcon kind="class" size="big" />
            <DeclarationHeading>
              <DeclarationNameLink to={declPath} title={`class in ${declaration.module}`}>
                {declaration.name}
              </DeclarationNameLink>
            </DeclarationHeading>
            {declaration.flags.includes("abstract") && (
              <SectionBadge title="Abstract class, only derived classes are instantiated">
                abstract
              </SectionBadge>
            )}
            <ClassLayout declaration={declaration} />
            {isSearchResult && <ModuleBadge module={declaration.module} />}
            <GitHubFileLink module={declaration.module} name={declaration.name} />
          </CommonGroupSignature>
        </DeclarationHeader>
        <MetadataTags metadata={declaration.metadata} game={game} module={declaration.module} />
        {inheritedGroups.length > 0 && <InheritedSection groups={inheritedGroups} />}
        {declaration.fields.length > 0 && (
          <ClassMembers>
            {declaration.fields.map((field) => (
              <SchemaFieldView
                key={`${field.name}-${field.offset}`}
                owner={declaration}
                field={field}
                fieldUrlBase={declPath}
                game={game}
                bitfield={bitfieldInfo.get(field)}
                anchored={fieldParam === field.name}
              />
            ))}
          </ClassMembers>
        )}
        {!isSearchResult && <ReferencedBy name={declaration.name} module={declaration.module} />}
        {!isSearchResult && <CrossGameRefs declaration={declaration} />}
      </CommonGroupWrapper>
  );
};

const LayoutText = styled.span`
  font-size: 13px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

/** Size and alignment of a class */
function ClassLayout({ declaration }: { declaration: api.SchemaClass }) {
  const { size, alignment } = declaration;
  return (
    <LayoutText>
      {size} byte{size !== 1 && "s"} ({formatHexOffset(size)})
      {alignment != null && `, align ${alignment}`}
    </LayoutText>
  );
}

const BaseOffsetText = styled.span`
  font-size: 12px;
  font-weight: 400;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

/** "at 4712 (0x1268)" for a base that doesn't start at 0 */
function BaseOffset({ offset }: { offset: number }) {
  if (offset === 0) return null;
  return (
    <BaseOffsetText>
      at {offset} ({formatHexOffset(offset)})
    </BaseOffsetText>
  );
}

function InheritedSection({ groups }: { groups: InheritedBase[] }) {
  const { game } = useContext(DeclarationsContext);
  const [expanded, setExpanded] = useState(false);
  const totalFields = groups.reduce((sum, g) => sum + g.fields.length, 0);

  if (!expanded) {
    return (
      <SectionWrapper>
        <SectionTitle>
          Inherits from ({totalFields} field{totalFields !== 1 ? "s" : ""})
        </SectionTitle>
        <SectionList>
          {groups.toReversed().map((group) => (
            <SectionLink
              key={`inherited-${group.parent.module}/${group.parent.name}`}
              to={schemaPath(game, group.parent.module, group.parent.name)}
              title={`class in ${group.parent.module}`}
            >
              <KindIcon kind="inherited-class" size="small" />
              {group.parent.name}
              <BaseOffset offset={group.offset} />
            </SectionLink>
          ))}
          {totalFields > 0 && (
            <SectionToggle onClick={() => setExpanded(true)}>expand fields</SectionToggle>
          )}
        </SectionList>
      </SectionWrapper>
    );
  }

  return (
    <InheritedMembers>
      {groups.map((group) => (
        <React.Fragment key={`inherited-${group.parent.module}/${group.parent.name}`}>
          <InheritedGroupLabel>
            Inherits from
            <KindIcon kind="inherited-class" size="small" />
            <SchemaTypeView
              type={{
                category: "declared_class",
                name: group.parent.name,
                module: group.parent.module,
              }}
            />
            <BaseOffset offset={group.offset} />
          </InheritedGroupLabel>
          {group.fields.map((field) => (
            <InheritedFieldView
              key={`${group.parent.name}-${field.name}-${field.offset}`}
              field={field}
              baseOffset={group.offset}
            />
          ))}
        </React.Fragment>
      ))}
      <li>
        <SectionToggle onClick={() => setExpanded(false)}>collapse inherited</SectionToggle>
      </li>
    </InheritedMembers>
  );
}

const InheritedMembers = styled(CommonGroupMembers)`
  background-color: color-mix(in srgb, var(--group-members) 50%, var(--group));
  border-bottom: 1px solid var(--group-separator);

  > :not(:last-child) {
    margin-bottom: 4px;
  }
`;

const InheritedGroupLabel = styled.li`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 2px 4px;
`;

const InheritedRow = styled.li`
  padding: 3px 10px;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: var(--text-dim);
`;

const InheritedFieldOffset = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
  white-space: nowrap;
`;

function InheritedFieldView({
  field,
  baseOffset,
}: {
  field: api.SchemaField;
  baseOffset: number;
}) {
  const offset = baseOffset + field.offset;
  return (
    <InheritedRow>
      <KindIcon kind="field" size="small" />
      <span>{field.name}:</span> <SchemaTypeView type={field.type} />
      <InheritedFieldOffset>
        {offset} ({formatHexOffset(offset)})
      </InheritedFieldOffset>
    </InheritedRow>
  );
}

const DefaultValueSpan = styled.span`
  color: var(--text-dim);
  opacity: 0.7;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
`;

const BitRange = styled.span`
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

const BitfieldPadding = styled.li`
  padding: 3px 10px;
  font-size: 13px;
  color: var(--text-dim);
  opacity: 0.5;
  font-style: italic;
  text-align: right;
`;

function SchemaFieldView({
  owner,
  field,
  fieldUrlBase,
  game,
  bitfield,
  anchored,
}: {
  owner: { name: string; module: string };
  field: api.SchemaField;
  fieldUrlBase: string;
  game: string;
  bitfield?: BitfieldInfo;
  anchored: boolean;
}) {
  const offsetHex = formatHexOffset(field.offset);
  const rowRef = useAnchoredRef(anchored);

  return (
    <>
      <FieldRow ref={rowRef as React.Ref<HTMLLIElement>} data-anchored={anchored || undefined}>
        <GridIcon>
          <KindIcon kind="field" size="small" />
        </GridIcon>
        <GridContent>
          <MemberSignature>
            <AnchorName
              to={{ pathname: fieldUrlBase, hash: `field=${encodeURIComponent(field.name)}` }}
              replace
              preventScrollReset
            >
              {field.name}
            </AnchorName>
            : <SchemaTypeView type={field.type} />
            {field.defaultValue != null && (
              <DefaultValueSpan> = {field.defaultValue}</DefaultValueSpan>
            )}
            {bitfield && (
              <BitRange>
                bit{bitfield.bitCount !== 1 ? "s" : ""} {bitfield.bitOffset}
                {bitfield.bitCount !== 1 ? `..${bitfield.bitOffset + bitfield.bitCount - 1}` : ""}
              </BitRange>
            )}
            <FieldOffset to={searchLink(game, `offset:${offsetHex}`)}>
              {field.offset} ({offsetHex})
            </FieldOffset>
          </MemberSignature>
          <MetadataTags metadata={field.metadata} game={game} module={owner.module} />
        </GridContent>
      </FieldRow>
      {bitfield && bitfield.totalBits > 0 && (
        <BitfieldPadding>
          {Math.ceil(bitfield.totalBits / 8)} byte
          {Math.ceil(bitfield.totalBits / 8) !== 1 ? "s" : ""} ({bitfield.totalBits} bit
          {bitfield.totalBits !== 1 ? "s" : ""}
          {bitfield.padding > 0 ? ` + ${bitfield.padding} padding` : ""})
        </BitfieldPadding>
      )}
    </>
  );
}
