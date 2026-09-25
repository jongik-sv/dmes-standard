/**
 * codeConfirm 응답 타입(TSK-06-05 design.md §6.5). 서버 `CodeConfirmService` 의 `data.result` 모양이다.
 * ver 는 늘 문자열이다(JS number 는 2.000 의 소수 자릿수를 잃는다). 날짜는 `yyyy-MM-dd HH:mm:ss`(KST) 문자열이다.
 */
import type { MdmVersionStatus } from "@/shell";

/** 확정 대기 목록 한 행 — MDM 원천이고 DRAFT 가 있는 코드의 DRAFT 마다 한 행. */
export interface PendingDraft {
  maruCodeId: string;
  maruCodeName: string;
  ver: string;
  verLabel: string;
  verKind: string;
  ownerId: string | null;
  codeStatus: string;
}

export interface SearchResult {
  rows?: PendingDraft[];
}

export interface ConfirmHeader {
  maruCodeId: string;
  maruCodeName: string;
  status: string;
  sourceKind: string;
}

export interface ConfirmVersion {
  ver: string;
  verLabel: string;
  verKind: string;
  status: MdmVersionStatus;
  ownerId: string | null;
  rowVersion: number;
  applyFrom: string | null;
  applyTo: string | null;
  requestedBy: string | null;
  releasedAt: string | null;
  restoredFrom: string | null;
}

export interface PreviousReleased {
  ver: string;
  verLabel: string;
  applyFrom: string | null;
}

export type DiffKind = "ADDED" | "REMOVED" | "CHANGED";

export interface DiffEntry {
  table: string;
  key: string;
  kind: DiffKind;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

/** 직전 RELEASED 대비 카테고리 해석 결과 요약(`MasterCodeCategoryChanges.Change`). */
export interface CategoryChange {
  cateId: string;
  cateName: string | null;
  kind: "NEW" | "CLOSED" | "CHANGED";
  beforeCount: number | null;
  afterCount: number | null;
  addedCodes: string[];
  removedCodes: string[];
  reduced: boolean;
}

export interface ViewResult {
  header: ConfirmHeader;
  version: ConfirmVersion;
  previous: PreviousReleased | null;
  firstVersion: boolean;
  diff?: DiffEntry[];
  categoryChanges?: CategoryChange[];
  unchangedCategories?: string[];
  serverNow?: string;
}

export type CheckStatus = "PASSED" | "WARNED" | "REJECTED" | "EXEMPT" | "DELEGATED" | "DEFERRED";

export interface CheckIssue {
  code: string;
  message: string;
  field: string | null;
  itemKey: string | null;
}

/** 검사 결과 표 한 행(`MasterCodeConfirmCheckItem` 10행 중 하나). */
export interface CheckRow {
  no: string;
  item: string;
  severity: string;
  status: CheckStatus;
  issues?: CheckIssue[];
}

export interface ValidateResult {
  rows?: CheckRow[];
  rejectedCount?: number;
  warnedCount?: number;
  applyFrom?: string;
  futureApplyFrom?: boolean;
  serverNow?: string;
}

export interface ConfirmResult extends Partial<ViewResult> {
  confirmed?: { ver: string; rowVersion: number };
  closedPreviousVer?: string | null;
  warnings?: CheckIssue[];
}
