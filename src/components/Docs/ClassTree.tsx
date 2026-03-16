import { useContext, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { styled } from "@linaria/react";
import { SchemaClass } from "./api";
import { DeclarationsContext, declarationKey, declarationPath } from "./DeclarationsContext";

interface TreeNode {
  cls: SchemaClass;
  children: TreeNode[];
}

interface ModuleGroup {
  module: string;
  roots: TreeNode[];
}

function buildTree(classesByKey: Map<string, SchemaClass>): ModuleGroup[] {
  const allNodes = new Map<string, TreeNode>();
  const hasParentInTree = new Set<string>();

  for (const [key, cls] of classesByKey) {
    allNodes.set(key, { cls, children: [] });
  }

  for (const [key, cls] of classesByKey) {
    for (const parent of cls.parents) {
      const parentKey = declarationKey(parent.module, parent.name);
      const parentNode = allNodes.get(parentKey);
      if (parentNode) {
        hasParentInTree.add(key);
        parentNode.children.push(allNodes.get(key)!);
      }
    }
  }

  for (const node of allNodes.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
    }
  }

  const moduleRoots = new Map<string, TreeNode[]>();
  for (const [key, node] of allNodes) {
    if (!hasParentInTree.has(key)) {
      let roots = moduleRoots.get(node.cls.module);
      if (!roots) {
        roots = [];
        moduleRoots.set(node.cls.module, roots);
      }
      roots.push(node);
    }
  }

  const groups: ModuleGroup[] = [];
  for (const [module, roots] of moduleRoots) {
    roots.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
    groups.push({ module, roots });
  }
  groups.sort((a, b) => a.module.localeCompare(b.module));
  return groups;
}

function filterTree(nodes: TreeNode[], lower: string): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const nameMatches = node.cls.name.toLowerCase().includes(lower);
    if (nameMatches) {
      result.push(node);
    } else {
      const filteredChildren = filterTree(node.children, lower);
      if (filteredChildren.length > 0) {
        result.push({ cls: node.cls, children: filteredChildren });
      }
    }
  }
  return result;
}

function filterGroups(groups: ModuleGroup[], query: string): ModuleGroup[] {
  const lower = query.toLowerCase();
  const result: ModuleGroup[] = [];
  for (const group of groups) {
    const filteredRoots = filterTree(group.roots, lower);
    if (filteredRoots.length > 0) {
      result.push({ module: group.module, roots: filteredRoots });
    }
  }
  return result;
}

const ClassLink = styled(Link)`
  text-decoration: none;
  color: var(--text);
  font-size: 14px;

  &:hover {
    color: var(--highlight);
  }
`;

const TreeList = styled.ul`
  margin: 0;
  padding-left: 20px;
  list-style: none;
`;

const RootList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const TreeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  font-size: 14px;
  color: var(--text-dim);
`;

const TreeFilterInput = styled.input`
  background: var(--group-members);
  border: 1px solid var(--group-border);
  border-radius: 6px;
  padding: 4px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  width: 200px;

  &:focus {
    outline: none;
    border-color: var(--highlight);
  }
`;

function TreeNodeView({ node, root }: { node: TreeNode; root: string }) {
  return (
    <li>
      <ClassLink to={declarationPath(root, node.cls.module, node.cls.name)}>
        {node.cls.name}
      </ClassLink>
      {node.children.length > 0 && (
        <TreeList>
          {node.children.map((child) => (
            <TreeNodeView
              key={declarationKey(child.cls.module, child.cls.name)}
              node={child}
              root={root}
            />
          ))}
        </TreeList>
      )}
    </li>
  );
}

export function ClassTree() {
  const { classesByKey, root } = useContext(DeclarationsContext);
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => buildTree(classesByKey), [classesByKey]);

  const displayGroups = useMemo(() => {
    if (!filter) return groups;
    return filterGroups(groups, filter);
  }, [groups, filter]);

  const totalClasses = classesByKey.size;

  return (
    <>
      <TreeHeader>
        <TreeFilterInput
          type="search"
          placeholder={`Filter ${totalClasses} classes...`}
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </TreeHeader>
      <RootList>
        {displayGroups.map((group) => (
          <li key={group.module}>
            <strong>{group.module}</strong>
            <TreeList>
              {group.roots.map((node) => (
                <TreeNodeView
                  key={declarationKey(node.cls.module, node.cls.name)}
                  node={node}
                  root={root}
                />
              ))}
            </TreeList>
          </li>
        ))}
      </RootList>
    </>
  );
}
