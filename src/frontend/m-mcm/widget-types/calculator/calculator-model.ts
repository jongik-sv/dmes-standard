/**
 * 계산기 유형 순수 로직 — React 와 떨어진 상태 + 동작(reducer). 렌더러는 `calcReducer` 를 쓰고, 이 파일은 화면을 모른다.
 *
 * 식 전체를 들고 있다가 `=` 에서 계산한다(연산자 우선순위: × ÷ 가 + − 보다 먼저). 계산은 shared evalex 의 `D`(decimal.js 복제본)로 한다 —
 * 0.1 + 0.2 = 0.3. D 는 정밀도 68자리라 중간 계산은 거의 정확하고, 화면에 보일 때만 유효숫자 15자리로 반올림한다(HALF_UP).
 * 다음 계산에는 화면에 보이는 값(반올림한 값)을 쓴다 — 보이는 대로 계산한다.
 *
 * 상태 모양:
 * - tokens: 식에 이미 넣은 조각. [숫자, 연산자, 숫자, 연산자 …]. 입력 모드에서는 비었거나 연산자로 끝난다. 숫자는 쉼표 없는 평문.
 * - entry: 지금 입력 중이거나(또는 계산돼 나온) 숫자 문자열. 아직 없으면 "".
 * - fresh: entry 가 입력한 값이 아니라 계산된 값(%·±·기록에서 나온 값)이라 다음 숫자·소수점이 그 값을 대신한다는 표시.
 * - mode: input(입력 중) · result(= 로 나온 결과가 entry) · error(0으로 나눔).
 * - repeat: `=` 를 다시 눌렀을 때 되풀이할 마지막 연산.
 * - history: 최근 계산 기록(최신이 앞, 최대 10건). 화면 상태로만 들고 저장하지 않는다.
 */
import { D, type Dec } from "@dk-oasis/shared/evalex";

export type CalcOp = "+" | "−" | "×" | "÷";
export type CalcMode = "input" | "result" | "error";

export interface CalcHistoryItem {
  /** 목록 키(상태 안에서 증가하는 번호). */
  id: number;
  /** 식 글(쉼표 포함, `=` 없음). 예: "1,250 × 3". */
  expr: string;
  /** 결과(쉼표 없는 숫자 글, 지수 표기일 수 있다). */
  result: string;
}

export interface CalcState {
  mode: CalcMode;
  tokens: string[];
  entry: string;
  fresh: boolean;
  repeat: { op: CalcOp; operand: string } | null;
  /** result·error 일 때 윗줄에 보일 식(`=` 포함). */
  doneExpr: string;
  history: CalcHistoryItem[];
  nextId: number;
}

export type CalcAction =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "operator"; op: CalcOp }
  | { type: "equals" }
  | { type: "percent" }
  | { type: "negate" }
  | { type: "backspace" }
  | { type: "clear" }
  /** 기록의 결과를 현재 값으로 불러온다. */
  | { type: "recall"; value: string };

export const CALC_MAX_DIGITS = 16;
export const CALC_SIG_DIGITS = 15;
export const CALC_HISTORY_MAX = 10;
/** 기록 칸을 보이는 최소 본문 너비(px). */
export const CALC_HISTORY_MIN_WIDTH = 420;
/** 기록 칸 너비(px) — 스타일과 글자 크기 계산이 같은 값을 쓴다. */
export const CALC_HISTORY_WIDTH = 148;
export const CALC_GAP = 4;
export const CALC_DIV_ZERO_MESSAGE = "0으로 나눌 수 없습니다";

export const INITIAL_CALC_STATE: CalcState = {
  mode: "input",
  tokens: [],
  entry: "",
  fresh: false,
  repeat: null,
  doneExpr: "",
  history: [],
  nextId: 1,
};

// ───────────────────────── 설정 ─────────────────────────

export interface CalculatorConfig {
  showHistory: boolean;
}

