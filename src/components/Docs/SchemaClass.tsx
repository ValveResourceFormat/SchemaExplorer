import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import * as api from "./api";
import { SchemaTypeView, MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { KindIcon } from "./utils/components";
import { DeclarationsContext, declarationKey } from "./DeclarationsContext";
import {
  matchesWords,
  matchesMetadataKeys,
  useSearchWords,
  useSearchOffsets,
  useSearchMetadata,
} from "./utils/filtering";
import { formatHexOffset } from "./utils/format";
import {
  CollapsedItemsLink,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  DeclarationNameLink,
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
  gap: 0 6px;

  &[data-highlighted] {
    background-color: var(--search-highlight);
  }
`;

const FieldIcon = styled.div`
  grid-column: 1;
  grid-row: 1 / -1;
`;

const FieldContent = styled.div`
  grid-column: 2;
  min-width: 0;
`;

const FieldSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
`;

const FieldOffset = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
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
  const navigate = useNavigate();
  return (
    <StyledModuleBadge
      onClick={() => navigate(`${root}?search=${encodeURIComponent(`module:${module}`)}`)}
    >
      {module}
    </StyledModuleBadge>
  );
};

const StyledModuleBadge = styled.button`
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-dim);
  background-color: var(--group-members);
  border: 1px solid var(--group-border);
  padding: 2px 8px;
  border-radius: 6px;
  margin-left: 8px;
  cursor: pointer;

  &:hover {
    border-color: var(--highlight);
  }
`;

export const SchemaClassView: React.FC<{
  declaration: api.SchemaClass;
}> = ({ declaration }) => {
  const { root, classesByKey } = useContext(DeclarationsContext);
  const searchWords = useSearchWords();
  const searchOffsets = useSearchOffsets();
  const searchMetadata = useSearchMetadata();

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

  return (
    <CommonGroupWrapper>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="class" size="big" />
          <DeclarationNameLink to={`${root}/${declaration.module}/${declaration.name}`}>
            {declaration.name}
          </DeclarationNameLink>
          <ModuleBadge module={declaration.module} />
        </CommonGroupSignature>
      </DeclarationHeader>
      {(!collapseNonMatching ||
        (searchMetadata.length > 0 &&
          matchesMetadataKeys(declaration.metadata, searchMetadata))) && (
        <MetadataTags metadata={declaration.metadata} />
      )}
      {inheritedGroups.length > 0 && <InheritedSection groups={inheritedGroups} />}
      {(matchingFields.length > 0 || hiddenCount > 0) && (
        <ClassMembers>
          {matchingFields.map((field) => (
            <SchemaFieldView
              key={`${field.name}-${field.offset}`}
              field={field}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(field.name, searchWords)) ||
                (searchOffsets.size > 0 && searchOffsets.has(field.offset)) ||
                (searchMetadata.length > 0 && matchesMetadataKeys(field.metadata, searchMetadata))
              }
            />
          ))}
          {hiddenCount > 0 && (
            <CollapsedItemsLink to={`${root}/${declaration.module}/${declaration.name}`}>
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
          {[...groups].reverse().map((group) => (
            <SectionLink
              key={`inherited-${group.parent.module}/${group.parent.name}`}
              to={`${root}/${group.parent.module}/${group.parent.name}`}
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
  align-items: center;
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

function SchemaFieldView({ field, highlighted }: { field: api.SchemaField; highlighted: boolean }) {
  const { root } = useContext(DeclarationsContext);
  const navigate = useNavigate();
  const offsetHex = formatHexOffset(field.offset);
  return (
    <FieldRow data-highlighted={highlighted || undefined}>
      <FieldIcon>
        <KindIcon kind="field" size="small" />
      </FieldIcon>
      <FieldContent>
        <FieldSignature>
          {field.name}: <SchemaTypeView type={field.type} />
          <FieldOffset
            onClick={() => navigate(`${root}?search=${encodeURIComponent(`offset:${offsetHex}`)}`)}
          >
            {field.offset} ({offsetHex})
          </FieldOffset>
        </FieldSignature>
        <MetadataTags metadata={field.metadata} />
      </FieldContent>
    </FieldRow>
  );
}
