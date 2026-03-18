import React from "react";

export type IconKind =
  | "class"
  | "enum"
  | "enum-member"
  | "field"
  | "inherited-class"
  | "meta-default"
  | "meta-tag"
  | "meta-broadcast"
  | "meta-note"
  | "meta-variable"
  | "meta-eye-closed"
  | "meta-folder"
  | "meta-discard";

import ICONS_URL from "../../icons.svg?url";
export { ICONS_URL };

export const KindIcon: React.FC<{
  className?: string;
  kind: IconKind;
  size: "small" | "medium" | "big" | number;
}> = React.memo(({ className, kind, size }) => {
  const sizes =
    typeof size === "number" ? size : size === "small" ? 16 : size === "medium" ? 20 : 24;
  return (
    <svg className={className} width={sizes} height={sizes} aria-hidden="true">
      <use href={`${ICONS_URL}#ki-${kind}`} />
    </svg>
  );
});