export const CALCULATOR_DEFAULT_CONFIG: CalculatorConfig = { showHistory: true };

/** 정의 설정 읽기 — 객체가 아니거나 showHistory 가 불리언이 아니면 기본값. */
export function readCalculatorConfig(raw: unknown): CalculatorConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...CALCULATOR_DEFAULT_CONFIG };
  const v = (raw as Record<string, unknown>).showHistory;
  return { showHistory: typeof v === "boolean" ? v : CALCULATOR_DEFAULT_CONFIG.showHistory };
}

// ───────────────────────── 숫자 글 ─────────────────────────

const OPS: readonly string[] = ["+", "−", "×", "÷"];

function isOp(token: string): token is CalcOp {
  return OPS.includes(token);
}

/** 끝의 소수점을 뗀 글을 Decimal 로 읽는다("3." → 3). 지수 표기("1e+16")도 읽는다. */
function toDec(text: string): Dec {
  return new D(text.endsWith(".") ? text.slice(0, -1) : text);
}

/** 입력한 글을 식 조각으로 굳힌다 — 끝의 소수점·소수 끝 0·"-0" 을 정리한다. 지수 표기는 그대로 둔다. */
function normalizeNumber(text: string): string {
  const t = text.endsWith(".") ? text.slice(0, -1) : text;
  return /e/i.test(t) ? t : new D(t).toString();
}

/** 보일 때만 하이픈 `-` 를 빼기 연산자와 같은 `−`(U+2212)로 바꾼다 — 음수 부호가 연산자와 섞여 `5 − -5` 로 보이지 않게. 복사·계산 값은 `-` 그대로다. */
function displayMinus(text: string): string {
  return text.replace(/-/g, "−");
}

/**
 * 보일 글 — 정수부 천 단위 쉼표, 음수 부호는 `−`(displayMinus). 입력 중인 글("1250.", "0.50")은 모양을 그대로 두고,
 * 지수 표기("1e+16")는 쉼표를 넣지 않는다. 화면에 보이는 숫자는 모두 이 함수를 거친다(복사 값은 거치지 않는다).
 */
export function formatNumberText(raw: string): string {
  const m = /^(-?)(\d+)(\.\d*)?$/.exec(raw);
  if (!m) return displayMinus(raw);
  return displayMinus(`${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${m[3] ?? ""}`);
}

/**
 * 계산 결과를 보일 글로 — 유효숫자 15자리까지 반올림(HALF_UP)하고 끝의 0 을 지운다.
 * 반올림한 뒤 정수부가 16자리 이상(≥ 1e15)이거나 0 이 아닌 값이 0.000001 미만이면 지수 표기("1.2345e+16", "1e-7").
 */
export function formatResult(value: Dec): string {
  const r = value.toSignificantDigits(CALC_SIG_DIGITS, D.ROUND_HALF_UP);
  if (r.isZero()) return "0";
  const abs = r.abs();
  if (abs.gte("1e15") || abs.lt("1e-6")) return r.toExponential();
  return r.toString();
}

// ───────────────────────── 계산 ─────────────────────────

/** 식 조각([숫자, 연산자, 숫자 …], 숫자로 시작해 숫자로 끝남)을 우선순위대로 계산한다. 0으로 나누면 null. */
function evaluateTokens(tokens: readonly string[]): Dec | null {
  const terms: Dec[] = [];
  const signs: ("+" | "−")[] = [];
  let cur = toDec(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = toDec(tokens[i + 1]);
    if (op === "×") {
      cur = cur.times(n);
    } else if (op === "÷") {
      if (n.isZero()) return null;
      cur = cur.div(n);
    } else {
      terms.push(cur);
      signs.push(op === "−" ? "−" : "+");
      cur = n;
    }
  }
  terms.push(cur);
  let acc = terms[0];
  signs.forEach((s, i) => {
    acc = s === "+" ? acc.plus(terms[i + 1]) : acc.minus(terms[i + 1]);
  });
  return acc;
}

