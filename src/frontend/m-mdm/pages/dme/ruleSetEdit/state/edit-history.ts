/**
 * 룰 세트 흐름 편집 이력(3단계 P5) — 되돌리기·다시 하기 스택. 화면 상태가 아니라 순수 자료구조다.
 * 같은 칸(mergeKey)을 mergeMs 안에 연달아 고치면 한 번으로 합친다(입력 칸 글자마다 기록하지 않게).
 */
import type { EditFlow } from "../flow-edit";

export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;

interface Entry {
  flow: EditFlow;
  key: string | undefined;
  at: number;
}

export class EditHistory {
  private undoStack: Entry[] = [];
  private redoStack: EditFlow[] = [];

  constructor(
    private readonly limit: number = HISTORY_LIMIT,
    private readonly mergeMs: number = MERGE_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 바뀌기 "전" 흐름을 적는다. 합칠 수 있으면 시각만 늦춘다. */
  record(before: EditFlow, mergeKey?: string): void {
    const t = this.now();
    const last = this.undoStack[this.undoStack.length - 1];
    this.redoStack = [];
    if (last && mergeKey !== undefined && last.key === mergeKey && t - last.at <= this.mergeMs) {
      last.at = t;
      return;
    }
    this.undoStack.push({ flow: before, key: mergeKey, at: t });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  undo(current: EditFlow): EditFlow | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.redoStack.push(current);
    this.breakMerge();
    return e.flow;
  }

  redo(current: EditFlow): EditFlow | null {
    const f = this.redoStack.pop();
    if (!f) return null;
    this.undoStack.push({ flow: current, key: undefined, at: this.now() });
    this.breakMerge();
    return f;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** 되돌리기·다시 하기 뒤에는 다음 입력이 새 기록이 되게 합치기를 끊는다. */
  private breakMerge(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last) last.key = undefined;
  }
}
