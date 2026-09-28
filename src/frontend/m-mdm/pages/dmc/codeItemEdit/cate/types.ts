/**
 * 카테고리 탭이 부르는 codeCateEdit 서비스 요청·응답 타입(TSK-06-04 design.md §2). 버전은 늘 문자열이다(`"2.000"`).
 * 합친 저장이 거부되면 codeItemEdit `validate` 가 카테고리 이슈(`cateIssues`)를 이 `Issue` 모양으로 돌려준다(D-101).
 */
import type { MdmVersionStatus } from "@/shell";

export interface CodeHeader {
  maruCodeId: string;
  maruCodeName: string;
  sourceKind: "MDM" | "EXTERNAL";
  status: string;
  lvlCnt: number;
}

export interface VersionInfo {
  ver: string;
  display: string;
  status: MdmVersionStatus;
  verKind: string;
  ownerId: string | null;
  applyFrom: string | null;
  applyTo: string | null;
}

export interface SelectedVersion {
  ver: string;
  display: string;
  status: MdmVersionStatus;
  ownerId: string | null;
  rowVersion: number;
  editable: boolean;
  warning: "MULTIPLE_UNAPPLIED" | null;
}

export interface CategoryDef {
  cateId: string;
  cateName: string | null;
  defKind: "REGEX" | "TABLE";
  defExpr: string | null;
  defTarget: string | null;
  description: string | null;
}

export interface CodeItemInfo {
  code: string;
  name: string | null;
  seq: number | null;
  lvls: (string | null)[];
}

export interface CateItemInfo {
  cateId: string;
  code: string;
}

export interface ViewResult {
  header?: CodeHeader;
  versions?: VersionInfo[];
  selected?: SelectedVersion | null;
  categories?: CategoryDef[];
  items?: CodeItemInfo[];
  cateItems?: CateItemInfo[];
}

export interface Issue {
  code: string;
  message: string;
  field: string | null;
  itemKey: string | null;
}

export interface PreviewRow {
  code: string;
  name: string | null;
  seq: number | null;
  lvls: (string | null)[];
  hit: boolean;
  reason: "MATCH" | "NO_MATCH" | "TARGET_NULL" | "MEMBER" | "NOT_MEMBER";
  targetValue: string | null;
}

export interface PreviewResult {
  cateId?: string | null;
  ver?: string;
  defKind?: "REGEX" | "TABLE";
  defTarget?: string | null;
  defExpr?: string | null;
  hitCount?: number;
  total?: number;
  invalidExpression?: boolean;
  warnings?: Issue[];
  rows?: PreviewRow[];
}

export const DEF_TARGET_OPTIONS = [
  "CODE", "LVL1", "LVL2", "LVL3", "LVL4", "LVL5",
  "ATTR01", "ATTR02", "ATTR03", "ATTR04", "ATTR05", "ATTR06", "ATTR07", "ATTR08", "ATTR09", "ATTR10",
] as const;

/** 예약 카테고리 ID — 편집·닫기 대상이 아니다(불변 규칙 2, 서버 CategoryConventions.BASE_CATE_ID 와 짝). */
export const BASE_CATE_ID = "BASE";