function applyOp(a: Dec, op: CalcOp, b: Dec): Dec | null {
  if (op === "÷" && b.isZero()) return null;
  switch (op) {
    case "+":
      return a.plus(b);
    case "−":
      return a.minus(b);
    case "×":
      return a.times(b);
    case "÷":
      return a.div(b);
  }
}

/** 식 조각을 윗줄에 보일 글로(쉼표 포함, 조각 사이 한 칸). */
function tokensText(tokens: readonly string[]): string {
  return tokens.map((t) => (isOp(t) ? t : formatNumberText(t))).join(" ");
}

// ───────────────────────── 보이는 값 ─────────────────────────

/** 아래 줄에 보일 값의 원문(쉼표 없음). 입력이 없으면 식의 앞 숫자, 그도 없으면 "0". */
export function displayValue(state: CalcState): string {
  if (state.entry !== "") return state.entry;
  if (state.tokens.length >= 2) return state.tokens[state.tokens.length - 2];
  return "0";
}

/** 아래 줄 글 — 정수부에 쉼표를 넣는다. 오류면 오류 문구. */
export function displayText(state: CalcState): string {
  if (state.mode === "error") return CALC_DIV_ZERO_MESSAGE;
  return formatNumberText(displayValue(state));
}

/** 윗줄 글 — 진행 중인 식(입력 중인 숫자까지, 연산자를 누르기 전에는 비어 있다). 결과·오류는 `1,250 × 3 =`. */
export function exprText(state: CalcState): string {
  if (state.mode !== "input") return state.doneExpr;
  if (state.tokens.length === 0) return "";
  return tokensText(state.entry !== "" ? [...state.tokens, state.entry] : state.tokens);
}

/** 복사할 값(쉼표 없는 숫자). 오류면 빈 글. */
export function copyValue(state: CalcState): string {
  if (state.mode === "error") return "";
  const v = displayValue(state);
  return v.endsWith(".") ? v.slice(0, -1) : v;
}

// ───────────────────────── 상태 바꾸기 ─────────────────────────

/** 기록은 두고 나머지를 처음 상태로. */
function cleared(state: CalcState): CalcState {
  return { ...INITIAL_CALC_STATE, history: state.history, nextId: state.nextId };
}

function errorState(state: CalcState, doneExpr: string): CalcState {
  return { ...cleared(state), mode: "error", doneExpr };
}

/** 숫자·소수점을 받을 바탕 — 결과·오류 뒤는 새 계산, 계산된 값(fresh)은 그 값만 버리고 식은 둔다. */
function startTyping(state: CalcState): CalcState {
  if (state.mode !== "input") return cleared(state);
  if (state.fresh) return { ...state, entry: "", fresh: false };
  return state;
}

function digitCount(entry: string): number {
  return entry.replace(/[-.]/g, "").length;
}

/** = 로 나온 결과를 상태에 싣는다. 기록에 남길 식이 있으면(숫자 하나만이 아니면) 최신 앞에 넣는다. */
function finish(
  state: CalcState,
  expr: string,
  result: string,
  repeat: CalcState["repeat"],
  record: boolean
): CalcState {
  const base = cleared(state);
  const history = record
    ? [{ id: state.nextId, expr, result }, ...state.history].slice(0, CALC_HISTORY_MAX)
    : state.history;
  return {
    ...base,
    mode: "result",
    entry: result,
    doneExpr: `${expr} =`,
    repeat,
    history,
    nextId: record ? state.nextId + 1 : state.nextId,
  };
}

function toggleSign(text: string): string {
  return text.startsWith("-") ? text.slice(1) : `-${text}`;
}

