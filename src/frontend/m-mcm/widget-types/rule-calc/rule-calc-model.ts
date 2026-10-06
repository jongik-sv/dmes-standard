/**
 * 룰 계산기 위젯의 순수 모델 — 정의 설정 읽기·검사, 서버 응답(io·run) 정규화, 입력값 모으기, 값 표시.
 * 서버 계약은 docs/widget-2026-10/rule-calc-api.md(조정 README §1 초안) — 숫자는 소수 자리를 지키도록 문자열(BigDecimal)로 온다.
 * 응답은 unknown 으로 받아 모양을 맞춰 쓴다(키가 빠져도 화면이 깨지지 않게). React·네트워크에 의존하지 않는다.
 */

export type RuleCalcTargetTp = "RULE" | "SET";

/** 업무 화면 값 채우기 방식 — auto: 새 화면 문맥이 올 때마다 채움(계산은 사용자가 누른다), button: 단추를 눌렀을 때만 채움, off: 채우지 않음. */
export type RuleCalcFillMode = "auto" | "button" | "off";

export const FILL_MODE_LABELS: Readonly<Record<RuleCalcFillMode, string>> = {
  auto: "자동으로 채움",
  button: "단추를 눌러 채움",
  off: "채우지 않음",
};

export interface RuleCalcConfig {
  targetTp: RuleCalcTargetTp;
  targetId: string;
  /** 룰 세트의 단계별 중간값(앞 룰 결과)을 보일지. 기본 끔. */
  showSteps: boolean;
  /** 도크에서 업무 화면이 게시한 값(선택 행 등)을 입력 칸에 채우는 방식. 기본 auto. 보드에서는 화면 문맥이 없어 동작하지 않는다. */
  fillMode: RuleCalcFillMode;
}

export const RULE_CALC_DEFAULT_CONFIG: Readonly<RuleCalcConfig> = { targetTp: "RULE", targetId: "", showSteps: false, fillMode: "auto" };

export const TARGET_TP_LABELS: Readonly<Record<RuleCalcTargetTp, string>> = { RULE: "룰", SET: "룰 세트" };

export const NO_TARGET_MESSAGE = "룰 또는 룰 세트를 지정하세요";

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

function optStr(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}

function optInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** 정의 설정 읽기 — 모양이 틀린 값은 기본값으로 돌린다. targetTp 는 "SET" 일 때만 세트, 그 밖은 룰. */
export function readRuleCalcConfig(raw: unknown): RuleCalcConfig {
  const r = asRecord(raw);
  return {
    targetTp: r.targetTp === "SET" ? "SET" : "RULE",
    targetId: str(r.targetId).trim(),
    showSteps: r.showSteps === true,
    fillMode: r.fillMode === "button" || r.fillMode === "off" ? r.fillMode : "auto",
  };
}

/** 편집기 검사 — 비면 저장할 수 없다. */
export function validateRuleCalcConfig(cfg: RuleCalcConfig): string[] {
  return cfg.targetId ? [] : [NO_TARGET_MESSAGE];
}

// ───────────────────────── 서버 응답 ─────────────────────────

export interface RuleCalcTarget {
  tp: string;
  id: string;
  name: string;
  ver: string;
  /** 실제로 고른 버전의 상태(RELEASED·DRAFT). 위젯 실행은 늘 RELEASED, 편집기 미리보기만 DRAFT 일 수 있다. */
  verStatus: string;
  /** 룰·세트 헤더의 계산 상태(CREATED·INUSE·DEPRECATED 등). */
  status: string;
}

export interface RuleCalcInput {
  name: string;
  label: string;
  dataType: string;
  scale: number | null;
  unit: string | null;
  required: boolean;
}

export interface RuleCalcOutput {
  name: string;
  label: string;
  dataType: string;
  scale: number | null;
  unit: string | null;
}

export interface RuleCalcIoStep {
  ruleId: string;
  name: string;
  outputs: RuleCalcOutput[];
}

export interface RuleCalcIo {
  ok: boolean;
  target: RuleCalcTarget;
  inputs: RuleCalcInput[];
  outputs: RuleCalcOutput[];
  /** 세트일 때만, 실행 순서대로. */
  steps: RuleCalcIoStep[];
  /** 확정 버전 없음·룰 없음·폐기 경고 등. NO_RELEASED·NOT_FOUND 가 있으면 입력 칸 없이 문구만 보인다. */
  messages: RuleCalcMessage[];
}

