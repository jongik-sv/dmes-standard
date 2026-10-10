"use client";

/** 버전 막대 자리(Task 11). */
import type { ErdEditContext } from "../edit-context";
import type { ErdVersionEvent } from "../types";

export interface VersionBarProps { ctx: ErdEditContext; onReload(): Promise<void>; onVersion(ev: ErdVersionEvent): void }

export function VersionBar(_p: VersionBarProps) {
  return null;
}