function equals(state: CalcState): CalcState {
  if (state.mode === "error") return state;

  // 결과 뒤 다시 = : 마지막 연산을 결과에 되풀이한다(5 + 3 = = → 11).
  if (state.mode === "result") {
    if (!state.repeat) return state;
    const { op, operand } = state.repeat;
    const expr = `${formatNumberText(state.entry)} ${op} ${formatNumberText(operand)}`;
    const r = applyOp(toDec(state.entry), op, toDec(operand));
    if (r === null) return errorState(state, `${expr} =`);
    return finish(state, expr, formatResult(r), state.repeat, true);
  }

  let tokens = state.tokens;
  if (state.entry !== "") tokens = [...tokens, normalizeNumber(state.entry)];
  else if (tokens.length >= 2) tokens = [...tokens, tokens[tokens.length - 2]]; // 5 + = → 5 + 5
  else tokens = ["0"];

  const expr = tokensText(tokens);
  if (tokens.length === 1) {
    // 숫자 하나 — 계산이 아니므로 기록에 남기지 않고 반복할 연산도 없다.
    return finish(state, expr, formatResult(toDec(tokens[0])), null, false);
  }
  const r = evaluateTokens(tokens);
  if (r === null) return errorState(state, `${expr} =`);
  const repeat = { op: tokens[tokens.length - 2] as CalcOp, operand: tokens[tokens.length - 1] };
  return finish(state, expr, formatResult(r), repeat, true);
}

function percent(state: CalcState): CalcState {
  if (state.mode === "error") return state;
  // 결과 뒤 % — 그 값을 100 으로 나눈 값을 입력 값으로 둔다(식·반복 연산은 버린다).
  if (state.mode === "result") {
    return { ...cleared(state), entry: formatResult(toDec(state.entry).div(100)), fresh: true };
  }
  // 식이 숫자 하나 — 그 값 / 100.
  if (state.tokens.length === 0) {
    const b = state.entry === "" ? new D(0) : toDec(state.entry);
    return { ...state, entry: formatResult(b.div(100)), fresh: true };
  }
  const op = state.tokens[state.tokens.length - 1];
  const b = toDec(state.entry !== "" ? state.entry : state.tokens[state.tokens.length - 2]);
  if (op === "+" || op === "−") {
    // a ± a×b/100 — a 는 이 연산자 앞까지의 식을 계산한 값.
    const a = evaluateTokens(state.tokens.slice(0, -1));
    if (a === null) return errorState(state, `${tokensText(state.tokens.slice(0, -1))} =`);
    return { ...state, entry: formatResult(a.times(b).div(100)), fresh: true };
  }
  return { ...state, entry: formatResult(b.div(100)), fresh: true };
}

function negate(state: CalcState): CalcState {
  if (state.mode === "error") return state;
  if (state.mode === "result") {
    if (/^-?0$/.test(state.entry)) return state;
    return { ...cleared(state), entry: toggleSign(state.entry), fresh: true };
  }
  const fromEntry = state.entry !== "";
  const src = fromEntry ? state.entry : state.tokens.length >= 2 ? state.tokens[state.tokens.length - 2] : "";
  if (src === "" || /^-?0$/.test(src)) return state; // 0 의 부호는 바꾸지 않는다
  return { ...state, entry: toggleSign(src), fresh: fromEntry ? state.fresh : true };
}

