import React, { useContext, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import { Link } from "../Link";
import type { ReferenceEntry } from "../../data/derived";
import {
  DeclarationsContext,
  consolePath,
  declarationKey,
  fieldLink,
  schemaPath,
} from "./DeclarationsContext";
import { KindIcon } from "../kind-icon/KindIcon";
import { InlineList, SectionToggle } from "./styles";
import { Detail } from "./Detail";

const COLLAPSE_THRESHOLD = 8;

export const RefField = styled.span`
  color: var(--text-dim);

  &::before {
    content: ".";
  }
`;

/** A detail row of links that collapses after a few items */
export function CollapsibleLinkDetail<T>({
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
    <Detail label={title}>
      <InlineList>
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
      </InlineList>
    </Detail>
  );
}

/** Convars whose value is an enumerator of this enum */
export function UsedByConVars({ name, module }: { name: string; module: string }) {
  const { game, enumConVars } = useContext(DeclarationsContext);
  return (
    <CollapsibleLinkDetail
      title="Used by convars"
      items={enumConVars.get(declarationKey(module, name))}
      render={(convar) => (
        <Link
          key={convar.name}
          to={{ pathname: consolePath(game), hash: `name=${encodeURIComponent(convar.name)}` }}
        >
          <KindIcon kind="convar" size="small" />
          {convar.name}
        </Link>
      )}
    />
  );
}

/** Classes deriving from a declaration, and fields using it as their type */
export function ReferencedBy({ name, module }: { name: string; module: string }) {
  const { game, references } = useContext(DeclarationsContext);
  const { derived, fields } = useMemo(() => {
    const refs = references.get(declarationKey(module, name)) ?? [];
    return {
      derived: refs.filter((r) => r.relation === "class"),
      fields: refs.filter((r) => r.relation === "field"),
    };
  }, [references, module, name]);

  const render = (ref: ReferenceEntry, i: number) => (
    <Link
      key={`${ref.declarationModule}/${ref.declarationName}-${ref.fieldName ?? ""}-${i}`}
      to={
        ref.fieldName
          ? fieldLink(game, ref.declarationModule, ref.declarationName, ref.fieldName)
          : schemaPath(game, ref.declarationModule, ref.declarationName)
      }
      title={`class in ${ref.declarationModule}`}
    >
      <KindIcon kind={ref.relation} size="small" />
      <span>
        {ref.declarationName}
        {ref.fieldName && <RefField>{ref.fieldName}</RefField>}
      </span>
    </Link>
  );

  return (
    <>
      <CollapsibleLinkDetail title="Derived classes" items={derived} render={render} />
      <CollapsibleLinkDetail title="Used by fields" items={fields} render={render} />
    </>
  );
}