/** 값 한 칸 — 보통 글자(숫자는 소수 자리를 지키는 글자), 결과가 목록(COLLECT LIST)이면 원소마다 글자인 배열. */
export type RuleCalcValue = string | string[];

export interface RuleCalcRunStep {
  ruleId: string;
  inputs: Record<string, RuleCalcValue>;
  outputs: Record<string, RuleCalcValue>;
  /** 일반 행이 적중했는지. */
  hit: boolean;
  /** 적중이 없어 기본 행을 썼는지. */
  defaultApplied: boolean;
}

export interface RuleCalcMessage {
  code: string;
  text: string;
}

export interface RuleCalcRun {
  ok: boolean;
  result: Record<string, RuleCalcValue>;
  steps: RuleCalcRunStep[];
  messages: RuleCalcMessage[];
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function scalarText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** 목록이면 원소마다 글자(표시할 때 원소마다 scale 을 적용한다 — A0 §4), 아니면 글자 하나. */
function valueOf(v: unknown): RuleCalcValue {
  return Array.isArray(v) ? v.map(scalarText) : scalarText(v);
}

function valueMap(v: unknown): Record<string, RuleCalcValue> {
  const out: Record<string, RuleCalcValue> = {};
  for (const [k, val] of Object.entries(asRecord(v))) out[k] = valueOf(val);
  return out;
}

function toOutput(raw: unknown): RuleCalcOutput | null {
  const r = asRecord(raw);
  const name = str(r.name).trim();
  if (!name) return null;
  return { name, label: optStr(r.label) ?? name, dataType: str(r.dataType), scale: optInt(r.scale), unit: optStr(r.unit) };
}

function toInput(raw: unknown): RuleCalcInput | null {
  const r = asRecord(raw);
  const name = str(r.name).trim();
  if (!name) return null;
  return {
    name,
    label: optStr(r.label) ?? name,
    dataType: str(r.dataType),
    scale: optInt(r.scale),
    unit: optStr(r.unit),
    required: r.required === true,
  };
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x !== null);
}

/** io 응답(봉투 해제 뒤) → RuleCalcIo. 입력·출력 이름이 없는 항목은 버린다. */
export function normalizeIo(raw: unknown): RuleCalcIo {
  const r = asRecord(raw);
  const t = asRecord(r.target);
  return {
    ok: r.ok === true,
    target: {
      tp: str(t.tp),
      id: str(t.id),
      name: str(t.name),
      ver: str(t.ver),
      verStatus: str(t.verStatus),
      status: str(t.status),
    },
    inputs: compact(list(r.inputs).map(toInput)),
    outputs: compact(list(r.outputs).map(toOutput)),
    steps: list(r.steps).map((s) => {
      const sr = asRecord(s);
      return { ruleId: str(sr.ruleId), name: str(sr.name), outputs: compact(list(sr.outputs).map(toOutput)) };
    }),
    messages: normalizeMessages(r.messages),
  };
}

function normalizeMessages(raw: unknown): RuleCalcMessage[] {
  return list(raw).map((m) => {
    const mr = asRecord(m);
    return { code: str(mr.code), text: str(mr.text) };
  });
}

/** run 응답(봉투 해제 뒤) → RuleCalcRun. 값은 모두 글자로 맞춘다(소수 자리 보존). */
export function normalizeRun(raw: unknown): RuleCalcRun {
  const r = asRecord(raw);
  return {
    ok: r.ok === true,
    result: valueMap(r.result),
    steps: list(r.steps).map((s) => {
      const sr = asRecord(s);
      return {
        ruleId: str(sr.ruleId),
        inputs: valueMap(sr.inputs),
        outputs: valueMap(sr.outputs),
        hit: sr.hit !== false,
        defaultApplied: sr.defaultApplied === true,
      };
    }),
    messages: normalizeMessages(r.messages),
  };
}

// ───────────────────────── 입력값 ─────────────────────────

const NUMERIC_TYPE = /^(NUMBER|NUMERIC|DECIMAL|INT|INTEGER|LONG|SHORT|DOUBLE|FLOAT|NUM)/i;

