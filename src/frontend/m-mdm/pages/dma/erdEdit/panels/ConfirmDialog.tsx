"use client";

/** 확정 대화상자 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";

export interface ConfirmDialogProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onConfirmed(): void }

export function ConfirmDialog(_p: ConfirmDialogProps) {
  return null;
}
