/**
 * 시뮬레이션(designSimulation) 응답 모양. 파이프라인 결과(PipelineRun)는 품질설계결과와 같은 것을 쓴다.
 */
import type { PipelineRun } from "@/qdr/qualityDesignResult/types";

export const SCREEN_ID = "designSimulation";

export type CaseStatus = "NOT_RUN" | "PASS" | "WARN" | "FAIL";
export type PinOp = "=" | "~" | "≠";

export interface Pin {
  path: string;
  label: string;
  op: PinOp;
  val: string;
}

export interface VerdictExpect {
  stage: number;
  expect?: string;
  expectErrorCode?: string;
}

export interface PinResult extends Pin {
  actual: string | null;
  ok: boolean;
}

export interface VerdictResult {
  stage: number;
  expect: string | null;
  expectErrorCode: string | null;
  actual: string | null;
  ok: boolean;
}

export interface GoldenDiff {
  path: string;
  before: string | null;
  after: string | null;
}

export interface CaseEval {
  status: Exclude<CaseStatus, "NOT_RUN">;
  statusNm: string;
  pins: PinResult[];
  pinPass: number;
  pinTotal: number;
  verdicts: VerdictResult[];
  verdictPass: number;
  verdictTotal: number;
  goldenAt: string | null;
  goldenDiff: GoldenDiff[];
  anomalies: number;
  warnings: number;
}

export type OrderFields = Record<string, string | null>;

export interface SimCase {
  caseId: string;
  caseNm: string;
  baseOrdRef: string | null;
  author: string;
  order: OrderFields;
  pins: Pin[];
  verdicts: VerdictExpect[];
  goldenAt: string | null;
  hasGolden: boolean;
  status: CaseStatus;
  statusNm: string;
  lastRunAt: string | null;
  lastEval: CaseEval | null;
}

export interface CaseRow {
  caseId: string;
  caseNm: string;
  baseOrdRef: string | null;
  status: CaseStatus;
  statusNm: string;
  lastRunAt: string | null;
  pinTotal: number;
  verdictTotal: number;
  hasGolden: boolean;
  author: string;
}

export interface CaseSearchResult {
  rows: CaseRow[];
  totalCount: number;
}

export interface CaseViewResult {
  case: SimCase;
  labels: Record<string, string>;
  coreFields: string[];
  requiredFields: string[];
}

export interface CaseRunResult {
  case: SimCase;
  run: PipelineRun;
  eval: CaseEval;
}

export interface CaseSaveInput {
  caseId?: string | null;
  caseNm: string;
  baseOrdRef?: string | null;
  order: OrderFields;
  pins: Pin[];
  verdicts: VerdictExpect[];
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  NOT_RUN: "미실행",
  PASS: "PASS",
  WARN: "경고",
  FAIL: "FAIL",
};

/** 설계에만 쓰는 항목(★) — 주문정합성 룰 사전에 없다. */
export const DESIGN_ONLY_FIELDS = ["MAT_CD"];

export const PIN_OPS: { value: PinOp; label: string }[] = [
  { value: "=", label: "= 같음" },
  { value: "~", label: "~ 포함" },
  { value: "≠", label: "≠ 다름" },
];
