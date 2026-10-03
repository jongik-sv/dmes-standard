/**
 * 단위 계산기 환산 표·계산 — React 와 떨어진 순수 모듈.
 * 계수는 문자열(분수 "400/121" 허용)로 적고 `@dk-oasis/shared/evalex` 의 `D`(decimal.js 복제본, 68자리)로 계산한다.
 * `D` 는 MDM 식 평가기가 같이 쓰는 모듈 단일 객체이므로 `D.set`·`D.config` 로 설정을 바꾸지 않는다(반올림은 호출마다 지정한다).
 *
 * 모든 단위는 분류 기준 단위에 대한 (값 − 오프셋) × 분자 / 분모 로 정의한다. 곧
 *   기준값 = (단위값 − offset) × n / d,  단위값 = 기준값 × d / n + offset
 * 길이·무게 같은 선형 단위는 offset 이 0 이고, 온도(기준 °C)만 offset 이 있다(°F: offset 32, 계수 5/9, K: offset 273.15).
 * 환산은 `(v − offFrom) · nFrom · dTo / (dFrom · nTo) + offTo` 로 나눗셈을 한 번만 해 오차를 줄인다.
 */
import { D, type Dec } from "@dk-oasis/shared/evalex";

export type CategoryId =
  | "length"
  | "mass"
  | "area"
  | "volume"
  | "temperature"
  | "pressure"
  | "force"
  | "speed"
  | "energy";

export interface UnitDef {
  /** 안전한 영문 id(소문자·숫자). 표시 이름은 label. */
  id: string;
  label: string;
  /** 기준 단위 1 에 대한 이 단위 1 의 크기(기준 단위 환산 계수) — 십진 문자열 또는 "분자/분모". */
  factor: string;
  /** 기준값 0 에 해당하는 이 단위의 값(온도 °F 32, K 273.15). 없으면 "0". */
  offset?: string;
}

export interface CategoryDef {
  id: CategoryId;
  label: string;
  /** 기준 단위 id(factor 1, offset 0 인 단위). */
  baseUnit: string;
  units: readonly UnitDef[];
  /** 처음 열 때 「변환 전」·「변환 후」 단위. */
  defaultFrom: string;
  defaultTo: string;
}

/** 분류 표 — 이 순서가 화면·설정 편집기의 분류 순서다. */
export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "length",
    label: "길이",
    baseUnit: "m",
    defaultFrom: "mm",
    defaultTo: "in",
    units: [
      { id: "mm", label: "mm", factor: "0.001" },
      { id: "cm", label: "cm", factor: "0.01" },
      { id: "m", label: "m", factor: "1" },
      { id: "km", label: "km", factor: "1000" },
      { id: "in", label: "in", factor: "0.0254" },
      { id: "ft", label: "ft", factor: "0.3048" },
      { id: "yd", label: "yd", factor: "0.9144" },
      { id: "mi", label: "mi", factor: "1609.344" },
    ],
  },
  {
    id: "mass",
    label: "무게",
    baseUnit: "kg",
    defaultFrom: "kg",
    defaultTo: "lb",
    units: [
      { id: "mg", label: "mg", factor: "0.000001" },
      { id: "g", label: "g", factor: "0.001" },
      { id: "kg", label: "kg", factor: "1" },
      { id: "t", label: "t", factor: "1000" },
      { id: "lb", label: "lb", factor: "0.45359237" },
      { id: "oz", label: "oz", factor: "0.028349523125" },
    ],
  },
  {
    id: "area",
    label: "면적",
    baseUnit: "m2",
    defaultFrom: "m2",
    defaultTo: "pyeong",
    units: [
      { id: "mm2", label: "mm²", factor: "0.000001" },
      { id: "cm2", label: "cm²", factor: "0.0001" },
      { id: "m2", label: "m²", factor: "1" },
      { id: "km2", label: "km²", factor: "1000000" },
      { id: "ha", label: "ha", factor: "10000" },
      { id: "pyeong", label: "평", factor: "400/121" },
      { id: "ft2", label: "ft²", factor: "0.09290304" },
      { id: "in2", label: "in²", factor: "0.00064516" },
    ],
  },
  {
    id: "volume",
    label: "부피",
    baseUnit: "m3",
    defaultFrom: "l",
    defaultTo: "gal",
    units: [
      { id: "ml", label: "mL", factor: "0.000001" },
      { id: "l", label: "L", factor: "0.001" },
      { id: "m3", label: "m³", factor: "1" },
      { id: "cm3", label: "cm³", factor: "0.000001" },
      { id: "gal", label: "gal(US)", factor: "0.003785411784" },
      { id: "ft3", label: "ft³", factor: "0.028316846592" },
    ],
  },
  {
    id: "temperature",
    label: "온도",
    baseUnit: "celsius",
    defaultFrom: "celsius",
    defaultTo: "fahrenheit",
    units: [
      { id: "celsius", label: "°C", factor: "1" },
      { id: "fahrenheit", label: "°F", factor: "5/9", offset: "32" },
      { id: "kelvin", label: "K", factor: "1", offset: "273.15" },
    ],
  },
  {
    id: "pressure",
    label: "압력",
    baseUnit: "pa",
    defaultFrom: "mpa",
    defaultTo: "kgfcm2",
    units: [
      { id: "pa", label: "Pa", factor: "1" },
      { id: "kpa", label: "kPa", factor: "1000" },
      { id: "mpa", label: "MPa", factor: "1000000" },
      { id: "bar", label: "bar", factor: "100000" },
      { id: "atm", label: "atm", factor: "101325" },
      { id: "psi", label: "psi", factor: "6894.757293168361" },
      { id: "kgfcm2", label: "kgf/cm²", factor: "98066.5" },
      { id: "kgfmm2", label: "kgf/mm²", factor: "9806650" },
      { id: "mmhg", label: "mmHg", factor: "133.322387415" },
    ],
  },
  {
    id: "force",
    label: "힘",
    baseUnit: "n",
    defaultFrom: "kn",
    defaultTo: "kgf",
    units: [
      { id: "n", label: "N", factor: "1" },
      { id: "kn", label: "kN", factor: "1000" },
      { id: "kgf", label: "kgf", factor: "9.80665" },
      { id: "tf", label: "tf", factor: "9806.65" },
      { id: "lbf", label: "lbf", factor: "4.4482216152605" },
    ],
  },
  {
    id: "speed",
    label: "속도",
    baseUnit: "mps",
    defaultFrom: "kmh",
    defaultTo: "mps",
    units: [
      { id: "mps", label: "m/s", factor: "1" },
      { id: "mmin", label: "m/min", factor: "1/60" },
      { id: "kmh", label: "km/h", factor: "1/3.6" },
      { id: "mph", label: "mph", factor: "0.44704" },
      { id: "knot", label: "knot", factor: "1852/3600" },
    ],
  },
  {
    id: "energy",
    label: "에너지",
    baseUnit: "j",
    defaultFrom: "kwh",
    defaultTo: "kcal",
    units: [
      { id: "j", label: "J", factor: "1" },
      { id: "kj", label: "kJ", factor: "1000" },
      { id: "kwh", label: "kWh", factor: "3600000" },
      { id: "cal", label: "cal", factor: "4.184" },
      { id: "kcal", label: "kcal", factor: "4184" },
    ],
  },
];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

