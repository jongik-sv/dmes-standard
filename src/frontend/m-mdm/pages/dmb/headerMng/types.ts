/** headerMng 응답·초안 타입(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE 그대로). */
import type { ColumnInfo, LayoutItemRow, LayoutVersionRow, UnitRow } from "@/layout/types";

export interface HeaderRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  EAI_CODE?: string | null;
  ENCODING?: string | null;
  ITEM_COUNT: number;
  TOTAL_LENGTH: number;
  USED_BY_COUNT: number;
  HEADER_VER?: string | null;
  HEADER_STATE?: string;
  AUD_VER: number;
}

export interface EaiRow {
  EAI_CODE: string;
  EAI_NAME: string;
  ENCODING: string;
  PAD_RULE?: string | null;
  HEADER_LAYOUT_ID?: number | null;
}

export interface UsedByRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  SND_SYSTEM?: string | null;
  RCV_SYSTEM?: string | null;
  HEADER_SEQ: number;
  /** 그 전문의 쌓인 헤더 하나라도 지금 확정 버전이 없으면 null. */
  TOTAL_LENGTH: number | null;
  VER: string;
  STATE: string;
}

export interface SearchResult {
  headers?: HeaderRow[];
  eais?: EaiRow[];
  columns?: ColumnInfo[];
}

export interface ViewResult {
  header?: {
    LAYOUT_ID: number; LAYOUT_NAME: string; EAI_CODE?: string | null; EAI_NAME?: string | null; ENCODING?: string | null;
    PAD_RULE?: string | null; TOTAL_LENGTH: number; AUD_VER?: number;
  };
  items?: LayoutItemRow[];
  usedBy?: UsedByRow[];
  units?: UnitRow[];
  selected?: LayoutVersionRow | null;
  versions?: LayoutVersionRow[];
  editable?: boolean;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  nextMajor?: string | null;
  nextMinor?: string | null;
}

export interface SaveResult {
  layoutId: number;
  ver: string;
  rowVersion: number;
  ownLength: number;
  totalLength: number;
}

export interface HeaderDraft {
  layoutId: number | null;
  ver: string | null;
  rowVersion: number | null;
  layoutName: string;
  eaiCode: string | null;
  eaiName: string | null;
  encoding: string | null;
  padRule: string | null;
}
