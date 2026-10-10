"use client";

/** 컬럼 점프 자리(Ctrl/⌘+O·Alt+O, FE3 Task 14). 열렸을 때 바깥 요소에 data-testid="erd-column-jump" 를 단다(뼈대 계약 6). */
import type { ErdEditContext } from "../edit-context";

export interface ColumnJumpProps { ctx: ErdEditContext; opened: boolean; onClose(): void }

export function ColumnJump({ opened }: ColumnJumpProps) {
  return opened ? <div data-testid="erd-column-jump" hidden /> : null;
}
