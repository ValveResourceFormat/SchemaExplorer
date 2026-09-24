import React, { memo } from "react";
import { styled } from "@linaria/react";
import type { ConsoleItem } from "../../data/types";
import { KindIcon } from "../kind-icon/KindIcon";
import { useTooltip } from "../Tooltip";
import { flagAccent, flagDescription, flagGroup, flagIcon } from "./flags";
import type { FilterTag } from "../../utils/console-filtering";
import { formatDefault, formatModules, formatRange, parseColor } from "../../utils/console-format";

/** Sets --c to the color of the element's data-group flag group */
export const flagColorVars = `
  &[data-group="workshop"] {
    --c: var(--flag-workshop);
  }
  &[data-group="cheat"] {
    --c: var(--flag-cheat);
  }
  &[data-group="devonly"] {
    --c: var(--flag-devonly);
  }
  &[data-group="restricted"] {
    --c: var(--flag-restricted);
  }
  &[data-group="network"] {
    --c: var(--flag-network);
  }
  &[data-group="saved"] {
    --c: var(--flag-saved);
  }
`;

const flagChipStyles = `
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--group-border);
  background: var(--group-members);
  color: var(--text-dim);
  white-space: nowrap;
  --c: var(--text-dim);

  > svg {
    width: 12px;
    height: 12px;
  }

  ${flagColorVars}
  &[data-group]:not([data-group="hidden"]) {
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, transparent);
    border-color: color-mix(in srgb, var(--c) 35%, transparent);
  }
  &[data-group="hidden"] {
    border-style: dashed;
  }
`;

const FlagChip = styled.span`
  ${flagChipStyles}
`;

const FlagChipButton = styled.button`
  ${flagChipStyles}
  cursor: pointer;
  font-size: 13px;
  line-height: 22px;
  padding: 0 8px;

  &:hover {
    border-color: var(--c);
  }
`;

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

/** Flag label, with an icon for the flags that need to stand out */
function FlagContent({ flag }: { flag: string }) {
  const icon = flagIcon(flag);
  return (
    <>
      {icon && <KindIcon kind={icon} size={12} />}
      {flag}
    </>
  );
}

/** Tooltip body: the flag's own badge as a heading, colored to match, then its description */
function FlagTooltipContent({
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

function FlagBadge({ flag }: { flag: string }) {
  const description = flagDescription(flag);
  const { referenceProps, tooltip } = useTooltip(
    description && <FlagTooltipContent flag={flag} description={description} />,
    flagAccent(flag),
  );
  return (
    <>
      <FlagChip data-group={flagGroup(flag)} {...referenceProps}>
        <FlagContent flag={flag} />
      </FlagChip>
      {tooltip}
    </>
  );
}

/** Same badge, clickable to add a flag filter. Its tooltip covers both what the flag means
 *  and what clicking it does, since flags without a description would otherwise show nothing */
function FilterableFlagBadge({ flag, onClick }: { flag: string; onClick: () => void }) {
  const { referenceProps, tooltip } = useTooltip(
    <FlagTooltipContent
      flag={flag}
      description={flagDescription(flag)}
      hint="Click to filter by this flag."
    />,
    flagAccent(flag),
  );
  return (
    <>
      <FlagChipButton data-group={flagGroup(flag)} onClick={onClick} {...referenceProps}>
        <FlagContent flag={flag} />
      </FlagChipButton>
      {tooltip}
    </>
  );
}

/** Modified clicks open links normally instead of navigating in place */
export function isPlainLeftClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

// -- Row --

const Row = styled.li`
  padding: 6px 12px;
  border-bottom: 1px solid var(--group-separator);
  box-sizing: border-box;
  cursor: pointer;
  word-break: normal;
  overflow-wrap: anywhere;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: color-mix(in srgb, var(--group-members) 60%, transparent);
  }

  &[data-expanded] {
    cursor: auto;
    /* A tint, the neutral chips and buttons inside use --group-members */
    background: color-mix(in srgb, var(--highlight) 6%, var(--group));
  }

  &[data-anchored] {
    background: var(--search-highlight);
  }
`;

const Line = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
`;

// The kind icon is drawn by CSS, an <svg><use> per row adds up over thousands of prerendered rows
const Name = styled.a`
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
  text-decoration: none;

  &::before {
    content: "";
    display: inline-block;
    width: 16px;
    height: 16px;
    margin-right: 8px;
    vertical-align: -2px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%234EC9B0' stroke-width='1.2' stroke-linecap='round'%3E%3Cpath d='M2 4.5h2.25M7.75 4.5H14M2 11.5h7.25M12.75 11.5H14'/%3E%3Ccircle cx='6' cy='4.5' r='1.75'/%3E%3Ccircle cx='11' cy='11.5' r='1.75'/%3E%3C/svg%3E")
      no-repeat;
  }

  &[data-command]::before {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23C586C0' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='1.5' y='2.5' width='13' height='11' rx='1.5'/%3E%3Cpath d='M4.5 6l2 2-2 2M8.5 10.5h3'/%3E%3C/svg%3E");
  }

  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--text-dim);
  }
`;

const Type = styled.span`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--syntax-interface);
`;

const Value = styled.span`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--syntax-literal);
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Range = styled.span`
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-dim);
`;

