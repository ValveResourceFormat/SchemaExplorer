import { memo, type MouseEvent } from "react";
import { styled } from "@linaria/react";
import type { ConsoleItem } from "../../data/types";
import { KindIcon } from "../kind-icon/KindIcon";
import { SchemaTypeView } from "../schema/SchemaType";
import { useTooltip } from "../Tooltip";
import { FlagContent, FlagTooltipContent } from "./FlagTooltipContent";
import { flagAccent, flagDescription, flagGroup } from "./flags";
import type { FilterTag } from "../../utils/console-filtering";
import { formatDefault, formatRange, parseColor } from "../../utils/console-format";

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

  &:hover {
    border-color: var(--c);
  }
`;

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

/** The module badge from the schema pages (icon + name pill), sized to sit inline with flags */
function ModuleBadge({ module, onClick }: { module: string; onClick?: () => void }) {
  const content = (
    <>
      <KindIcon kind="module" size={12} />
      {module}
    </>
  );
  return onClick ? (
    <FlagChipButton onClick={onClick} title={`Filter by module:${module}`}>
      {content}
    </FlagChipButton>
  ) : (
    <FlagChip>{content}</FlagChip>
  );
}

/** Modified clicks open links normally instead of navigating in place */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

// -- Row --

const Row = styled.li`
  padding: 6px 12px;
  border-bottom: 1px solid var(--group-separator);
  box-sizing: border-box;
  word-break: normal;
  overflow-wrap: anywhere;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: color-mix(in srgb, var(--group-members) 60%, transparent);
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

const Chips = styled.div`
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;

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

  &[data-missing] {
    font-style: italic;
    opacity: 0.7;
  }

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

export interface ConsoleRowProps {
  item: ConsoleItem;
  anchored: boolean;
  /** href of the page the row links to, without hash, when it isn't the current page */
  pageHref?: string;
  onNavigate: (name: string, e: MouseEvent) => void;
  /** Rows without it show flags and modules as plain, non-clickable badges */
  onFilter?: (tag: FilterTag, value: string) => void;
  /** Set by the virtualized list */
  rowRef?: (el: HTMLLIElement | null) => void;
  index?: number;
  top?: number;
}

export const ConsoleRow = memo(function ConsoleRow({
  item,
  anchored,
  pageHref = "",
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

  return (
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
    >
      <Line>
        <Name
          href={href}
          onClick={(e) => onNavigate(item.name, e)}
          data-command={item.kind === "command" || undefined}
        >
          {item.name}
        </Name>
        {convar && (
          <Type>
            {convar.enum && convar.enumModule ? (
              <SchemaTypeView
                type={{ category: "declared_enum", name: convar.enum, module: convar.enumModule }}
              />
            ) : (
              convar.type
            )}
          </Type>
        )}
        {defaultValue != null && (
          <Value>
            {"= " + defaultValue}
            {color && <Swatch style={{ backgroundColor: color }} />}
          </Value>
        )}
        {range && <Range>{range}</Range>}
        <Chips>
          {item.modules.map((m) => (
            <ModuleBadge key={m} module={m} onClick={onFilter && (() => onFilter("module:", m))} />
          ))}
          {item.flags.map((f) =>
            onFilter ? (
              <FilterableFlagBadge key={f} flag={f} onClick={() => onFilter("flag:", f)} />
            ) : (
              <FlagBadge key={f} flag={f} />
            ),
          )}
        </Chips>
      </Line>
      {item.help ? (
        <Help>{item.help}</Help>
      ) : (
        isReference && <Help data-missing>referenced, never declared</Help>
      )}
    </Row>
  );
});
