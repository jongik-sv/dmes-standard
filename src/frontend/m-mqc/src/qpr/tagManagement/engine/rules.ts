/**
 * 규칙 엔진 — 목업 `Engine`(규칙관리 프로토타입과 같은 코드)을 그대로 옮겼다. 순수 함수만 있다.
 *  · 파생속성 판정(판정 방식 5종 + 기준값) · 추출 · 대응표
 *  · 규칙 칸(조건) 일치 판정 — SQL 의 NULL 비교 규칙(값 없음 → 거짓)을 따른다
 *  · 규칙 표 적용(처음 일치 1행 / 일치 행 모두), 인증 · 표기(적용표 → 인증 예외 → 규격 · 인증서 → 표기 규칙)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Cons, Ctx, Row, Table } from "./types";

export const NONE = "(없음)";
const CUS_FIELDS = ["CUS_CD", "ACT_CUS_CD", "FNL_CUS_CD"];

export function empty(v: unknown): v is undefined | null | "" {
  return v === undefined || v === null || v === "";
}
/** DerivedAttributes.part — 자리가 모자라면 ''. */
export function part(v: unknown, from: number, len: number): string {
  if (empty(v)) return "";
  const s0 = String(v);
  const s = from - 1;
  const e = s + len;
  return s >= 0 && s0.length >= e ? s0.substring(s, e) : "";
}
/** Oracle SUBSTR — 시작 0은 1, 음수는 뒤에서, 모자라면 남은 만큼, 비면 NULL. */
export function substr(v: unknown, pos: number, len?: number): string | null {
  if (empty(v)) return null;
  const s0 = String(v);
  const s = pos > 0 ? pos - 1 : pos === 0 ? 0 : s0.length + pos;
  if (s < 0 || s >= s0.length) return null;
  const r = len === undefined || len === null ? s0.slice(s) : s0.slice(s, s + len);
  return r === "" ? null : r;
}

// ---- 파생속성 ----------------------------------------------------------
function condTest(c: any, v: string): boolean {
  if (c.method === "RANGE") {
    const n = Number(v);
    if (isNaN(n)) return false;
    const lo = c.values[0];
    const hi = c.values[1];
    return (empty(lo) || n >= Number(lo)) && (empty(hi) || n <= Number(hi));
  }
  const any = (list: string[]) => {
    for (const x of list) {
      if (c.method === "MATCH" && v === x) return true;
      if (c.method === "PREFIX" && v.indexOf(x) === 0) return true;
      if (c.method === "POSITION" && part(v, c.from, c.len) === x) return true;
      if (c.method === "ENDS_WITH" && x.length && v.slice(-x.length) === x) return true;
    }
    return false;
  };
  if (c.excludes && c.excludes.length && any(c.excludes)) return false;
  return any(c.values || []);
}
export function judge(def: any, coil: Ctx): boolean {
  for (const c of def.conds) {
    const v = coil[c.field];
    let r = empty(v) ? !!def.whenNull : condTest(c, String(v));
    if (c.negate) r = !r;
    if (!r) return false;
  }
  return true;
}
export function mapPart(p: any, coil: Ctx): any {
  if (!p) return null;
  const v = coil[p.field];
  if (empty(v) && p.empty !== undefined && p.empty !== null) return p.empty;
  const key = p.len ? part(v, p.from, p.len) : empty(v) ? null : String(v);
  let hit = null;
  for (const pr of p.pairs)
    if (pr[0] === key) {
      hit = pr[1];
      break;
    }
  if (hit !== null) return hit;
  return p.other === null || p.other === undefined ? key : p.other;
}
function findPart(defs: any[], name: string): any {
  for (const d of defs) for (const p of d.parts || []) if (p.name === name) return p;
  return null;
}
function gixSpecCode(defs: any[], coil: Ctx) {
  const side = mapPart(findPart(defs, "gixSpecCode.side"), coil);
  const cw = empty(coil.COAT_WGT) ? "" : coil.COAT_WGT;
  if (!side) return "IZMCCR0-ZM" + cw;
  return "IZMCCR0-" + side + "-" + mapPart(findPart(defs, "gixSpecCode.surface"), coil) + "-ZM" + cw;
}
function tisiSpecCode(defs: any[], coil: Ctx, kind: string) {
  const m = (n: string) => {
    const p = findPart(defs, n);
    return p ? mapPart(p, coil) || "" : "";
  };
  if (kind === "EGI") return m("tisiSpecCode.egiGrade") + " S" + m("tisiSpecCode.egiSurface") + m("tisiSpecCode.egiCoat");
  return m("tisiSpecCode.giGrade") + m("tisiSpecCode.giSpangle") + m("tisiSpecCode.giSurface") + m("tisiSpecCode.edge");
}
/** 파생속성 전체 계산 → { 이름: 값 }. 계산형은 화면용 근사(입력 사실 값으로 계산 가능한 것만). */
export function deriveAll(defs: any[], coil: Ctx): Ctx {
  const out: Ctx = {};
  const c2: Ctx = { ...coil };
  const opg = coil.OP_GRD;
  c2.FLOW_CHL_EFF = !empty(opg) && opg !== "1" ? "11" : coil.FLOW_CHL;
  out.effectiveFlowChl = c2.FLOW_CHL_EFF;
  for (const d of defs) {
    if (d.type === "판정") out[d.name] = judge(d, c2);
    else if (d.type === "추출") {
      const x = part(coil[d.field], d.from, d.len);
      out[d.name] = x === "" ? null : x;
    } else if (d.type === "대응표" && d.parts.length === 1) out[d.name] = mapPart(d.parts[0], coil);
  }
  out.edgeType = mapPart(findPart(defs, "edgeType"), coil);
  out.gixSpecCode = gixSpecCode(defs, coil);
  out["tisiSpecCode:EGI"] = tisiSpecCode(defs, coil, "EGI");
  out["tisiSpecCode:GI"] = tisiSpecCode(defs, coil, "GI");
  return out;
}