const Swatch = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--group-border);
`;

const Modules = styled.span`
  margin-left: auto;
  font-size: 13px;
  color: var(--text-dim);
  white-space: nowrap;

  @media (max-width: 768px) {
    margin-left: 0;
    flex-basis: 100%;
    order: 10;
  }
`;

const Help = styled.div`
  margin: 2px 0 0 24px;
  font-size: 14px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &[data-expanded] {
    white-space: pre-wrap;
    color: var(--text);
  }

  &[data-missing] {
    font-style: italic;
    opacity: 0.7;
  }

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const Details = styled.div`
  margin: 8px 0 4px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--text-dim);
  cursor: auto;
`;

const DetailLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
`;

const DetailLabel = styled.span`
  min-width: 56px;
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: inherit;
  font-size: 13px;
  padding: 1px 8px;
  border-radius: 6px;
  border: 1px solid var(--group-border);
  background: var(--group-members);
  color: var(--text);
  text-decoration: none;
  cursor: pointer;

  &:hover {
    border-color: var(--highlight);
  }
`;

export interface ConsoleRowProps {
  item: ConsoleItem;
  expanded: boolean;
  anchored: boolean;
  /** href of the page the row links to, without hash, when it isn't the current page */
  pageHref?: string;
  /** Rows without it can't be expanded */
  onToggle?: (name: string) => void;
  onNavigate: (name: string, e: React.MouseEvent) => void;
  onFilter?: (tag: FilterTag, value: string) => void;
  /** Set by the virtualized list */
  rowRef?: (el: HTMLLIElement | null) => void;
  index?: number;
  top?: number;
}

export const ConsoleRow = memo(function ConsoleRow({
  item,
  expanded,
  anchored,
  pageHref = "",
  onToggle,
  onNavigate,
  onFilter,
  rowRef,
  index,
  top,
}: ConsoleRowProps) {
  const href = `${pageHref}#name=${encodeURIComponent(item.name)}`;
  const convar = item.kind === "convar" ? item : null;
  const defaultValue = convar ? formatDefault(convar) : null;
  const color = convar?.type === "color" && convar.default ? parseColor(convar.default) : null;
  const range = convar ? formatRange(convar.min, convar.max) : null;
  const isReference = item.modules.length === 0;

  function onRowClick(e: React.MouseEvent) {
    if (expanded || !onToggle) return;
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    onToggle(item.name);
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <Row
      ref={rowRef}
      data-index={index}
      style={
        top != null
          ? {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${top}px)`,
            }
          : undefined
      }
      data-anchored={anchored || undefined}
      data-expanded={expanded || undefined}
      onClick={onRowClick}
    >
      <Line>
        <Name
          href={href}
          onClick={(e) => onNavigate(item.name, e)}
          data-command={item.kind === "command" || undefined}
        >
          {item.name}
        </Name>
        {convar && <Type>{convar.type}</Type>}
        {defaultValue != null && (
          <Value>
            {"= " + defaultValue}
            {color && <Swatch style={{ backgroundColor: color }} />}
          </Value>
        )}
        {range && <Range>{range}</Range>}
        <Modules title={item.modules.length > 2 ? item.modules.join(", ") : undefined}>
          {formatModules(item.modules)}
        </Modules>
        {item.flags.map((f) => (
          <FlagBadge key={f} flag={f} />
        ))}
      </Line>
      {item.help ? (
        <Help data-expanded={expanded || undefined}>{item.help}</Help>
      ) : (
        isReference && <Help data-missing>referenced, never declared</Help>
      )}
      {expanded && (
        <Details>
          <DetailLine>
            <DetailLabel>Flags</DetailLabel>
            {item.flags.length === 0 && "none"}
            {item.flags.map((f) =>
              onFilter ? (
                <FilterableFlagBadge key={f} flag={f} onClick={() => onFilter("flag:", f)} />
              ) : (
                <FlagBadge key={f} flag={f} />
              ),
            )}
          </DetailLine>
          {convar && (convar.min != null || convar.max != null) && (
            <DetailLine>
              <DetailLabel>Range</DetailLabel>
              {convar.min != null && <Range>min {convar.min}</Range>}
              {convar.max != null && <Range>max {convar.max}</Range>}
            </DetailLine>
          )}
          <DetailLine>
            <DetailLabel>Modules</DetailLabel>
            {item.modules.length === 0 && "none"}
            {item.modules.map((m) =>
              onFilter ? (
                <FlagChipButton
                  key={m}
                  onClick={() => onFilter("module:", m)}
                  title={`Filter by module:${m}`}
                >
                  {m}
                </FlagChipButton>
              ) : (
                <FlagChip key={m}>{m}</FlagChip>
              ),
            )}
          </DetailLine>
          <DetailLine>
            <ActionButton onClick={() => navigator.clipboard?.writeText(item.name)}>
              Copy name
            </ActionButton>
            <ActionButton
              onClick={() => navigator.clipboard?.writeText(new URL(href, location.href).href)}
            >
              Copy link
            </ActionButton>
            {onToggle && <ActionButton onClick={() => onToggle(item.name)}>Collapse</ActionButton>}
          </DetailLine>
        </Details>
      )}
    </Row>
  );
});
