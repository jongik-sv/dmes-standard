/**
 * 결과 열 표시 설정(RuleDisplay) — 화면마다 결과 변수를 어떻게 보일지 정한다. 없으면 키트는 지금처럼 모든 결과를 같은 모양으로 보인다.
 *
 * Maru 행 메모는 search 가 돌려주지 않으므로, 데이터 담당은 화면에 필요한 값(프로토타입 룰 ID·우선순위·레거시 순번·원본주의 등)을
 * 결과 열에 두었다(scripts/mqc-demo/mdm/README.md §데이터 결정). 이 설정은 그런 보조 결과를
 * 「룰 ID」 열·앞 열·배지로 옮기고, 업무 결과(폭수축량·보정치 등)를 앞에 굵게 보인다. React 에 기대지 않는 순수 함수다.
 *
 *   const DISPLAY: RuleDisplay = {
 *     keyVar: "RULE_KEY", leadVars: ["PRIO", "LEGACY_NO"], primaryVars: ["WID_SHRINK_QTY"],
 *     hiddenVars: ["SRC_NOTE"], blankValues: ["-"],
 *     format: { WID_SHRINK_QTY: signedNumber },
 *     badges: (r) => (r.SRC_NOTE ? [{ label: "원본주의", tone: "danger", title: r.SRC_NOTE }] : []),
 *   };
 *   <RuleStandardScreen screenId="lineWidthShrinkage" display={DISPLAY} />
 */
import {
  CATALOG,
  orderedVarNames,
  varLabel,
  varUnit,
  type Catalog,
} from "./meta";
import { NA_TEXT, valueWithUnit } from "./text";
import type { JudgeResult, RuleRow, RuleView } from "./types";

/** 행 배지 하나. tone 은 의미 색이다(muted 는 흐림). */
export interface RuleBadge {
  label: string;
  tone: "primary" | "success" | "warning" | "danger" | "muted";
  /** 마우스를 올리면 보일 설명(원문 메모 등). */
  title?: string;
}

/** 결과 값(빈 값 처리 뒤). 빈 값은 키가 없거나 null 이다. */
export type DisplayResults = Readonly<Record<string, string | null>>;

/** 간편판정 추가 타일 계산 입력. */
export interface JudgeTileArgs {
  ruleId: string;
  rule: RuleView | undefined;
  result: JudgeResult;
  /** 판정에 보낸 입력(변수명 → 글). */
  input: Readonly<Record<string, string>>;
}

/** 간편판정 추가 타일 — 입력과 결과로 계산한 값(Set 두께, 출측 폭 등). */
export interface JudgeTile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  /** 타일 아래 작은 글(계산식 등). */
  target?: string;
  /** 경고 표시(계산할 수 없음 등)와 그 문구. */
  warn?: boolean;
  warnLabel?: string;
}

export interface RuleDisplay {
  /** 행 키(프로토타입 룰 ID) 결과 변수. 목록 「룰 ID」 열, 판정 「적용 룰」 타일, 이력 「룰 ID」 열로 보인다. */
  keyVar?: string;
  /** Maru 행 순번 열의 머리. 기본 「순번」. 레거시 순번을 따로 보일 때 「평가 순서」 처럼 바꾼다. */
  seqLabel?: string;
  /** 룰 ID 뒤 앞 열로 올릴 결과 변수(우선순위·레거시 순번 등). 머리는 catalog 라벨. */
  leadVars?: string[];
  /** 업무 결과 변수. 결과 열 맨 앞에 굵게, 판정 결과 타일은 이것만. 룰에 없는 이름은 건너뛴다. */
  primaryVars?: string[];
  /** 목록 열·판정 타일·결과 문장에서 뺄 결과 변수(행 상세에는 보인다). */
  hiddenVars?: string[];
  /** 빈 결과로 볼 값. Maru 는 결과 칸을 비울 수 없어 빈 문자 결과를 "-" 로 저장했다. 화면에는 「—」. */
  blankValues?: string[];
  /** 결과 값 표시 — 변수명 → 글. value 는 비어 있지 않은 원문, results 는 그 행의 결과 전체(빈 값 처리 뒤). */
  format?: Record<string, (value: string, results: DisplayResults) => string>;
  /** 행 배지 — 결과 값(빈 값 처리 뒤)과 그 룰 정의로. 목록 「표시」 열·행 상세·판정 적중 행에 보인다. */
  badges?: (results: DisplayResults, rule: RuleView | undefined) => RuleBadge[];
  /** 간편판정 추가 타일. */
  judgeTiles?: (args: JudgeTileArgs) => JudgeTile[];
  /** 목록 열 너비 — 결과·앞 열 변수명 → px. 긴 글(메시지)이나 형식으로 길어지는 열에 준다. */
  columnWidths?: Record<string, number>;
}

/** 빈 값인가 — null·undefined·빈 글, 그리고 display.blankValues. */
export function isBlankValue(
  value: unknown,
  display: RuleDisplay | undefined,
): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  return s === "" || (display?.blankValues ?? []).includes(s);
}

/** 결과 맵의 빈 값을 null 로 바꾼다(배지·형식 함수가 「-」 를 따로 보지 않게). */
export function cleanResults(
  results: Readonly<Record<string, unknown>>,
  display: RuleDisplay | undefined,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(results))
    out[k] = isBlankValue(v, display) ? null : String(v).trim();
  return out;
}

