import { memo, useState } from "react";
import { styled } from "@linaria/react";
import { EXCLUSIVE_FLAG } from "../../data/derived";
import {
  getTagState,
  type FilterTag,
  type ParsedConsoleSearch,
  type TagState,
} from "../../utils/console-filtering";
import { SidebarCount, SidebarGroupHeader, SidebarList } from "../layout/Sidebar";
import { sidebarRow, sidebarRowSelected } from "../layout/sidebar-styles";
import { KindIcon } from "../kind-icon/KindIcon";
import { useTooltip } from "../Tooltip";
import { flagColorVars } from "./flag-styles";
import { ExclusiveIcon, FlagTooltipContent, VisuallyHidden } from "./FlagTooltipContent";
import { flagAccent, flagDescription, flagGroup, flagIcon } from "./flags";
import type { ConsoleFilters } from "./ConsolePage";

const KINDS = [
  { kind: "all", label: "All", icon: null },
  { kind: "convars", label: "ConVars", icon: "convar" },
  { kind: "commands", label: "Commands", icon: "command" },
] as const;

// Flags explain themselves via their tooltip instead, modules don't have one
const MODULE_TITLE: Record<TagState, (value: string) => string> = {
  off: (v) => `Only show ${v}`,
  include: (v) => `Stop filtering by ${v}`,
  exclude: (v) => `Stop filtering by ${v}`,
};

export const ConsoleSidebar = memo(function ConsoleSidebar({
  filters,
}: {
  filters: ConsoleFilters;
}) {
  const {
    kind,
    kindCounts,
    moduleCounts,
    flagCounts,
    stats,
    parsed,
    setKind,
    cycleTag,
    clearFilters,
  } = filters;
  const hasFilters =
    kind !== "all" ||
    parsed.modules.length + parsed.notModules.length + parsed.flags.length > 0 ||
    parsed.notFlags.length + parsed.types.length + parsed.notTypes.length > 0;

  return (
    <>
      <SidebarList>
        <Group title="Show">
          {KINDS.map(({ kind: k, label, icon }) => (
            <FilterItem
              key={k}
              data-state={kind === k ? "include" : "off"}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {icon ? <KindIcon kind={icon} size="small" /> : <Spacer />}
              <ItemName>{label}</ItemName>
              <SidebarCount>{kindCounts[k].toLocaleString("en-US")}</SidebarCount>
            </FilterItem>
          ))}
        </Group>
        <TagGroup
          title="Flags"
          tag="flag:"
          values={stats.sorted.flags}
          counts={flagCounts}
          parsed={parsed}
          onToggle={cycleTag}
        />
        <TagGroup
          title="Modules"
          tag="module:"
          values={stats.sorted.modules}
          counts={moduleCounts}
          parsed={parsed}
          onToggle={cycleTag}
        />
      </SidebarList>
      {hasFilters && <ClearButton onClick={clearFilters}>Clear filters</ClearButton>}
    </>
  );
});

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <SidebarGroupHeader
        data-collapsed={collapsed || undefined}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        {title}
        {count !== undefined && <SidebarCount>{count}</SidebarCount>}
      </SidebarGroupHeader>
      {!collapsed && <GroupItems>{children}</GroupItems>}
    </>
  );
}

function TagGroup({
  title,
  tag,
  values,
  counts,
  parsed,
  onToggle,
}: {
  title: string;
  tag: FilterTag;
  values: string[];
  counts: Map<string, number>;
  parsed: ParsedConsoleSearch;
  onToggle: (tag: FilterTag, value: string) => void;
}) {
  return (
    <Group title={title} count={values.length}>
      {values.map((v) => {
        const state = getTagState(parsed, tag, v);
        const count = counts.get(v) ?? 0;
        return tag === "flag:" ? (
          <FlagFilterItem
            key={v}
            flag={v}
            state={state}
            count={count}
            onClick={() => onToggle(tag, v)}
          />
        ) : (
          <FilterItem
            key={v}
            data-state={state}
            data-empty={count === 0 || undefined}
            aria-pressed={state === "include"}
            title={MODULE_TITLE[state](v)}
            onClick={() => onToggle(tag, v)}
          >
            <Spacer />
            <ItemName>{v}</ItemName>
            {state === "exclude" && <VisuallyHidden>(hidden)</VisuallyHidden>}
            <SidebarCount>{count.toLocaleString("en-US")}</SidebarCount>
          </FilterItem>
        );
      })}
    </Group>
  );
}

/** A flag's filter row, with a hover tooltip explaining the flag */
function FlagFilterItem({
  flag,
  state,
  count,
  onClick,
}: {
  flag: string;
  state: TagState;
  count: number;
  onClick: () => void;
}) {
  const icon = flagIcon(flag);
  const description = flagDescription(flag);
  const { referenceProps, tooltip } = useTooltip(
    description && <FlagTooltipContent flag={flag} description={description} />,
    flagAccent(flag),
  );

  return (
    <>
      <FilterItem
        data-group={flagGroup(flag)}
        data-state={state}
        data-empty={count === 0 || undefined}
        aria-pressed={state === "include"}
        onClick={onClick}
        {...referenceProps}
      >
        {/* The flag's own icon takes the place of the color dot */}
        {flag === EXCLUSIVE_FLAG ? (
          <ExclusiveIcon size={16} />
        ) : icon ? (
          <FlagIcon kind={icon} size={12} />
        ) : (
          <Dot />
        )}
        <ItemName>{flag}</ItemName>
        {state === "exclude" && <VisuallyHidden>(hidden)</VisuallyHidden>}
        <SidebarCount>{count.toLocaleString("en-US")}</SidebarCount>
      </FilterItem>
      {tooltip}
    </>
  );
}

const GroupItems = styled.div`
  padding-bottom: 8px;
`;

const Spacer = styled.span`
  width: 16px;
  flex-shrink: 0;
`;

const FlagIcon = styled(KindIcon)`
  margin: 0 2px;
  flex-shrink: 0;
  color: var(--c);
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  margin: 0 4px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c);
`;

const ItemName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FilterItem = styled.button`
  ${sidebarRow}
  position: relative;
  --c: var(--group-border);
  ${flagColorVars}

  &[data-group="hidden"] > ${Dot} {
    background: transparent;
    border: 1px dashed var(--text-dim);
  }

  &[data-empty] {
    color: var(--text-dim);
  }

  &[data-state="include"] {
    ${sidebarRowSelected}
  }

  &[data-state="exclude"] {
    background: color-mix(in srgb, var(--flag-cheat) 9%, transparent);
    border-left-color: var(--flag-cheat);
    color: var(--text-dim);

    ${ItemName} {
      text-decoration: line-through;
    }
  }
`;

const ClearButton = styled.button`
  flex-shrink: 0;
  margin: 8px 0;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--group-border);
  background: var(--group);
  font: inherit;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;

  &:hover {
    border-color: var(--highlight);
  }
`;
