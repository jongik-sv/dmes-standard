/** layoutMng 응답·초안 타입(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE 그대로). */
import type { ColumnInfo, LayoutItemRow, UnitRow } from "@/layout/types";
import type { LayoutSnapshot } from "@/layout/snapshot-export";

export interface LayoutRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  EAI_CODE?: string | null;
  SND_SYSTEM?: string | null;
  RCV_SYSTEM?: string | null;
  HEADER_SUMMARY?: string;
  ITEM_COUNT: number;
  TOTAL_LENGTH: number;
  LAYOUT_VERSION: number;
  VER: number;
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
}

export interface ViewHeader {
  SEQ: number;
  HEADER_LAYOUT_ID: number;
  HEADER_NAME: string;
  EAI_CODE?: string | null;
  TOTAL_LENGTH: number;
  OFFSET: number;
  items: LayoutItemRow[];
}

export interface ViewResult {
  layout?: {
    LAYOUT_ID: number; LAYOUT_NAME: string; EAI_CODE?: string | null; SND_SYSTEM?: string | null; RCV_SYSTEM?: string | null;
    TOTAL_LENGTH: number; HEADER_LENGTH: number; LAYOUT_VERSION: number; VER: number;
  };
  headers?: ViewHeader[];
  items?: LayoutItemRow[];
  units?: UnitRow[];
  versions?: VersionRow[];
}

export interface SaveResult {
  layoutId?: number;
  ver?: number;
  totalLength?: number;
  headerLength?: number;
  layoutVersion?: number;
  versionCreated?: boolean;
  switchMode?: string | null;
  changeSummary?: string | null;
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

export interface VersionRow {
  LAYOUT_VERSION: number;
  SAVED_AT?: string | null;
  SAVED_BY?: string | null;
  TOTAL_LENGTH: number;
  SWITCH_MODE?: string | null;
  CHANGE_KINDS?: string | null;
  CHANGE_SUMMARY?: string | null;
}

export interface ExportResult {
  layoutId?: number;
  layoutVersion?: number;
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
  LAYOUT_KIND?: string | null;
  SEQ?: number | null;
  ITEM?: string | null;
  SND_RCV?: string | null;
  USED_BY_COUNT?: number | null;
  IMPACT: string;
}

export interface LayoutDraft {
  layoutId: number | null;
  ver: number | null;
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
