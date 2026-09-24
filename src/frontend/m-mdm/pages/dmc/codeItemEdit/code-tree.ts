/**
 * 계층 칸(lvl1~lvl5) 트리 — 시뮬레이터 `docs/mdm/design/basic/sql/04-hier-tree-sim.py` 의 `tree()`·`order()` 규칙
 * (TSK-06-03 design.md §1.4-1, D9). 행은 최종 코드만 두고 그룹은 lvl 칸의 값이다. 같은 문자열은 같은 노드다.
 *
 * 표시 순서는 앱이 정한다(04:808): 한 노드의 자식 가운데 코드 행이 있는 노드(코드이자 그룹인 노드 포함)를 먼저
 * (seq, 값) 오름차순으로, 그다음 순수 그룹을 값 오름차순으로 둔다. 뿌리도 같다. 문자열 비교는 시뮬레이터(Python)와 같은
 * 코드 포인트 순이다(localeCompare 를 쓰지 않는다).
 */
import type { TreeNode } from "@dk-oasis/shared/tree";

export interface HierRow {
  code: string;
  name?: string | null;
  seq?: number | null;
  lvl1?: string | null;
  lvl2?: string | null;
  lvl3?: string | null;
  lvl4?: string | null;
  lvl5?: string | null;
}

export interface CodeTreeNode {
  value: string;
  name?: string | null;
  seq?: number | null;
  /** 이 값의 코드 행이 있다(코드이자 그룹인 노드도 true). */
  isCode: boolean;
  /** 표시 순서대로. */
  children: CodeTreeNode[];
}

export const LVL_KEYS = ["lvl1", "lvl2", "lvl3", "lvl4", "lvl5"] as const;

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function lvlsOf(row: HierRow): string[] {
  const out: string[] = [];
  for (const k of LVL_KEYS) {
    const v = row[k];
    if (v === null || v === undefined || v === "") break;
    out.push(v);
  }
  return out;
}

interface Building {
  value: string;
  name?: string | null;
  seq?: number | null;
  isCode: boolean;
  kids: string[];
}

export function buildCodeTree(rows: HierRow[]): CodeTreeNode[] {
  const sorted = [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || cmp(a.code, b.code));
  const nodes = new Map<string, Building>();
  const roots: string[] = [];
  const node = (v: string, parent: string | null): Building => {
    let n = nodes.get(v);
    if (!n) {
      n = { value: v, isCode: false, kids: [] };
      nodes.set(v, n);
      (parent === null ? roots : nodes.get(parent)!.kids).push(v);
    }
    return n;
  };
  for (const row of sorted) {
    let parent: string | null = null;
    for (const v of lvlsOf(row)) {
      node(v, parent);
      parent = v;
    }
    const self = node(row.code, parent);
    self.isCode = true;
    self.name = row.name;
    self.seq = row.seq;
  }
  const order = (kids: string[]): string[] => {
    const codes = kids.filter((k) => nodes.get(k)!.isCode)
      .sort((a, b) => (nodes.get(a)!.seq ?? 0) - (nodes.get(b)!.seq ?? 0) || cmp(a, b));
    const groups = kids.filter((k) => !nodes.get(k)!.isCode).sort(cmp);
    return [...codes, ...groups];
  };
  const build = (v: string): CodeTreeNode => {
    const n = nodes.get(v)!;
    return { value: n.value, name: n.name, seq: n.seq, isCode: n.isCode, children: order(n.kids).map(build) };
  };
  return order(roots).map(build);
}

function countCodes(n: CodeTreeNode): number {
  return n.children.reduce((sum, c) => sum + (c.isCode ? 1 : 0) + countCodes(c), 0);
}

/** shared Tree 노드로 — 코드면 `· 값 이름`, 순수 그룹이면 `값 (n건)`(n = 아래 코드 수). id 는 값이다. */
export function toTreeItems(nodes: CodeTreeNode[]): TreeNode[] {
  return nodes.map((n) => ({
    id: n.value,
    label: n.isCode ? `· ${n.value} ${n.name ?? ""}`.trimEnd() : `${n.value} (${countCodes(n)}건)`,
    isCode: n.isCode,
    children: n.children.length > 0 ? toTreeItems(n.children) : undefined,
  }));
}

/** 트리의 모든 노드 값(기본 모두 펼침용). */
export function allNodeValues(nodes: CodeTreeNode[]): string[] {
  return nodes.flatMap((n) => [n.value, ...allNodeValues(n.children)]);
}
