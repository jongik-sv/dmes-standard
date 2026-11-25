/**
 * 주문정합성 조건 문장 — 셀 조건을 「품명코드가 1·A·B 중 하나이고 주문조도코드가 입력이 없으면」 처럼 읽는 글로 바꾼다(시제품 condPhrase 와 같은 말).
 * 조건이 3개 이하면 연결 어미(…이고 / …이면)로 한 문장, 4개 이상이면 연결 어미 없는 낱 문장(목록)이다.
 * 값에는 사전 라벨을 덧붙이고(추정이면 표시), NOT_IN 7개 이상은 앞 3개만 보이고 나머지는 접는다. React 에 기대지 않는다.
 */
import type { Cond } from "../shared/cond";
import type { ValueLabel } from "./model";

/** 받침에 따른 조사 — a: 받침 없음(가·는), b: 받침 있음(이·은). 영문·숫자는 읽는 소리로. */
export function josa(word: string, a: string, b: string): string {
  const w = word.trim();
  if (!w) return a;
  const ch = w.charCodeAt(w.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 > 0 ? b : a;
  const c = w[w.length - 1].toLowerCase();
  if ("013678".includes(c)) return b; // 영·일·삼·육·칠·팔
  if ("lmnr".includes(c)) return b; // 엘·엠·엔·알
  return a;
}

export interface ValueView {
  value: string;
  /** 사전 라벨(없으면 undefined — 라벨을 지어내지 않는다). */
  label?: string;
  certainty?: string;
}

export interface CondPhrase {
  field: string;
  /** 항목 라벨. */
  label: string;
  /** 주어 조사(가·이). */
  subject: string;
  /** 값 목록(IN·NOT_IN·EQ·NE·비교). BETWEEN·NULL 은 빈 목록. */
  values: ValueView[];
  /** 이 개수 뒤 값은 접는다(NOT_IN 7개 이상이면 3). 접지 않으면 null. */
  foldAfter: number | null;
  /** 값 앞 글(BETWEEN 범위 글 등). */
  head: string;
  /** 값 뒤 글(「 중 하나이고」, 「입력이 없으면」 등). */
  tail: string;
  /** 원 연산자 표지(=, ≠, IN, IS_NULL …). */
  opBadge: string;
  /** 추정 라벨을 담았는가. */
  estimated: boolean;
}

const COMPARE_WORD: Record<string, string> = {
  GT: "초과",
  GE: "이상",
  LT: "미만",
  LE: "이하",
};

export function opBadgeOf(cond: Cond): string {
  switch (cond.op) {
    case "EQ":
      return "=";
    case "NE":
      return "≠";
    case "GT":
      return ">";
    case "GE":
      return "≥";
    case "LT":
      return "<";
    case "LE":
      return "≤";
    case "BETWEEN":
      return `${cond.lowInclusive ? "≤" : "<"}x${cond.highInclusive ? "≤" : "<"}`;
    case "UNKNOWN":
      return cond.summary;
    default:
      return cond.op;
  }
}

/** BETWEEN 범위 글 — 「0.8 이상 ~ 0.999 이하」. */
export function rangeText(cond: Cond): string {
  return `${cond.low ?? ""} ${cond.lowInclusive ? "이상" : "초과"} ~ ${cond.high ?? ""} ${cond.highInclusive ? "이하" : "미만"}`;
}

/**
 * 조건 구절. conn = 연결 어미를 쓰는가(조건 3개 이하), isLast = 마지막 조건인가(…이면 / …이고).
 */
export function condPhrase(
  field: string,
  label: string,
  cond: Cond,
  conn: boolean,
  isLast: boolean,
  labels: ReadonlyMap<string, ValueLabel>,
): CondPhrase {
  const tail = conn ? (isLast ? "이면" : "이고") : "";
  let estimated = false;
  const values: ValueView[] = cond.values.map((value) => {
    const vl = labels.get(`${field}:${value}`);
    if (vl?.label && vl.certainty !== "확정") estimated = true;
    return vl?.label
      ? { value, label: vl.label, certainty: vl.certainty }
      : { value };
  });
  const base = {
    field,
    label,
    subject: josa(label, "가", "이"),
    values: [] as ValueView[],
    foldAfter: null as number | null,
    head: "",
    tail: "",
    opBadge: opBadgeOf(cond),
    estimated: false,
  };
  switch (cond.op) {
    case "IS_NULL":
      return {
        ...base,
        tail: conn ? (isLast ? "입력이 없으면" : "입력이 없고") : "입력 없음",
      };
    case "NOT_NULL":
      return {
        ...base,
        tail: conn ? (isLast ? "입력이 있으면" : "입력이 있고") : "입력 있음",
      };
    case "IN":
      return { ...base, values, estimated, tail: ` 중 하나${tail}` };
    case "NOT_IN":
      return {
        ...base,
        values,
        estimated,
        foldAfter: values.length >= 7 ? 3 : null,
        tail: ` 외의 값${tail}`,
      };
    case "EQ":
      return { ...base, values, estimated, tail: conn ? tail : "임" };
    case "NE": {
      const j = josa(cond.values[0] ?? "", "가", "이");
      return {
        ...base,
        values,
        estimated,
        tail: `${j}${conn ? (isLast ? " 아니면" : " 아니고") : " 아님"}`,
      };
    }
    case "GT":
    case "GE":
    case "LT":
    case "LE":
      return {
        ...base,
        values,
        estimated,
        tail: ` ${COMPARE_WORD[cond.op]}${tail}`,
      };
    case "BETWEEN":
      return { ...base, head: rangeText(cond), tail };
    default:
      return { ...base, head: cond.summary };
  }
}

/** 값 글 — 「G(GI)」 처럼 라벨을 괄호로. folded 면 접힌 값은 「외 n개」. */
export function valuesText(p: CondPhrase, folded = false): string {
  const list =
    folded && p.foldAfter !== null ? p.values.slice(0, p.foldAfter) : p.values;
  const text = list
    .map((v) => (v.label ? `${v.value}(${v.label})` : v.value))
    .join("·");
  return folded && p.foldAfter !== null && p.values.length > p.foldAfter
    ? `${text} 외 ${p.values.length - p.foldAfter}개`
    : text;
}

/** 구절 전체 글(시험·툴팁용). */
export function phraseText(p: CondPhrase, folded = false): string {
  return `${p.label}${p.subject} ${p.head}${valuesText(p, folded)}${p.tail}`;
}

/** 룰 조건 전체 — sentence 는 3개 이하면 연결 어미(한 문장), list 는 늘 낱 문장(목록 줄). */
export function rulePhrases(
  conds: readonly { field: string; cond: Cond }[],
  labelOf: (field: string) => string,
  labels: ReadonlyMap<string, ValueLabel>,
  mode: "sentence" | "list" = "sentence",
): CondPhrase[] {
  const conn = mode === "sentence" && conds.length <= 3;
  return conds.map((c, i) =>
    condPhrase(
      c.field,
      labelOf(c.field),
      c.cond,
      conn,
      i === conds.length - 1,
      labels,
    ),
  );
}
