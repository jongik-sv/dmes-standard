"use client";

/**
 * 캔버스 편집 자리(FE2 Task 13). Task 9 뼈대는 단계 1 과 같은 읽기 캔버스다.
 * 돌려주는 함수는 안정된 참조여야 한다(CanvasPane 이 decorateNodes 를 useMemo 의존성으로 쓴다). Ctrl+Z 는 ErdViewer 가 받으므로 여기서 걸지 않는다.
 */
import type { KeyboardEvent, ReactNode } from "react";

import type { NodeChange, ReactFlowInstance, ReactFlowProps } from "@dk-oasis/shared/react-flow";

import type { ErdEditContext } from "../edit-context";
import type { ErdFlowEdge, ErdFlowNode } from "./erd-flow";

export interface CanvasEditing {
  flowProps: Pick<ReactFlowProps<ErdFlowNode, ErdFlowEdge>, "nodesDraggable" | "nodesConnectable" | "deleteKeyCode"
    | "onNodeDragStop" | "onConnect" | "isValidConnection" | "connectionMode" | "onPaneClick"
    | "onNodeContextMenu" | "onPaneContextMenu" | "snapToGrid" | "snapGrid">;
  /** CanvasPane 이 select 처리 뒤 모든 변경을 넘긴다. */
  onNodesChange(changes: NodeChange<ErdFlowNode>[]): void;
  /** 끄는 중 위치를 덮는다. 바뀌지 않은 노드는 같은 참조. */
  decorateNodes(nodes: ErdFlowNode[]): ErdFlowNode[];
  /** CanvasPane 이 ReactFlow 를 감싼 tabIndex=0 div 에 단다. */
  onKeyDown(e: KeyboardEvent): void;
  toolbar: ReactNode;
  /** 이름 겹침 창·마법사 등. */
  overlay: ReactNode;
}

const READ_ONLY: CanvasEditing = {
  flowProps: { nodesDraggable: false, nodesConnectable: false, deleteKeyCode: null },
  onNodesChange: () => undefined,
  decorateNodes: (nodes) => nodes,
  onKeyDown: () => undefined,
  toolbar: null,
  overlay: null,
};

export function useCanvasEditing(_ctx: ErdEditContext, _rf: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>): CanvasEditing {
  return READ_ONLY;
}
