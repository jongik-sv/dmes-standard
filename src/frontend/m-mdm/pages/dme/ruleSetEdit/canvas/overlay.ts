/**
 * 디버거 겹침 타입(2단계 계획 P9). 기록 해석(trace-view.ts, Task 8)이 만들고 캔버스가 props 로만 받는다.
 * Task 8 이 병합되기 전에도 캔버스가 컴파일되도록 타입만 먼저 여기 둔다 — Task 8 은 이 파일에서 import 한다.
 */

/** 3단계(P9·P-D13): `next` 는 디버그 커서 바로 다음 노드(점선) — 디버그 겹침(`debugOverlay`)만 쓴다. */
export type NodeState = "run" | "error" | "current" | "next" | "pending" | "dim";
export interface NodeOverlay { state: NodeState; seq: number | null; chip: string | null; }
export type EdgeState = "run" | "chosen" | "dim" | "idle";
export interface Overlay { nodes: Record<string, NodeOverlay>; edges: Record<string, EdgeState>; }
