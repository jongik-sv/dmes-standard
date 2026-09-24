/** codeItemEdit 요청·응답 타입(TSK-06-03 design.md §6.6). 버전은 늘 문자열이다(`"2.000"`). */
import type { MdmVersionStatus } from "@/shell";
import type { ServerRow } from "./grid-state";

export interface CodeSummary {
  maruCodeId: string;
  maruCodeName: string;
  sourceKind: "MDM" | "EXTERNAL";
  status: string;
  lvlCnt: number;
}

export interface SearchResult {
  codes?: CodeSummary[];
}

export interface CodeHeader extends CodeSummary {
  attrLabels: { no: number; label: string }[];
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
  patchable: boolean;
  warning: "MULTIPLE_UNAPPLIED" | null;
}

export interface CategoryInfo {
  cateId: string;
  cateName: string | null;
  defKind: "REGEX" | "TABLE";
}

export interface ViewResult {
  header?: CodeHeader;
  versions?: VersionInfo[];
  selected?: SelectedVersion | null;
  rows?: ServerRow[];
  closed?: ServerRow[];
  closedCateItems?: { cateId: string; code: string }[];
  categories?: CategoryInfo[];
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
  cateId?: string;
  cateName?: string | null;
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

export interface PatchParams {
  maruCodeId: string;
  code: string;
  fromVer: string;
  name: string | null;
  alterName: string | null;
  seq: number | null;
  description: string | null;
}
