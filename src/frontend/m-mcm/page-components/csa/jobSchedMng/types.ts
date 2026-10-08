/**
 * jobSchedMng(예약 작업 관리) 타입·상수. 설계 docs/superpowers/specs/2026-10-08-job-scheduler-design.md §7, 계획 Task 10·12.
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared 런타임 없이 시험한다).
 */
import type { JobVarRow } from "@dk-oasis/shared/variable-table";

export const SCREEN_ID = "jobSchedMng";

export type JobKind = "CODE" | "BPMN" | "QUERY" | "COLLECT";
export const JOB_KINDS: readonly JobKind[] = ["CODE", "BPMN", "QUERY", "COLLECT"];

export const JOB_MODULES = ["MCM", "MDM", "MPP", "MLS", "MQC", "MPN"] as const;
export type JobModule = (typeof JOB_MODULES)[number];

export type RunStatus = "OK" | "FAIL" | "RUN" | "SKIP" | "TIMEOUT";
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  OK: "정상",
  FAIL: "실패",
  RUN: "실행 중",
  SKIP: "건너뜀",
  TIMEOUT: "시간 초과",
};

/** 목록 한 줄(list 응답). CLOB 칸은 싣지 않는다. */
export interface JobListRow extends Record<string, unknown> {
  jobId: string;
  moduleCd: string;
  jobNm: string;
  jobKind: string;
  cronExpr: string;
  cronDesc: string;
  useYn: string;
  nextRunAt: string;
  lastStatus: string;
  lastServerNm: string;
  lastEndedAt: string;
  ownerTp: string;
  codeMissing: boolean;
}

/** 목록 그리드 행 — 서버 값에 표시용 글자를 더한다. */
export interface JobGridRow extends Record<string, unknown> {
  jobId: string;
  moduleCd: string;
  jobNm: string;
  jobKind: string;
  kindLabel: string;
  cronExpr: string;
  cronDesc: string;
  useYn: string;
  nextRun: string;
  lastStatus: string;
  lastServerNm: string;
  codeMissing: boolean;
}

/** get·save·setUse 의 def. 칸 이름은 서버(JobSchedMngService.defView)와 같다. */
export interface JobDef {
  jobId: string;
  moduleCd: string;
  jobNm: string;
  jobKind: string;
  serviceId: string;
  svcAction: string;
  cronExpr: string;
  cronDesc: string;
  useYn: string;
  configJson: string;
  varsJson: string;
  optsJson: string;
  timeoutSec: number;
  nextRunAt: string;
  jobDesc: string;
  ownerTp: string;
  ver: number;
}

/** 실행 이력 한 줄(history 응답). */
export interface JobRunRow extends Record<string, unknown> {
  schedAt: string;
  triggerTp: string;
  status: string;
  serverNm: string;
  serviceTag: string;
  startedAt: string;
  endedAt: string;
  itemCnt: number | null;
  msg: string;
  reqUsrId: string;
}

/** 이력 그리드 행 — 서버 값에 구분 이름·소요 글자를 더한다. */
export interface JobRunGridRow extends Record<string, unknown> {
  rowId: string;
  schedAt: string;
  trigger: string;
  status: string;
  serverNm: string;
  serviceTag: string;
  startedAt: string;
  endedAt: string;
  duration: string;
  itemCnt: number | null;
  msg: string;
}

export interface HandlerRow {
  handlerId: string;
  moduleCd: string;
  handlerNm: string;
  defaultCron: string;
  varsJson: string;
  seenAt: string;
  missing: boolean;
}

export interface CronPreviewResult {
  valid: boolean;
  error?: string;
  desc?: string;
  next?: string[];
  minGapMin?: number;
}

export interface RunNowResult {
  accepted: boolean;
  message: string;
  runId: string;
}

export interface JobListFilters {
  moduleCd: string;
  jobKind: string;
  useYn: string;
  lastStatus: string;
  keyword: string;
}

export const EMPTY_FILTERS: JobListFilters = { moduleCd: "", jobKind: "", useYn: "", lastStatus: "", keyword: "" };

/** save 요청 params. 서버 JobSchedMngRequest 의 칸 이름 그대로다(BPMN 의 action 은 예약 키라 svcAction). */
export interface JobSaveRequest {
  jobId: string;
  moduleCd: string;
  jobNm: string;
  jobKind: JobKind;
  serviceId?: string;
  svcAction?: string;
  cronExpr: string;
  useYn: "Y" | "N";
  configJson?: string;
  varsJson: string;
  optsJson?: string;
  jobDesc?: string;
  timeoutSec: number;
  ver?: number;
  newJob: boolean;
}

export type { JobVarRow };
