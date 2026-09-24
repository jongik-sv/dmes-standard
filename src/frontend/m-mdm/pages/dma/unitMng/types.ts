/**
 * unitMng(단위 마스터) 화면 타입.
 *
 * 정본: docs/mdm/screens/unitMng/unitMng_기능설계서.md §3~§4.
 * DB 컬럼은 SNAKE_CASE 대문자가 아니라 서버 DTO 의 camelCase 필드 그대로 받는다(unitMng 서버 DTO 는
 * camelCase 필드를 쓴다 — noticeMgmt 의 SNAKE_CASE 그리드 관례와 다르다, TSK-04-02 design.md §2).
 */

/** LV-001 차원 라벨맵(design.md I21, D11) — DB 값(ASCII 코드)과 별개로 한글만 표시한다. */
export const DIMENSION_LABELS: Record<string, string> = {
  MASS: "질량",
  LENGTH: "길이",
  TIME: "시간",
  COUNT: "개수",
};

/** 맵에 없는 코드는 코드 문자열 그대로 보여준다(I21). */
export function dimensionLabel(code: string): string {
  return DIMENSION_LABELS[code] ?? code;
}

export interface UnitRow {
  unitCode: string;
  dimension: string;
  baseUnit: string;
  factor: number;
  /** 클라이언트 전용 파생 컬럼(G-005) — 서버 컬럼이 아니다. */
  isBaseUnit?: boolean;
}

export interface DimensionOption {
  dimension: string;
  baseUnit: string;
}

export interface UnitMngFilters {
  unitCode: string;
  dimension: string;
}

export function emptyFilters(): UnitMngFilters {
  return { unitCode: "", dimension: "" };
}

/** 상세 폼(A-DETAIL) 값. factor 는 TextBox 입력이라 문자열로 들고 있다가 저장 시 그대로 보낸다. */
export interface UnitForm {
  unitCode: string;
  dimension: string;
  baseUnit: string;
  factor: string;
}

export function emptyUnitForm(): UnitForm {
  return { unitCode: "", dimension: "", baseUnit: "", factor: "" };
}

export interface ConvertPreviewForm {
  value: string;
  fromUnitCode: string;
  toUnitCode: string;
}

export function emptyConvertPreviewForm(): ConvertPreviewForm {
  return { value: "", fromUnitCode: "", toUnitCode: "" };
}
