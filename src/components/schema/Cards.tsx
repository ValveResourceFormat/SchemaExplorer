import React, { useContext } from "react";
import { styled } from "@linaria/react";
import { KindIcon, type IconKind } from "../kind-icon/KindIcon";
import { dumpFileUrl } from "../../games-list";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { hasIntrinsicLayout } from "../../data/derived";
import { keepInPlace } from "../../utils/keep-in-place";
import { DeclarationsContext } from "./DeclarationsContext";
import { Card, CardHeader, CardTitle, CollapsedRow, CollapsedText } from "./styles";

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
          <KindIcon kind={icon} />
          {title}
        </CardTitle>
        {actions && <Actions>{actions}</Actions>}
      </CardHeader>
      {children}
    </Card>
  );
}

/** Right of the title, a line of their own when they don't fit, still on the right */
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
`;

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
      <CollapsedText data-inline data-before-offset={range ? true : undefined}>
        {label}
      </CollapsedText>
      {range}
    </CollapsedRow>
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
  const { game, declarations } = useContext(DeclarationsContext);
  const isIntrinsic = module === INTRINSIC_MODULE;
  // Intrinsics without a layout only come from the dump, there's no source to show
  if (isIntrinsic && !hasIntrinsicLayout(declarations, name)) return null;
  const url = isIntrinsic
    ? INTRINSIC_SOURCE_URL
    : dumpFileUrl(game, `schemas/${module}/${name.replace(/:/g, "_")}.h`);
  if (!url) return null;
  return (
    <GitHubButton
      href={url}
      title={isIntrinsic ? "View engine type definitions" : `View ${name}.h on GitHub`}
      label={button ? "Source" : undefined}
    />
  );
}

/** A file on GitHub, a button when it has a label and only the icon without */
export function GitHubButton({
  href,
  title,
  label,
}: {
  href: string;
  title?: string;
  label?: string;
}) {
  return (
    <GitHubLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      data-button={label ? true : undefined}
    >
      <KindIcon kind="github" />
      {label}
    </GitHubLink>
  );
}
