import { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { SchemaClass } from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";

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

const TreeContainer = styled.div`
  max-width: 560px;
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
`;

function TreeNodeView({ node, game }: { node: TreeNode; game: string }) {
  return (
    <li>
      <ClassLink
        to={schemaPath(game, node.cls.module, node.cls.name)}
        title={`class in ${node.cls.module}`}
      >
        {node.cls.name}
      </ClassLink>
      {node.children.length > 0 && (
        <TreeList>
          {node.children.map((child) => (
            <TreeNodeView
              key={declarationKey(child.cls.module, child.cls.name)}
              node={child}
              game={game}
            />
          ))}
        </TreeList>
      )}
    </li>
  );
}

export function ClassTree({ module }: { module?: string }) {
  const { classesByKey, game } = useContext(DeclarationsContext);

  const filteredClassesByKey = useMemo(() => {
    if (!module) return classesByKey;
    const filtered = new Map<string, SchemaClass>();
    for (const [key, cls] of classesByKey) {
      if (cls.module === module) filtered.set(key, cls);
    }
    return filtered;
  }, [classesByKey, module]);

  const groups = useMemo(() => buildTree(filteredClassesByKey), [filteredClassesByKey]);

  return (
    <TreeContainer>
      <RootList>
        {groups.map((group) => (
          <li key={group.module}>
            <strong>{group.module}</strong>
            <TreeList>
              {group.roots.map((node) => (
                <TreeNodeView
                  key={declarationKey(node.cls.module, node.cls.name)}
                  node={node}
                  game={game}
                />
              ))}
            </TreeList>
          </li>
        ))}
      </RootList>
    </TreeContainer>
  );
}