// ---- 규칙 칸 ----------------------------------------------------------
// 칸 키: 원천 컬럼 "NAT_CD", 자리 "MTL_CD@4,2"(4번째부터 2자리) · "TAG_SIZ@-1"(끝 1자리), 파생 "@isLamina", 고객 셋 중 하나 "ANY_CUS"
export function keyValue(key: string, ctx: Ctx, nvl?: unknown): any {
  if (key === "ANY_CUS") return CUS_FIELDS.map((f) => (empty(ctx[f]) ? null : String(ctx[f])));
  if (key.charAt(0) === "@") return ctx[key];
  const at = key.indexOf("@");
  if (at > 0) {
    let base = ctx[key.slice(0, at)];
    if (empty(base) && nvl !== undefined && nvl !== null) base = nvl;
    const p = key.slice(at + 1).split(",");
    return substr(base, Number(p[0]), p[1] === undefined ? undefined : Number(p[1]));
  }
  let v = ctx[key];
  if (empty(v) && nvl !== undefined && nvl !== null) v = nvl;
  return empty(v) ? null : typeof v === "boolean" ? v : String(v);
}
function eq(a: unknown, b: unknown) {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return a !== "" && b !== "" && !isNaN(na) && !isNaN(nb) && na === nb;
}
function inList(v: unknown, list: unknown[]) {
  for (const x of list) if (eq(v, x)) return true;
  return false;
}
/** 칸 제약: { in, notin, pre, notpre, ge, gt, le, lt, nn, isnull, b, nvl, orNull } — orNull: 값이 없으면 참. */
export function cellMatch(key: string, cons: Cons | undefined | null, ctx: Ctx): boolean {
  if (!cons) return true;
  const v = keyValue(key, ctx, cons.nvl);
  if (key === "ANY_CUS") {
    const vs = (v as (string | null)[]).filter((x) => x !== null);
    if (cons.in && !vs.some((x) => inList(x, cons.in!))) return false;
    if (cons.notin && vs.some((x) => inList(x, cons.notin!))) return false;
    return true;
  }
  if (cons.b !== undefined) return cons.b === !!v;
  if (cons.isnull) return v === null;
  if (v === null || v === undefined) return !!cons.orNull;
  if (cons.in && !inList(v, cons.in)) return false;
  if (cons.notin && inList(v, cons.notin)) return false;
  if (cons.pre && !cons.pre.some((p) => String(v).indexOf(p) === 0)) return false;
  if (cons.notpre && cons.notpre.some((p) => String(v).indexOf(p) === 0)) return false;
  const n = Number(v);
  if (cons.ge !== undefined && !(n >= cons.ge)) return false;
  if (cons.gt !== undefined && !(n > cons.gt)) return false;
  if (cons.le !== undefined && !(n <= cons.le)) return false;
  if (cons.lt !== undefined && !(n < cons.lt)) return false;
  return true;
}
export function rowMatch(_table: unknown, row: Row, ctx: Ctx) {
  for (const k in row.c) if (!cellMatch(k, row.c[k], ctx)) return false;
  return true;
}
export function sortRows<T extends { prio: number; uid: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => a.prio - b.prio || (a.uid < b.uid ? -1 : 1));
}
export interface EvalResult {
  skip?: boolean;
  rows: string[];
  vals: Record<string, string>;
  from: Record<string, string>;
  none?: boolean;
}
/** 처음 일치 1행: 그 행의 결과 전체 / 일치 행 모두: 항목마다 우선순위가 가장 높은 행의 값. */
export function evalTable(table: Table, rows: Row[], ctx: Ctx): EvalResult {
  if (table.pre && !cellMatch(table.pre.key, table.pre.cons, ctx)) return { skip: true, rows: [], vals: {}, from: {} };
  const sorted = sortRows(rows);
  const hit: string[] = [];
  const vals: Record<string, string> = {};
  const from: Record<string, string> = {};
  for (const r of sorted) {
    if (!rowMatch(table, r, ctx)) continue;
    hit.push(r.uid);
    if (table.mode === "first") {
      for (const k in r.r)
        if (r.r[k] !== "") {
          vals[k] = r.r[k];
          from[k] = r.uid;
        }
      break;
    }
    for (const k in r.r)
      if (r.r[k] !== "" && vals[k] === undefined) {
        vals[k] = r.r[k];
        from[k] = r.uid;
      }
  }
  return { rows: hit, vals, from, none: !hit.length };
}
/** 결과 값의 자리표시 {COL} · {파생속성} 채우기. */
export function fill(v: any, ctx: Ctx): any {
  if (empty(v) || v === NONE) return v;
  return String(v).replace(/\{([^}:]+)(?::([^}]+))?\}/g, (_m, a: string, b?: string) => {
    if (a === "고객명") return (ctx.__cus && ctx.__cus[b!]) || "[고객명 " + b + "]";
    if (a === "식") return "[식]";
    const key = b ? a + ":" + b : a;
    const x = ctx[key] !== undefined ? ctx[key] : ctx["@" + key];
    return empty(x) ? "" : String(x);
  });
}

