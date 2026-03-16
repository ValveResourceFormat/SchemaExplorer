import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import * as api from "./api";
import { SchemaTypeView, MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { KindIcon } from "../KindIcon";
import { DeclarationsContext, declarationKey, declarationPath } from "./DeclarationsContext";
import { getGame } from "../../games";
import {
  matchesWords,
  matchesMetadataKeys,
  useParsedSearch,
  useFieldParam,
} from "./utils/filtering";
import { formatHexOffset } from "./utils/format";
import { computeBitfieldInfo, type BitfieldInfo } from "./utils/bitfields";
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
  SectionLink,
  SectionList,
  SectionTitle,
  SectionToggle,
  SectionWrapper,
} from "./utils/styles";

const ClassMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 6px;
  }
`;

const FieldRow = styled.div`
  padding: 6px 10px;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 10px;

  &[data-highlighted] {
    background-color: var(--search-highlight);
  }

  &[data-anchored] {
    background-color: var(--search-highlight);
    border-color: var(--highlight);
  }
`;

const FieldOffset = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  margin-left: auto;

  &:hover {
    color: var(--highlight);
  }
`;

export const ModuleBadge: React.FC<{ module: string }> = ({ module }) => {
  const { root } = useContext(DeclarationsContext);
  return (
    <SectionLink to={`${root}?search=${encodeURIComponent(`module:${module}`)}`}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
        fill="#B180D7"
        aria-hidden="true"
      >
        <path d="M5 2C3.89543 2 3 2.89543 3 4V6.00469C3 6.53494 2.99231 6.79889 2.91088 7.00209C2.84826 7.15835 2.71576 7.33309 2.2764 7.55276C2.10701 7.63745 2 7.81058 2 7.99997C2 8.18935 2.10699 8.36249 2.27638 8.44719C2.71569 8.66685 2.84809 8.84151 2.91076 8.99819C2.99233 9.20211 3 9.46732 3 10L3 12C3 13.1046 3.89543 14 5 14C5.27614 14 5.5 13.7761 5.5 13.5C5.5 13.2239 5.27614 13 5 13C4.44772 13 4 12.5523 4 12L4.00003 9.94145C4.00033 9.49235 4.00065 9.03033 3.83924 8.6268C3.74212 8.384 3.59654 8.17962 3.40072 8.00002C3.59646 7.82057 3.74199 7.61645 3.83912 7.37408C4.00065 6.971 4.00033 6.51001 4.00003 6.063L4 4C4 3.44772 4.44772 3 5 3C5.27614 3 5.5 2.77614 5.5 2.5C5.5 2.22386 5.27614 2 5 2ZM11 2C12.1046 2 13 2.89543 13 4V6.00469C13 6.53494 13.0077 6.79889 13.0891 7.00209C13.1517 7.15835 13.2842 7.33309 13.7236 7.55276C13.893 7.63745 14 7.81058 14 7.99997C14 8.18935 13.893 8.36249 13.7236 8.44719C13.2843 8.66685 13.1519 8.84151 13.0892 8.99819C13.0077 9.20211 13 9.46732 13 10V12C13 13.1046 12.1046 14 11 14C10.7239 14 10.5 13.7761 10.5 13.5C10.5 13.2239 10.7239 13 11 13C11.5523 13 12 12.5523 12 12L12 9.94145C11.9997 9.49235 11.9994 9.03033 12.1608 8.6268C12.2579 8.384 12.4035 8.17962 12.5993 8.00002C12.4035 7.82057 12.258 7.61645 12.1609 7.37408C11.9993 6.971 11.9997 6.51001 12 6.063L12 4C12 3.44772 11.5523 3 11 3C10.7239 3 10.5 2.77614 10.5 2.5C10.5 2.22386 10.7239 2 11 2Z" />
      </svg>
      {module}
    </SectionLink>
  );
};

const GitHubIcon = styled.a`
  display: inline-flex;
  align-items: center;
  color: var(--text-dim);
  margin-left: 4px;

  &:hover {
    color: var(--highlight);
  }
`;

