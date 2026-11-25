/**
 * 품질사양 한 줄 표기(DSL) — "조건 = 값, … | 설계결과 = 값, …" 의 해석·채번·표시 도우미(순수 함수).
 * 프로토타입 quality-spec.html 의 parseLine·splitTokens·parseToken·finishToken·nextSpecNo 와 같은 규칙이다.
 * 화면은 「등록 전 확인」 미리보기에만 쓰고, 저장 때는 서버가 같은 규칙으로 다시 해석해 검사한다.
 */
import type { AttrKind, AttrView, Op, OrderView, Term } from "./types";

/** 해석에 쓰는 사전 항목 — 서버 AttrView 의 일부. */
export type DictItem = Pick<AttrView, "attrCd" | "attrNm" | "kind" | "unit" | "useYn">;

export type IssueLevel = "err" | "warn";

export interface Issue {
  level: IssueLevel;
  msg: string;
  /** 코드 사전에 없는 항목 이름 — 「코드 사전에 추가」 빠른 단추용 */
  name?: string;
  quickAdd?: boolean;
  kindGuess?: AttrKind;
}

export interface ParsedToken {
  attrNm: string;
  op: Op;
  val: string;
  attr: DictItem | null;
  issues: Issue[];
}

export interface ParsedLine {
  raw: string;
  conds: ParsedToken[];
  results: ParsedToken[];
  issues: Issue[];
  ok: boolean;
  cus: string | null;
  prd: string | null;
}

/** 연산자 인식 순서 — 두 글자 표기를 먼저 본다. */
const OPS: [string, Op][] = [
  [">=", "≥"],
  ["<=", "≤"],
  ["≥", "≥"],
  ["≤", "≤"],
  ["=", "="],
  [">", ">"],
  ["<", "<"],
];

