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
  /** 계산값(화면 즉시 재계산, 저장 값은 서버가 다시 계산). 앞 헤더 길이를 모르면(판정 시각에 확정 헤더 없음) null. */
  OFFSET?: number | null;
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
  /** 판정 시각 T 의 헤더 길이. 그 시각에 확정 헤더 버전이 없으면 null(HEADER_STATE = MISSING). */
  TOTAL_LENGTH: number | null;
  OFFSET?: number | null;
  /** 판정 시각 T 에 고른 헤더 버전(`"1.001"`). 헤더 추가 팝업에서 막 고른 행은 없다. */
  HEADER_VER?: string | null;
  /** CURRENT·FUTURE·PAST·DRAFT·MISSING(확정 헤더 없음)·LEGACY(이행 전 스냅샷). */
  HEADER_STATE?: string | null;
  items: LayoutItemRow[];
}

/** 레이아웃·헤더 버전 이력 한 행(D-144 3단계). 버전은 문자열 `"1.001"` 이다 — 숫자로 바꾸지 않는다. */
export interface LayoutVersionRow {
  VER: string;
  VER_KIND: "MAJOR" | "MINOR";
  STATUS: string;
  STATE: "DRAFT" | "CURRENT" | "FUTURE" | "PAST";
  BASE_VER?: string | null;
  OWNER_ID?: string | null;
  APPLY_FROM?: string | null;
  APPLY_TO?: string | null;
  ROW_VERSION: number;
  OWN_LENGTH: number;
  SWITCH_MODE?: string | null;
  CHANGE_KINDS?: string | null;
  CHANGE_SUMMARY?: string | null;
  LEGACY: "Y" | "N";
  REQUESTED_BY?: string | null;
  RELEASED_AT?: string | null;
}