/** 숫자 계열 데이터 타입인지 — 숫자 입력 칸(소수 키패드)·천 단위 표시에 쓴다. */
export function isNumericType(dataType: string): boolean {
  return NUMERIC_TYPE.test(dataType.trim());
}

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** 숫자 칸 입력값이 숫자 모양인지(빈 값은 true — 필수 검사는 따로). 쉼표는 허용하지 않는다. */
export function isValidNumberText(text: string): boolean {
  const t = text.trim();
  return t === "" || NUMBER_TEXT.test(t);
}

export interface RuleCalcValues {
  /** 서버로 보낼 값(빈 칸은 뺀다). */
  values: Record<string, string>;
  /** 칸 이름 → 오류 문구(필수 누락·숫자 모양 오류). */
  errors: Record<string, string>;
}

/** 입력 초안 → 보낼 값과 칸별 오류. 값은 앞뒤 공백을 지운 글자 그대로 보낸다(서버가 BigDecimal 로 읽는다). */
export function collectValues(inputs: readonly RuleCalcInput[], draft: Readonly<Record<string, string>>): RuleCalcValues {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const input of inputs) {
    const text = (draft[input.name] ?? "").trim();
    if (text === "") {
      if (input.required) errors[input.name] = "필수 입력입니다";
      continue;
    }
    if (isNumericType(input.dataType)) {
      if (!isValidNumberText(text)) {
        errors[input.name] = "숫자를 입력하세요";
        continue;
      }
      // 서버는 입력을 반올림하지 않는다 — 허용 소수 자릿수(scale)를 넘기면 보내기 전에 알린다.
      const frac = (text.split(".")[1] ?? "").replace(/0+$/, "");
      if (input.scale != null && frac.length > input.scale) {
        errors[input.name] = input.scale === 0 ? "정수만 입력할 수 있습니다" : `소수 ${input.scale}자리까지 입력할 수 있습니다`;
        continue;
      }
    }
    values[input.name] = text;
  }
  return { values, errors };
}

// ───────────────────────── 값 표시 ─────────────────────────

