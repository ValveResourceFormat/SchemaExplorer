import { Link } from "../Link";
import { styled } from "@linaria/react";
import { subtleUnderline } from "./link-styles";

export const CardBlock = styled.div`
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  box-shadow: var(--group-shadow);
  color: var(--text);
  font-size: 16px;
  line-height: 1.6;
`;

export const SectionToggle = styled.button`
  background: none;
  border: none;
  font: inherit;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;

  &:hover {
    color: var(--text);
  }
`;

export const Dim = styled.span`
  color: var(--text-dim);
  font-weight: 400;
`;

export const AnchorName = styled(Link)`
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--text-dim);
  }
`;

// -- Page header --

/** The title and what follows it share the text baseline, not the box centers */
export const PageHeader = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 16px;
`;

export const PageTitle = styled.h1`
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  /* Long class names break anywhere, titles with spaces between words */
  overflow-wrap: anywhere;

  > svg {
    flex-shrink: 0;
    align-self: center;
  }
`;

// -- Cards --

export const Card = styled.section`
  margin-bottom: 16px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  box-shadow: var(--group-shadow);
  overflow: hidden;
  overflow-wrap: anywhere;
`;

export const CardHeader = styled.header`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding: 12px 16px;
`;

export const CardTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  word-break: break-all;

  > svg {
    flex-shrink: 0;
  }
`;

/** Padded content of a card, under its header */
export const CardBody = styled.div`
  padding: 0 16px 14px;
`;

const pillStyles = `
  display: inline-flex;
  /* The baseline comes from the text, so pills line up with text next to them */
  align-items: baseline;
  gap: 5px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  color: var(--text-dim);
  background: color-mix(in srgb, var(--text-dim) 14%, transparent);

  > svg {
    align-self: center;
  }

  &[data-mono] {
    font-family: var(--font-mono);
  }
`;

/** Something to know about a declaration, in a card header or a row */
export const Pill = styled.span`
  ${pillStyles}
`;

const pillLinkStyles = `
  ${pillStyles}
  text-decoration: none;

  &:hover {
    color: var(--text);
  }
`;

/** A pill jumping to a spot on the page */
export const PillAnchor = styled.a`
  ${pillLinkStyles}
`;

export const PillLink = styled(Link)`
  ${pillLinkStyles}
`;

/** Status dot inside a pill, the color comes from --dot */
export const PillDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dot);
`;

/** Inline list of links in a detail, wrapping */
export const InlineList = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 18px;

  > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    ${subtleUnderline}
    color: inherit;

    &:hover {
      color: var(--highlight);
    }
  }

  svg {
    flex-shrink: 0;
    border-radius: 3px;
  }
`;

// -- Tables: a grid, every row is a subgrid so columns line up across rows --

/** Names the class or entity the following rows come from */
export const Band = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 7px 16px;
  background: var(--group-members);
  font-size: 14px;
  color: var(--text-dim);

  &:not(:first-child) {
    border-top: 1px solid var(--row-line);
  }

  > a {
    font-weight: 600;
    color: var(--text);
    ${subtleUnderline}

    &:hover {
      color: var(--highlight);
    }
  }

  > strong {
    font-weight: 600;
    color: var(--text);
  }
`;

/** Columns come from --cols, on phones every cell gets its own line */
export const Table = styled.div`
  display: grid;
  grid-template-columns: var(--cols);
  column-gap: 28px;
  border-top: 1px solid var(--row-line);

  ${Band} + & {
    border-top: none;
  }

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const rowStyles = `
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: baseline;
  padding: 9px 16px;

  /* The table draws the line above its first row */
  &:not(:first-child) {
    border-top: 1px solid var(--row-line);
  }
`;

export const TableHead = styled.div`
  ${rowStyles}
  padding-top: 6px;
  padding-bottom: 6px;
  background: var(--group-members);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);

  @media (max-width: 768px) {
    display: none;
  }
`;

export const Row = styled.div`
  ${rowStyles}

  &:hover {
    background: var(--row-hover);
  }

  &[data-anchored] {
    background: var(--search-highlight);
    box-shadow: inset 2px 0 0 var(--highlight);
  }

  &[data-overridden] {
    opacity: 0.55;
  }
`;

/** A row standing in for inherited members that are hidden, where they are in the list */
export const CollapsedRow = styled.button`
  border: none;
  ${rowStyles}
  width: 100%;
  background: none;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: var(--text-dim);
  cursor: pointer;

  &:hover {
    color: var(--text);
    background: var(--row-hover);
  }
`;

export const CollapsedText = styled.span`
  grid-column: 1 / -1;

  &[data-before-offset] {
    grid-column: 1 / -2;
  }

  &::after {
    content: " · show";
    color: var(--highlight);
  }
`;

/** Metadata and notes under a row's name, across the whole row */
export const RowNotes = styled.div`
  grid-column: 1 / -1;
  margin-top: 4px;
  padding-left: 10px;
  border-left: 2px solid var(--row-line);
`;
