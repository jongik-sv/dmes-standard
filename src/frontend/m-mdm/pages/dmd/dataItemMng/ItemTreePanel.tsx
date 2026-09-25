"use client";

/**
 * ItemTreePanel — 항목 관리 트리 보기(TSK-07-04 design.md §2, D1). 서버 `search(withTree=true)` 응답의 `tree`
 * (열린 행만, I6)를 `hier-tree.ts`(`buildCodeTree`·`toTreeItems`, TSK-06-03 이 확정한 정렬·표시 규칙, I8)로 그린다.
 *
 * codeItemEdit 트리 탭과 달리 이미 불러온 전체 행이 아니라 서버가 준 `tree` 배열을 그대로 쓴다 — 데이터 출처만 다르고
 * 트리 알고리즘·버튼 배치(이 노드로 보기/모두 펴기/모두 접기)는 같은 패턴을 따른다.
 */
import { useMemo, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { Tree } from "@dk-oasis/shared/tree";
import "@dk-oasis/shared/tree.css";
import { allNodeValues, buildCodeTree, toTreeItems, type HierRow } from "@/hier-tree";
import type { DataItemRow } from "./types";

/** 서버 `DataItemRow[]` → `HierRow[]` 어댑터 — code/name/seq/lvl1~5 만 넘긴다(다른 항목 필드는 트리에 쓰지 않는다). */
export function toHierRows(rows: DataItemRow[]): HierRow[] {
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    seq: r.seq,
    lvl1: r.lvl1,
    lvl2: r.lvl2,
    lvl3: r.lvl3,
    lvl4: r.lvl4,
    lvl5: r.lvl5,
  }));
}

export interface ItemTreePanelProps {
  rows: DataItemRow[];
  /** 트리가 상한(TREE_MAX)에 걸려 일부만 왔다(design.md §2). */
  truncated: boolean;
  loading: boolean;
  /** "이 노드로 보기" — 고른 노드 값을 그리드 필터로 올린다. */
  onViewNode: (value: string) => void;
}

const toolbar = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "var(--spacing-sm)",
  padding: "var(--spacing-xs) var(--spacing-sm)",
};

const hint = {
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
  margin: "0 0 var(--spacing-xs) 0",
};

export function ItemTreePanel({ rows, truncated, loading, onViewNode }: ItemTreePanelProps) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const treeNodes = useMemo(() => buildCodeTree(toHierRows(rows)), [rows]);
  const treeItems = useMemo(() => toTreeItems(treeNodes), [treeNodes]);

  return (
    <div data-testid="item-tree-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={toolbar}>
        <Button
          data-testid="item-tree-to-grid"
          size="sm"
          disabled={!selected}
          onClick={() => selected && onViewNode(selected)}
        >
          이 노드로 보기
        </Button>
        <Button size="sm" onClick={() => setExpanded(allNodeValues(treeNodes))}>
          모두 펴기
        </Button>
        <Button size="sm" onClick={() => setExpanded([])}>
          모두 접기
        </Button>
      </div>
      {truncated && <p style={hint}>처음 2000건만 표시합니다.</p>}
      {!loading && rows.length === 0 && (
        <p data-testid="item-tree-empty" style={hint}>
          트리로 보일 항목이 없습니다.
        </p>
      )}
      <div data-testid="item-tree" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Tree
          items={treeItems}
          expandedItems={expanded}
          selectedItems={selected ? [selected] : []}
          onExpandedItemsChange={(_e, next) => setExpanded(next.map(String))}
          onSelectedItemsChange={(_e, id) => setSelected(id)}
        />
      </div>
    </div>
  );
}
