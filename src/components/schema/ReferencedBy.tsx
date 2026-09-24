import React, { useContext, useState } from "react";
import { styled } from "@linaria/react";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { KindIcon } from "../kind-icon/KindIcon";
import { SectionWrapper, SectionTitle, SectionList, SectionLink, SectionToggle } from "./styles";

const COLLAPSE_THRESHOLD = 8;

export const RefField = styled.span`
  color: var(--text-dim);

  &::before {
    content: ".";
  }
`;

/** A titled list of chips that collapses after a few items */
export function CollapsibleChipSection<T>({
  title,
  items,
  render,
}: {
  title: string;
  items: T[] | undefined;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  const collapsible = items.length > COLLAPSE_THRESHOLD;
  const visible = collapsible && !expanded ? items.slice(0, COLLAPSE_THRESHOLD) : items;
  const toggleLabel = expanded ? "show less" : `+${items.length - COLLAPSE_THRESHOLD} more…`;

  return (
    <SectionWrapper>
      <SectionTitle>
        {title} ({items.length})
      </SectionTitle>
      <SectionList>
        {visible.map(render)}
        {collapsible && (
          <SectionToggle
            onClick={() => setExpanded(!expanded)}
            // The visible text, and which section it belongs to
            aria-label={`${toggleLabel} (${title})`}
            aria-expanded={expanded}
          >
            {toggleLabel}
          </SectionToggle>
        )}
      </SectionList>
    </SectionWrapper>
  );
}

export function ReferencedBy({ name, module }: { name: string; module: string }) {
  const { game, references } = useContext(DeclarationsContext);
  return (
    <CollapsibleChipSection
      title="Referenced by"
      items={references.get(declarationKey(module, name))}
      render={(ref, i) => (
        <SectionLink
          key={`${ref.declarationModule}/${ref.declarationName}-${ref.fieldName ?? ""}-${i}`}
          to={schemaPath(game, ref.declarationModule, ref.declarationName)}
          title={`${ref.relation} in ${ref.declarationModule}`}
        >
          <KindIcon kind={ref.relation} size={18} />
          <span>
            {ref.declarationName}
            {ref.fieldName && <RefField>{ref.fieldName}</RefField>}
          </span>
        </SectionLink>
      )}
    />
  );
}
