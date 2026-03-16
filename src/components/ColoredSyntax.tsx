import React from "react";

export type ColoredSyntaxKind = "literal" | "interface";

const syntaxStyles: Record<ColoredSyntaxKind, React.CSSProperties> = {
  literal: { color: "var(--syntax-literal)" },
  interface: { color: "var(--syntax-interface)" },
};

export function ColoredSyntax({
  kind,
  children,
}: {
  kind: ColoredSyntaxKind;
  children: React.ReactNode;
}) {
  return <span style={syntaxStyles[kind]}>{children}</span>;
}