export const normKo = (s: string) => String(s).replace(/\s+/g, "");
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 쉼표로 나누되 따옴표 안의 쉼표는 나누지 않는다. */
export function splitTokens(side: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of side) {
    if (ch === "'" || ch === '"') {
      quoted = !quoted;
      cur += ch;
      continue;
    }
    if (ch === "," && !quoted) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function stripQuotes(v: string): string {
  return v.replace(/^['"]|['"]$/g, "").trim();
}

const isActive = (a: DictItem) => a.useYn !== "N";

/** 한글 항목명(공백 무시) 또는 시스템 코드로 사용 중인 항목을 찾는다. */
export function findAttr(name: string, dict: readonly DictItem[]): DictItem | null {
  const n = normKo(name);
  return (
    dict.find((a) => isActive(a) && normKo(a.attrNm) === n) ??
    dict.find((a) => isActive(a) && a.attrCd.toUpperCase() === name.trim().toUpperCase()) ??
    null
  );
}

function finishToken(name: string, op: Op, val: string, attr: DictItem | null, sideKind: "COND" | "RESULT"): ParsedToken {
  const issues: Issue[] = [];
  let finalOp = op;
  if (/^-?[\d.]+\s*~\s*-?[\d.]+$/.test(val)) finalOp = "~";
  if (!attr) issues.push({ level: "warn", msg: `"${name}" — 코드 사전에 없는 항목입니다`, name, quickAdd: true, kindGuess: sideKind });
  if (val === "") issues.push({ level: "err", msg: `"${name}" — 값이 없습니다` });
  if (attr && attr.kind !== "BOTH" && attr.kind !== sideKind) {
    const where = sideKind === "COND" ? "조건" : "설계결과";
    const orig = attr.kind === "COND" ? "조건" : "설계결과";
    issues.push({ level: "warn", msg: `"${attr.attrNm}" 은(는) ${orig}용 항목인데 ${where} 영역에 있습니다` });
  }
  return { attrNm: attr ? attr.attrNm : name.trim(), op: finalOp, val, attr, issues };
}

export function parseToken(token: string, dict: readonly DictItem[], sideKind: "COND" | "RESULT"): ParsedToken {
  // 1) 연산자가 있는 표기
  for (const [raw, op] of OPS) {
    const idx = token.indexOf(raw);
    if (idx > 0) {
      const name = token.slice(0, idx).trim();
      const val = stripQuotes(token.slice(idx + raw.length).trim());
      return finishToken(name, op, val, findAttr(name, dict), sideKind);
    }
  }
  // 2) 연산자 없음 — 사전 항목명 중 가장 긴 앞부분("원재료 두께 1.2")
  const nt = normKo(token);
  let best: DictItem | null = null;
  for (const a of dict) {
    if (!isActive(a)) continue;
    const an = normKo(a.attrNm);
    if (nt.startsWith(an) && (!best || an.length > normKo(best.attrNm).length)) best = a;
  }
  if (best) {
    const an = normKo(best.attrNm);
    let rest = "";
    let seen = 0;
    for (const ch of token) {
      if (seen < an.length && !/\s/.test(ch)) {
        seen++;
        continue;
      }
      if (seen >= an.length) rest += ch;
    }
    return finishToken(best.attrNm, "=", stripQuotes(rest.trim()), best, sideKind);
  }
  return { attrNm: token, op: "=", val: "", attr: null, issues: [{ level: "err", msg: `"${token}" — 항목명을 인식할 수 없습니다`, name: token }] };
}

export function parseLine(text: string, dict: readonly DictItem[]): ParsedLine {
  const issues: Issue[] = [];
  const pi = text.indexOf("|");
  const left = pi >= 0 ? text.slice(0, pi) : text;
  const right = pi >= 0 ? text.slice(pi + 1) : "";
  if (pi < 0) issues.push({ level: "warn", msg: "'|' 구분자가 없습니다 — 전체를 조건으로 해석합니다. '|' 뒤에 설계결과를 입력하세요" });
  const conds = splitTokens(left).map((t) => parseToken(t, dict, "COND"));
  const results = splitTokens(right).map((t) => parseToken(t, dict, "RESULT"));
  for (const it of [...conds, ...results]) issues.push(...it.issues);
  if (conds.length === 0) issues.push({ level: "err", msg: "조건이 없습니다" });
  if (pi >= 0 && results.length === 0) issues.push({ level: "err", msg: "'|' 뒤에 설계결과가 없습니다" });
  const cus = conds.find((c) => c.attr?.attrCd === "CUS_CD");
  const prd = conds.find((c) => c.attr?.attrCd === "PRD_NM_CD");
  if (!cus) issues.push({ level: "err", msg: "조건에 고객사가 필요합니다 (채번 기준)" });
  if (!prd) issues.push({ level: "err", msg: "조건에 품명이 필요합니다 (채번 기준)" });
  const ok = !issues.some((i) => i.level === "err");
  return { raw: text.trim(), conds, results, issues, ok, cus: cus ? cus.val : null, prd: prd ? prd.val : null };
}

/** 여러 줄 입력 — 빈 줄은 뺀다. */
export function parseText(text: string, dict: readonly DictItem[]): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => parseLine(l, dict));
}

/** 채번: 고객사-품명+순번(2자리). 기존 번호와 같은 묶음에서 예약한 번호(taken) 중 가장 큰 순번 + 1. */
export function nextSpecNo(cus: string, prd: string, existing: readonly string[], taken: readonly string[] = []): string {
  const prefix = `${cus}-${prd}`;
  let max = 0;
  for (const no of [...existing, ...taken]) {
    if (!no.startsWith(prefix)) continue;
    const n = parseInt(no.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${pad2(max + 1)}`;
}

/** 줄마다 미리 볼 사양번호 — 해석이 고객사·품명을 못 찾으면 null. */
export function previewSpecNos(lines: readonly ParsedLine[], existing: readonly string[]): (string | null)[] {
  const taken: string[] = [];
  return lines.map((l) => {
    if (!l.cus || !l.prd) return null;
    const no = nextSpecNo(l.cus, l.prd, existing, taken);
    taken.push(no);
    return no;
  });
}

export interface LineSummary {
  flag: "ok" | "warn" | "err";
  errCount: number;
  warnCount: number;
}

export function summarizeLine(line: ParsedLine): LineSummary {
  const errCount = line.issues.filter((i) => i.level === "err").length;
  const warnCount = line.issues.filter((i) => i.level === "warn").length;
  return { flag: errCount > 0 ? "err" : warnCount > 0 ? "warn" : "ok", errCount, warnCount };
}

/** 모든 토큰이 사전 코드에 매핑됐는가 — 확정 가능 조건 중 하나. */
export function lineMapped(line: ParsedLine): boolean {
  return [...line.conds, ...line.results].every((t) => t.attr !== null);
}

/** 값 표시 — `=`·`~` 는 값만, 그 밖은 "≥ 20" 처럼 연산자를 앞에 붙인다(설계결과 적용값과 같은 규칙). */
export function displayValue(op: Op | string, val: string): string {
  return op === "=" || op === "~" ? val : `${op} ${val}`;
}

/** 조건·결과 칩 글 — "원재료 두께 = 1.2 mm", "광택 25~35 GU". */
export function termText(t: Pick<Term, "attrNm" | "op" | "val" | "unit">): string {
  const body = t.op === "~" ? `${t.attrNm} ${t.val}` : `${t.attrNm} ${t.op} ${t.val}`;
  return t.unit ? `${body} ${t.unit}` : body;
}

/** 해석 결과 토큰 → 화면 Term 모양. */
export function toTerm(t: ParsedToken, side: "IF" | "THEN", seq: number): Term {
  return { side, seq, attrCd: t.attr?.attrCd ?? null, attrNm: t.attrNm, op: t.op, val: t.val, unit: t.attr?.unit ?? null };
}

// ── 간편 입력 ↔ 한 줄 표기 ───────────────────────────────

export interface GuidedRow {
  attrCd: string;
  op: Op;
  val: string;
}

export interface GuidedForm {
  cusCd: string;
  prdNmCd: string;
  conds: GuidedRow[];
  results: GuidedRow[];
}

function quoteIfNeeded(v: string): string {
  return /[,|]/.test(v) ? `'${v.replace(/'/g, "")}'` : v;
}

function rowText(row: GuidedRow, dict: readonly DictItem[]): string | null {
  const a = dict.find((d) => d.attrCd === row.attrCd);
  const val = row.val.trim();
  if (!a || val === "") return null;
  const op = /^-?[\d.]+\s*~\s*-?[\d.]+$/.test(val) ? "=" : row.op;
  return `${a.attrNm} ${op} ${quoteIfNeeded(val)}`;
}

/** 간편 입력 → 한 줄 표기. 고객사·품명 이름은 사전 항목명을 쓴다(없으면 기본 이름). */
export function guidedToLine(form: GuidedForm, dict: readonly DictItem[]): string {
  const cusNm = dict.find((d) => d.attrCd === "CUS_CD")?.attrNm ?? "고객사";
  const prdNm = dict.find((d) => d.attrCd === "PRD_NM_CD")?.attrNm ?? "품명";
  const left = [`${cusNm} = ${form.cusCd}`, `${prdNm} = ${form.prdNmCd}`];
  for (const r of form.conds) {
    const t = rowText(r, dict);
    if (t) left.push(t);
  }
  const right: string[] = [];
  for (const r of form.results) {
    const t = rowText(r, dict);
    if (t) right.push(t);
  }
  return `${left.join(", ")} | ${right.join(", ")}`;
}

/** 한 줄 표기 → 간편 입력. 한 줄이고 모든 항목이 사전에 있을 때만 되돌린다(아니면 null). */
export function lineToGuided(text: string, dict: readonly DictItem[]): GuidedForm | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length !== 1) return null;
  const p = parseLine(lines[0], dict);
  if (!p.cus || !p.prd || !lineMapped(p)) return null;
  const toRow = (t: ParsedToken): GuidedRow => ({ attrCd: t.attr!.attrCd, op: t.op === "~" ? "=" : t.op, val: t.val });
  return {
    cusCd: p.cus,
    prdNmCd: p.prd,
    conds: p.conds.filter((c) => c.attr!.attrCd !== "CUS_CD" && c.attr!.attrCd !== "PRD_NM_CD").map(toRow),
    results: p.results.map(toRow),
  };
}

