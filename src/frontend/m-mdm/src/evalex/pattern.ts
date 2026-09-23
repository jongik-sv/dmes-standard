/**
 * `=` 패턴(STRING 변수의 EQ 값) — 06 「EvalEx 생성 규칙」, TSK-03-03 design §6.11 과 같은 토큰화(design §6.5).
 * 서버 생성기(Java)와 이 모듈이 같은 규칙을 따로 구현하고, 정합성 코퍼스가 둘을 묶는다.
 */
export const ANY_SEQ = Symbol("ANY_SEQ");
export const ANY_ONE = Symbol("ANY_ONE");
export type PatternToken = string | typeof ANY_SEQ | typeof ANY_ONE;

/** 접은 뒤 `%` 개수 상한(03-03 `MAX_PATTERN_WILDCARDS`). */
export const MAX_PATTERN_WILDCARDS = 3;

export type PatternShape =
  | { kind: "exact"; lit: string }
  | { kind: "prefix"; lit: string }
  | { kind: "suffix"; lit: string }
  | { kind: "infix"; lit: string }
  | { kind: "regex"; tokens: PatternToken[] };

/** 저장 시 검사가 막는 패턴(홀로 선 `\`, `%` 만, 접은 뒤 `%` 가 3 개 초과). */
export class PatternRejected extends Error {}

/**
 * 토큰화: `\%`·`\_`·`\\` 는 글자, 그 밖의 `\x` 와 끝의 `\` 는 거부. 인접 글자는 하나로 합치고 연속 `%` 는 하나로 접는다.
 */
export function tokenize(p: string): PatternToken[] {
  const out: PatternToken[] = [];
  let lit = "";
  const flush = () => {
    if (lit) out.push(lit);
    lit = "";
  };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      const n = p[i + 1];
      if (n !== "%" && n !== "_" && n !== "\\") throw new PatternRejected(`홀로 선 \\ 는 쓸 수 없다: ${p}`);
      lit += n;
      i++;
    } else if (c === "%") {
      flush();
      if (out[out.length - 1] !== ANY_SEQ) out.push(ANY_SEQ);
    } else if (c === "_") {
      flush();
      out.push(ANY_ONE);
    } else {
      lit += c;
    }
  }
  flush();
  return out;
}

/** 모양 판정. 거부 대상이면 {@link PatternRejected}. */
export function classify(p: string): PatternShape {
  const t = tokenize(p);
  if (t.length === 1 && t[0] === ANY_SEQ) throw new PatternRejected(`% 만 있는 패턴은 쓸 수 없다: ${p}`);
  if (t.filter((x) => x === ANY_SEQ).length > MAX_PATTERN_WILDCARDS) {
    throw new PatternRejected(`% 가 ${MAX_PATTERN_WILDCARDS} 개를 넘는다: ${p}`);
  }
  const isLit = (x: PatternToken | undefined): x is string => typeof x === "string";
  if (t.every(isLit)) return { kind: "exact", lit: t.length ? (t[0] as string) : "" };
  if (t.length === 2 && isLit(t[0]) && t[1] === ANY_SEQ) return { kind: "prefix", lit: t[0] };
  if (t.length === 2 && t[0] === ANY_SEQ && isLit(t[1])) return { kind: "suffix", lit: t[1] };
  if (t.length === 3 && t[0] === ANY_SEQ && isLit(t[1]) && t[2] === ANY_SEQ) return { kind: "infix", lit: t[1] };
  return { kind: "regex", tokens: t };
}

/**
 * 접두 구간의 위 끝 — `[A, succ(A))`. 마지막 코드유닛이 대리쌍 범위(0xD800–0xDFFF)이거나 0xD7FF·0xFFFF 면 못 푼다.
 */
export function succ(a: string): string | undefined {
  if (a === "") return undefined;
  const u = a.charCodeAt(a.length - 1);
  if ((u >= 0xd7ff && u <= 0xdfff) || u === 0xffff) return undefined;
  return a.slice(0, -1) + String.fromCharCode(u + 1);
}
