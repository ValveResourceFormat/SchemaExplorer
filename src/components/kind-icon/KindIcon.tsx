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
import type { GameId } from "../../games-list";

/**
 * Codicons are drawn on a 16px grid and are sharpest at that size, so 16 goes next to text of
 * any size and 24 only next to page headings
 */
type IconSize = 16 | 24;

interface IconProps {
  className?: string;
  size?: IconSize;
}

/** A symbol in icons.svg */
export const SpriteIcon = ({
  id,
  className,
  size,
}: {
  id: string;
  className?: string;
  size: number;
}) => (
  <svg className={className} width={size} height={size} aria-hidden="true">
    <use href={`${ICONS_URL}#${id}`} />
  </svg>
);

export const KindIcon = ({ kind, size = 16, ...props }: IconProps & { kind: IconKind }) => (
  <SpriteIcon id={`ki-${kind}`} size={size} {...props} />
);

export const UiIcon = ({ name, size = 16, ...props }: IconProps & { name: UiIconName }) => (
  <SpriteIcon id={name} size={size} {...props} />
);

export const GameIcon = ({ game, size = 16, ...props }: IconProps & { game: GameId }) => (
  <SpriteIcon id={`game-${game}`} size={size} {...props} />
);
