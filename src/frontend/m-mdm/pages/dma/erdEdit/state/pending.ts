/** 두 층 모델의 형(Task 9 뼈대). 함수는 Task 10 이 채운다. */
import type { ErdCommandJson, ErdDelta, ErdState } from "../types";

export interface PendingBatch {
  id: number; label: string; baseRev: number; commands: ErdCommandJson[]; undoOf?: number;
  state: "queued" | "sending" | "held" | "echoed"; heldRev?: number; heldSince?: number;
}
export interface Layers { server: ErdState; pending: PendingBatch[]; held: ErdDelta[] }
