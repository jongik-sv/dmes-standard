/**
 * 룰 세트 편집의 변수·룰 링크(TSK-08-06 design §6.10, 06:756).
 *
 * 룰 → 룰 화면(`openRuleEdit`). 컬럼 사전 변수 → 컬럼 화면(파라미터 없음, D13). 결과 변수·앞 룰이 만든 조건 변수 → 그 이름을 만드는
 * 첫 룰(목록 순)의 룰 화면. 프로그램 변수·어디에도 없는 이름은 링크가 없다.
 */
import { openRuleEdit } from "@/dme/rule-handoff";
import { openMdmPage } from "@/shell";

import type { IoSource } from "./types";

export const COLUMN_PAGE = "dma/columnMng";
export const NO_LINK_TITLE = "컬럼 사전 밖 이름이라 갈 곳이 없다";

/** 변수 링크가 갈 곳 — 컬럼 화면이나 만드는 룰. null 이면 링크 없음. */
export type VarTarget = { kind: "column" } | { kind: "rule"; ruleId: string } | null;

/** 조건(입력) 변수의 갈 곳 — DICT 면 컬럼 화면, 앞 룰이 만든 이름이면 그 룰, 그 밖은 없음. */
export function condTarget(source: IoSource | null, producer: string | null | undefined): VarTarget {
  if (source === "DICT") return { kind: "column" };
  return producer ? { kind: "rule", ruleId: producer } : null;
}

/** 결과 변수의 갈 곳 — 만드는 첫 룰. */
export function resultTarget(by: readonly string[]): VarTarget {
  return by.length ? { kind: "rule", ruleId: by[0] } : null;
}

export function openRule(ruleId: string): void {
  openRuleEdit(ruleId);
}

export function openVar(target: VarTarget): void {
  if (!target) return;
  if (target.kind === "column") openMdmPage(COLUMN_PAGE);
  else openRuleEdit(target.ruleId);
}
