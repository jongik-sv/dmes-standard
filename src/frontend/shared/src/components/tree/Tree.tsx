"use client";

import React, { memo, useMemo, useState } from "react";
import { Tree as MTree, useTree, type RenderTreeNodePayload, type TreeNodeData } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import clsx from "clsx";
import "./tree.css";

export interface TreeNode {
  id: string | number;
  label: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

export interface TreeProps {
  items?: TreeNode[];
  expandedItems?: (string | number)[];
  selectedItems?: (string | number)[] | string;
  onExpandedItemsChange?: (event: null, newExpanded: (string | number)[]) => void;
  onSelectedItemsChange?: (event: null, nodeId: string) => void;
  className?: string;
}

function toNodeData(items: TreeNode[]): TreeNodeData[] {
  return items.map((n) => ({
    value: String(n.id),
    label: n.label,
    children: n.children ? toNodeData(n.children) : undefined,
  }));
}

function TreeComponent({
  items = [],
  expandedItems: controlledExpanded,
  selectedItems: controlledSelected,
  onExpandedItemsChange,
  onSelectedItemsChange,
  className = "",
}: TreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<(string | number)[]>([]);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);

  const expandedItems = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const selectedItems: string[] =
    controlledSelected !== undefined
      ? Array.isArray(controlledSelected)
        ? controlledSelected.map(String)
        : [String(controlledSelected)]
      : internalSelected;

  const data = useMemo(() => toNodeData(items), [items]);
  const tree = useTree({
    expandedState: Object.fromEntries(expandedItems.map((id) => [String(id), true])),
    selectedState: selectedItems,
    multiple: false,
  });

  const toggle = (id: string) => {
    const next = expandedItems.map(String).includes(id)
      ? expandedItems.filter((x) => String(x) !== id)
      : [...expandedItems, id];
    if (onExpandedItemsChange) {
      onExpandedItemsChange(null, next);
    } else {
      setInternalExpanded(next);
    }
  };

  const select = (id: string) => {
    if (onSelectedItemsChange) {
      onSelectedItemsChange(null, id);
    } else {
      setInternalSelected([id]);
    }
  };

  const renderNode = ({ node, expanded, hasChildren, selected, level, elementProps }: RenderTreeNodePayload) => (
    <div
      {...elementProps}
      className={clsx("tree-item", selected && "selected", elementProps.className)}
      style={{ paddingLeft: level * 16 }}
      onClick={(e) => {
        e.stopPropagation();
        select(node.value);
      }}
    >
      {hasChildren ? (
        <IconChevronRight
          size={14}
          className={clsx("tree-item__toggle", expanded && "expanded")}
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.value);
          }}
        />
      ) : (
        <span className="tree-item__toggle tree-item__toggle--leaf" />
      )}
      <span className="tree-item__label">{node.label}</span>
    </div>
  );

  return (
    <MTree
      data={data}
      tree={tree}
      renderNode={renderNode}
      expandOnClick={false}
      selectOnClick={false}
      className={clsx("cm-tree", className)}
    />
  );
}

export const Tree = memo(TreeComponent);
