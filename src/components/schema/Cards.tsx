import React, { useContext } from "react";
import { styled } from "@linaria/react";
import { KindIcon, ICONS_URL, type IconKind } from "../kind-icon/KindIcon";
import { dumpFileUrl } from "../../games-list";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { keepInPlace } from "../../utils/keep-in-place";
import type { Declaration } from "../../data/types";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { MetadataTags } from "./SchemaType";
import {
  AnchorName,
  Card,
  CardHeader,
  CardTitle,
  CollapsedRow,
  CollapsedText,
  PillLink,
} from "./styles";

/** A card titled with a kind icon, actions like a switch go on the right of the title */
export function TitledCard({
  title,
  icon,
  titleAs,
  actions,
  children,
}: {
  title: string;
  icon: IconKind;
  /** h3 under an entity heading */
  titleAs?: "h3";
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as={titleAs}>
          <KindIcon kind={icon} size="small" />
          {title}
        </CardTitle>
        {actions}
      </CardHeader>
      {children}
    </Card>
  );
}

/** Stands in for hidden inherited rows, showing them keeps the card where it is on screen */
export function CollapsedInheritedRow({
  label,
  range,
  onShow,
}: {
  label: string;
  /** Offsets the hidden rows cover, in the last column */
  range?: React.ReactNode;
  onShow: () => void;
}) {
  return (
    <CollapsedRow
      onClick={(e) => keepInPlace(e.currentTarget.closest("section")!, onShow)}
      aria-expanded={false}
    >
      <CollapsedText data-before-offset={range ? true : undefined}>{label}</CollapsedText>
      {range}
    </CollapsedRow>
  );
}

export function ModulePill({ module }: { module: string }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <PillLink to={schemaPath(game, module)} title={`${module} module`}>
      <KindIcon kind="module" size={14} />
      {module}
    </PillLink>
  );
}

const GitHubLink = styled.a`
  display: inline-flex;
  /* The baseline comes from the label, like the rest of the page header */
  align-items: baseline;
  gap: 8px;
  margin-left: auto;
  color: var(--text-dim);
  text-decoration: none;

  &[data-button] {
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid var(--group-border);
    background: var(--group);
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  > svg {
    align-self: center;
  }

  &:hover {
    color: var(--highlight);
  }
`;

const INTRINSIC_SOURCE_URL =
  "https://github.com/ValveResourceFormat/SchemaExplorer/blob/master/src/data/intrinsics.ts";

/** The declaration's dumped header on GitHub, a labelled button on its own page */
export function GitHubFileLink({
  module,
  name,
  button,
}: {
  module: string;
  name: string;
  button?: boolean;
}) {
  const { game } = useContext(DeclarationsContext);
  const isIntrinsic = module === INTRINSIC_MODULE;
  const url = isIntrinsic
    ? INTRINSIC_SOURCE_URL
    : dumpFileUrl(game, `schemas/${module}/${name.replace(/:/g, "_")}.h`);
  if (!url) return null;
  return (
    <GitHubLink
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={isIntrinsic ? "View intrinsic type definitions" : `View ${name}.h on GitHub`}
      data-button={button || undefined}
    >
      <svg width="16" height="16" aria-hidden="true">
        <use href={`${ICONS_URL}#ki-github`} />
      </svg>
      {button && "Source"}
    </GitHubLink>
  );
}

const CardNotes = styled.div`
  padding: 0 16px 12px;
`;

/** A class or enum in search results, its pills after the name and its matches below */
export function SearchResultCard({
  declaration,
  pills,
  children,
}: {
  declaration: Declaration;
  pills: React.ReactNode;
  children: React.ReactNode;
}) {
  const { game } = useContext(DeclarationsContext);
  const { kind, module, name, metadata } = declaration;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <KindIcon kind={kind} size="small" />
          <AnchorName to={schemaPath(game, module, name)} title={`${kind} in ${module}`}>
            {name}
          </AnchorName>
        </CardTitle>
        <ModulePill module={module} />
        {pills}
        <GitHubFileLink module={module} name={name} />
      </CardHeader>
      {metadata.length > 0 && (
        <CardNotes>
          <MetadataTags metadata={metadata} game={game} module={module} />
        </CardNotes>
      )}
      {children}
    </Card>
  );
}