/** 결과 값 한 칸의 글 — 빈 값은 「—」, 형식 함수가 있으면 그 글. */
export function formatResult(
  display: RuleDisplay | undefined,
  name: string,
  value: unknown,
  results: Readonly<Record<string, unknown>> = {},
): string {
  if (isBlankValue(value, display)) return NA_TEXT;
  const raw = String(value).trim();
  const fn = display?.format?.[name];
  return fn ? fn(raw, cleanResults(results, display)) : raw;
}

/** 결과 값 + 단위. 빈 값이면 단위 없이 「—」. */
export function formatResultWithUnit(
  display: RuleDisplay | undefined,
  name: string,
  value: unknown,
  unit: string | undefined,
  results: Readonly<Record<string, unknown>> = {},
): string {
  const text = formatResult(display, name, value, results);
  return text === NA_TEXT ? NA_TEXT : valueWithUnit(text, unit);
}

/** 열·문장에서 뺄 결과 변수 — 숨김 + 룰 ID + 앞 열. */
function offResultNames(display: RuleDisplay | undefined): Set<string> {
  return new Set([
    ...(display?.hiddenVars ?? []),
    ...(display?.keyVar ? [display.keyVar] : []),
    ...(display?.leadVars ?? []),
  ]);
}

/**
 * 보일 결과 변수 순서 — 업무 결과(primaryVars 순서) 먼저, 그다음 나머지(넘겨받은 순서). 숨김·룰 ID·앞 열은 뺀다.
 * display 가 없으면 그대로.
 */
export function visibleResultNames(
  names: readonly string[],
  display: RuleDisplay | undefined,
): string[] {
  if (!display) return [...names];
  const off = offResultNames(display);
  const primary = (display.primaryVars ?? []).filter(
    (n) => names.includes(n) && !off.has(n),
  );
  return [
    ...primary,
    ...names.filter((n) => !off.has(n) && !primary.includes(n)),
  ];
}

/** 업무 결과 변수인가. primaryVars 가 없으면 아무것도 아니다. */
export function isPrimaryVar(
  display: RuleDisplay | undefined,
  name: string,
): boolean {
  return (display?.primaryVars ?? []).includes(name);
}

/** 판정 결과 타일로 보일 변수 — primaryVars 가 있으면 그중 룰에 있는 것, 없으면 보일 결과 전부. */
export function tileResultNames(
  names: readonly string[],
  display: RuleDisplay | undefined,
): string[] {
  const visible = visibleResultNames(names, display);
  const primary = visible.filter((n) => isPrimaryVar(display, n));
  return primary.length > 0 ? primary : visible;
}

/** 앞 열 변수 중 룰에 있는 것. */
export function leadVarNames(
  names: readonly string[],
  display: RuleDisplay | undefined,
): string[] {
  return (display?.leadVars ?? []).filter((n) => names.includes(n));
}

/** 행 결과 문장(표시 설정 적용) — 「폭감소량 +2 mm」 들을 「 · 」 로. 보일 결과가 없으면 「—」. */
export function displayResultText(
  rule: Pick<RuleView, "ruleId" | "vars">,
  row: Pick<RuleRow, "results">,
  display: RuleDisplay | undefined,
  catalog: Catalog = CATALOG,
): string {
  const ordered = orderedVarNames(rule, rule.ruleId, "RESULT", catalog);
  const names = visibleResultNames(
    ordered.length > 0 ? ordered : Object.keys(row.results),
    display,
  );
  if (names.length === 0) return NA_TEXT;
  return names
    .map(
      (n) =>
        `${varLabel(rule.ruleId, n, catalog)} ${formatResultWithUnit(display, n, row.results[n], varUnit(rule.ruleId, n, catalog), row.results)}`,
    )
    .join(" · ");
}

/** 행 키(룰 ID) 글. keyVar 가 없거나 비면 null. */
export function rowKeyOf(
  display: RuleDisplay | undefined,
  results: Readonly<Record<string, unknown>>,
): string | null {
  if (!display?.keyVar) return null;
  const v = results[display.keyVar];
  return isBlankValue(v, display) ? null : String(v).trim();
}

/** 행 배지 — display.badges 를 빈 값 처리한 결과로 부른다. */
export function rowBadges(
  display: RuleDisplay | undefined,
  results: Readonly<Record<string, unknown>>,
  rule: RuleView | undefined,
): RuleBadge[] {
  return display?.badges?.(cleanResults(results, display), rule) ?? [];
}

/** 앞 열 값 문장 — 「우선순위 1 · 순번 3」. 없으면 빈 글. */
export function leadText(
  ruleId: string,
  display: RuleDisplay | undefined,
  results: Readonly<Record<string, unknown>>,
  catalog: Catalog = CATALOG,
): string {
  return (display?.leadVars ?? [])
    .filter((n) => n in results)
    .map(
      (n) =>
        `${varLabel(ruleId, n, catalog)} ${formatResult(display, n, results[n], results)}`,
    )
    .join(" · ");
}

// ── 자주 쓰는 형식 ─────────────────────────────────────────

/** 부동소수 찌꺼기를 지운다(0.45 − 0.04 가 0.41000000000000003 이 되지 않게). */
export const tidyNumber = (n: number): number => Math.round(n * 1e6) / 1e6;

/** 부호 붙은 수 — 양수 「+2」, 음수 「−0.04」(빼기 기호), 0 은 「0」. 숫자가 아니면 원문. */
export function signedNumber(value: string): string {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) return value;
  if (n === 0) return "0";
  return n > 0 ? `+${tidyNumber(n)}` : `−${tidyNumber(-n)}`;
}

/** 수 하나 — 숫자가 아니거나 비면 null. */
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
