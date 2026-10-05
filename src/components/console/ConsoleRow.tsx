import { memo, useContext, useState, type MouseEvent } from "react";
import { styled } from "@linaria/react";
import type { ConsoleItem } from "../../data/types";
import { EXCLUSIVE_FLAG } from "../../data/derived";
import { KindIcon } from "../kind-icon/KindIcon";
import { tip } from "../Tooltip";
import { SchemaTypeView } from "../schema/SchemaType";
import { FlagContent, flagTip } from "./FlagTooltipContent";
import { flagDescription, flagGroup } from "./flags";
import { DeclarationsContext } from "../schema/DeclarationsContext";
import { getConsoleStats, type FilterTag } from "../../utils/console-filtering";
import { formatDefault, formatRange, parseColor } from "../../utils/console-format";
import { flagColorVars } from "./flag-styles";

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
  position: relative;
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

  /* The exclusive flag is only the game's icon */
  &[data-plain] {
    padding: 0;
    border: none;
    background: none;

    /* As tall and round as the pills next to it */
    > svg {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
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
  const { game } = useContext(DeclarationsContext);
  return (
    <FlagChip
      data-group={flagGroup(flag)}
      data-plain={flag === EXCLUSIVE_FLAG || undefined}
      tabIndex={flagDescription(flag) ? 0 : undefined}
      {...flagTip(flag, game)}
    >
      <FlagContent flag={flag} compact />
    </FlagChip>
  );
}

/** Same badge, clickable to add a flag filter. Its tooltip covers both what the flag means
 *  and what clicking it does, since flags without a description would otherwise show nothing */
function FilterableFlagBadge({ flag, onClick }: { flag: string; onClick: () => void }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <FlagChipButton
      data-group={flagGroup(flag)}
      data-plain={flag === EXCLUSIVE_FLAG || undefined}
      onClick={onClick}
      {...flagTip(flag, game, "Click to filter by this flag.")}
    >
      <FlagContent flag={flag} compact />
    </FlagChipButton>
  );
}

/** A module, styled like the flags it sits inline with */
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

/** Lines, hover and the anchored row like the schema tables */
const Row = styled.li`
  padding: 6px 12px;
  border-bottom: 1px solid var(--row-line);
  word-break: normal;
  overflow-wrap: anywhere;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--row-hover);
  }

  &[data-anchored] {
    background: var(--search-highlight);
    box-shadow: inset 2px 0 0 var(--highlight);
  }
`;

const Line = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
`;

// The kind icon is drawn by CSS, an <svg><use> per row adds up over thousands of prerendered rows.
// The masks are the convar and command icons from icons.svg
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
    background: var(--icon-teal);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M6 9.5c.93 0 1.71.64 1.94 1.5h5.56c.28 0 .5.22.5.5s-.22.5-.5.5H7.94c-.23.86-1.01 1.5-1.94 1.5s-1.71-.64-1.94-1.5H2.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h1.56c.23-.86 1.01-1.5 1.94-1.5zm0 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4-8c.93 0 1.71.64 1.94 1.5h1.56c.28 0 .5.22.5.5s-.22.5-.5.5h-1.56c-.23.86-1.01 1.5-1.94 1.5s-1.71-.64-1.94-1.5H2.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h5.56c.23-.86 1.01-1.5 1.94-1.5zm0 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }

  &[data-command]::before {
    background: var(--icon-pink);
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18.75 1.5H5.25A3.75 3.75 0 0 0 1.5 5.25v13.5a3.75 3.75 0 0 0 3.75 3.75h13.5a3.75 3.75 0 0 0 3.75-3.75V5.25a3.75 3.75 0 0 0-3.75-3.75zM21 18.75A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25zm-10.72-5.47-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.97-3.97-3.97-3.97a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06zm9.22 3.97a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1 0-1.5h7.5a.75.75 0 0 1 .75.75z'/%3E%3C/svg%3E");
  }

  &:hover {
    text-decoration: underline;
    text-decoration-color: var(--text-dim);
  }
`;

/** Blue like builtin types on the schema pages */
const Type = styled.span`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--syntax-literal);
`;

const Value = styled.span`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text);
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
  /** The module: filter's values, their modules are shown before the others */
  filteredModules?: readonly string[];
  /** Set by the virtualized list */
  rowRef?: (el: HTMLLIElement | null) => void;
  index?: number;
  top?: number;
}

const MODULES_SHOWN = 2;

/**
 * The modules a filter asks for first, then the rarest, which tell the entry apart. The ones
 * nearly everything is in, like client and server, say the least
 */
function orderModules(
  modules: readonly string[],
  counts: ReadonlyMap<string, number>,
  filtered: readonly string[] = [],
): string[] {
  const isFiltered = (m: string) => filtered.some((f) => m.includes(f));
  return [...modules].sort(
    (a, b) =>
      Number(isFiltered(b)) - Number(isFiltered(a)) || (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
  );
}

export const ConsoleRow = memo(function ConsoleRow({
  item,
  anchored,
  pageHref = "",
  onNavigate,
  onFilter,
  filteredModules,
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

  // Some are in dozens of modules, the rarest few are enough until asked for the rest
  const { consoleItems } = useContext(DeclarationsContext);
  const [showAllModules, setShowAllModules] = useState(false);
  const manyModules = item.modules.length > MODULES_SHOWN + 1;
  const ordered = manyModules
    ? orderModules(item.modules, getConsoleStats(consoleItems).modules, filteredModules)
    : item.modules;
  const collapseModules = manyModules && !showAllModules;
  const modules = collapseModules ? ordered.slice(0, MODULES_SHOWN) : ordered;
  const hiddenModules = collapseModules ? ordered.slice(MODULES_SHOWN) : [];

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
          {modules.map((m) => (
            <ModuleBadge key={m} module={m} onClick={onFilter && (() => onFilter("module:", m))} />
          ))}
          {hiddenModules.length > 0 && (
            <FlagChipButton
              aria-expanded={false}
              onClick={() => setShowAllModules(true)}
              {...tip(hiddenModules.join(", "))}
            >
              +{hiddenModules.length} modules
            </FlagChipButton>
          )}
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
