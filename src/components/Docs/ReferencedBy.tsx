import React, { useContext, useEffect, useState } from "react";
import { styled } from "@linaria/react";
import { DeclarationsContext } from "./DeclarationsContext";
import { KindIcon } from "../KindIcon";
import {
  SectionWrapper,
  SectionTitle,
  SectionList,
  SectionLink,
  SectionToggle,
} from "./utils/styles";

const COLLAPSE_THRESHOLD = 8;

const RefField = styled.span`
  color: var(--text-dim);

  &::before {
    content: ".";
  }
`;

export function ReferencedBy({ name, module }: { name: string; module: string }) {
  const { root, references } = useContext(DeclarationsContext);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [name, module]);

  const refs = references.get(`${module}/${name}`);
  if (!refs || refs.length === 0) return null;

  const collapsible = refs.length > COLLAPSE_THRESHOLD;
  const visible = collapsible && !expanded ? refs.slice(0, COLLAPSE_THRESHOLD) : refs;

  return (
    <SectionWrapper>
      <SectionTitle>Referenced by ({refs.length})</SectionTitle>
      <SectionList>
        {visible.map((ref, i) => (
          <SectionLink
            key={`${ref.declarationModule}/${ref.declarationName}-${ref.fieldName ?? ""}-${i}`}
            to={`${root}/${ref.declarationModule}/${ref.declarationName}`}
          >
            <KindIcon kind={ref.relation} size={18} />
            <span>
              {ref.declarationName}
              {ref.fieldName && <RefField>{ref.fieldName}</RefField>}
            </span>
          </SectionLink>
        ))}
        {collapsible && (
          <SectionToggle
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Show fewer references" : "Show all references"}
            aria-expanded={expanded}
          >
            {expanded ? "show less" : `+${refs.length - COLLAPSE_THRESHOLD} more…`}
          </SectionToggle>
        )}
      </SectionList>
    </SectionWrapper>
  );
}
