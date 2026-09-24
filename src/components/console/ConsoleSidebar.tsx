import { memo, useState } from "react";
import { styled } from "@linaria/react";
import {
  getTagState,
  type FilterTag,
  type ParsedConsoleSearch,
  type TagState,
} from "../../utils/console-filtering";
import { BrandRow } from "../layout/NavBar";
import { SidebarGroupHeader, SidebarHeader, SidebarList, SidebarWrapper } from "../layout/Sidebar";
import { KindIcon } from "../kind-icon/KindIcon";
import { flagColorVars } from "./ConsoleRow";
import { flagGroup, flagIcon } from "./flags";
import type { ConsoleFilters } from "./ConsolePage";

const KINDS = [
  { kind: "all", label: "All", icon: null },
  { kind: "convars", label: "ConVars", icon: "convar" },
  { kind: "commands", label: "Commands", icon: "command" },
] as const;

const TITLES: Record<FilterTag, Record<TagState, (value: string) => string>> = {
  "flag:": {
    off: (v) => `Only show ${v}`,
    include: (v) => `Hide ${v}`,
    exclude: (v) => `Stop filtering by ${v}`,
  },
  "module:": {
    off: (v) => `Only show ${v}`,
    include: (v) => `Stop filtering by ${v}`,
    exclude: (v) => `Stop filtering by ${v}`,
  },
};

export const ConsoleSidebar = memo(function ConsoleSidebar({
  filters,
}: {
  filters: ConsoleFilters;
}) {
  const { kind, kindCounts, moduleCounts, stats, parsed, setKind, cycleTag, clearFilters } =
    filters;
  const hasFilters =
    kind !== "all" ||
    parsed.modules.length + parsed.notModules.length + parsed.flags.length > 0 ||
    parsed.notFlags.length + parsed.types.length + parsed.notTypes.length > 0;

  return (
    <SidebarWrapper aria-label="Filters">
      <SidebarHeader>
        <BrandRow section="console" />
      </SidebarHeader>
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
              <ChipCount>{kindCounts[k].toLocaleString("en-US")}</ChipCount>
            </FilterItem>
          ))}
        </Group>
        <TagGroup
          title="Flags"
          tag="flag:"
          values={stats.sorted.flags}
          counts={stats.flags}
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
    </SidebarWrapper>
  );
});

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <SidebarGroupHeader
        data-collapsed={collapsed || undefined}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        {title}
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
    <Group title={`${title} (${values.length})`}>
      {values.map((v) => {
        const state = getTagState(parsed, tag, v);
        const count = counts.get(v) ?? 0;
        const icon = tag === "flag:" ? flagIcon(v) : undefined;
        return (
          <FilterItem
            key={v}
            data-group={tag === "flag:" ? flagGroup(v) : undefined}
            data-state={state}
            data-empty={count === 0 || undefined}
            aria-pressed={state === "include"}
            title={TITLES[tag][state](v)}
            onClick={() => onToggle(tag, v)}
          >
            {/* The flag's own icon takes the place of the color dot */}
            {icon ? <FlagIcon kind={icon} size={12} /> : tag === "flag:" ? <Dot /> : <Spacer />}
            <ItemName>{v}</ItemName>
            {state === "exclude" && <VisuallyHidden>(hidden)</VisuallyHidden>}
            <ChipCount>{count.toLocaleString("en-US")}</ChipCount>
          </FilterItem>
        );
      })}
    </Group>
  );
}

/** An excluded flag is only drawn differently, screen readers get it as text */
const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const ChipCount = styled.span`
  font-weight: 400;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
`;

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
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: var(--text);
  cursor: pointer;
  --c: var(--group-border);
  ${flagColorVars}

  > :last-child {
    margin-left: auto;
  }

  &[data-group="hidden"] > ${Dot} {
    background: transparent;
    border: 1px dashed var(--text-dim);
    box-sizing: border-box;
  }

  &:hover {
    background: var(--group-members);
  }

  &[data-empty] {
    color: var(--text-dim);
  }

  &[data-state="include"] {
    font-weight: 600;
    background: color-mix(in srgb, var(--highlight) 9%, transparent);
    border-left-color: var(--highlight);
    color: var(--highlight);
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