const CATEGORY_BY_ID = new Map<string, CategoryDef>(CATEGORIES.map((c) => [c.id, c]));

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === "string" && CATEGORY_BY_ID.has(v);
}

export function getCategory(id: CategoryId): CategoryDef {
  return CATEGORY_BY_ID.get(id)!;
}

export function findUnit(category: CategoryId, unitId: unknown): UnitDef | undefined {
  return typeof unitId === "string" ? getCategory(category).units.find((u) => u.id === unitId) : undefined;
}

/* ------------------------------------------------------------------ 계산 */

interface Compiled {
  n: Dec;
  d: Dec;
  off: Dec;
}

const COMPILED = new WeakMap<UnitDef, Compiled>();

/** "400/121" → 분자 400·분모 121, "0.0254" → 분자 0.0254·분모 1. */
function compile(unit: UnitDef): Compiled {
  let c = COMPILED.get(unit);
  if (!c) {
    const [num, den] = unit.factor.split("/");
    c = { n: new D(num), d: new D(den ?? "1"), off: new D(unit.offset ?? "0") };
    COMPILED.set(unit, c);
  }
  return c;
}

function convertBetween(value: Dec, from: UnitDef, to: UnitDef): Dec {
  const f = compile(from);
  const t = compile(to);
  return value.minus(f.off).times(f.n).times(t.d).div(f.d.times(t.n)).plus(t.off);
}

/** value(fromId 단위) → toId 단위. 모르는 단위면 예외(화면은 늘 표에 있는 id 만 넘긴다). */
export function convert(value: Dec, category: CategoryId, fromId: string, toId: string): Dec {
  const from = findUnit(category, fromId);
  const to = findUnit(category, toId);
  if (!from || !to) throw new Error(`알 수 없는 단위입니다: ${category} ${fromId} → ${toId}`);
  return convertBetween(value, from, to);
}

export interface ConvertedUnit {
  unit: UnitDef;
  value: Dec;
}

/** value(fromId 단위)를 분류의 모든 단위로 환산한다(표 순서). */
export function convertAll(value: Dec, category: CategoryId, fromId: string): ConvertedUnit[] {
  const from = findUnit(category, fromId);
  if (!from) throw new Error(`알 수 없는 단위입니다: ${category} ${fromId}`);
  return getCategory(category).units.map((unit) => ({ unit, value: convertBetween(value, from, unit) }));
}

/** 온도가 절대영도(0 K) 아래인가. 온도 분류가 아니면 false. */
export function isBelowAbsoluteZero(value: Dec, category: CategoryId, unitId: string): boolean {
  if (category !== "temperature") return false;
  return convert(value, category, unitId, "kelvin").lt(0);
}
