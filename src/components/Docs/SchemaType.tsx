import { useContext, useEffect, useMemo, useState } from "react";
import { NavLink, type NavigateFunction } from "react-router-dom";
import { styled } from "@linaria/react";
import { SchemaFieldType, SchemaMetadataEntry } from "./api";
import { ColoredSyntax } from "../ColoredSyntax";
import { KindIcon } from "../KindIcon";
import { metadataIconMap } from "../KindIcon/metadataIconMap";
import { DeclarationsContext, declarationPath } from "./DeclarationsContext";

const AngleBracket = styled.span`
  color: var(--text-dim);
  font-weight: 400;
`;

// @ts-expect-error Linaria styled() doesn't support ForwardRefExoticComponent
const TypeLink = styled(NavLink)`
  font-weight: 600;
  text-decoration-color: var(--syntax-interface);

  &.active {
    text-decoration: none;
  }
`;

export function SchemaTypeView({ type }: { type: SchemaFieldType }) {
  switch (type.category) {
    case "builtin":
      return <ColoredSyntax kind="literal">{type.name}</ColoredSyntax>;
    case "declared_class":
    case "declared_enum":
      return <DeclarationLink name={type.name} module={type.module} />;
    case "ptr":
      return (
        <>
          <SchemaTypeView type={type.inner} />*
        </>
      );
    case "fixed_array":
      return (
        <>
          <SchemaTypeView type={type.inner} />[{type.count}]
        </>
      );
    case "atomic":
      if (type.inner) {
        return (
          <span>
            <ColoredSyntax kind="interface">{type.name}</ColoredSyntax>
            <AngleBracket>&lt; </AngleBracket>
            <SchemaTypeView type={type.inner} />
            {type.inner2 && (
              <>
                , <SchemaTypeView type={type.inner2} />
              </>
            )}
            <AngleBracket> &gt;</AngleBracket>
          </span>
        );
      }
      return <ColoredSyntax kind="interface">{type.name}</ColoredSyntax>;
    case "bitfield":
      return <ColoredSyntax kind="literal">bitfield:{type.count}</ColoredSyntax>;
  }
}

function DeclarationLink({ name, module }: { name: string; module: string }) {
  const { root } = useContext(DeclarationsContext);
  const to = declarationPath(root, module, name);

  return (
    <TypeLink to={to}>
      <ColoredSyntax kind="interface">{name}</ColoredSyntax>
    </TypeLink>
  );
}

const MetadataList = styled.div`
  font-size: 14px;
  color: var(--text-dim);
  margin-top: 4px;
  margin-bottom: 4px;
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetadataGroupName = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text);
  opacity: 0.6;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;

  &:hover {
    color: var(--highlight);
    opacity: 1;
  }
`;

const MetadataGroupValues = styled.div`
  margin-left: 16px;
  display: flex;
  flex-direction: column;
`;

const MetadataEntry = styled.div`
  display: flex;
`;

const MetadataIcon = styled.span`
  display: inline-flex;
  margin-right: 4px;
  flex-shrink: 0;
`;

const MetadataName = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text);
  opacity: 0.6;
  cursor: pointer;

  &:hover {
    color: var(--highlight);
    opacity: 1;
  }
`;

const MetadataValue = styled.span`
  color: var(--text-dim);
  white-space: pre-wrap;
`;

const MetadataToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  user-select: none;
  opacity: 0.5;
  font-size: 14px;
  margin-left: 20px;
  text-align: left;

  &:hover {
    opacity: 0.8;
  }

  &::before {
    content: "·";
    margin-right: 4px;
    opacity: 0.5;
  }
`;

const MAX_COLLAPSED_LINES = 6;

function countLines(groups: { name: string; values: (string | undefined)[] }[]): number {
  let lines = 0;
  for (const group of groups) {
    if (group.values.length === 1) {
      const val = group.values[0];
      lines += val !== undefined ? val.split("\n").length : 1;
    } else {
      lines++; // group name
      for (const v of group.values) {
        lines += v !== undefined ? v.split("\n").length : 1;
      }
    }
  }
  return lines;
}

