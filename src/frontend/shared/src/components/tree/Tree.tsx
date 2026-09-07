"use client";

import React, { memo, useMemo, useRef, useState } from "react";
import { Tree as MTree, useTree, type RenderTreeNodePayload, type TreeNodeData } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import clsx from "clsx";
import { useIsomorphicLayoutEffect } from "../../hooks/use-isomorphic-layout-effect";
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

/** 자식을 가진 노드의 id 집합을 모은다(`aria-expanded` 부여 대상 판정용). */
function collectParentIds(items: TreeNode[], acc: Set<string> = new Set()): Set<string> {
  for (const node of items) {
    if (node.children && node.children.length > 0) {
      acc.add(String(node.id));
      collectParentIds(node.children, acc);
    }
  }
  return acc;
}

/** 두 id 목록이 순서와 무관하게 같은 집합인지 판정한다. */
function isSameIdSet(a: (string | number)[], b: (string | number)[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map(String));
  return b.every((id) => set.has(String(id)));
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

  const emitExpanded = (next: (string | number)[]) => {
    if (onExpandedItemsChange) {
      onExpandedItemsChange(null, next);
    } else {
      setInternalExpanded(next);
    }
  };

  const toggle = (id: string) => {
    emitExpanded(
      expandedItems.map(String).includes(id)
        ? expandedItems.filter((x) => String(x) !== id)
        : [...expandedItems, id],
    );
  };

  const select = (id: string) => {
    if (onSelectedItemsChange) {
      onSelectedItemsChange(null, id);
    } else {
      setInternalSelected([id]);
    }
  };

  const tree = useTree({
    expandedState: Object.fromEntries(expandedItems.map((id) => [String(id), true])),
    selectedState: selectedItems,
    multiple: false,
    // `useTree` 는 제어 모드(`expandedState`/`selectedState` 를 넘긴 경우)에서 상태를 스스로
    // 갱신하지 않고 오직 아래 콜백만 호출한다(use-tree.mjs 의 `useUncontrolled`). Mantine 의
    // 키보드 핸들러(TreeNode.mjs)는 ArrowRight 에서 `controller.expand`, ArrowLeft 에서
    // `controller.collapse`, Space 에서 `controller.toggleExpanded` 를 부르므로, 이 콜백을
    // 연결하지 않으면 키보드 확장·축소가 전부 무반응이 된다.
    onExpandedStateChange: (state) => {
      const next = Object.keys(state).filter((key) => state[key]);
      // Mantine `Tree` 는 마운트 시점과 `data` 가 바뀔 때마다 `controller.initialize(data)` 로
      // 전체 노드의 확장 상태를 되돌려 준다(Tree.mjs 의 useEffect). 값이 그대로인 통지까지
      // 흘려보내면 소비처가 사용자 조작으로 오인하고, 그 결과 `items` 를 다시 만들면 순환한다.
      // 집합이 실제로 달라졌을 때만 상위로 알린다.
      if (isSameIdSet(next, expandedItems)) return;
      emitExpanded(next);
    },
    // 참고: `selectOnClick={false}` 라 현재 Mantine 이 `controller.select` 를 부르는 경로가 없어
    // 이 콜백은 실사용되지 않는다. 제어 모드 계약을 온전히 갖추기 위한 연결이다.
    onSelectedStateChange: (state) => {
      const id = state[state.length - 1];
      if (id === undefined || isSameIdSet(state, selectedItems)) return;
      select(id);
    },
  });

  // Mantine 의 TreeNode 는 ArrowUp/Down/Left/Right 와 Space 만 다루고 Enter 분기가 없다
  // (TreeNode.mjs 의 handleKeyDown). base 의 Tree 는 Enter 로 선택했으므로 그 동작을 복원한다.
  // 포커스를 받는 요소는 `<li role="treeitem">` 이고 `renderNode` 의 div 는 그 자손이라
  // 이벤트 경로에 오르지 않는다. 따라서 핸들러는 이벤트가 실제로 올라오는 root `<ul>` 에 건다
  // (Tree.mjs 가 나머지 props 를 root 요소로 전개한다).
  // base 의 `<li role="treeitem" aria-expanded aria-level>` 복원.
  // Mantine 의 중첩 `TreeNode` 는 `li` 에 `aria-expanded`·`aria-level` 을 붙이지 않고
  // (`aria-expanded` 는 flat 모드인 `FlatTreeNode` 전용), `renderNode` 는 `li` 에 props 를 주입할 수
  // 없다. 그래서 DOM 커밋 이후 `treeitem` 요소에 직접 반영한다(Radio·MultiSelectComboBox 와 동형).
  // `aria-level` 은 Mantine 이 `li` 에 남기는 `data-level`(루트가 1) 을 그대로 쓴다.
  const rootRef = useRef<HTMLUListElement>(null);
  const parentIds = useMemo(() => collectParentIds(items), [items]);
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[role="treeitem"][data-value]').forEach((li) => {
      const value = li.dataset.value;
      if (value === undefined) return;
      if (parentIds.has(value)) {
        li.setAttribute("aria-expanded", String(expandedItems.map(String).includes(value)));
      } else {
        li.removeAttribute("aria-expanded");
      }
      const level = li.dataset.level;
      if (level) li.setAttribute("aria-level", level);
    });
  }, [data, parentIds, expandedItems]);

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement | null;
    const item = target?.closest?.("[role=treeitem]") as HTMLElement | null;
    const value = item?.dataset.value;
    if (!value) return;
    event.preventDefault();
    select(value);
  };

  const renderNode = ({ node, expanded, hasChildren, selected, level, elementProps }: RenderTreeNodePayload) => (
    <div
      {...elementProps}
      className={clsx("tree-item", selected && "selected", elementProps.className)}
      style={{ paddingLeft: level * 16 }}
      // `aria-expanded`·`aria-level` 은 role 이 없는 이 div 가 아니라 실제 `li[role="treeitem"]` 에
      // 있어야 보조기술이 읽는다 — 위 layout effect 가 담당한다.
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
      ref={rootRef}
      data={data}
      tree={tree}
      renderNode={renderNode}
      expandOnClick={false}
      selectOnClick={false}
      onKeyDown={handleRootKeyDown}
      className={clsx("cm-tree", className)}
    />
  );
}

export const Tree = memo(TreeComponent);
