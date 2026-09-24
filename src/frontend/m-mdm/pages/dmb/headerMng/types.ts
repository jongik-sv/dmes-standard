/** headerMng 응답·초안 타입(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE 그대로). */
import type { ColumnInfo, LayoutItemRow, UnitRow } from "@/layout/types";

export interface HeaderRow {
  LAYOUT_ID: number;
  LAYOUT_NAME: string;
  EAI_CODE?: string | null;
  ENCODING?: string | null;
  ITEM_COUNT: number;
  TOTAL_LENGTH: number;
  USED_BY_COUNT: number;
  VER: number;
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
  TOTAL_LENGTH: number;
}

export interface SearchResult {
  headers?: HeaderRow[];
  eais?: EaiRow[];
  columns?: ColumnInfo[];
}

export interface ViewResult {
  header?: {
    LAYOUT_ID: number; LAYOUT_NAME: string; EAI_CODE?: string | null; EAI_NAME?: string | null; ENCODING?: string | null;
    PAD_RULE?: string | null; TOTAL_LENGTH: number; VER: number;
  };
  items?: LayoutItemRow[];
  usedBy?: UsedByRow[];
  units?: UnitRow[];
}

export interface SaveResult {
  layoutId?: number;
  ver?: number;
  totalLength?: number;
  recalculated?: Array<{ LAYOUT_ID: number; LAYOUT_NAME: string; TOTAL_LENGTH_BEFORE: number; TOTAL_LENGTH_AFTER: number }>;
  droppedOverrides?: number;
}

export interface HeaderDraft {
  layoutId: number | null;
  ver: number | null;
  layoutName: string;
  eaiCode: string | null;
  eaiName: string | null;
  encoding: string | null;
  padRule: string | null;
}
