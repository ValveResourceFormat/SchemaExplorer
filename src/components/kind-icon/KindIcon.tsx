export type IconKind =
  | "class"
  | "inherited-class"
  | "derived-class"
  | "enum"
  | "enum-member"
  | "field"
  | "offset"
  | "meta-default"
  | "meta-tag"
  | "meta-broadcast"
  | "meta-broadcast-off"
  | "meta-note"
  | "meta-variable"
  | "meta-eye-closed"
  | "meta-folder"
  | "meta-not-saved"
  | "entity"
  | "keyvalue"
  | "input"
  | "output"
  | "convar"
  | "command"
  | "flag"
  | "module"
  | "tools"
  | "lock"
  | "code"
  | "shield"
  | "replicated"
  | "user"
  | "github";

/** Interface icons that take the text color, drawn with UiIcon */
export type UiIconName = "search" | "close" | "menu" | "check" | "sun" | "moon";

import ICONS_URL from "../../icons.svg?url";
export { ICONS_URL };

export const UiIcon = ({
  className,
  name,
  size = 16,
}: {
  className?: string;
  name: UiIconName;
  size?: number;
}) => (
  <svg className={className} width={size} height={size} aria-hidden="true">
    <use href={`${ICONS_URL}#${name}`} />
  </svg>
);

export const KindIcon = ({
  className,
  kind,
  size,
}: {
  className?: string;
  kind: IconKind;
  size: "small" | "medium" | "big" | number;
}) => {
  const sizes =
    typeof size === "number" ? size : size === "small" ? 16 : size === "medium" ? 20 : 24;
  return (
    <svg className={className} width={sizes} height={sizes} aria-hidden="true">
      <use href={`${ICONS_URL}#ki-${kind}`} />
    </svg>
  );
};
