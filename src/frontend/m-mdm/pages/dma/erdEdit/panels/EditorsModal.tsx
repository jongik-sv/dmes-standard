"use client";

/** 공동 편집자 관리 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";
import type { ErdVersionEvent } from "../types";

export interface EditorsModalProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onVersion(ev: ErdVersionEvent): void }

export function EditorsModal(_p: EditorsModalProps) {
  return null;
}
