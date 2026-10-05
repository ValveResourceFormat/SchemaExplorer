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

/**
 * Codicons are drawn on a 16px grid and are sharpest at that size, so 16 goes next to text of
 * any size and 24 only next to page headings
 */
type IconSize = 16 | 24;

export const UiIcon = ({
  className,
  name,
  size = 16,
}: {
  className?: string;
  name: UiIconName;
  size?: IconSize;
}) => (
  <svg className={className} width={size} height={size} aria-hidden="true">
    <use href={`${ICONS_URL}#${name}`} />
  </svg>
);

export const KindIcon = ({
  className,
  kind,
  size = 16,
}: {
  className?: string;
  kind: IconKind;
  size?: IconSize;
}) => (
  <svg className={className} width={size} height={size} aria-hidden="true">
    <use href={`${ICONS_URL}#ki-${kind}`} />
  </svg>
);
