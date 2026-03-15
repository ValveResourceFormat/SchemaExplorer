import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import * as api from "./api";
import { SchemaTypeView, MetadataTags } from "./SchemaType";
import { ReferencedBy } from "./ReferencedBy";
import { CrossGameRefs } from "./CrossGameRefs";
import { KindIcon } from "./utils/components";
import { DeclarationsContext } from "./DeclarationsContext";
import { matchesWords, useSearchWords, useSearchOffsets } from "./utils/filtering";
import {
  CollapsedItemsLink,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  DeclarationNameLink,
} from "./utils/styles";

const ClassExtendsWrapper = styled.span`
  font-size: 16px;
  font-weight: normal;
  color: ${(props) => props.theme.textDim};

  @media (max-width: 768px) {
    display: block;
  }
`;

const ClassMembers = styled(CommonGroupMembers)`
  > :not(:last-child) {
    margin-bottom: 6px;
  }
`;

const FieldRow = styled.div<{ $highlighted?: boolean }>`
  padding: 6px 10px;
  background-color: ${(props) =>
    props.$highlighted ? props.theme.searchHighlight : props.theme.group};
  border: 1px solid ${(props) => props.theme.groupBorder};
  border-radius: 8px;
`;

const FieldSignature = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
`;

const FieldOffset = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => props.theme.textDim};
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.highlight};
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
  color: ${(props) => props.theme.textDim};
  background-color: ${(props) => props.theme.groupMembers};
  border: 1px solid ${(props) => props.theme.groupBorder};
  padding: 2px 8px;
  border-radius: 6px;
  margin-left: 8px;
  cursor: pointer;

  &:hover {
    border-color: ${(props) => props.theme.highlight};
  }
`;

export const SchemaClassView: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  declaration: api.SchemaClass;
}> = ({ className, style, declaration }) => {
  const { root } = useContext(DeclarationsContext);
  const searchWords = useSearchWords();
  const searchOffsets = useSearchOffsets();

  const isSearching = searchWords.length > 0 || searchOffsets.size > 0;
  const nameMatches = searchWords.length > 0 && matchesWords(declaration.name, searchWords);
  const collapseNonMatching = isSearching && !nameMatches;

  const { matchingFields, hiddenCount } = useMemo(() => {
    if (!collapseNonMatching) {
      return { matchingFields: declaration.fields, hiddenCount: 0 };
    }
    const matching = declaration.fields.filter(
      (f) =>
        (searchWords.length > 0 && matchesWords(f.name, searchWords)) ||
        (searchOffsets.size > 0 && searchOffsets.has(f.offset)),
    );
    return { matchingFields: matching, hiddenCount: declaration.fields.length - matching.length };
  }, [declaration.fields, searchWords, searchOffsets, collapseNonMatching]);

  return (
    <CommonGroupWrapper className={className} style={style}>
      <DeclarationHeader>
        <CommonGroupSignature>
          <KindIcon kind="class" size="big" />
          <DeclarationNameLink to={`${root}/${declaration.module}/${declaration.name}`}>
            {declaration.name}
          </DeclarationNameLink>
          {declaration.parents.length > 0 && (
            <ClassExtendsWrapper>
              extends{" "}
              {declaration.parents.map((p, i) => (
                <React.Fragment key={`${p.module}/${p.name}`}>
                  {i > 0 && ", "}
                  <SchemaTypeView
                    type={{ category: "declared_class", name: p.name, module: p.module }}
                  />
                </React.Fragment>
              ))}
            </ClassExtendsWrapper>
          )}
          <ModuleBadge module={declaration.module} />
        </CommonGroupSignature>
      </DeclarationHeader>
      {!collapseNonMatching && <MetadataTags metadata={declaration.metadata} />}
      {(matchingFields.length > 0 || hiddenCount > 0) && (
        <ClassMembers>
          {matchingFields.map((field) => (
            <SchemaFieldView
              key={`${field.name}-${field.offset}`}
              field={field}
              highlighted={
                collapseNonMatching ||
                (searchWords.length > 0 && matchesWords(field.name, searchWords)) ||
                (searchOffsets.size > 0 && searchOffsets.has(field.offset))
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

function SchemaFieldView({ field, highlighted }: { field: api.SchemaField; highlighted: boolean }) {
  const { root } = useContext(DeclarationsContext);
  const navigate = useNavigate();
  const offsetHex = `0x${field.offset.toString(16).toUpperCase()}`;
  return (
    <FieldRow $highlighted={highlighted}>
      <FieldSignature>
        <KindIcon kind="field" size="small" />
        <FieldOffset
          onClick={() => navigate(`${root}?search=${encodeURIComponent(`offset:${offsetHex}`)}`)}
        >
          {offsetHex}
        </FieldOffset>
        {field.name}: <SchemaTypeView type={field.type} />
      </FieldSignature>
      <MetadataTags metadata={field.metadata} />
    </FieldRow>
  );
}
