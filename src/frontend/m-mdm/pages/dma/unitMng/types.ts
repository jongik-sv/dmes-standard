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
  AREA: "면적",
  VOLUME: "부피",
  DENSITY: "밀도",
  SPECIFIC_GRAVITY: "비중",
  AREAL_DENSITY: "면적당 질량",
  RATIO: "비율",
  TEMPERATURE: "온도",
  PRESSURE: "압력",
  SPEED: "속도",
  ROTATION_SPEED: "회전 속도",
  MASS_FLOW: "질량 유량",
  FREQUENCY: "주파수",
  POWER: "전력",
  ENERGY: "에너지",
  CURRENT: "전류",
  VOLTAGE: "전압",
  ANGLE: "각도",
  ACIDITY: "산도",
  GLOSS: "광택도",
  CURRENCY: "통화",
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

/** 서버 compare 요청 한 건(A-PREVIEW 환산 계산기). value 는 parseCalcValue 로 정리한 문자열 그대로 보낸다. */
export interface ConvertRequest {
  value: string;
  fromUnitCode: string;
  toUnitCode: string;
}

/** 환산 계산기 입력 단위 콤보·결과 표용 단위 선택지(서버 search 응답의 unitOptions). */
export interface UnitOption {
  unitCode: string;
  dimension: string;
}

export interface ComboItem {
  value: string;
  label: string;
}

/** 입력 단위 콤보 — 전체 단위. */
export function fromUnitComboData(units: UnitOption[]): ComboItem[] {
  return units.map((u) => ({ value: u.unitCode, label: `${u.unitCode} (${dimensionLabel(u.dimension)})` }));
}

/** 결과 표 단위 — 입력 단위와 같은 차원만(다른 차원 간 환산은 서버가 거부한다). 입력 단위가 없으면 빈 목록. */
export function sameDimensionUnits(units: UnitOption[], fromUnitCode: string): UnitOption[] {
  const from = units.find((u) => u.unitCode === fromUnitCode);
  return from ? units.filter((u) => u.dimension === from.dimension) : [];
}

export type CalcValue = { kind: "empty" } | { kind: "invalid" } | { kind: "ok"; value: string };

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** 환산할 값 — 공백·천 단위 쉼표를 걷고 십진수만 받는다(지수 표기 X). 계산은 하지 않는다(I2). */
export function parseCalcValue(raw: string): CalcValue {
  const value = raw.replace(/[\s,]/g, "");
  if (!value) return { kind: "empty" };
  return DECIMAL.test(value) ? { kind: "ok", value } : { kind: "invalid" };
}

/** 서버 환산값 표시 — 천 단위 쉼표, 유효숫자 15자리(소수 자리를 고정 길이로 자르지 않는다). 표시 형식만 바꾼다(I2). */
export function formatConvertedValue(value: number): string {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 15 });
}
