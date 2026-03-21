import { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { Declaration, SchemaClass } from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";

interface TreeNode {
  cls: SchemaClass;
  children: TreeNode[];
}

function buildTree(
  classes: Map<string, SchemaClass>,
  declarations: Map<string, Map<string, Declaration>>,
): TreeNode[] {
  const allNodes = new Map<string, TreeNode>();
  const hasParentInTree = new Set<string>();

  for (const [key, cls] of classes) {
    allNodes.set(key, { cls, children: [] });
  }

  for (const [key, cls] of classes) {
    for (const parent of cls.parents) {
      const parentKey = declarationKey(parent.module, parent.name);
      let parentNode = allNodes.get(parentKey);
      if (!parentNode) {
        // Parent may be in a different module
        const parentDecl = declarations.get(parent.module)?.get(parent.name);
        if (parentDecl?.kind === "class") {
          parentNode = { cls: parentDecl, children: [] };
          allNodes.set(parentKey, parentNode);
        }
      }
      if (parentNode) {
        hasParentInTree.add(key);
        parentNode.children.push(allNodes.get(key)!);
      }
    }
  }

  for (const node of allNodes.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) =>
        a.cls.name < b.cls.name ? -1 : a.cls.name > b.cls.name ? 1 : 0,
      );
    }
  }

  const roots: TreeNode[] = [];
  for (const [key, node] of allNodes) {
    if (!hasParentInTree.has(key)) {
      roots.push(node);
    }
  }
  roots.sort((a, b) => (a.cls.name < b.cls.name ? -1 : a.cls.name > b.cls.name ? 1 : 0));
  return roots;
}

const ClassLink = styled(Link)`
  text-decoration: none;
  color: var(--text);
  font-size: 14px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--highlight);
  }
`;

const TreeList = styled.ul`
  margin: 0;
  padding-left: 10px;
  list-style: none;
`;

const RootList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const TreeHeading = styled.h1`
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
`;

const TreeContainer = styled.div`
  max-width: 560px;
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  overflow: hidden;
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
  const { declarations, game } = useContext(DeclarationsContext);

  const classes = useMemo(() => {
    const result = new Map<string, SchemaClass>();
    const modules = module ? [declarations.get(module)] : declarations.values();
    for (const moduleMap of modules) {
      if (!moduleMap) continue;
      for (const d of moduleMap.values()) {
        if (d.kind === "class") result.set(declarationKey(d.module, d.name), d);
      }
    }
    return result;
  }, [declarations, module]);

  const roots = useMemo(() => buildTree(classes, declarations), [classes, declarations]);

  return (
    <TreeContainer>
      <TreeHeading>{module}</TreeHeading>
      <RootList>
        {roots.map((node) => (
          <TreeNodeView
            key={declarationKey(node.cls.module, node.cls.name)}
            node={node}
            game={game}
          />
        ))}
      </RootList>
    </TreeContainer>
  );
}