function truncateGroups(
  groups: { name: string; values: (string | undefined)[] }[],
  maxLines: number,
): { name: string; values: (string | undefined)[] }[] {
  const result: { name: string; values: (string | undefined)[] }[] = [];
  let remaining = maxLines;

  for (const group of groups) {
    if (remaining <= 0) break;

    if (group.values.length === 1) {
      const val = group.values[0];
      if (val !== undefined) {
        const lines = val.split("\n");
        if (lines.length <= remaining) {
          result.push(group);
          remaining -= lines.length;
        } else {
          result.push({ name: group.name, values: [lines.slice(0, remaining).join("\n") + "…"] });
          remaining = 0;
        }
      } else {
        result.push(group);
        remaining--;
      }
    } else {
      remaining--; // group name line
      if (remaining <= 0) break;
      const truncatedValues: (string | undefined)[] = [];
      for (const v of group.values) {
        if (remaining <= 0) break;
        if (v !== undefined) {
          const lines = v.split("\n");
          if (lines.length <= remaining) {
            truncatedValues.push(v);
            remaining -= lines.length;
          } else {
            truncatedValues.push(lines.slice(0, remaining).join("\n") + "…");
            remaining = 0;
          }
        } else {
          truncatedValues.push(v);
          remaining--;
        }
      }
      result.push({ name: group.name, values: truncatedValues });
    }
  }

  return result;
}

export function MetadataTags({
  metadata,
  root,
  navigate,
}: {
  metadata: SchemaMetadataEntry[];
  root: string;
  navigate: NavigateFunction;
}) {
  const grouped = useMemo(() => {
    const groups: { name: string; values: (string | undefined)[] }[] = [];
    const map = new Map<string, { name: string; values: (string | undefined)[] }>();
    for (const entry of metadata) {
      let group = map.get(entry.name);
      if (!group) {
        group = { name: entry.name, values: [] };
        map.set(entry.name, group);
        groups.push(group);
      }
      group.values.push(entry.value);
    }
    const priority = (name: string) => {
      if (name === "MPropertyFriendlyName" || name === "MPropertyDescription") return -1;
      if (name === "MGetKV3ClassDefaults") return 1;
      return 0;
    };
    groups.sort((a, b) => {
      const p = priority(a.name) - priority(b.name);
      if (p !== 0) return p;
      return a.name.localeCompare(b.name);
    });
    return groups;
  }, [metadata]);

  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [metadata]);

  if (metadata.length === 0) return null;

  const totalLines = countLines(grouped);
  const hasMore = totalLines > MAX_COLLAPSED_LINES;
  const visible = expanded || !hasMore ? grouped : truncateGroups(grouped, MAX_COLLAPSED_LINES);

  return (
    <>
      <MetadataList>
        {visible.map((group) => {
          const iconKind = metadataIconMap[group.name] ?? "meta-default";
          if (group.values.length === 1) {
            return (
              <MetadataEntry key={group.name}>
                <MetadataIcon>
                  <KindIcon kind={iconKind} size="small" />
                </MetadataIcon>
                <span>
                  <MetadataName
                    onClick={() =>
                      navigate(`${root}?search=${encodeURIComponent(`metadata:${group.name}`)}`)
                    }
                  >
                    {group.name}
                  </MetadataName>
                  {group.values[0] !== undefined && (
                    <MetadataValue>: {group.values[0]}</MetadataValue>
                  )}
                </span>
              </MetadataEntry>
            );
          }

          return (
            <div key={group.name}>
              <MetadataGroupName
                onClick={() =>
                  navigate(`${root}?search=${encodeURIComponent(`metadata:${group.name}`)}`)
                }
              >
                <MetadataIcon>
                  <KindIcon kind={iconKind} size="small" />
                </MetadataIcon>
                {group.name}
              </MetadataGroupName>
              <MetadataGroupValues>
                {group.values.map((v, i) => (
                  <MetadataValue key={i}>{v}</MetadataValue>
                ))}
              </MetadataGroupValues>
            </div>
          );
        })}
      </MetadataList>
      {hasMore && (
        <MetadataToggle onClick={() => setExpanded(!expanded)}>
          {expanded ? "collapse" : "expand…"}
        </MetadataToggle>
      )}
    </>
  );
}