export function calcReducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case "digit": {
      const s = startTyping(state);
      if (digitCount(s.entry) >= CALC_MAX_DIGITS) return s;
      // 입력이 "0"·"-0" 이면 그 0 을 숫자로 바꾼다(선행 0 방지) — "-0" 뒤 7 → "-7", 0 → "-0" 그대로.
      const base = s.entry === "0" ? "" : s.entry === "-0" ? "-" : s.entry;
      return { ...s, entry: base + action.digit };
    }
    case "decimal": {
      const s = startTyping(state);
      if (s.entry.includes(".") || digitCount(s.entry) >= CALC_MAX_DIGITS) return s;
      return { ...s, entry: s.entry === "" ? "0." : `${s.entry}.` };
    }
    case "operator": {
      if (state.mode === "error") return state;
      // 결과 뒤 연산자 — 결과에 이어서 계산한다.
      if (state.mode === "result") return { ...cleared(state), tokens: [state.entry, action.op] };
      if (state.entry !== "") {
        return { ...state, tokens: [...state.tokens, normalizeNumber(state.entry), action.op], entry: "", fresh: false };
      }
      // 연산자를 연달아 누르면 마지막 연산자로 바꾼다.
      if (state.tokens.length > 0) return { ...state, tokens: [...state.tokens.slice(0, -1), action.op] };
      return { ...state, tokens: ["0", action.op] };
    }
    case "equals":
      return equals(state);
    case "percent":
      return percent(state);
    case "negate":
      return negate(state);
    case "backspace": {
      // 입력 중인 숫자만 지운다 — 결과·계산된 값·오류에서는 아무 일도 하지 않는다.
      if (state.mode !== "input" || state.fresh || state.entry === "") return state;
      const next = state.entry.slice(0, -1);
      return { ...state, entry: next === "-" ? "" : next };
    }
    case "clear":
      return cleared(state);
    case "recall": {
      // 식 도중(연산자 뒤)이면 입력 값만 바꾸고, 아니면 그 값으로 새로 시작한다.
      const base = state.mode === "input" && state.tokens.length > 0 ? state : cleared(state);
      return { ...base, entry: action.value, fresh: true };
    }
  }
}

// ───────────────────────── 단추·키보드 ─────────────────────────

export interface CalcKey {
  /** data-testid 꼬리(calc-key-{id}). */
  id: string;
  /** 단추에 보일 글자. */
  label: string;
  /** 스크린리더 이름. */
  aria: string;
  action: CalcAction;
  kind: "digit" | "op" | "fn" | "eq";
}

const digitKey = (d: string): CalcKey => ({ id: d, label: d, aria: d, action: { type: "digit", digit: d }, kind: "digit" });
const opKey = (id: string, op: CalcOp, aria: string): CalcKey => ({
  id,
  label: op,
  aria,
  action: { type: "operator", op },
  kind: "op",
});

/** 단추 5행 4열(왼쪽 위부터 가로로 읽는 순서). */
export const CALC_KEYS: readonly CalcKey[] = [
  { id: "clear", label: "C", aria: "모두 지우기", action: { type: "clear" }, kind: "fn" },
  { id: "back", label: "⌫", aria: "한 글자 지우기", action: { type: "backspace" }, kind: "fn" },
  { id: "pct", label: "%", aria: "퍼센트", action: { type: "percent" }, kind: "fn" },
  opKey("div", "÷", "나누기"),
  digitKey("7"),
  digitKey("8"),
  digitKey("9"),
  opKey("mul", "×", "곱하기"),
  digitKey("4"),
  digitKey("5"),
  digitKey("6"),
  opKey("sub", "−", "빼기"),
  digitKey("1"),
  digitKey("2"),
  digitKey("3"),
  opKey("add", "+", "더하기"),
  { id: "neg", label: "±", aria: "부호 바꾸기", action: { type: "negate" }, kind: "fn" },
  digitKey("0"),
  { id: "dot", label: ".", aria: "소수점", action: { type: "decimal" }, kind: "digit" },
  { id: "eq", label: "=", aria: "계산", action: { type: "equals" }, kind: "eq" },
];

export const CALC_KEY_COLS = 4;
export const CALC_KEY_ROWS = 5;

/** 계산기 영역의 aria-keyshortcuts — 숫자·연산자·계산·지우기·부호. `+` 는 구분자와 겹쳐 Plus 로 쓴다. */
export const CALC_KEY_SHORTCUTS = "0 1 2 3 4 5 6 7 8 9 Plus - * / % . = Enter Backspace Escape Delete F9";

