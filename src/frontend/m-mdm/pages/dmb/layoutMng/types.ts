/** layoutMng 응답·초안 타입(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE 그대로). */
import type { ColumnInfo, LayoutItemRow, LayoutVersionRow, UnitRow } from "@/layout/types";
import type { LayoutSnapshot } from "@/layout/snapshot-export";

export interface LayoutRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  EAI_CODE?: string | null;
  SND_SYSTEM?: string | null;
  RCV_SYSTEM?: string | null;
  HEADER_SUMMARY?: string;
  ITEM_COUNT: number;
  /** 쌓인 헤더 하나라도 지금 확정 버전이 없으면 null(길이를 모른다). */
  TOTAL_LENGTH: number | null;
  CURRENT_VER?: string | null;
  DRAFT_VER?: string | null;
  DRAFT_OWNER?: string | null;
  STATUS: string;
  AUD_VER: number;
}

export interface SystemRow {
  SYSTEM_CODE: string;
  SYSTEM_NAME: string;
}

export interface EaiRow {
  EAI_CODE: string;
  EAI_NAME: string;
  ENCODING: string;
  PAD_RULE?: string | null;
  HEADER_LAYOUT_ID?: number | null;
}

export interface HeaderOption {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  TOTAL_LENGTH: number;
  EAI_CODE?: string | null;
  items?: LayoutItemRow[];
}

export interface SearchFilters {
  keyword: string;
  headerLayoutId: string;
  sndSystem: string;
  rcvSystem: string;
}

export interface SearchResult {
  layouts?: LayoutRow[];
  systems?: SystemRow[];
  eais?: EaiRow[];
  headers?: HeaderOption[];
  columns?: ColumnInfo[];
  impacts?: ImpactRow[];
  /** limit 을 보냈을 때만 온다 — 조건에 맞는 전체 건수. */
  totalCount?: number;
  /** limit 을 보냈을 때만 온다 — 상한으로 잘렸는지. */
  truncated?: boolean;
}

export interface ViewHeader {
  SEQ: number;
  HEADER_LAYOUT_ID: number;
  HEADER_NAME: string;
  EAI_CODE?: string | null;
  /** 판정 시각 T 에 이 헤더의 확정 버전이 없으면 null — 그 뒤 헤더 OFFSET 도 null. */
  TOTAL_LENGTH: number | null;
  OFFSET: number | null;
  /** 판정 시각 T 에 고른 헤더 버전(`"1.001"`). MISSING 이면 null. */
  HEADER_VER?: string | null;
  /** CURRENT·FUTURE·PAST·DRAFT·MISSING(확정 헤더 없음)·LEGACY(이행 전 스냅샷). */
  HEADER_STATE?: string | null;
  items: LayoutItemRow[];
}

export interface ViewResult {
  layout?: {
    LAYOUT_ID: number; LAYOUT_NAME: string; EAI_CODE?: string | null; SND_SYSTEM?: string | null; RCV_SYSTEM?: string | null;
    /** 쌓인 헤더 하나라도 판정 시각에 확정 버전이 없으면 둘 다 null. */
    TOTAL_LENGTH: number | null; HEADER_LENGTH: number | null; AUD_VER?: number;
  };
  headers?: ViewHeader[];
  items?: LayoutItemRow[];
  units?: UnitRow[];
  /** 고른 버전 행(없으면 이력이 비었다). */
  selected?: LayoutVersionRow | null;
  versions?: LayoutVersionRow[];
  editable?: boolean;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  nextMajor?: string | null;
  nextMinor?: string | null;
  asOf?: string | null;
}

export interface SaveResult {
  layoutId: number;
  ver: string;
  rowVersion: number;
  ownLength: number;
  headerLength: number;
  totalLength: number;
  asOf: string;
}

// ── TSK-05-03 design.md §6.1 ──

export interface CheckRow {
  NO: number;
  CONDITION: string;
  CODE: string;
  RESULT: "PASS" | "FAIL" | "WARN";
  MESSAGES: string[];
}

export interface IssueRow {
  CODE: string;
  SEQ?: number | null;
  FIELD?: string | null;
  MESSAGE: string;
}

export interface CheckResult {
  checks?: CheckRow[];
  otherIssues?: IssueRow[];
  passed?: boolean;
}

export interface SampleSegment {
  INDEX: number;
  ZONE: "HEADER" | "BODY";
  HEADER_SEQ: number;
  ZONE_LABEL?: string | null;
  SEQ: number;
  NAME?: string | null;
  COLUMN_PHYS?: string | null;
  FILL_KIND: string;
  OFFSET: number;
  LENGTH: number;
  POSITION: string;
  TEXT: string;
}

export interface SampleResult {
  encoding?: string;
  totalBytes?: number;
  line?: string;
  segments?: SampleSegment[];
  parsed?: Array<{ COLUMN_PHYS: string; NAME?: string | null; VALUE?: string | null }>;
  errors?: Array<{ SEQ?: number | null; COLUMN_PHYS?: string | null; MESSAGE: string }>;
  issues?: IssueRow[];
}

export interface ExportResult {
  layoutId: number;
  ver: string;
  asOf: string;
  fileBase?: string;
  snapshot?: LayoutSnapshot;
  names?: Record<string, string>;
}

export interface ImpactRow {
  COLUMN_PHYS: string;
  COLUMN_NAME?: string | null;
  DOMAIN_NAME?: string | null;
  LAYOUT_ID?: number | null;
  LAYOUT_NAME?: string | null;
  VER?: string | null;
  VER_STATE?: string | null;
  LAYOUT_KIND?: string | null;
  SEQ?: number | null;
  ITEM?: string | null;
  SND_RCV?: string | null;
  USED_BY_COUNT?: number | null;
  IMPACT: string;
}

export interface LayoutDraft {
  layoutId: number | null;
  ver: string | null;
  rowVersion: number | null;
  asOf: string | null;
  layoutName: string;
  eaiCode: string | null;
  sndSystem: string | null;
  rcvSystem: string | null;
}

export interface ConstRow {
  HEADER_LAYOUT_ID: number;
  HEADER_SEQ: number;
  CONST_VALUE: string;
}
