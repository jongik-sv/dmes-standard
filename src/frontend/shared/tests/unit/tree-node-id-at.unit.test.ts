/** @vitest-environment happy-dom */

// treeNodeIdAt — 끌어 놓기 때 마우스 아래 트리 노드 찾기. 끌기 그림(ghost)이 맨 위에 있어도 그 아래 노드를 찾는다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { treeNodeIdAt } from "../../src/components/tree/Tree";

function treeWithItem(value: string) {
  const root = document.createElement("div");
  root.innerHTML = `<ul class="cm-tree"><li role="treeitem" data-value="${value}"><div class="tree-item"><span class="tree-item__label">${value}</span></div></li></ul>`;
  document.body.appendChild(root);
  return { root, label: root.querySelector(".tree-item__label")! };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("treeNodeIdAt", () => {
  it("맨 위에 끌기 그림이 있어도 그 아래 트리 노드 id 를 준다", () => {
    const { root, label } = treeWithItem("grp-a");
    const ghost = document.createElement("div");
    ghost.className = "ag-dnd-ghost";
    document.body.appendChild(ghost);
    document.elementsFromPoint = vi.fn(() => [ghost, label, root, document.body]);
    expect(treeNodeIdAt({ clientX: 1, clientY: 1 }, root)).toBe("grp-a");
  });

  it("트리 밖이면 null", () => {
    const { root } = treeWithItem("grp-a");
    const other = document.createElement("div");
    document.body.appendChild(other);
    document.elementsFromPoint = vi.fn(() => [other, document.body]);
    expect(treeNodeIdAt({ clientX: 1, clientY: 1 }, root)).toBeNull();
  });

  it("root 를 주면 다른 트리의 노드는 무시한다", () => {
    const a = treeWithItem("in-a");
    const b = treeWithItem("in-b");
    document.elementsFromPoint = vi.fn(() => [b.label, b.root, document.body]);
    expect(treeNodeIdAt({ clientX: 1, clientY: 1 }, a.root)).toBeNull();
    expect(treeNodeIdAt({ clientX: 1, clientY: 1 })).toBe("in-b");
  });
});
