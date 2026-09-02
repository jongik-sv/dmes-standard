"use client";

import React, { useState, useCallback, useRef, memo } from "react";
import "./tree.css";

export interface TreeNode {
  id: string | number;
  label: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

interface TreeNodeProps {
  node: TreeNode;
  level: number;
  expandedItems: (string | number)[];
  selectedItems: string[];
  onToggle: (nodeId: string | number) => void;
  onSelect: (nodeId: string | number) => void;
}

function getVisibleNodes(items: TreeNode[], expandedItems: (string | number)[], level = 0): (TreeNode & { level: number })[] {
  const result: (TreeNode & { level: number })[] = [];
  for (const item of items) {
    result.push({ ...item, level });
    const hasChildren = item.children && item.children.length > 0;
    if (hasChildren && expandedItems.includes(item.id)) {
      result.push(...getVisibleNodes(item.children!, expandedItems, level + 1));
    }
  }
  return result;
}

function findParentNode(items: TreeNode[], targetId: string | number, parent: TreeNode | null = null): TreeNode | null | undefined {
  for (const item of items) {
    if (item.id === targetId) return parent;
    if (item.children && item.children.length > 0) {
      const found = findParentNode(item.children, targetId, item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const TreeNodeComponent = memo(function TreeNodeComponent({ node, level, expandedItems, selectedItems, onToggle, onSelect }: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedItems.includes(node.id);
  const isSelected = selectedItems.includes(String(node.id));

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) onToggle(node.id);
  };

  const handleSelect = () => {
    onSelect(node.id);
  };

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected} aria-level={level + 1} data-node-id={node.id}>
      <div className={`tree-node-content ${isSelected ? "selected" : ""}`} style={{ paddingLeft: `${level * 16 + 8}px` }} onClick={handleSelect}>
        <span className={`tree-node-toggle ${hasChildren ? "has-children" : ""}`} onClick={handleToggle}>
          {hasChildren ? (isExpanded ? "\u25BC" : "\u25B6") : ""}
        </span>
        <span className="tree-node-label">{node.label}</span>
      </div>
      {hasChildren && isExpanded && (
        <ul role="group">
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              expandedItems={expandedItems}
              selectedItems={selectedItems}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

export interface TreeProps {
  items?: TreeNode[];
  expandedItems?: (string | number)[];
  selectedItems?: (string | number)[] | string;
  onExpandedItemsChange?: (event: null, newExpanded: (string | number)[]) => void;
  onSelectedItemsChange?: (event: null, nodeId: string) => void;
  className?: string;
}

function TreeComponent({
  items = [],
  expandedItems: controlledExpanded,
  selectedItems: controlledSelected,
  onExpandedItemsChange,
  onSelectedItemsChange,
  className = "",
}: TreeProps) {
  const treeRef = useRef<HTMLUListElement>(null);
  const [internalExpanded, setInternalExpanded] = useState<(string | number)[]>([]);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);

  const expandedItems = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const selectedItems: string[] =
    controlledSelected !== undefined
      ? Array.isArray(controlledSelected)
        ? controlledSelected.map(String)
        : [String(controlledSelected)]
      : internalSelected;

  const handleToggle = useCallback(
    (nodeId: string | number) => {
      const newExpanded = expandedItems.includes(nodeId) ? expandedItems.filter((id) => id !== nodeId) : [...expandedItems, nodeId];
      if (onExpandedItemsChange) {
        onExpandedItemsChange(null, newExpanded);
      } else {
        setInternalExpanded(newExpanded);
      }
    },
    [expandedItems, onExpandedItemsChange],
  );

  const handleSelect = useCallback(
    (nodeId: string | number) => {
      const nodeIdStr = String(nodeId);
      if (onSelectedItemsChange) {
        onSelectedItemsChange(null, nodeIdStr);
      } else {
        setInternalSelected([nodeIdStr]);
      }
    },
    [onSelectedItemsChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const visibleNodes = getVisibleNodes(items, expandedItems);
      if (visibleNodes.length === 0) return;

      const currentId = selectedItems.length > 0 ? selectedItems[0] : null;
      const currentIndex = currentId != null ? visibleNodes.findIndex((n) => String(n.id) === String(currentId)) : -1;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex = currentIndex < visibleNodes.length - 1 ? currentIndex + 1 : 0;
          handleSelect(visibleNodes[nextIndex].id);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleNodes.length - 1;
          handleSelect(visibleNodes[prevIndex].id);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (currentIndex >= 0) {
            const node = visibleNodes[currentIndex];
            if (node.children?.length && !expandedItems.includes(node.id)) {
              handleToggle(node.id);
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (currentIndex >= 0) {
            const node = visibleNodes[currentIndex];
            if (node.children?.length && expandedItems.includes(node.id)) {
              handleToggle(node.id);
            } else {
              const parent = findParentNode(items, node.id);
              if (parent) handleSelect(parent.id);
            }
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (currentIndex >= 0) handleSelect(visibleNodes[currentIndex].id);
          break;
        }
      }
    },
    [items, expandedItems, selectedItems, handleToggle, handleSelect],
  );

  return (
    <ul ref={treeRef} className={`cm-tree ${className}`.trim()} role="tree" aria-label="트리 메뉴" tabIndex={0} onKeyDown={handleKeyDown}>
      {items.map((item) => (
        <TreeNodeComponent
          key={item.id}
          node={item}
          level={0}
          expandedItems={expandedItems}
          selectedItems={selectedItems}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      ))}
    </ul>
  );
}

export const Tree = memo(TreeComponent);
