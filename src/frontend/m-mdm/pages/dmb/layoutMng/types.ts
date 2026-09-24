/** layoutMng 응답·초안 타입(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE 그대로). */
import type { ColumnInfo, LayoutItemRow, UnitRow } from "@/layout/types";

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
}

export interface SaveResult {
  layoutId?: number;
  ver?: number;
  totalLength?: number;
  headerLength?: number;
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