/** 빠른 시작 서식 3종 — 두께 → 재질, BOM → 통과공정, 색상 → 광택·후처리. */
export const QUICK_TEMPLATES: { key: string; label: string; conds: GuidedRow[]; results: GuidedRow[] }[] = [
  { key: "thk", label: "두께 → 재질", conds: [{ attrCd: "RAW_THK", op: "=", val: "" }], results: [{ attrCd: "RAW_MTRL", op: "=", val: "" }] },
  { key: "bom", label: "BOM → 통과공정", conds: [{ attrCd: "CCL_BOM", op: "=", val: "" }], results: [{ attrCd: "PROC_CD", op: "=", val: "" }] },
  {
    key: "color",
    label: "색상 → 광택·후처리",
    conds: [{ attrCd: "COLOR_CD", op: "=", val: "" }],
    results: [
      { attrCd: "GLOSS", op: "=", val: "" },
      { attrCd: "POST_TRT", op: "=", val: "" },
    ],
  },
];

// ── 시뮬레이션 ─────────────────────────────────────────────

/** 실행 전 보여 줄 수신 전문(OMS → MES). 서버 run 응답의 payload 와 같은 머리 키를 쓴다. */
export function inboundPayload(order: OrderView): Record<string, string> {
  return { IF_ID: "OMS_MESQ_ORD_001", ORD_NO: order.ordNo, CUS_CD: order.cusCd, PRD_NM_CD: order.prdNmCd, QTY: order.qty, ...order.attrs };
}

/** JSON 글을 객체로 — 실패하면 글 그대로(JsonView 가 글 값으로 보인다). */
export function parseJsonText(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 쉼표 목록 정리 — 빈 칸과 중복을 뺀다. */
export function joinKeys(keys: readonly string[]): string {
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))].join(",");
}
