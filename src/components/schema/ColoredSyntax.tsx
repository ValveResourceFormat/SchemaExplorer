import React from "react";
import { styled } from "@linaria/react";

type ColoredSyntaxKind = "literal" | "interface" | "intrinsic";

const Span = styled.span`
  &.literal {
    color: var(--syntax-literal);
  }
  &.interface {
    color: var(--syntax-interface);
  }
  &.intrinsic {
    color: var(--syntax-intrinsic);
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
