import React from "react";
import { styled } from "@linaria/react";
import { Card } from "./styles";

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

export function Detail({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <DetailRow>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </DetailRow>
  );
}