export const GitHubFileLink: React.FC<{ module: string; name: string }> = ({ module, name }) => {
  const { game } = useContext(DeclarationsContext);
  const gameData = getGame(game);
  if (!gameData) return null;
  const fileName = name.replace(/:/g, "_");
  const url = `https://github.com/${gameData.repo}/blob/master/DumpSource2/schemas/${module}/${fileName}.h`;
  return (
    <GitHubIcon href={url} target="_blank" rel="noopener noreferrer" title="View on GitHub">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="currentColor"
      >
        <path d="M6.766 11.695C4.703 11.437 3.25 9.904 3.25 7.92c0-.806.281-1.677.75-2.258-.203-.532-.172-1.662.062-2.129.626-.081 1.469.258 1.969.726.594-.194 1.219-.291 1.985-.291.765 0 1.39.097 1.953.274.484-.451 1.343-.79 1.969-.709.218.435.25 1.564.046 2.113.5.613.766 1.436.766 2.274 0 1.984-1.453 3.485-3.547 3.759.531.355.891 1.129.891 2.016v1.678c0 .484.39.758.859.564C13.781 14.824 16 11.905 16 8.291 16 3.726 12.406 0 7.984 0 3.562 0 0 3.726 0 8.291c0 3.581 2.203 6.55 5.172 7.663A.595.595 0 0 0 6 15.389v-1.291c-.219.097-.5.162-.75.162-1.031 0-1.641-.581-2.078-1.662-.172-.435-.36-.693-.719-.742-.187-.016-.25-.097-.25-.193 0-.194.313-.339.625-.339.453 0 .844.29 1.25.887.313.468.641.678 1.031.678.391 0 .641-.146 1-.516.266-.275.469-.517.657-.678Z"></path>
      </svg>
    </GitHubIcon>
  );
};

export const SchemaClassView: React.FC<{
  declaration: api.SchemaClass;
}> = ({ declaration }) => {
  const { root, classesByKey } = useContext(DeclarationsContext);
  const navigate = useNavigate();
  const {
    nameWords: searchWords,
    offsets: searchOffsets,
    metadataKeys: searchMetadata,
  } = useParsedSearch();
  const fieldParam = useFieldParam();

  const isSearching = searchWords.length > 0 || searchOffsets.size > 0 || searchMetadata.length > 0;

  const inheritedGroups = useMemo(() => {
    if (isSearching) return [];
    const groups: { parent: { name: string; module: string }; fields: api.SchemaField[] }[] = [];
    const visited = new Set<string>();
    function collect(parents: { name: string; module: string }[]) {
      for (const p of parents) {
        const key = declarationKey(p.module, p.name);
        if (visited.has(key)) continue;
        visited.add(key);
        const parentDecl = classesByKey.get(key);
        if (parentDecl) {
          collect(parentDecl.parents);
          if (parentDecl.fields.length > 0) {
            groups.push({ parent: p, fields: parentDecl.fields });
          }
        }
      }
    }
    collect(declaration.parents);
    return groups;
  }, [declaration.parents, classesByKey, isSearching]);
  const nameMatches = searchWords.length > 0 && matchesWords(declaration.name, searchWords);
  const collapseNonMatching = isSearching && !nameMatches;

  const { matchingFields, hiddenCount } = useMemo(() => {
    if (!collapseNonMatching) {
      return { matchingFields: declaration.fields, hiddenCount: 0 };
    }
    const matching = declaration.fields.filter(
      (f) =>
        (searchWords.length > 0 && matchesWords(f.name, searchWords)) ||
        (searchOffsets.size > 0 && searchOffsets.has(f.offset)) ||
        (searchMetadata.length > 0 && matchesMetadataKeys(f.metadata, searchMetadata)),
    );
    return { matchingFields: matching, hiddenCount: declaration.fields.length - matching.length };
  }, [declaration.fields, searchWords, searchOffsets, searchMetadata, collapseNonMatching]);

  const bitfieldInfo = useMemo(() => computeBitfieldInfo(declaration.fields), [declaration.fields]);
  const declPath = declarationPath(root, declaration.module, declaration.name);

  return (
    <CommonGroupWrapper>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="class" size="big" />
          <DeclarationNameLink to={declPath}>{declaration.name}</DeclarationNameLink>
          <ModuleBadge module={declaration.module} />
          <GitHubFileLink module={declaration.module} name={declaration.name} />
        </CommonGroupSignature>
      </DeclarationHeader>
      {(!collapseNonMatching ||
        (searchMetadata.length > 0 &&
          matchesMetadataKeys(declaration.metadata, searchMetadata))) && (
        <MetadataTags metadata={declaration.metadata} root={root} navigate={navigate} />
      )}
      {inheritedGroups.length > 0 && <InheritedSection groups={inheritedGroups} />}
      {(matchingFields.length > 0 || hiddenCount > 0) && (
        <ClassMembers>
          {matchingFields.map((field) => (
            <SchemaFieldView
              key={`${field.name}-${field.offset}`}
              field={field}
              fieldUrlBase={declPath}
              root={root}
              navigate={navigate}
              bitfield={bitfieldInfo.get(field)}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(field.name, searchWords)) ||
                (searchOffsets.size > 0 && searchOffsets.has(field.offset)) ||
                (searchMetadata.length > 0 && matchesMetadataKeys(field.metadata, searchMetadata))
              }
              anchored={fieldParam === field.name}
            />
          ))}
          {hiddenCount > 0 && (
            <CollapsedItemsLink to={declPath}>
              {hiddenCount} more field{hiddenCount !== 1 ? "s" : ""}…
            </CollapsedItemsLink>
          )}
        </ClassMembers>
      )}
      {!collapseNonMatching && <ReferencedBy name={declaration.name} module={declaration.module} />}
      {!collapseNonMatching && <CrossGameRefs declaration={declaration} />}
    </CommonGroupWrapper>
  );
};

