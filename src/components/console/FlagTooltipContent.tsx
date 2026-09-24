import { styled } from "@linaria/react";
import { KindIcon } from "../kind-icon/KindIcon";
import { flagIcon } from "./flags";

/** Flag label, with an icon for the flags that need to stand out */
export function FlagContent({ flag }: { flag: string }) {
  const icon = flagIcon(flag);
  return (
    <>
      {icon && <KindIcon kind={icon} size={12} />}
      {flag}
    </>
  );
}

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
