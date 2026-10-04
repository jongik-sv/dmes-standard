/**
 * layoutConfirm 응답 타입(D-144 3단계, Task 7 계약). 서버 `LayoutConfirmService` 의 `data.result` 모양이다.
 * 레이아웃 업무 버전(VER)은 소수 셋째 자리 문자열이다(`"1.001"`). 날짜는 `yyyy-MM-dd HH:mm:ss`(KST) 문자열이다.
 */
import type { MdmVersionStatus } from "@/shell";

export type LayoutKind = "MESSAGE" | "HEADER" | string;

/** 확정 대기 목록 한 행 — 레이아웃의 DRAFT 마다 한 행. */
export interface DraftRow {
  LAYOUT_ID: number;
  LAYOUT_KIND: LayoutKind;
  LAYOUT_NAME: string;
  VER: string;
  VER_KIND: string;
  OWNER_ID: string | null;
  ROW_VERSION: number;
  BASE_VER: string | null;
}

export interface SearchResult {
  rows?: DraftRow[];
  /** limit 을 보냈을 때만 온다 — 조건에 맞는 전체 건수. */
  totalCount?: number;
  /** limit 을 보냈을 때만 온다 — 상한으로 잘렸는지. */
  truncated?: boolean;
}

export interface ViewLayout {
  LAYOUT_ID: number;
  LAYOUT_KIND: LayoutKind;
  LAYOUT_NAME: string;
  STATUS: string;
}

export interface ViewVersion {
  VER: string;
  VER_KIND: string;
  STATUS: MdmVersionStatus;
  OWNER_ID: string | null;
  ROW_VERSION: number;
  BASE_VER: string | null;
  APPLY_FROM?: string | null;
  APPLY_TO?: string | null;
}

export interface PreviousVersion {
  VER: string;
  APPLY_FROM: string | null;
  APPLY_TO: string | null;
}

export interface ViewResult {
  layout: ViewLayout;
  version: ViewVersion;
  previous: PreviousVersion | null;
  firstVersion: boolean;
}

export interface CheckRow {
  severity: "ERROR" | "WARNING" | string;
  code: string;
  message: string;
  field: string | null;
  itemKey: string | null;
}

/** 직전 RELEASED 대비 변경 분류. 최초 확정(INITIAL)이면 switchMode 가 null 이다. */
export interface ChangeInfo {
  switchMode: string | null;
  kinds: string[];
  summary: string;
}

/** 헤더 확정이 T 시점 전문에 미치는 영향 한 행. */
export interface ImpactRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  SND_RCV: string;
  VER: string;
  STATE: string;
  EVALUATED_AT: string;
  TOTAL_LENGTH_BEFORE: number | null;
  TOTAL_LENGTH_AFTER: number | null;
  ISSUES: string;
}

export interface ValidateResult {
  checks?: CheckRow[];
  applyFromCheck?: { ok: boolean; message: string | null };
  /** 검사 오류가 있으면 분류할 수 없어 null 이다. */
  change?: ChangeInfo | null;
  simultaneous?: boolean;
  futureApplyFrom?: boolean;
  impact?: ImpactRow[];
  /** 이 헤더 버전을 apply_from 에 확정하면 그 시각 이 헤더가 표준 헤더인 EAI(시각 T 해석, Ruling P3-15). 표준 헤더가 바뀌면 checks 에 EAI_STANDARD_HEADER_SWITCH 경고가 함께 온다. 전문이면 빈 목록. */
  eais?: string[];
}

export interface ConfirmResult {
  layoutId: number;
  ver: string;
  rowVersion: number;
  closedPreviousVer: string | null;
  /** 최초 확정(INITIAL)이면 null. */
  switchMode?: string | null;
  /** 변경 종류를 쉼표로 이은 문자열(`"FILLER_SPLIT"`, `"ITEM_LENGTH,TOTAL_LENGTH"`) — 버전 행 CHANGE_KINDS 칸과 같은 모양이다. */
  changeKinds?: string;
  changeSummary?: string;
}
