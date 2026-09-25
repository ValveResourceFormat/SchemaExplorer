import React from "react";
import { styled } from "@linaria/react";
import { Card } from "./styles";
import { chevronBefore } from "../chevron-styles";

// Components with props live apart from styles.tsx, the build evaluates that file for the
// styled components other files extend and can only read plain definitions there

const DetailsBox = styled(Card)`
  /* Every detail leaves itself out when it has nothing to show, the card goes with them */
  &:has(> dl:empty) {
    display: none;
  }
`;

const DetailList = styled.dl`
  margin: 0;
`;

/** Labelled facts about a declaration, one line each */
export function DetailsCard({ children }: { children: React.ReactNode }) {
  return (
    <DetailsBox>
      <DetailList>{children}</DetailList>
    </DetailsBox>
  );
}

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 9.5rem minmax(0, 1fr);
  align-items: baseline;
  gap: 2px 16px;
  padding: 8px 16px;

  &:not(:first-child) {
    border-top: 1px solid var(--row-line);
  }

  > dt {
    font-size: 14px;
    color: var(--text-dim);
  }

  > dd {
    margin: 0;
    font-size: 15px;
    min-width: 0;
  }

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export interface DetailToggleState {
  expanded: boolean;
  onToggle: () => void;
  /** What expanding shows, like "Show all 77" */
  more: string;
}

/**
 * A labelled fact. A long one collapses, its toggle sits under the label where it stays in
 * place however long the value gets
 */
export function Detail({
  label,
  toggle,
  children,
}: {
  label: React.ReactNode;
  toggle?: DetailToggleState;
  children: React.ReactNode;
}) {
  return (
    <DetailRow>
      <dt>
        {label}
        {toggle && <ExpandToggle {...toggle} data-in-label />}
      </dt>
      <dd>{children}</dd>
    </DetailRow>
  );
}

/** Shows more or less of something, with a chevron like the sidebar's groups */
export function ExpandToggle({
  expanded,
  onToggle,
  more,
  ...rest
}: DetailToggleState & { "data-in-label"?: boolean }) {
  return (
    <ToggleButton aria-expanded={expanded} onClick={onToggle} {...rest}>
      {expanded ? "Show less" : more}
    </ToggleButton>
  );
}

const ToggleButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 14px;
  color: var(--highlight);
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  ${chevronBefore}

  &[data-in-label] {
    display: flex;
    margin-top: 2px;
  }
`;