// ---- 인증 · 표기 ----------------------------------------------------------
export const STD_REF: Record<string, string> = { 짧은표기: "SHORT", 전체표기: "FULL", 영문품명1: "T1", 영문품명2: "T2", 표시품명: "DISP" };
export const LIC_REF: Record<string, string> = { 번호: "NO", 마크: "MARK", QR: "QR" };
function findRow(rows: Row[], id: string) {
  for (const r of rows) if (r.r.ID === id) return r;
  return null;
}
/** 규격에 붙은 인증서 — 규격 하나에 인증서 하나. */
export function licOf(lics: Row[], stdId: string) {
  for (const l of lics) if (l.r.STD === stdId) return l;
  return null;
}
/** 참조를 값으로 — 참조한 속성이 비어 있으면 undefined(이 행은 그 항목을 정하지 않음). */
export function resolveRefs(v: unknown, env: { std: Row[]; lic: Row[] }, cur: { std: Row | null; lic: Row | null }): string | undefined {
  let miss = false;
  const out = String(v).replace(/\{(규격|인증):([^}]+)\}/g, (_m, kind: string, rest: string) => {
    const p = rest.split(":");
    const field = p.pop()!;
    const id = p.join(":");
    const map = kind === "규격" ? STD_REF : LIC_REF;
    let row: Row | null;
    if (id) row = findRow(kind === "규격" ? env.std : env.lic, id);
    else row = kind === "규격" ? cur.std : cur.lic;
    const x = row && map[field] ? row.r[map[field]] : "";
    if (empty(x)) {
      miss = true;
      return "";
    }
    return x;
  });
  return miss ? undefined : out;
}
/** 표기 정의: 묶음(grp)에 현행 규칙 줄이 남아 있으면 그 묶음의 정의 줄은 "제안"(쓰지 않음). */
export function activeDisp(rows: Row[]) {
  const held: Record<string, boolean> = {};
  for (const r of rows) if (r.kind === "현행") held[r.grp!] = true;
  return rows.filter((r) => !(r.kind === "정의" && held[r.grp!]));
}
export interface CertResult {
  vals: Record<string, string>;
  from: Record<string, string>;
  raw: Record<string, string>;
  rows: string[];
  apply?: string;
  ex: string | null;
  std: Row | null;
  lic: Row | null;
  certOff: boolean;
}
/** 적용표: 칸(적용 규격 · 인증 표시)마다 위에서 처음 정한 값 — 예외 행이 위, 국가 × 품명 행이 아래. */
export function evalCert(T: Record<string, Table>, env: { std: Row[]; lic: Row[]; apply: Row[]; disp: Row[] }, ctx: Ctx): CertResult {
  const ap = evalTable(T.apply, env.apply, ctx);
  const stdId = ap.vals.STD_ID;
  const certOff = ap.vals.CERT === NONE;
  const std = stdId ? findRow(env.std, stdId) : null;
  const lic = std && !certOff ? licOf(env.lic, stdId) : null;
  ctx.STD_ID = std ? stdId : null;
  ctx.CERT_SCHEME = lic ? lic.r.SCHEME : null;
  const cur = { std, lic };
  const sorted = sortRows(activeDisp(env.disp));
  const hit: string[] = [];
  const vals: Record<string, string> = {};
  const from: Record<string, string> = {};
  const raw: Record<string, string> = {};
  for (const r of sorted) {
    if (!rowMatch(T.disp, r, ctx)) continue;
    for (const k in r.r) {
      if (r.r[k] === "" || vals[k] !== undefined) continue;
      const v = resolveRefs(r.r[k], env, cur);
      if (v === undefined) continue;
      vals[k] = v;
      from[k] = r.uid;
      raw[k] = r.r[k];
    }
    hit.push(r.uid);
  }
  return { vals, from, raw, rows: hit, apply: ap.from.STD_ID, ex: certOff ? ap.from.CERT : null, std, lic, certOff };
}
