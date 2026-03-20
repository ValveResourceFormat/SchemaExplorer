import React from "react";
import { styled } from "@linaria/react";

type ColoredSyntaxKind = "literal" | "interface" | "container" | "atomic";

const Span = styled.span`
  &.literal {
    color: var(--syntax-literal);
  }
  &.interface {
    color: var(--syntax-interface);
  }
  &.container {
    color: var(--syntax-container);
  }
  &.atomic {
    color: var(--syntax-atomic);
  }
`;

export function ColoredSyntax({
  kind,
  children,
}: {
  kind: ColoredSyntaxKind;
  children: React.ReactNode;
}) {
  return <Span className={kind}>{children}</Span>;
}
