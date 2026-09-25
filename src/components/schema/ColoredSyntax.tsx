import React from "react";
import { styled } from "@linaria/react";

type ColoredSyntaxKind = "literal" | "interface";

const Span = styled.span`
  &.literal {
    color: var(--syntax-literal);
  }
  &.interface {
    color: var(--syntax-interface);
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