/**
 * 키보드 키 → 동작. 처리하지 않을 키는 null(호출자가 preventDefault 하지 않는다).
 * 수정키(Ctrl·Meta·Alt)가 눌렸는지는 호출자가 먼저 거른다 — `*`·`+`·`%` 는 Shift 가 필요하므로 Shift 는 여기서 따지지 않는다.
 * F9 는 ±(Windows 계산기와 같은 키). `,` 는 숫자패드 소수점(code === "NumpadDecimal", 쉼표 로캘의 소수점 키)일 때만 소수점이다 —
 * 일반 `,` 는 천 단위 쉼표를 버릇대로 치는 것이라 무시한다.
 */
export function calcActionForKey(key: string, code?: string): CalcAction | null {
  if (key.length === 1 && key >= "0" && key <= "9") return { type: "digit", digit: key };
  switch (key) {
    case "+":
      return { type: "operator", op: "+" };
    case "-":
      return { type: "operator", op: "−" };
    case "*":
      return { type: "operator", op: "×" };
    case "/":
      return { type: "operator", op: "÷" };
    case "Enter":
    case "=":
      return { type: "equals" };
    case "Backspace":
      return { type: "backspace" };
    case "Escape":
    case "Delete":
      return { type: "clear" };
    case "%":
      return { type: "percent" };
    case ".":
      return { type: "decimal" };
    case ",":
      return code === "NumpadDecimal" ? { type: "decimal" } : null;
    case "F9":
      return { type: "negate" };
    default:
      return null;
  }
}

// ───────────────────────── 크기 ─────────────────────────

/** 기록 칸을 보일지 — 설정이 켜져 있고 본문 너비가 충분할 때만(너비를 모르면 0 이라 숨긴다). */
export function historyVisible(enabled: boolean, width: number): boolean {
  return enabled && width >= CALC_HISTORY_MIN_WIDTH;
}

export interface CalcFonts {
  /** 단추 글자 크기(px). */
  key: number;
  /** 표시창 큰 글씨 크기(px) — 글이 길면 줄어든다. */
  value: number;
}

/** 표시창 큰 글씨 크기의 하한(px). 그래도 넘치면 스타일이 앞쪽을 잘라 끝자리(최근 자릿수)를 보인다. */
export const CALC_VALUE_MIN_FONT = 10;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * 본문 크기에 맞춘 글자 크기. 본문 크기를 모르면(너비 0 이하·높이 null) null — 스타일의 기본 크기를 쓴다.
 * 단추 칸의 가로·세로 중 작은 쪽에 맞추고, 표시창 큰 글씨는 단추 글자의 약 1.7배에서 시작해 글이 칸 너비를 넘으면 줄인다(하한 CALC_VALUE_MIN_FONT).
 */
export function calcFonts(
  width: number,
  height: number | null,
  historyShown: boolean,
  valueText: string
): CalcFonts | null {
  if (!(width > 0) || height === null || !(height > 0)) return null;
  const mainWidth = historyShown ? width - CALC_HISTORY_WIDTH - 2 * CALC_GAP : width;
  const valueMax = 34;
  const displayHeight = 64;
  const cellH = (height - displayHeight - CALC_GAP) / CALC_KEY_ROWS - CALC_GAP;
  const cellW = (mainWidth - (CALC_KEY_COLS - 1) * CALC_GAP) / CALC_KEY_COLS;
  const key = clamp(Math.floor(Math.min(cellH * 0.45, cellW * 0.4)), 11, 24);
  const wanted = clamp(Math.round(key * 1.7), 18, valueMax);
  // 글자 폭은 대략 0.6em 으로 본다(숫자 + 쉼표). 표시창 좌우 여백 16px 를 뺀다.
  const fit = Math.floor((mainWidth - 16 - 28) / (Math.max(valueText.length, 1) * 0.6));
  return { key, value: clamp(Math.min(wanted, fit), CALC_VALUE_MIN_FONT, valueMax) };
}
