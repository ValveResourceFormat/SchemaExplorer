import { useContext } from "react";
import { styled } from "@linaria/react";
import { EXCLUSIVE_FLAG } from "../../data/derived";
import { ICONS_URL, KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext } from "../schema/DeclarationsContext";
import { flagIcon } from "./flags";

/** The exclusive flag's icon, the game's own */
export function ExclusiveIcon({ size = 12 }: { size?: number }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <GameIcon width={size} height={size} aria-hidden="true">
      <use href={`${ICONS_URL}#game-${game}`} />
    </GameIcon>
  );
}

/**
 * Flag label, with an icon for the flags that need to stand out. The exclusive flag is only
 * its icon in the lists, where every other row would repeat the same word
 */
export function FlagContent({ flag, compact }: { flag: string; compact?: boolean }) {
  if (flag === EXCLUSIVE_FLAG) {
    return (
      <>
        <ExclusiveIcon />
        {compact ? <VisuallyHidden>{flag}</VisuallyHidden> : flag}
      </>
    );
  }
  const icon = flagIcon(flag);
  return (
    <>
      {icon && <KindIcon kind={icon} size={12} />}
      {flag}
    </>
  );
}

const GameIcon = styled.svg`
  flex-shrink: 0;
  border-radius: 2px;
`;

/** Read by screen readers, not shown */
export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

/** Tooltip body: the flag's own badge as a heading, colored to match, then its description.
 *  Shared by the row badges and the sidebar's flag filters so both look identical. */
export function FlagTooltipContent({
  flag,
  description,
  hint,
}: {
  flag: string;
  description?: string;
  hint?: string;
}) {
  return (
    <>
      <TooltipFlagName>
        <FlagContent flag={flag} />
      </TooltipFlagName>
      {description && <TooltipDescription>{description}</TooltipDescription>}
      {hint && <TooltipHint>{hint}</TooltipHint>}
    </>
  );
}

const TooltipFlagName = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent, var(--text));

  > svg {
    width: 12px;
    height: 12px;
  }
`;

const TooltipDescription = styled.div`
  color: var(--text);
`;

const TooltipHint = styled.div`
  margin-top: 6px;
  color: var(--text-dim);
  font-style: italic;
`;
