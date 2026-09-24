/**
 * 03 인터페이스 레이아웃 화면 공용 타입(TSK-05-02 design.md §2·§6.1). 행 키는 서버 응답 그대로 UPPER_SNAKE 다.
 * `KEY` 는 화면 전용의 안정된 행 식별자(드래그·선택용)이며 서버로 보내지 않는다.
 */
export type FillKind = "DATA" | "CONST" | "AUTO" | "FILLER";

export type ItemField = "COLUMN_PHYS" | "DEFAULT_VALUE" | "FILLER_LENGTH" | "TRANS_UNIT" | "UNIT_ITEM" | "NUM_FORMAT";

export interface LayoutItemRow {
  KEY?: string;
  SEQ: number;
  FILL_KIND: FillKind;
  COLUMN_PHYS?: string | null;
  TRANS_UNIT?: string | null;
  UNIT_ITEM?: string | null;
  NUM_FORMAT?: string | null;
  DEFAULT_VALUE?: string | null;
  FILLER_LENGTH?: number | null;
  /** 파생 표시 칸(서버 view·컬럼 사전) */
  DISPLAY_NAME?: string | null;
  DOMAIN_NAME?: string | null;
  DATA_TYPE?: string | null;
  DOMAIN_LENGTH?: number | null;
  SCALE?: number | null;
  UNIT_CODE?: string | null;
  /** 계산값(화면 즉시 재계산, 저장 값은 서버가 다시 계산) */
  OFFSET?: number;
  LENGTH?: number;
  /** layoutMng 헤더 항목 전용 */
  OVERRIDE_VALUE?: string | null;
  EFFECTIVE_VALUE?: string | null;
}

export interface ColumnInfo {
  PHYS_NAME: string;
  COLUMN_NAME: string;
  LABEL_LONG?: string | null;
  DISPLAY_NAME: string;
  DOMAIN_ID: number;
  DOMAIN_NAME?: string | null;
  DATA_TYPE?: string | null;
  LENGTH?: number | null;
  SCALE?: number | null;
  UNIT_CODE?: string | null;
}

export interface UnitRow {
  UNIT_CODE: string;
  DIMENSION: string;
  BASE_UNIT: string;
}

export interface NumFormat {
  sign: boolean;
  zeroPad: boolean;
  impliedScale: number;
  width: number;
}

export interface HeaderStackRow {
  KEY?: string;
  SEQ: number;
  HEADER_LAYOUT_ID: number;
  HEADER_NAME: string;
  EAI_CODE?: string | null;
  TOTAL_LENGTH: number;
  OFFSET?: number;
  items: LayoutItemRow[];
}
