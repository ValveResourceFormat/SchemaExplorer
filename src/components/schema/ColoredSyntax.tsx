import React from "react";

type ColoredSyntaxKind = "literal" | "interface" | "container" | "atomic";

const syntaxStyles: Record<ColoredSyntaxKind, React.CSSProperties> = {
  literal: { color: "var(--syntax-literal)" },
  interface: { color: "var(--syntax-interface)" },
  container: { color: "var(--syntax-container)" },
  atomic: { color: "var(--syntax-atomic)" },
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