/** 정수부에 천 단위 쉼표를 넣는다. 부호는 앞에 둔다. */
function groupInt(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 결과 값 표시 — 숫자 모양이고 소수 자리(scale)가 있으면 그 자리로 맞춰 천 단위 쉼표를 넣는다.
 * 부족한 자리는 0 으로 채우고, 넘치는 자리는 반올림(half-up)한다. 글자 연산이라 큰 수·긴 소수도 값이 변하지 않는다.
 * 숫자 모양이 아니거나 scale 이 없으면 서버가 준 글자를 그대로 보인다(scale 이 없는 숫자는 쉼표만 더한다).
 */
export function formatResultValue(text: string, scale: number | null, dataType = ""): string {
  const t = text.trim();
  if (t === "" || !NUMBER_TEXT.test(t)) return text;
  if (dataType && !isNumericType(dataType)) return text;
  const neg = t.startsWith("-");
  const body = t.replace(/^[+-]/, "");
  const [intRaw, fracRaw = ""] = body.split(".");
  let int = intRaw === "" ? "0" : intRaw.replace(/^0+(?=\d)/, "");
  let frac = fracRaw;
  if (scale != null) {
    if (frac.length > scale) {
      const roundUp = frac.charCodeAt(scale) - 48 >= 5;
      frac = frac.slice(0, scale);
      if (roundUp) {
        const digits = (int + frac).split("");
        let i = digits.length - 1;
        while (i >= 0) {
          if (digits[i] === "9") {
            digits[i] = "0";
            i -= 1;
          } else {
            digits[i] = String(Number(digits[i]) + 1);
            break;
          }
        }
        const joined = (i < 0 ? "1" : "") + digits.join("");
        int = joined.slice(0, joined.length - scale) || "0";
        frac = scale > 0 ? joined.slice(joined.length - scale) : "";
      }
    } else {
      frac = frac.padEnd(scale, "0");
    }
  }
  const zero = /^0*$/.test(int) && /^0*$/.test(frac);
  return `${neg && !zero ? "-" : ""}${groupInt(int)}${frac ? `.${frac}` : ""}`;
}

/** 값 한 칸 표시 — 목록이면 원소마다 같은 규칙을 적용해 쉼표로 잇는다. dataType 을 모르면(빈 글자) 서버 글자를 그대로 보인다. */
export function displayValue(value: RuleCalcValue, scale: number | null, dataType: string): string {
  const one = (t: string) => (dataType ? formatResultValue(t, scale, dataType) : t);
  return Array.isArray(value) ? value.map(one).join(", ") : one(value);
}

/** 안내 문구 — 서버가 text 를 주면 그것을, 없으면 코드별 기본 문구를 쓴다. */
export const MESSAGE_DEFAULTS: Readonly<Record<string, string>> = {
  NOT_FOUND: "룰 또는 룰 세트를 찾을 수 없습니다",
  NO_RELEASED: "확정 버전 없음: 확정된 버전이 없어 계산할 수 없습니다",
  RULE_DEPRECATED: "폐기된 룰이 포함되어 있습니다",
  INPUT_MISSING: "필수 입력이 비어 있습니다",
  INPUT_INVALID: "입력값의 형식이 맞지 않습니다",
  EVAL_ERROR: "계산 중 오류가 발생했습니다",
};

/** error=계산을 못 한 사유(ok=false), warn=계산은 되지만 주의, info=그 밖의 참고. */
export type MessageTone = "error" | "warn" | "info";

const ERROR_CODES: readonly string[] = ["NOT_FOUND", "NO_RELEASED", "INPUT_MISSING", "INPUT_INVALID", "EVAL_ERROR"];

export function messageTone(code: string): MessageTone {
  if (ERROR_CODES.includes(code)) return "error";
  return code === "RULE_DEPRECATED" ? "warn" : "info";
}

/** 이 안내가 있으면 입력 칸을 만들 수 없다(대상이 없거나 확정 버전이 없음). */
export function blocksInput(messages: readonly RuleCalcMessage[]): boolean {
  return messages.some((m) => m.code === "NOT_FOUND" || m.code === "NO_RELEASED");
}

export function messageText(m: RuleCalcMessage): string {
  return m.text.trim() || MESSAGE_DEFAULTS[m.code] || m.code || "알 수 없는 안내입니다";
}

/** 세트 단계 표시에 쓰는 출력 칸 라벨 찾기 — io 의 단계 정의에서, 없으면 이름 그대로. */
export function stepOutputLabel(io: RuleCalcIo | null, ruleId: string, name: string): string {
  const step = io?.steps.find((s) => s.ruleId === ruleId);
  return step?.outputs.find((o) => o.name === name)?.label ?? name;
}

export function stepOutputScale(io: RuleCalcIo | null, ruleId: string, name: string): number | null {
  const step = io?.steps.find((s) => s.ruleId === ruleId);
  return step?.outputs.find((o) => o.name === name)?.scale ?? null;
}

export function stepOutputDataType(io: RuleCalcIo | null, ruleId: string, name: string): string {
  const step = io?.steps.find((s) => s.ruleId === ruleId);
  return step?.outputs.find((o) => o.name === name)?.dataType ?? "";
}

// ───────────────────────── 화면 문맥 채우기 ─────────────────────────

/** 화면 문맥 값 한 칸 — shared screen-context 의 ScreenContextValue 와 같은 모양(런타임 import 를 피해 여기서 다시 적는다). */
export type ContextValue = string | number | null;

/**
 * 입력 칸 이름으로 화면 문맥 값을 찾아 채울 글자를 만든다. 찾는 방법(이름 정규화 비교)은 호출자가 find 로 넘긴다
 * (shared 의 findScreenContextValue). 없거나 비어 있는 값은 건너뛴다 — 비어 있는 값으로 사용자가 넣은 칸을 지우지 않는다.
 */
export function contextFill(
  inputs: readonly RuleCalcInput[],
  values: Record<string, ContextValue> | null | undefined,
  find: (values: Record<string, ContextValue>, key: string) => ContextValue | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values) return out;
  for (const input of inputs) {
    const v = find(values, input.name);
    if (v == null) continue;
    const text = String(v).trim();
    if (text !== "") out[input.name] = text;
  }
  return out;
}

/** 채울 값 묶음의 지문 — 같은 값이 다시 게시돼도 같은 지문이라 사용자가 고친 칸을 다시 덮어쓰지 않는다. */
export function fillSignature(fill: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.keys(fill).sort().map((k) => [k, fill[k]]));
}