function InheritedSection({
  groups,
}: {
  groups: { parent: { name: string; module: string }; fields: api.SchemaField[] }[];
}) {
  const { root } = useContext(DeclarationsContext);
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
              to={declarationPath(root, group.parent.module, group.parent.name)}
            >
              <KindIcon kind="inherited-class" size="small" />
              {group.parent.name}
            </SectionLink>
          ))}
          <SectionToggle onClick={() => setExpanded(true)}>expand fields</SectionToggle>
        </SectionList>
      </SectionWrapper>
    );
  }

  return (
    <InheritedMembers>
      {groups.map((group) => (
        <React.Fragment key={`inherited-${group.parent.module}/${group.parent.name}`}>
          <InheritedGroupLabel>
            <KindIcon kind="inherited-class" size="small" />
            <SchemaTypeView
              type={{
                category: "declared_class",
                name: group.parent.name,
                module: group.parent.module,
              }}
            />
          </InheritedGroupLabel>
          {group.fields.map((field) => (
            <InheritedFieldView
              key={`${group.parent.name}-${field.name}-${field.offset}`}
              field={field}
            />
          ))}
        </React.Fragment>
      ))}
      <SectionToggle onClick={() => setExpanded(false)}>collapse</SectionToggle>
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

const InheritedGroupLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 2px 4px;
`;

const InheritedRow = styled.div`
  padding: 3px 10px;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  opacity: 0.6;
`;

const InheritedFieldOffset = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
  white-space: nowrap;
`;

function InheritedFieldView({ field }: { field: api.SchemaField }) {
  return (
    <InheritedRow>
      <KindIcon kind="field" size="small" />
      <span>{field.name}:</span> <SchemaTypeView type={field.type} />
      <InheritedFieldOffset>
        {field.offset} ({formatHexOffset(field.offset)})
      </InheritedFieldOffset>
    </InheritedRow>
  );
}

const BitRange = styled.span`
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

const BitfieldPadding = styled.div`
  padding: 3px 10px;
  font-size: 13px;
  color: var(--text-dim);
  opacity: 0.5;
  font-style: italic;
  text-align: right;
`;

function SchemaFieldView({
  field,
  fieldUrlBase,
  root,
  navigate,
  bitfield,
  highlighted,
  anchored,
}: {
  field: api.SchemaField;
  fieldUrlBase: string;
  root: string;
  navigate: ReturnType<typeof useNavigate>;
  bitfield?: BitfieldInfo;
  highlighted: boolean;
  anchored: boolean;
}) {
  const offsetHex = formatHexOffset(field.offset);
  const { rowRef, copyAnchorLink } = useAnchoredRow(navigate, fieldUrlBase, field.name, anchored);

  return (
    <>
      <FieldRow
        ref={rowRef}
        data-highlighted={highlighted || undefined}
        data-anchored={anchored || undefined}
      >
        <GridIcon>
          <KindIcon kind="field" size="small" />
        </GridIcon>
        <GridContent>
          <MemberSignature>
            <AnchorName onClick={copyAnchorLink} title="Copy link to field">
              {field.name}
            </AnchorName>
            : <SchemaTypeView type={field.type} />
            {bitfield && (
              <BitRange>
                bit{bitfield.bitCount !== 1 ? "s" : ""} {bitfield.bitOffset}
                {bitfield.bitCount !== 1 ? `..${bitfield.bitOffset + bitfield.bitCount - 1}` : ""}
              </BitRange>
            )}
            <FieldOffset
              onClick={() =>
                navigate(`${root}?search=${encodeURIComponent(`offset:${offsetHex}`)}`)
              }
            >
              {field.offset} ({offsetHex})
            </FieldOffset>
          </MemberSignature>
          <MetadataTags metadata={field.metadata} root={root} navigate={navigate} />
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
