/**
 * TAG 발행 시뮬레이터 계산 — 목업 앱 코드(규칙 실행 · 칸 값과 출처 · 양식 → 칸 · TAG 그리기 · 사용 범위 · 바꾼 것 · 칸 목록 · 겹침)를 옮겼다.
 * `createSim(D, S)` 는 정적 자료 D 와 편집 상태 S(목업 전역 S 와 같은 모양)를 받아 계산 함수 묶음을 돌려준다.
 * S 는 store 가 갖고 고친다. 여기서 S 를 바꾸는 함수는 store.edit 안에서만 부른다(revertChange · setGeo).
 * 사용 범위 · 겹침처럼 무거운 계산은 목업처럼 자료가 바뀔 때만 다시 센다(캐시 키 = 쓰는 자료의 JSON).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FACT_NAMES,
  HEAD6,
  LBL,
  LIC_F,
  ORDER_KEYS,
  OWNER,
  PAGE,
  PT_MM,
  SIZES,
  SRC_FILL,
  STD_F,
  STDMRK_IMG,
} from "./consts";
import * as Engine from "./rules";
import { NONE } from "./rules";
import type { BaseDoc, Coil, Cons, Ctx, Geo, Row, SimState, TagData } from "./types";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
export const esc = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const mm = (v: number) => (v * PT_MM).toFixed(1);
export const geoTxt = (g: Geo | null | undefined) => (g ? `X ${mm(g.x)} · Y ${mm(g.y)} · ${mm(g.w)}×${mm(g.h)}mm` : "");
export const sizeOf = (id: string) => SIZES.find((z) => z.id === id) || SIZES[0];
export function pageDims(sz: string) {
  const z = sizeOf(sz);
  return { W: PAGE.w * z.fx, H: PAGE.h * z.fy, z };
}
export const layKey = (fid: string, size?: string) => (!size || size === "std" ? fid : fid + "@" + size);

/** 칸 하나(그리기 노드) — 양식 노드 + 값 · 출처 · 글자 폭. */
export type TagNode = Record<string, any> & { i: number; t: string; n: any; x: number; y: number; w: number; h: number; gid: number };
export interface Model {
  R: RunResult;
  fid: string | null;
  pi: number;
  nodes: TagNode[];
  coil: Coil;
  st: any;
  chg?: Set<string>;
}
export interface RunResult {
  ctx: Ctx;
  tt: string | undefined;
  prints: { pt: string; form: string; row: string }[];
  ce: Engine.CertResult;
  cus: Engine.EvalResult;
  show: Engine.EvalResult;
  D: { std: Row[]; lic: Row[]; cus: Row[] };
}
export interface FieldInfo {
  v: any;
  raw?: any;
  src: string;
  uid?: string;
  hidden?: boolean;
  expr?: string;
  why?: string;
}
export interface Change {
  id: string;
  who: string;
  what: string;
  from?: string;
  to?: string;
  go?: string;
}
export interface ClashEdge {
  a: string;
  b: string;
  ga: number;
  gb: number;
  st: "yes" | "maybe" | "no";
  why?: string;
  conds: Record<string, Cons>[];
  ex: { c: Coil; va: any; vb: any; show: any } | null;
  fact?: boolean;
  va?: any;
  vb?: any;
}
export interface ClashRes {
  fresh: ClashEdge[];
  old: ClashEdge[];
  apart: ClashEdge[];
  short: boolean;
}
export interface DecRow {
  src: string;
  uid: string;
  c: Record<string, Cons> | null;
  v: any;
  note?: string;
}
export interface FmapRow {
  n: TagNode;
  nm: string;
  dr: DecRow[];
  cr: any[];
  gap: number;
  chk: number;
  w: { k: string; t: string; s: string };
  fl: [number, number] | null;
  fn: number;
}

// ---- 바코드 · QR ----------------------------------------------------------------
const C39: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000", F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100", K: "100000011", L: "001000011", M: "101000010",
  N: "000010011", O: "100010010", P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110", U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000", Z: "011010000",
  "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
};
function code39(v: unknown, x: number, y: number, w: number, h: number) {
  const s = "*" + String(v).toUpperCase().replace(/[^0-9A-Z\-. ]/g, "") + "*";
  const WIDE = 3;
  const u = w / (s.length * (6 + 3 * WIDE) + (s.length - 1));
  let cx = x;
  let out = "";
  for (let ci = 0; ci < s.length; ci++) {
    const p = C39[s[ci]];
    for (let j = 0; j < 9; j++) {
      const ww = (p[j] === "1" ? WIDE : 1) * u;
      if (j % 2 === 0) out += `<rect x="${cx.toFixed(2)}" y="${y}" width="${ww.toFixed(2)}" height="${h}" fill="#000"/>`;
      cx += ww;
    }
    cx += u;
  }
  return out;
}
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** QR 모양(예시) — 실제 부호화는 하지 않는다. 값이 바뀌면 무늬가 바뀐다. */
function qrSvg(v: unknown, x: number, y: number, s: number) {
  const N = 25;
  const m = s / N;
  let out = `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#fff"/>`;
  let h = hash(String(v));
  const fin = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const finOn = (r: number, c: number) => {
    const rr = r % (N - 7) < 7 ? r % (N - 7) : r;
    const cc = c % (N - 7) < 7 ? c % (N - 7) : c;
    const a = Math.min(rr, cc, 6 - rr, 6 - cc);
    return a === 0 || a >= 2;
  };
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      let on: boolean;
      if (fin(r, c)) on = finOn(r, c);
      else {
        h ^= h << 13;
        h ^= h >>> 17;
        h ^= h << 5;
        on = (h >>> 0) % 100 < 46;
      }
      if (on) out += `<rect x="${(x + c * m).toFixed(2)}" y="${(y + r * m).toFixed(2)}" width="${(m + 0.05).toFixed(2)}" height="${(m + 0.05).toFixed(2)}" fill="#000"/>`;
    }
  return out;
}

// ---- 글꼴 · 글자 폭 ----------------------------------------------------------------
function fam(fn?: string) {
  fn = fn || "";
  if (/바탕|Batang|궁서/.test(fn)) return "Batang, 바탕, 'Noto Serif KR', serif";
  if (/Arial Narrow/.test(fn)) return "'Arial Narrow', Arial, sans-serif";
  if (/Calibri/.test(fn)) return "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
  if (/Consolas/.test(fn)) return "Consolas, monospace";
  if (/HY|헤드라인|견고딕|굴림|돋움/.test(fn)) return "'Malgun Gothic', sans-serif";
  return "Arial, 'Malgun Gothic', sans-serif";
}
const boldOf = (n: any) => !!(n.b || /Bold/.test(n.fn || ""));
let MC: CanvasRenderingContext2D | null | undefined;
function measure() {
  if (MC === undefined) {
    try {
      const c = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      MC = c && typeof c.measureText === "function" ? c : null;
    } catch {
      MC = null;
    }
  }
  return MC;
}
function textW(s: string, n: any, fs: number) {
  const mc = measure();
  let w: number;
  if (mc) {
    mc.font = (boldOf(n) ? "bold " : "") + fs + "px " + fam(n.fn);
    w = mc.measureText(s).width;
  } else w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56), 0) * fs; // 시험 환경(캔버스 없음) 어림
  return w + (n.ls || 0) * Math.max(0, s.length - 1);
}
function overOf(n: any, fs: number, v: unknown, pageW?: number) {
  const w = textW(String(v), n, fs);
  const avail = n.al === "center" ? n.w : n.w - 10;
  const x0 = n.al === "right" ? n.x + n.w - 5 - w : n.al === "center" ? n.x + n.w / 2 - w / 2 : n.x + 5;
  return { w, over: w > avail + 0.5 || x0 + w > (pageW || PAGE.w) };
}
/** 넘친 글자는 실제로 찍힌 범위까지 선택 상자를 넓힌다. */
function hitBox(n: any) {
  const x0 = n.al === "right" ? n.x + n.w - 5 - n.tw : n.al === "center" ? n.x + n.w / 2 - n.tw / 2 : n.x + 5;
  const x = Math.min(n.x, x0 - 2);
  const r = Math.max(n.x + n.w, x0 + n.tw + 2);
  return { x, y: n.y, w: r - x, h: n.h };
}
function inkBox(n: any) {
  const x0 = n.al === "right" ? n.x + n.w - 5 - n.tw : n.al === "center" ? n.x + n.w / 2 - n.tw / 2 : n.x + 5;
  const base = n.y + n.h / 2 + n.fs * 0.6;
  return { x: x0 - 2, y: base - n.fs * 0.82, w: n.tw + 4, h: n.fs * 1.02 };
}
function textEl(n: any, v: unknown, fs: number, fillC: string) {
  const base = n.y + n.h / 2 + (fs * 1.2) / 2;
  const x = n.al === "right" ? n.x + n.w - 5 : n.al === "center" ? n.x + n.w / 2 : n.x + 5;
  const anchor = n.al === "right" ? "end" : n.al === "center" ? "middle" : "start";
  return `<text x="${x}" y="${base.toFixed(1)}" font-family="${esc(fam(n.fn))}" font-size="${fs}" ${boldOf(n) ? 'font-weight="bold"' : ""} ${n.ls ? `letter-spacing="${n.ls}"` : ""} text-anchor="${anchor}" fill="${fillC}" xml:space="preserve">${esc(v)}</text>`;
}
const hit2 = (a: Geo, b: Geo) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > CLASH_MIN && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > CLASH_MIN;
const unionR = (rs: Geo[]) =>
  rs.reduce<Geo | null>(
    (u, r) =>
      !u
        ? { ...r }
        : { x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) },
    null,
  )!;
/** pt — 이보다 적게 닿으면 겹침으로 보지 않는다. */
const CLASH_MIN = 1.5;
/** 규칙이 정하는 값 — 코일에 직접 넣지 않는다. */
const CTXK = new Set(["CERT_SCHEME", "STD_ID", "TAG_PUB_TYPE", "PRINT_TYPE"]);

/** 맞춤선 — vals: 움직이는 칸의 선들, cands: 다른 칸 · 용지의 선들. */
function snapAxis(vals: number[], cands: number[], thr: number) {
  let best: { d: number; at: number } | null = null;
  for (const a of vals)
    for (const c of cands) {
      const d = c - a;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c };
    }
  return best;
}
export interface DragState {
  gid: number;
  h: string;
  sx: number;
  sy: number;
  k: number;
  W: number;
  H: number;
  g0: Geo;
  key: string;
  before: string;
  moved: boolean;
}

/** 프린터 해상도(흑백 점)로 바꾸기. */
export function threshold(g: CanvasRenderingContext2D, w: number, h: number) {
  const d = g.getImageData(0, 0, w, h);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const v = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114 < 150 ? 0 : 255;
    a[i] = a[i + 1] = a[i + 2] = v;
    a[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
}
export function rasterize(svgStr: string, wmm: number, hmm: number, dpi: number): Promise<HTMLCanvasElement> {
  return new Promise((ok, fail) => {
    const cw = Math.round((wmm / 25.4) * dpi);
    const ch = Math.round((hmm / 25.4) * dpi);
    const s = svgStr.replace(/width="[^"]*" height="[^"]*" role/, `width="${cw}" height="${ch}" role`);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, cw, ch);
      g.drawImage(img, 0, 0, cw, ch);
      threshold(g, cw, ch);
      ok(cv);
    };
    img.onerror = fail;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  });
}

/** 목업 initS() 의 편집 문서 — 현행 규칙 이관본(기준값 표 = 정적 자료의 인증서 · 규격 · 고객 요청 표). */
export function initDoc(D: TagData) {
  const T = D.tables;
  return { data: { std: clone(T.std.rows), lic: clone(T.lic.rows), cus: clone(T.cus.rows) }, style: {}, geo: {}, imgs: {}, facts: {} };
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Sim = ReturnType<typeof createSim>;

export function createSim(D: TagData, S: SimState) {
  const T = D.tables;
  const M = D.M;
  const COILS = D.coils;
  const DEFS = D.DERIVED;
  const JUDGE_INSP = DEFS.find((d: any) => d.name === "isInspectionTag");
  const FI = D.formInfo;
  const GOLD = D.gold;
  const RULES: any[] = D.rules || [];

  const itemNm = (n: string) => LBL[n] || ((D.items[n] || {}).d || n).replace(/\s+/g, " ").slice(0, 24);

  // ---- 코일 ----
  const GEN: Coil[] = (D.gen || []).map((g) => {
    const b = COILS.find((c) => c.id === g.b)!;
    const o: Coil = {};
    for (const k in g.o) if (g.o[k] !== null) o[k] = g.o[k];
    const c: Coil = { ...b, ...o, id: g.id, grp: "gen", why: g.why, base: g.b };
    for (const k in g.o) if (g.o[k] === null) delete c[k];
    if (c.NAT_CD !== c.natReal) c.TAG_DST = "";
    return c;
  });
  const GENMAP = new Map<string, Coil>(GEN.map((c) => [c.id, c]));
  function witCoil(c: Coil) {
    const id = "W" + String(hash(JSON.stringify(c))).slice(-6);
    S.wit[id] = c;
    GENMAP.set(id, { ...c, id, grp: "wit", COIL_ID: c.COIL_ID || "" });
    return id;
  }
  function coilOf(id: string): Coil {
    if (/^W/.test(id) && !GENMAP.has(id) && S.wit[id]) witCoil(S.wit[id]);
    if (GENMAP.has(id)) return { ...GENMAP.get(id), ...(S.facts[id] || {}) };
    const b = COILS.find((c) => c.id === id) || COILS[0];
    return { ...b, ...(S.facts[id] || {}) };
  }
  const coilBase = (id: string) => GENMAP.get(id) || COILS.find((c) => c.id === id);
  function coilName(id: string) {
    const g = GENMAP.get(id);
    if (g && g.grp === "wit") return "겹침 예시 코일 — 규칙 조건대로 만든 조합(운영 코일 아님)";
    if (g && g.grp === "real")
      return "운영 실제 코일 " + g.COIL_ID + (D.act[g.act] ? " — 2주 발행분의 조건 · 찍힌 값 그대로" : " — 조건은 실제, 찍힌 값은 보관 기간(2주)이 지나 없음");
    if (g) return "규칙에서 만든 코일 " + g.id + " — " + ((COILS.find((c) => c.id === g.base) || {}).name || "") + "에서 규칙 조건만 바꿈";
    const c = COILS.find((x) => x.id === id) || COILS[0];
    return c.name + (c.grp === "made" ? " — 최근 2주 발행 없는 경우" : " — 운영 실제 " + c.COIL_ID);
  }

  // ---- 규칙 실행(코일 1건) ----
  function run(coil: Coil, Dd: { std: Row[]; lic: Row[]; cus: Row[] }): RunResult {
    const ctx: Ctx = { __cus: M.CUS, ...coil };
    const d = Engine.deriveAll(DEFS, coil);
    for (const k in d) {
      ctx["@" + k] = d[k];
      if (ctx[k] === undefined) ctx[k] = d[k];
    }
    ctx.tisiSpecCode = d["tisiSpecCode:EGI"];
    const ev = (id: string) => Engine.evalTable(T[id], T[id].rows, ctx);
    const sc = T.svccard ? Engine.evalTable(T.svccard, T.svccard.rows, ctx) : null;
    if (sc) ctx.SVC_CARD = sc.vals.SVC_CARD === "Y";
    const k1 = ev("kind");
    let tt: string | undefined = k1.vals.TAG_PUB_TYPE;
    if (tt === NONE) tt = undefined;
    if (tt && tt.indexOf("{") >= 0) tt = Engine.fill(tt, ctx) || undefined;
    ctx.TAG_PUB_TYPE = tt;
    ctx["@isInspectionTag"] = tt && JUDGE_INSP ? Engine.judge(JUDGE_INSP, ctx) : false;
    const k2 = ev("kindPost");
    if (k2.vals.TAG_PUB_TYPE) {
      tt = k2.vals.TAG_PUB_TYPE;
      ctx.TAG_PUB_TYPE = tt;
    }
    const ex = ev("expand");
    const pts = !tt ? [] : ex.vals.PRINT_TYPES ? ex.vals.PRINT_TYPES.split(/\s+/) : [tt];
    const prints = pts.map((pt) => {
      const f = Engine.evalTable(T.form, T.form.rows, { ...ctx, PRINT_TYPE: pt });
      return { pt, form: f.vals.FORM, row: f.from.FORM };
    });
    const ce = Engine.evalCert(T, { std: Dd.std, lic: Dd.lic, apply: T.apply.rows, disp: T.disp.rows }, ctx);
    const cus = Engine.evalTable(T.cus, Dd.cus, ctx);
    const show = T.display ? Engine.evalTable(T.display, T.display.rows, ctx) : { vals: {}, from: {}, rows: [] };
    return { ctx, tt, prints, ce, cus, show, D: Dd };
  }

  // ---- 칸 값과 출처 ----
  function actOf(c: Ctx) {
    const a = c.act && D.act[c.act];
    if (!a) return null;
    const f = a.f[c.__fid] || a.f[c.form] || Object.values(a.f)[0];
    return f ? (f as any).v : null;
  }
  function fact(n: string, c: Ctx): any {
    if (n === "BARCD" || n === "COIL_ID") return c.COIL_ID || "";
    const a = actOf(c);
    const lit = /^'[^']*'$/.test(String((D.items[n] || {}).e || "").trim());
    if (!FACT_NAMES.has(n) && !(a && a[n] !== undefined && !lit)) return undefined;
    if (c.grp !== "real" && c.NAT_CD !== c.natReal && ORDER_KEYS.has(n)) return "";
    return a && a[n] !== undefined ? a[n] : "";
  }
  function fieldOf(R: Pick<RunResult, "cus" | "ce" | "ctx"> & { show?: Engine.EvalResult }, name: string): FieldInfo {
    const cv = R.cus.vals[name];
    const dv = R.ce.vals[name];
    if (cv !== undefined) return { v: cv === NONE ? "" : Engine.fill(cv, R.ctx), raw: cv, src: "cus", uid: R.cus.from[name], hidden: cv === NONE };
    if (dv !== undefined) return { v: dv === NONE ? "" : Engine.fill(dv, R.ctx), raw: R.ce.raw[name], src: "disp", uid: R.ce.from[name], hidden: dv === NONE };
    const sv = R.show && R.show.vals[name];
    if (sv !== undefined) {
      if (sv !== NONE && String(sv).indexOf("{") >= 0) {
        const fv = fact(name, R.ctx);
        return { v: fv !== undefined && fv !== "" ? fv : Engine.fill(sv, R.ctx), raw: sv, src: "show", uid: R.show!.from[name] };
      }
      return { v: sv === NONE ? "" : sv, raw: sv, src: "show", uid: R.show!.from[name], hidden: sv === NONE };
    }
    const e = String((D.items[name] || {}).e || "").trim();
    if (name === "STD_MRK")
      return {
        v: STDMRK_IMG[R.ctx.STD_MRK] || "",
        src: "else",
        expr: e,
        why: "코일의 규격 마크 " + (R.ctx.STD_MRK || "없음") + " → " + (STDMRK_IMG[R.ctx.STD_MRK] ? "그 마크 이미지" : "마크 없음"),
      };
    const f = fact(name, R.ctx);
    if (f !== undefined) return { v: f, src: "fact", expr: e };
    const m = /^'([^']*)'$/.exec(e);
    if (m) return { v: m[1], src: "else", expr: e };
    return { v: "", src: "none", expr: e };
  }

  // ---- 양식 → 칸 ----
  const FLAT: Record<string, any[]> = {};
  function flat(fid: string): any[] {
    if (FLAT[fid]) return FLAT[fid];
    const out: any[] = [];
    let gn = 0;
    const walk = (n: any, p: any, pg: number) => {
      const own = n.x !== undefined;
      const g = own ? n : p;
      const gid = own ? gn++ : pg;
      if (!g) return;
      if (n.t === "box") {
        if (n.lt && own) out.push({ t: "line", x: n.x, y: n.y, w: n.w, h: n.h, lt: n.lt, gid });
        (n.k || []).forEach((k: any) => walk(k, g, gid));
      } else if (["data", "title", "image", "barcode", "qrcode"].includes(n.t)) out.push({ ...n, x: g.x, y: g.y, w: g.w, h: g.h, gid });
    };
    D.forms[fid].layout.forEach((n) => walk(n, null, -1));
    return (FLAT[fid] = out);
  }
  const imgVers = (file: string, st: { imgs?: Record<string, any[]> }) => (st.imgs || {})[file] || [];
  function imgSrc(file: string, st: { imgs?: Record<string, any[]> }): string | null {
    const v = imgVers(file, st);
    return v.length ? v[v.length - 1].src : D.images[file] || null;
  }
  const imgVer = (file: string, st: { imgs?: Record<string, any[]> }) => imgVers(file, st).length + 1;
  /** 칸 배치 — 크기별로 따로. 표준이 아닌 크기는 표준 배치 위에 그 크기에서 옮긴 것을 얹는다. */
  function geoOf(st: { geo?: Record<string, Record<string, Geo>> }, fid: string, size?: string): Record<string, Geo> {
    const g = st.geo || {};
    return { ...g[fid], ...(size && size !== "std" ? g[layKey(fid, size)] : null) };
  }
  function gName(fid: string, gid: number) {
    const ns = flat(fid).filter((n) => n.gid === gid);
    const d = ns.find((n) => n.t !== "title" && n.t !== "line");
    const t = ns.find((n) => n.t === "title");
    return d ? itemNm(d.t === "barcode" ? "BARCD" : d.n) : t ? "「" + String(t.n).trim().slice(0, 20) + "」 글자" : "테두리 상자";
  }
  /** 배치 한 칸 고치기(S.geo) — store.edit 안에서 부른다. */
  function setGeo(key: string, gid: number, g: Geo | null | undefined) {
    const m = (S.geo[key] = S.geo[key] || {});
    if (g) m[gid] = { x: g.x, y: g.y, w: g.w, h: g.h };
    else delete m[gid];
    if (!Object.keys(m).length) delete S.geo[key];
  }

  /** TAG 한 장의 모델 — which: 'cur' 지금 / 'base' 적용본. */
  function modelOf(coilId: string, which: "cur" | "base", pick?: string): Model {
    const st: any = which === "base" ? S.base : S;
    const coil = coilOf(coilId);
    const R = run(coil, st.data);
    pick = pick || S.view.pick || "p0";
    let fid: string | null = null;
    let pi = 0;
    if (pick.startsWith("f:")) fid = pick.slice(2);
    else {
      pi = Math.min(+pick.slice(1) || 0, Math.max(0, R.prints.length - 1));
      fid = R.prints[pi] ? R.prints[pi].form : null;
    }
    if (!fid || !D.forms[fid]) return { R, fid: null, pi, nodes: [], coil, st };
    R.ctx.__fid = fid;
    const sty = st.style[fid] || {};
    const geo = geoOf(st, fid, S.view.size);
    const pw = pageDims(S.view.size).W;
    const nodes = flat(fid).map((n, i) => {
      const o: any = { i, ...n, ...geo[n.gid] };
      if (n.t === "title") {
        o.v = n.n;
        o.info = { src: "title" };
      } else if (n.t === "barcode") {
        o.info = fieldOf(R, "BARCD");
        o.v = o.info.v;
      } else {
        o.info = fieldOf(R, n.n);
        o.v = o.info.v;
      }
      if (n.t === "data") {
        o.fs0 = n.fs || 10;
        o.fs = sty[n.n] || o.fs0;
        if (o.v) {
          const r = overOf(o, o.fs, o.v, pw);
          o.tw = r.w;
          o.over = r.over;
        }
      }
      if (n.t === "image" && o.v) {
        o.src = imgSrc(o.v, st);
        o.ver = imgVer(o.v, st);
      }
      return o as TagNode;
    });
    return { R, fid, pi, nodes, coil, st };
  }
  const sig = (n: any) => n.t + "|" + n.n + "|" + (n.v == null ? "" : n.v) + "|" + (n.fs || "") + "|" + (n.ver || "") + "|" + [n.x, n.y, n.w, n.h].join(",");
  function changedSet(cur: Model, base: Model | null) {
    const s = new Set<string>();
    if (!base || cur.fid !== base.fid) return s;
    cur.nodes.forEach((n, i) => {
      if (n.t !== "title" && n.t !== "line" && sig(n) !== sig(base.nodes[i])) s.add(n.n);
    });
    return s;
  }
  function uniqFields(md: Model) {
    const seen = new Map<string, TagNode>();
    md.nodes.forEach((n) => {
      if (n.t === "title") return;
      if (!seen.has(n.n) || (!seen.get(n.n)!.v && n.v)) seen.set(n.n, n);
    });
    return [...seen.values()];
  }

  // ---- 지금 그림(목업 CUR · BASE) ----
  let CUR: Model = null as unknown as Model;
  let BASE: Model = null as unknown as Model;
  function compute() {
    CUR = modelOf(S.view.coil, "cur");
    BASE = modelOf(S.view.coil, "base");
    CUR.chg = changedSet(CUR, BASE);
    return { CUR, BASE };
  }
  const curNode = (name: string) => CUR.nodes.find((x) => x.n === name && x.v) || CUR.nodes.find((x) => x.n === name);
  const selG = () => (CUR && CUR.fid && S.view.gfid === CUR.fid && S.view.gsel != null ? S.view.gsel : null);

  // ---- TAG 그리기(SVG) ----
  /** opts: { k(px/pt) | mm, sel, chg, names, hit, tint, media, lay, gsel, clash, role, size } */
  function tagSvg(md: Model, opts: any) {
    const { W, H, z } = pageDims(opts.size || S.view.size);
    const headPt = HEAD6 / PT_MM;
    const dim = opts.mm
      ? `width="${(W * PT_MM).toFixed(1)}mm" height="${(H * PT_MM).toFixed(1)}mm"`
      : `width="${Math.round(W * opts.k)}" height="${Math.round(H * opts.k)}"`;
    let o = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" ${dim} role="img" aria-label="TAG ${esc(md.fid || "")}">`;
    o += `<defs><clipPath id="pg"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FBE4E1"/><line x1="0" y1="0" x2="0" y2="8" stroke="#E8A49B" stroke-width="3"/></pattern>
    <pattern id="hatch2" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#F4F6F7"/><line x1="0" y1="0" x2="0" y2="8" stroke="#DDE3E6" stroke-width="2"/></pattern></defs>`;
    o += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
    if (z.fx > 1)
      o += `<rect x="${PAGE.w}" y="0" width="${W - PAGE.w}" height="${Math.min(H, PAGE.h)}" fill="url(#hatch2)"/><text x="${(PAGE.w + W) / 2}" y="${Math.min(H, PAGE.h) - 14}" text-anchor="middle" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#8A969F">늘어난 자리 — 「칸 옮기기」로 칸을 끌어다 채워 봄</text>`;
    if (z.fy > 1) o += `<rect x="0" y="${PAGE.h}" width="${W}" height="${H - PAGE.h}" fill="url(#hatch2)"/>`;
    if (H > headPt)
      o += `<rect x="0" y="${headPt}" width="${W}" height="${H - headPt}" fill="url(#hatch)"/><text x="${W / 2}" y="${headPt + Math.min(26, (H - headPt) / 2 + 6)}" text-anchor="middle" font-family="Malgun Gothic, sans-serif" font-size="15" font-weight="700" fill="#B42318">프린터 헤드 폭(6인치기 168mm) 밖 — 찍히지 않음</text>`;
    o += `<g clip-path="url(#pg)">`;
    for (const n of md.nodes) {
      if (n.t === "line") {
        o += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="none" stroke="#000" stroke-width="${n.lt}"/>`;
        continue;
      }
      if (n.t === "title") {
        o += textEl(n, n.v, n.fs || 10, "#000");
        continue;
      }
      const cls = ["fld"];
      if (opts.sel === n.n) cls.push("sel");
      if (opts.role && opts.role !== "all" && OWNER[(n.info || {}).src] !== opts.role) cls.push("dim");
      if (n.over) cls.push("over");
      if (opts.clash && !opts.lay) {
        const f = (opts.clash as ClashRes).fresh.filter((e) => e.a === n.n || e.b === n.n);
        if (f.length) cls.push(f.some((e) => e.st === "yes") ? "clash" : "clash2");
      }
      const chg = opts.chg && opts.chg.has(n.n);
      let inner = "";
      if (n.t === "data") {
        if (n.v) inner = textEl(n, n.v, n.fs, "#000");
      } else if (n.t === "image") {
        if (n.v && n.src) inner = `<image href="${n.src}" xlink:href="${n.src}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" preserveAspectRatio="none"/>`;
        else if (n.v)
          inner = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="none" stroke="#999" stroke-dasharray="3 2"/><text x="${n.x + 3}" y="${n.y + 11}" font-size="8" fill="#999">${esc(n.v)}</text>`;
      } else if (n.t === "barcode") {
        if (n.v) inner = code39(n.v, n.x, n.y, n.w, n.h * 0.82);
      } else if (n.t === "qrcode") {
        if (n.v) inner = qrSvg(n.v, n.x, n.y, Math.min(n.w, n.h));
      }
      const isEmpty = !inner;
      const attrs = opts.hit ? ` tabindex="0" role="button" aria-label="${esc(itemNm(n.n) + (n.v ? " " + n.v : " 비어 있음"))}"` : "";
      if (isEmpty && !opts.names) {
        if (opts.hit)
          o += `<g class="${cls.join(" ")}" data-f="${esc(n.n)}"${attrs}><rect class="hit" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="transparent" stroke="none"/></g>`;
        continue;
      }
      if (isEmpty && opts.names)
        inner = `<rect x="${n.x + 0.5}" y="${n.y + 0.5}" width="${n.w - 1}" height="${n.h - 1}" fill="none" stroke="#B9C3CA" stroke-dasharray="2 2"/><text x="${n.x + 3}" y="${n.y + Math.min(n.h - 2, 10)}" font-family="Malgun Gothic, sans-serif" font-size="7.5" fill="#9AA6AF">${esc(itemNm(n.n))}</text>`;
      const hb = n.over && n.tw ? hitBox(n) : n;
      const ib = n.t === "data" && n.tw && !isEmpty ? inkBox(n) : hb;
      const bg = chg
        ? `<rect x="${ib.x}" y="${ib.y}" width="${ib.w}" height="${ib.h}" rx="2" fill="#FFC86B" opacity=".8"/>`
        : opts.tint && !isEmpty && SRC_FILL[n.info && n.info.src]
          ? `<rect x="${ib.x}" y="${ib.y}" width="${ib.w}" height="${ib.h}" rx="2" fill="${SRC_FILL[n.info.src]}" opacity=".45"/>`
          : "";
      o += `<g class="${cls.join(" ")}" data-f="${esc(n.n)}"${attrs}>${bg}${inner}<rect class="hit" x="${hb.x}" y="${hb.y}" width="${hb.w}" height="${hb.h}" fill="transparent" stroke="none"/></g>`;
    }
    if (z.fx > 1 && opts.media && opts.media !== "cont") {
      const cut = opts.media === "cut";
      const c = cut ? "#B42318" : "#8A969F";
      o += `<line x1="${PAGE.w}" y1="0" x2="${PAGE.w}" y2="${H}" stroke="${c}" stroke-width="2" stroke-dasharray="7 4"/><text x="${PAGE.w - 6}" y="${H - 8}" text-anchor="end" font-family="Malgun Gothic, sans-serif" font-size="12" font-weight="700" fill="${c}">${cut ? "지금 용지 경계(235mm) — 여기서 다음 장" : "재단 용지라면 여기서 다음 장"}</text>`;
    }
    if (opts.lay) o += layOverlay(md, opts.k, opts.gsel, opts.clash, opts.guides);
    o += `</g></svg>`;
    return o;
  }
  /** 칸 옮기기 — 칸(상자)마다 끌 수 있는 겉선. */
  function layGroups(md: Model) {
    const m = new Map<number, Geo & { gid: number; over: boolean }>();
    for (const n of md.nodes) {
      if (n.gid < 0) continue;
      const g = m.get(n.gid);
      if (!g) m.set(n.gid, { gid: n.gid, x: n.x, y: n.y, w: n.w, h: n.h, over: !!n.over });
      else if (n.over) g.over = true;
    }
    return [...m.values()];
  }
  function layOverlay(md: Model, k: number, gsel: number | null, cl: ClashRes | null, guides?: [string, number][]) {
    const moved = new Set(Object.keys(geoOf(S, md.fid!, S.view.size)).map(Number));
    const bad = new Set<number>();
    const warn = new Set<number>();
    (cl ? cl.fresh : []).forEach((e) => {
      const t = e.st === "yes" ? bad : warn;
      t.add(e.ga);
      t.add(e.gb);
    });
    const gs = layGroups(md).sort((a, b) => b.w * b.h - a.w * a.h);
    let o = gs
      .map(
        (g) =>
          `<rect class="gbox ${moved.has(g.gid) ? "moved" : ""} ${bad.has(g.gid) ? "clash" : warn.has(g.gid) ? "clash2" : ""} ${g.gid === gsel ? "sel" : ""}" data-g="${g.gid}" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}"/>`,
      )
      .join("");
    const s = gs.find((g) => g.gid === gsel);
    if (s) {
      const r = 4 / (k || 1);
      const pts: Record<string, [number, number]> = {
        nw: [s.x, s.y], n: [s.x + s.w / 2, s.y], ne: [s.x + s.w, s.y], e: [s.x + s.w, s.y + s.h / 2],
        se: [s.x + s.w, s.y + s.h], s: [s.x + s.w / 2, s.y + s.h], sw: [s.x, s.y + s.h], w: [s.x, s.y + s.h / 2],
      };
      o += Object.entries(pts)
        .map(([h, [x, y]]) => `<rect class="hdl" data-h="${h}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`)
        .join("");
    }
    const { W, H } = pageDims(S.view.size);
    const gl = (guides || [])
      .map(([ax, at]) => (ax === "x" ? `<line class="guide-l" x1="${at}" y1="0" x2="${at}" y2="${H}"/>` : `<line class="guide-l" x1="0" y1="${at}" x2="${W}" y2="${at}"/>`))
      .join("");
    return o + `<g>${gl}</g>`;
  }

  // ---- 조건을 말로 ----
  function colLabel(k: string) {
    if (k[0] === "@") {
      const d = DEFS.find((x: any) => x.name === k.slice(1));
      return d ? d.label : k.slice(1);
    }
    const c = D.COLS[k];
    if (c) return c.label;
    const at = k.indexOf("@");
    if (at > 0) {
      const b = D.COLS[k.slice(0, at)];
      return (b ? b.label : k.slice(0, at)) + " 일부 자리";
    }
    return k;
  }
  function valName(k: string, v: string) {
    const c = D.COLS[k];
    const m = c && c.m && M[c.m];
    return m && m[v] ? m[v] : v;
  }
  function consText(k: string, v: Cons | undefined) {
    if (!v) return "";
    if (v.b !== undefined) return v.b ? "예" : "아니오";
    const out: string[] = [];
    if (v.in) out.push(v.in.map((x) => valName(k, x)).join(" / "));
    if (v.notin) out.push("≠ " + v.notin.map((x) => valName(k, x)).join(" / "));
    if (v.pre) out.push(v.pre.map((p) => p + "…").join(" / "));
    if (v.notpre) out.push("≠ " + v.notpre.map((p) => p + "…").join(" / "));
    if (v.ge !== undefined) out.push(v.ge + " 이상");
    if (v.gt !== undefined) out.push(v.gt + " 초과");
    if (v.le !== undefined) out.push(v.le + " 이하");
    if (v.lt !== undefined) out.push(v.lt + " 미만");
    if (v.nn) out.push("(값 있음)");
    if (v.isnull) out.push("(값 없음)");
    return out.join(" · ");
  }
  /** 조건 → [이름, 값] 쌍(화면이 값만 굵게). 비면 빈 배열(= 모든 코일). */
  function condParts(c: Record<string, Cons> | null | undefined): [string, string][] {
    return Object.keys(c || {}).map((k) => [colLabel(k), consText(k, c![k])]);
  }
  const condText = (c: Record<string, Cons> | null | undefined) => {
    const ps = condParts(c);
    return ps.length ? ps.map(([a, b]) => `${a} ${b}`).join(" · ") : "조건 없음 — 모든 코일";
  };

  // ---- 사용 범위(영향) — 예시 코일 + 무작위 가상 코일 1,200건 ----
  let SAMPLE: Coil[] | null = null;
  function sample() {
    if (SAMPLE) return SAMPLE;
    const rnd = mulberry32(2026);
    const P = D.pools;
    const pick = (arr: [string, number][]) => {
      let x = rnd() * arr.reduce((a, e) => a + e[1], 0);
      for (const [v, w] of arr) if ((x -= w) < 0) return v;
      return arr[arr.length - 1][0];
    };
    const out: Coil[] = [];
    for (let i = 0; i < 1200; i++) {
      const nat = pick(P.NAT_CD);
      const shp = pick(P.SHP);
      const spec: any = pick(P.SPEC);
      const cus = pick(P.CUS);
      const fnl = pick(P.FNL);
      const opg = pick(P.OP_GRD);
      const c: Coil = Object.assign(clone(COILS[0]), {
        NAT_CD: nat, FLOW_CHL: nat === "KR" ? "11" : "21", PRD_NM_CD: pick(P.PRD_NM_CD), OP_GRD: opg, COIL_SHP: shp, PRD_SHP: shp, CCL_BOM_NO: pick(P.CCL_BOM_NO), MTL_CD: pick(P.MTL_CD),
        TAG_SIZ: pick(P.TAG_SIZ), ORD_EXC_THK: pick(P.ORD_EXC_THK), SPC_FUL_NM: spec[0], SPC_AVR: spec[1],
        CUS_CD: nat === "IN" && rnd() < 0.4 ? "200454" : nat === "TH" && rnd() < 0.5 ? "205342" : cus,
        ACT_CUS_CD: cus, FNL_CUS_CD: fnl || cus, STD_MRK: pick(P.STD_MRK), ORD_TEM_CD: nat === "VN" ? pick(P.ORD_TEM_CD) : "", GW_ASG_CD: pick(P.GW_ASG_CD), PUB_REQ: pick(P.PUB_REQ),
        ENT_EXIT_TP: pick(P.ENT_EXIT_TP),
      });
      if (c.ENT_EXIT_TP === "E") c.ENT_RJT = rnd() < 0.7;
      c.COIL_ID = "";
      out.push(c);
    }
    return (SAMPLE = out);
  }
  const allCoils = () => COILS.map((c) => coilOf(c.id)).concat(sample());
  let USE: { n: number; lic: Record<string, number>; std: Record<string, number>; cus: Record<string, number>; form: Record<string, number> } | null = null;
  let USEkey = "";
  /** 어느 인증서 · 규격 · 고객 줄을 몇 코일이 쓰나 — 쓰는 관계가 바뀔 때만 다시 센다. */
  function usage() {
    const key = JSON.stringify([S.data.lic.map((r) => r.r.STD), S.data.cus.map((r) => [r.uid, r.prio, r.c, Object.keys(r.r)]), S.facts]);
    if (USE && USEkey === key) return USE;
    const lic: Record<string, number> = {};
    const std: Record<string, number> = {};
    const cus: Record<string, Set<string>> = {};
    const form: Record<string, number> = {};
    const list = allCoils();
    for (const c of list) {
      const R = run(c, S.data);
      for (const f of new Set(R.prints.map((p) => p.form).filter(Boolean))) form[f] = (form[f] || 0) + 1;
      if (R.ce.lic) lic[R.ce.lic.r.ID] = (lic[R.ce.lic.r.ID] || 0) + 1;
      if (R.ce.std) std[R.ce.std.r.ID] = (std[R.ce.std.r.ID] || 0) + 1;
      for (const k in R.cus.from) {
        const u = R.cus.from[k];
        (cus[u] = cus[u] || new Set()).add(c.COIL_ID);
      }
    }
    const cusN: Record<string, number> = {};
    for (const u in cus) cusN[u] = cus[u].size;
    USEkey = key;
    return (USE = { n: list.length, lic, std, cus: cusN, form });
  }
  const useTxt = (n: number) =>
    n ? `시험용 가상 코일 ${usage().n.toLocaleString()}건 중 ${n.toLocaleString()}건의 TAG 가 이 값을 씁니다` : "시험용 가상 코일 중에는 이 값을 쓰는 TAG 가 없습니다";
  /** 코일 하나의 모든 TAG 칸 서명(적용본 · 지금 비교용). */
  function tagSigs(coil: Coil, st: any) {
    const R = run(coil, st.data);
    const out: string[] = [];
    R.prints.forEach((p) => {
      if (!p.form || !D.forms[p.form]) return;
      const sty = st.style[p.form] || {};
      const geo = geoOf(st, p.form, "std");
      flat(p.form).forEach((n) => {
        const g = geo[n.gid];
        const at = g ? "~" + [g.x, g.y, g.w, g.h].join(",") : "";
        if (n.t === "title" || n.t === "line") {
          if (at) out.push(p.form + ":" + n.t + n.gid + at);
          return;
        }
        const info = n.t === "barcode" ? fieldOf(R, "BARCD") : fieldOf(R, n.n);
        out.push(p.form + ":" + n.n + "=" + info.v + (n.t === "data" ? "@" + (sty[n.n] || n.fs) : n.t === "image" && info.v ? "#" + imgVer(info.v, st) : "") + at);
      });
    });
    return out.join("\n");
  }
  function impact() {
    const cur = { data: S.data, style: S.style, geo: S.geo, imgs: S.imgs };
    const coils = COILS.map((c) => ({ id: c.id as string, name: c.name as string, changed: tagSigs(coilOf(c.id), S.base) !== tagSigs(coilOf(c.id), cur) }));
    let n = 0;
    for (const c of sample()) if (tagSigs(c, S.base) !== tagSigs(c, cur)) n++;
    return { coils, sample: { total: 1200, changed: n }, changedCoils: coils.filter((c) => c.changed) };
  }
  /** 승인 메모 — 바꾼 것 앞 두 건 + 영향 수. */
  function changesNote() {
    const ch = changes();
    const imp = impact();
    return (ch.length ? ch.slice(0, 2).map((c) => c.what).join(", ") + (ch.length > 2 ? " 외 " + (ch.length - 2) + "건" : "") : "변경") + " · 가상 코일 1,200건 중 " + imp.sample.changed + "건 영향";
  }

  // ---- 바꾼 것 목록 ----
  const sameAsBase = () =>
    JSON.stringify({ data: S.data, style: S.style, geo: S.geo, imgs: S.imgs }) ===
    JSON.stringify({ data: S.base.data, style: S.base.style, geo: S.base.geo || {}, imgs: S.base.imgs });
  function changes(): Change[] {
    const out: Change[] = [];
    const B = S.base;
    for (const kind of ["lic", "std"] as const) {
      const F = kind === "lic" ? LIC_F : STD_F;
      for (const r of S.data[kind]) {
        const b = B.data[kind].find((x) => x.uid === r.uid);
        if (!b) continue;
        for (const col in F)
          if (String(r.r[col] || "") !== String(b.r[col] || ""))
            out.push({ id: kind + "|" + r.uid + "|" + col, who: kind === "lic" ? "인증서 · 품질" : "규격 · 품질", what: `${r.r.ID} ${F[col]}`, from: b.r[col], to: r.r[col], go: kind + "|" + r.r.ID });
      }
    }
    for (const r of S.data.cus) {
      const b = B.data.cus.find((x) => x.uid === r.uid);
      if (!b) {
        out.push({
          id: "cusadd|" + r.uid,
          who: "고객 요청 · 영업",
          what: "새 줄 — " + condText(r.c),
          to: Object.entries(r.r)
            .map(([k, v]) => itemNm(k) + " = " + (v === NONE ? "(숨김)" : v))
            .join(", "),
          go: "cus|" + r.uid,
        });
        continue;
      }
      for (const k of new Set(Object.keys(r.r).concat(Object.keys(b.r))))
        if (String(r.r[k] == null ? "" : r.r[k]) !== String(b.r[k] == null ? "" : b.r[k]))
          out.push({ id: "cus|" + r.uid + "|" + k, who: "고객 요청 · 영업", what: `#${r.prio} ${itemNm(k)}`, from: b.r[k], to: r.r[k], go: "cus|" + r.uid });
    }
    for (const b of B.data.cus)
      if (!S.data.cus.some((r) => r.uid === b.uid))
        out.push({
          id: "cusdel|" + b.uid,
          who: "고객 요청 · 영업",
          what: "줄 삭제 — " + condText(b.c),
          from: Object.entries(b.r)
            .map(([k, v]) => itemNm(k) + " = " + v)
            .join(", "),
        });
    for (const fid of new Set(Object.keys(S.style).concat(Object.keys(B.style)))) {
      const a = S.style[fid] || {};
      const b = B.style[fid] || {};
      for (const k of new Set(Object.keys(a).concat(Object.keys(b))))
        if (a[k] !== b[k])
          out.push({ id: "fs|" + fid + "|" + k, who: "양식 · IT", what: `${fid} ${itemNm(k)} 글자 크기`, from: (b[k] || "기본") + (b[k] ? "pt" : ""), to: (a[k] || "기본") + (a[k] ? "pt" : "") });
    }
    for (const f of new Set(Object.keys(S.imgs).concat(Object.keys(B.imgs))))
      if (imgVers(f, S).length !== imgVers(f, B).length) out.push({ id: "img|" + f, who: "마크 · 품질", what: f + " 새 버전", from: "v" + imgVer(f, B), to: "v" + imgVer(f, S) });
    for (const key of new Set(Object.keys(S.geo).concat(Object.keys(B.geo || {})))) {
      const a = S.geo[key] || {};
      const b = (B.geo || {})[key] || {};
      const [fid, size] = key.split("@");
      const where = fid + (size ? " (" + sizeOf(size).nm + " 배치)" : "");
      for (const gid of new Set(Object.keys(a).concat(Object.keys(b))))
        if (JSON.stringify(a[gid]) !== JSON.stringify(b[gid])) {
          const orig = flat(fid).find((n) => n.gid === +gid);
          out.push({ id: "geo|" + key + "|" + gid, who: "양식 · IT", what: `${where} ${gName(fid, +gid)} 위치 · 크기`, from: geoTxt(b[gid] || orig), to: geoTxt(a[gid] || orig) });
        }
    }
    return out;
  }
  /** 바꾼 것 하나 되돌리기 — store.edit 안에서 부른다. */
  function revertChange(id: string) {
    const p = id.split("|");
    const B = S.base;
    if (p[0] === "lic" || p[0] === "std") {
      const k = p[0] as "lic" | "std";
      const r = S.data[k].find((x) => x.uid === p[1]);
      const b = B.data[k].find((x) => x.uid === p[1]);
      if (r && b) r.r[p[2]] = b.r[p[2]];
    } else if (p[0] === "cusadd") S.data.cus = S.data.cus.filter((r) => r.uid !== p[1]);
    else if (p[0] === "cusdel") S.data.cus.push(clone(B.data.cus.find((r) => r.uid === p[1])!));
    else if (p[0] === "cus") {
      const r = S.data.cus.find((x) => x.uid === p[1]);
      const b = B.data.cus.find((x) => x.uid === p[1]);
      if (r && b) {
        if (b.r[p[2]] === undefined) delete r.r[p[2]];
        else r.r[p[2]] = b.r[p[2]];
      }
    } else if (p[0] === "fs") {
      const b = (B.style[p[1]] || {})[p[2]];
      const a = (S.style[p[1]] = S.style[p[1]] || {});
      if (b === undefined) delete a[p[2]];
      else a[p[2]] = b;
      if (!Object.keys(a).length) delete S.style[p[1]];
    } else if (p[0] === "img") {
      const b = imgVers(p[1], B);
      if (b.length) S.imgs[p[1]] = clone(b);
      else delete S.imgs[p[1]];
    } else if (p[0] === "geo") setGeo(p[1], +p[2], ((B.geo || {})[p[1]] || {})[p[2]]);
  }

  // ---- 코일 목록 · 양식 35종 ----
  type Meta = { forms: string[]; scheme: string | null; cus: boolean; none: boolean };
  let METAkey = "";
  let METAS: Map<string, Meta> | null = null;
  let FC: Record<string, { id: string; i: number }[]> | null = null;
  /** 예시 코일마다 찍는 양식 · 인증 제도 · 고객 요청 여부 — 기준값 표 · 코일 조건이 바뀔 때만 다시 센다. */
  function metas() {
    const key = JSON.stringify([S.data, S.facts]);
    if (key !== METAkey) {
      METAkey = key;
      METAS = null;
      FC = null;
    }
    if (!METAS) {
      METAS = new Map();
      for (const c of COILS) {
        const R = run(coilOf(c.id), S.data);
        METAS.set(c.id, { forms: R.prints.map((p) => p.form).filter(Boolean), scheme: R.ce.lic ? R.ce.lic.r.SCHEME : null, cus: Object.keys(R.cus.vals).length > 0, none: !R.prints.length });
      }
    }
    return METAS;
  }
  const coilMeta = (id: string) => metas().get(id) || { forms: [], scheme: null, cus: false, none: true };
  const n12 = (f: string) => {
    const m = /12개월 ([\d,]+)건/.exec((D.forms[f] || ({} as any)).status || "");
    return m ? +m[1].replace(/,/g, "") : null;
  };
  function formCoils() {
    metas(); // 캐시 키 맞추기
    if (FC) return FC;
    const out: Record<string, { id: string; i: number }[]> = {};
    COILS.forEach((c) =>
      run(coilOf(c.id), S.data).prints.forEach((p, i) => {
        if (p.form) {
          const l = (out[p.form] = out[p.form] || []);
          if (!l.some((x) => x.id === c.id)) l.push({ id: c.id, i });
        }
      }),
    );
    return (FC = out);
  }
  function formRoute(f: string, fc: Record<string, unknown[]>): { k: string; t: string; why?: string } {
    if (fc[f]) return { k: "rule", t: "규칙 · 예시 " + fc[f].length };
    const fr = T.form.rows.find((r) => r.r.FORM === f);
    if (fr) {
      const pt = fr.c.PRINT_TYPE;
      return {
        k: "norow",
        t: "규칙 행 없음",
        why: `양식 표에는 있으나 발행유형 ${((pt && pt.in) || []).join(" · ")}을(를) 만드는 태그유형 규칙이 없음 — ${(FI[f] || {}).how ? "현행 발행 경로: " + FI[f].how : "현행에서 어디서 오는지 확인 필요"}`,
      };
    }
    const how = (FI[f] || {}).how || "";
    return /폐기/.test(how) ? { k: "dead", t: "폐기 후보", why: how } : { k: "out", t: "규칙 밖", why: how };
  }
  /** 양식 목록에서 고름 — 규칙으로 고르는 코일이 있으면 그 코일 · 그 장, 없으면 예시 코일 값을 넣어 봄. */
  function formTarget(f: string): { coil: string; pick: string } {
    const fc = formCoils()[f];
    if (fc) {
      const hit = fc.find((x) => x.id === S.view.coil) || fc[0];
      return { coil: hit.id, pick: "p" + hit.i };
    }
    const fb = FI[f].fb || (/^(FS|BS)/.test(f) ? "F01" : "S17");
    return { coil: fb, pick: "f:" + f };
  }

  // ---- 보는 사람 · 운영 실제 TAG 와 비교 ----
  const roleOk = (src: string) => !S.view.role || S.view.role === "all" || OWNER[src] === S.view.role;
  const goldKey = (g: any) => g.k + "|" + g.prod + "|" + g.neu;
  const goldGroups = (): any[] => (GOLD ? GOLD.groups.filter((g: any) => roleOk(g.src)) : []);
  const goldOpen = () => goldGroups().filter((g) => !(S.review[goldKey(g)] || {}).v).length;
  const XMAP = new Map<string, string>();
  /** 운영 실제 코일을 화면에 올림. */
  function exCoil(ex: any) {
    const key = JSON.stringify(ex);
    if (XMAP.has(key)) return XMAP.get(key)!;
    const id = "X" + String(XMAP.size + 1).padStart(3, "0");
    const a = D.act[ex.coilId] || {};
    const c: Coil = {
      ...ex,
      id,
      grp: "real",
      COIL_ID: ex.coilId || "",
      act: a.f ? ex.coilId : null,
      TAG_DST: a.dst || "",
      RMTL_HEAT_NO: ((a.f && (Object.values(a.f)[0] as any)) || { v: {} }).v.HEAT_NO || "",
    };
    delete c.n;
    delete c.coilId;
    GENMAP.set(id, c);
    XMAP.set(key, id);
    return id;
  }
  /** 코일 · 양식으로 가기 위한 pick 값. */
  function pickFor(id: string, form: string) {
    const R = run(coilOf(id), S.data);
    const i = R.prints.findIndex((p) => p.form === form);
    return i >= 0 ? "p" + i : "f:" + form;
  }
  function goldWhy(g: any) {
    if (g.src === "else")
      return g.prod
        ? "새 규칙 표에 이 칸을 정하는 규칙이 없어 기본값이 찍힙니다. 현행에는 규칙이 있습니다 — 옮겨야 하는 규칙인지 판정해 주세요."
        : "현행은 비워 찍고 새 규칙은 기본값을 찍습니다.";
    return g.src === "cus" ? "고객 요청 줄의 값이 현행과 다릅니다." : "인증 · 규격 규칙의 값이 현행과 다릅니다.";
  }

  // ---- 결정 카드 — 이 칸에 나올 수 있는 값 전부 ----
  function refText(v: any) {
    if (v === NONE) return "(비워 찍음)";
    return String(v)
      .replace(/\{(규격|인증):(?:[^}:]+:)?([^}]+)\}/g, (_m, k: string, f: string) => `‹${k === "규격" ? "규격" : "인증서"}의 ${(k === "규격" ? STD_F[Engine.STD_REF[f]] : LIC_F[Engine.LIC_REF[f]]) || f}›`)
      .replace(/\{고객명:([^}]+)\}/g, (_m, c: string) => M.CUS[c] || c)
      .replace(/\{식:[^}]*\}/g, "‹계산식›")
      .replace(/\{([A-Z_:]+)\}/g, (_m, c: string) => "‹" + ((D.COLS[c] || ({} as any)).label || c) + "›");
  }
  function decisionRows(name: string): DecRow[] {
    const rows: DecRow[] = [];
    S.data.cus
      .slice()
      .sort((a, b) => a.prio - b.prio)
      .forEach((r) => {
        if (r.r[name] !== undefined) rows.push({ src: "cus", uid: r.uid, c: r.c, v: r.r[name], note: r.note });
      });
    Engine.sortRows(Engine.activeDisp(T.disp.rows)).forEach((r) => {
      if (r.r[name] !== undefined && r.r[name] !== "") rows.push({ src: "disp", uid: r.uid, c: r.c, v: r.r[name], note: r.note });
    });
    if (T.display)
      Engine.sortRows(T.display.rows).forEach((r) => {
        if (r.r[name] !== undefined && r.r[name] !== "") rows.push({ src: "show", uid: r.uid, c: r.c, v: r.r[name], note: r.note });
      });
    if (!rows.length) return rows;
    const e = String((D.items[name] || {}).e || "").trim();
    const m = /^'([^']*)'$/.exec(e);
    rows.push({ src: "else", uid: "else", c: null, v: m ? m[1] : null });
    return rows;
  }
  const genFor = (r: DecRow) => (r.uid !== "else" ? GEN.find((g) => g.why === (r.src === "cus" ? "cus:" : "disp:") + r.uid) : undefined);

  // ---- 칸 목록 ----
  const GDIFF: Record<string, number> = {};
  (GOLD ? GOLD.groups : []).forEach((g: any) =>
    Object.entries(g.forms || {}).forEach(([f, n]) => {
      const k = g.k + "@" + f;
      GDIFF[k] = (GDIFF[k] || 0) + (n as number);
    }),
  );
  const gdiff = (k: string, fid: string) => GDIFF[k + "@" + fid] || 0;
  const inGold = (k: string) => !!(GOLD && GOLD.fields.includes(k));
  function migOf(r: any, fid: string) {
    if (r.pl.length) return { k: "moved", t: "옮김", d: "새 규칙 표의 줄로 옮겼습니다" };
    if (r.k === "STD_MRK" && /^std_/.test(r.v)) return { k: "same", t: "재현됨", d: "규격 마크 코드 → 마크 그림 연결(시뮬레이터에 들어 있음)" };
    if (/폐기/.test(r.to + r.st)) return { k: "drop", t: "없앰", d: "쓰지 않는 규칙으로 판단 — 옮기지 않음" };
    if (/파생속성|원천 데이터/.test(r.to)) return { k: "fact", t: "코일 조건으로", d: "MES가 보내는 값 · 파생 조건으로 넘김" };
    if (gdiff(r.k, fid)) return { k: "gap", t: "아직 안 옮김", d: "운영 2주 비교에서 이 칸이 현행과 다름 — 이 규칙이 새 규칙 표에 없음" };
    if (inGold(r.k)) return { k: "same", t: "재현됨", d: "옮긴 곳 기록은 없지만 운영 2주 비교에서 이 칸이 현행과 모두 같음" };
    if (/템플릿/.test(r.to)) return { k: "tpl", t: "양식 서식으로", d: "값 서식 · 단위 · 고정 글자 — 차세대 양식(템플릿)이 처리할 몫. 이 시뮬레이터는 예시값" };
    return { k: "chk", t: "확인 필요", d: "옮긴 곳 기록이 없고 운영 비교 대상도 아닌 칸" };
  }
  /** 현행 조건 글 — 컬럼 코드를 화면 이름으로. */
  const sqlText = (s: string) => String(s || "").replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, (w) => (D.COLS[w] ? D.COLS[w].label : w));
  function fmapRows(md: Model): FmapRow[] {
    const fillG = (GOLD && GOLD.fill && GOLD.fill[md.fid!]) || null;
    return uniqFields(md)
      .filter((n) => n.t !== "line")
      .map((n) => {
        const nm = n.n || (n.t === "barcode" ? "BARCD" : "?");
        const dr = decisionRows(nm);
        const cr = RULES.filter((r) => r.k === nm).map((r) => ({ mig: migOf(r, md.fid!), ...r }));
        const gap = cr.filter((r) => r.mig.k === "gap").length;
        const chk = cr.filter((r) => r.mig.k === "chk").length;
        const tpl = cr.filter((r) => r.mig.k === "tpl").length;
        const info = n.info || { src: "none" };
        const lit = /^'([^']*)'$/.exec(String((D.items[nm] || {}).e || "").trim());
        let w: { k: string; t: string; s: string };
        if (dr.length) {
          const el = dr[dr.length - 1];
          w = { k: "rule", t: `조건 따라 — 규칙 ${dr.length - 1}줄`, s: el.v == null ? "안 맞으면 MES 값 · 빈칸" : el.v === NONE ? "안 맞으면 비움" : `안 맞으면 「${el.v}」` };
        } else if (gap) w = { k: "gap", t: "조건 따라 — 현행 규칙만", s: "새 규칙 표에 없음" };
        else if (chk) w = { k: "chk", t: "조건 따라 — 확인 필요", s: `현행 규칙 ${chk}개가 새 표와 연결 안 됨 · 화면은 예시값` };
        else if (tpl) w = { k: "tpl", t: "조건 따라 — 양식 서식", s: `현행 규칙 ${cr.length}개 · 화면은 예시값` };
        else if (info.src === "fact" || cr.some((r) => r.mig.k === "fact"))
          w = { k: "fact", t: "MES 값", s: cr.length ? `현행 조건 ${cr.length}개 — 코일 조건으로 옮김` : "값이 있으면 찍힘" };
        else if (lit || info.src === "else") w = { k: "fixed", t: "항상 같은 값", s: lit ? `「${lit[1]}」` : info.why || "" };
        else w = { k: "none", t: "값 없음", s: "이 양식에선 늘 빈칸" };
        const fl = fillG && fillG.f[nm];
        return { n, nm, dr, cr, gap, chk, w, fl: fl || null, fn: fillG ? fillG.n : 0 };
      });
  }

  // ---- 같이 찍히면 겹치는 칸 — 규칙 조건으로 판정 ----
  function satKey(key: string, list: Cons[]): { ok: boolean; v?: any; show?: any } {
    const bs = list.filter((c) => c.b !== undefined);
    if (bs.length) return bs.every((c) => c.b === bs[0].b) ? { ok: true, show: bs[0] } : { ok: false };
    if (key === "ANY_CUS") {
      const ins = ([] as string[]).concat(...list.filter((c) => c.in).map((c) => c.in!));
      const outs = ([] as string[]).concat(...list.filter((c) => c.notin).map((c) => c.notin!));
      const left = ins.filter((v) => !outs.some((o) => Engine.cellMatch("X", { in: [o] }, { X: v })));
      return ins.length && !left.length ? { ok: false } : { ok: true, v: left[0], show: Object.assign({}, ...list) };
    }
    const isnull = list.some((c) => c.isnull);
    const other = list.filter((c) => !c.isnull);
    if (isnull) return other.length ? { ok: false } : { ok: true, v: null, show: { isnull: true } };
    const okv = (v: any) => list.every((c) => Engine.cellMatch("X", c, { X: v }));
    const ins = list.filter((c) => c.in);
    if (ins.length) {
      const cand = ins[0].in!.filter((v) => okv(v));
      return cand.length ? { ok: true, v: cand[0], show: { in: cand } } : { ok: false };
    }
    const pres = list.filter((c) => c.pre);
    if (pres.length) {
      let heads = pres[0].pre!.slice();
      for (const c of pres.slice(1))
        heads = ([] as string[]).concat(...heads.map((h) => c.pre!.filter((p) => p.startsWith(h) || h.startsWith(p)).map((p) => (p.length > h.length ? p : h))));
      const v = heads.map((h) => h + "X").find(okv) || heads.find(okv);
      return v ? { ok: true, v, show: { pre: heads } } : heads.length && list.some((c) => c.notpre) ? { ok: false } : heads.length ? { ok: true, show: { pre: heads } } : { ok: false };
    }
    let lo = -Infinity;
    let hi = Infinity;
    for (const c of list) {
      if (c.ge !== undefined) lo = Math.max(lo, c.ge);
      if (c.gt !== undefined) lo = Math.max(lo, c.gt + 1e-6);
      if (c.le !== undefined) hi = Math.min(hi, c.le);
      if (c.lt !== undefined) hi = Math.min(hi, c.lt - 1e-6);
    }
    if (lo > hi) return { ok: false };
    const v = isFinite(lo) ? String(Math.round(lo * 1000) / 1000) : isFinite(hi) ? String(hi) : undefined;
    return { ok: true, v, show: Object.assign({}, ...list) };
  }
  function satAll(conds: (Record<string, Cons> | null)[], showOf?: (Record<string, Cons> | null)[]): { ok: boolean; bad?: string; vals?: Record<string, any>; show?: Record<string, Cons> } {
    const by: Record<string, Cons[]> = {};
    conds.forEach((c) => {
      for (const k in c || {}) (by[k] = by[k] || []).push(c![k]);
    });
    const vals: Record<string, any> = {};
    const show: Record<string, Cons> = {};
    for (const k in by) {
      const r = satKey(k, by[k]);
      if (!r.ok) return { ok: false, bad: k };
      if (r.v !== undefined) vals[k] = r.v;
      if (k !== "STD_ID" && (!showOf || showOf.some((c) => c && c[k]))) show[k] = r.show;
    }
    return { ok: true, vals, show };
  }
  const ALWAYS = new Set(
    ["COIL_ID", "COIL_NO", "BARCD", "SIZ", "WGT", "NWGT", "GWGT", "WGT_TTL", "WGT_UNT", "LTH_SHT", "LTH_SHT_UNT", "MAN_DD", "PRD_CD", "COATG_TTL", "COATG", "INSR", "PAK_MTH", "MADEIN", "STL_KND"].filter(
      (n) => COILS.every((c) => fact(n, coilOf(c.id))),
    ),
  );
  let PATHC = new Map<string, any[]>();
  let PATHkey = "";
  function certPaths(c: Record<string, Cons>, v: string) {
    const sc: any = c.CERT_SCHEME;
    const sid: any = c.STD_ID;
    const res = (s: string | null, lic: Row | null) => Engine.resolveRefs(v, { std: S.data.std, lic: S.data.lic }, { std: s ? S.data.std.find((r) => r.r.ID === s) || null : null, lic });
    if (!sc && !sid) return [{ c, v: /\{(규격|인증):/.test(v) ? res(CUR.R.ce.std && CUR.R.ce.std.r.ID, CUR.R.ce.lic) || v : v }];
    const out: any[] = [];
    const seen = new Set<string>();
    for (const a of T.apply.rows) {
      const s = a.r.STD_ID;
      if (!s || a.r.CERT === NONE) continue;
      const lic = Engine.licOf(S.data.lic, s);
      if (sc && !(lic && Engine.cellMatch("X", sc, { X: lic.r.SCHEME }))) continue;
      if (sid && !Engine.cellMatch("X", sid, { X: s })) continue;
      const cc = { ...c, ...a.c, STD_ID: { in: [s] } };
      const key = JSON.stringify(cc);
      if (seen.has(key)) continue;
      seen.add(key);
      const rv = res(s, lic);
      if (rv !== undefined) out.push({ c: cc, v: rv });
    }
    return out;
  }
  function pathsOf(name: string) {
    const key = JSON.stringify([S.data, CUR.R.ce.std && CUR.R.ce.std.r.ID]);
    if (key !== PATHkey) {
      PATHC = new Map();
      PATHkey = key;
    }
    if (PATHC.has(name)) return PATHC.get(name)!;
    const out: any[] = [];
    S.data.cus.forEach((r) => {
      const v = r.r[name];
      if (v !== undefined && v !== "" && v !== NONE) out.push({ c: r.c, v, src: "cus" });
    });
    Engine.sortRows(Engine.activeDisp(T.disp.rows)).forEach((r) => {
      const v = r.r[name];
      if (v !== undefined && v !== "" && v !== NONE) certPaths(r.c, v).forEach((p) => out.push({ ...p, src: "disp" }));
    });
    if (T.display)
      Engine.sortRows(T.display.rows).forEach((r) => {
        const v = r.r[name];
        if (v !== undefined && v !== "" && v !== NONE) out.push({ c: r.c, v, src: "show" });
      });
    if (name === "STD_MRK") Object.entries(STDMRK_IMG).forEach(([k, img]) => out.push({ c: { STD_MRK: { in: [k] } }, v: img, src: "else" }));
    const e = String((D.items[name] || {}).e || "").trim();
    const lit = /^'([^']*)'$/.exec(e);
    const fv = fact(name, CUR.R.ctx);
    if (fv !== undefined) out.push({ c: {}, v: fv || fact(name, coilOf(COILS[0].id)) || "0000000000", src: "fact", always: ALWAYS.has(name) });
    else if (lit && lit[1]) out.push({ c: {}, v: lit[1], src: "else", always: true });
    PATHC.set(name, out);
    return out;
  }
  function inkOf(n: any, v: any, sty: Record<string, number>): Geo {
    if (n.t === "data" || n.t === "title") {
      const fs = (n.t === "data" && sty[n.n]) || n.fs || 10;
      return inkBox({ ...n, fs, tw: textW(String(Engine.fill(v, CUR.R.ctx)), n, fs) });
    }
    if (n.t === "qrcode") {
      const s = Math.min(n.w, n.h);
      return { x: n.x, y: n.y, w: s, h: s };
    }
    if (n.t === "barcode") return { x: n.x, y: n.y, w: n.w, h: n.h * 0.82 };
    return { x: n.x, y: n.y, w: n.w, h: n.h };
  }
  const clashNm = (fid: string, k: string) => (/^t\d+$/.test(k) ? "「" + String(flat(fid)[+k.slice(1)].n).trim().slice(0, 16) + "」 글자" : itemNm(k));
  function withVals(base: Coil, vals: Record<string, any>) {
    const c: Coil = { ...base };
    for (const k in vals) {
      if (k[0] === "@" || CTXK.has(k)) continue;
      const v = vals[k];
      if (k === "ANY_CUS") {
        if (v != null) c.CUS_CD = v;
        continue;
      }
      const at = k.indexOf("@");
      if (at > 0) {
        const col = k.slice(0, at);
        const [p, l] = k
          .slice(at + 1)
          .split(",")
          .map(Number);
        let s = String(c[col] == null ? "" : c[col]);
        if (v == null) continue;
        if (p > 0) {
          while (s.length < p - 1) s += "0";
          s = s.slice(0, p - 1) + v + s.slice(p - 1 + (l || v.length));
        } else s = s.slice(0, Math.max(0, s.length + p)) + v;
        c[col] = s;
        continue;
      }
      if (v === null) delete c[k];
      else c[k] = v;
    }
    if (vals.PRD_SHP !== undefined && vals.COIL_SHP === undefined) c.COIL_SHP = vals.PRD_SHP;
    if (vals.COIL_SHP !== undefined && vals.PRD_SHP === undefined) c.PRD_SHP = vals.COIL_SHP;
    return c;
  }
  const valOf = (R: RunResult, u: any) => (u.t === "title" ? String(u.n) : fieldOf(R, u.k).v);
  const CLASHC = new Map<string, any>();
  function clashScan(fid: string, size: string): ClashRes {
    const geo = geoOf(S, fid, size);
    const sty = S.style[fid] || {};
    const moved = Object.keys(geo).length || Object.keys(sty).length;
    const key = JSON.stringify([size, geo, sty, S.data]);
    const hit = CLASHC.get(fid);
    if (hit && hit.key === key) return hit.res;
    const fc = T.form.rows.filter((r) => r.r.FORM === fid).map((r) => r.c);
    const forms: Record<string, Cons>[] = fc.length ? fc : [{}];
    const bases = COILS.map((c) => coilOf(c.id)).concat(GEN.map((g) => coilOf(g.id)));
    const baseR = bases.map((b) => run(b, S.data).prints.some((p) => p.form === fid));
    const order = bases.map((_b, i) => i).sort((i, j) => Number(baseR[j]) - Number(baseR[i]));
    let short = false;
    const units = (g: Record<string, Geo>) =>
      flat(fid)
        .map((n0, i) => {
          if (n0.t === "line" || (n0.t === "title" && !String(n0.n).trim())) return null;
          const n = { ...n0, ...g[n0.gid] };
          const k = n.t === "title" ? "t" + i : n.t === "barcode" ? "BARCD" : n.n;
          const ps = n.t === "title" ? [{ c: {}, v: String(n.n), src: "title", always: true }] : pathsOf(k);
          if (!ps.length) return null;
          const rs = ps.map((p: any) => inkOf(n, p.v, g === geo ? sty : {}));
          return { k, n, t: n.t, gid: n0.gid, ps, rs, u: unionR(rs) };
        })
        .filter(Boolean) as any[];
    const judge = (us: any[], g: Record<string, Geo>) => {
      const out: Record<string, ClashEdge> = {};
      let budget = 6000;
      for (let i = 0; i < us.length; i++)
        for (let j = i + 1; j < us.length; j++) {
          const A = us[i];
          const B = us[j];
          if (A.t === "title" && B.t === "title") continue;
          if (A.k === B.k || !hit2(A.u, B.u)) continue;
          const pk = A.k < B.k ? A.k + "|" + B.k : B.k + "|" + A.k;
          if (out[pk]) continue;
          const ok: any[] = [];
          const bad: Record<string, number> = {};
          let geomAny = false;
          A.ps.forEach((pa: any, ia: number) =>
            B.ps.forEach((pb: any, ib: number) => {
              if (!hit2(A.rs[ia], B.rs[ib])) return;
              geomAny = true;
              for (const f of forms) {
                const r = satAll([pa.c, pb.c, f], [pa.c, pb.c]);
                if (r.ok) {
                  ok.push({ r, pa, pb });
                  return;
                }
                bad[r.bad!] = (bad[r.bad!] || 0) + 1;
              }
            }),
          );
          if (!geomAny) continue;
          const [a, b] = A.k < B.k ? [A, B] : [B, A];
          const e: any = { a: a.k, b: b.k, ga: a.gid, gb: b.gid };
          if (!ok.length) {
            const kk = Object.entries(bad).sort((x, y) => y[1] - x[1])[0];
            out[pk] = Object.assign(e, { st: "no", why: kk ? kk[0] : "", conds: [], ex: null });
            continue;
          }
          const conds: any[] = [];
          const seen = new Set<string>();
          ok.sort((x, y) => Object.keys(x.r.show).length - Object.keys(y.r.show).length).forEach((o) => {
            const s = JSON.stringify(o.r.show);
            if (!seen.has(s)) {
              seen.add(s);
              conds.push(o);
            }
          });
          const factOnly = ok.every((o) => (o.pa.src === "fact" && !o.pa.always) || (o.pb.src === "fact" && !o.pb.always));
          let ex: any = null;
          let each = 300;
          for (const o of conds.slice(0, 6)) {
            for (const bi of order) {
              if (budget-- <= 0 || each-- <= 0) {
                short = true;
                break;
              }
              const c = withVals(bases[bi], o.r.vals);
              const R = run(c, S.data);
              if (!R.prints.some((p) => p.form === fid)) continue;
              const va = valOf(R, a);
              const vb = valOf(R, b);
              if (!va || !vb || !hit2(inkOf(a.n, va, g === geo ? sty : {}), inkOf(b.n, vb, g === geo ? sty : {}))) continue;
              ex = { c, va, vb, show: o.r.show };
              break;
            }
            if (ex || budget <= 0 || each <= 0) break;
          }
          out[pk] = Object.assign(e, { st: ex ? "yes" : "maybe", conds: conds.map((o) => o.r.show), ex, fact: factOnly, va: ok[0].pa.v, vb: ok[0].pb.v });
        }
      return out;
    };
    const was: Record<string, ClashEdge> = hit && hit.was && hit.wasKey === JSON.stringify(S.data) ? hit.was : judge(units({}), {});
    const cur = moved ? judge(units(geo), geo) : was;
    const live = Object.values(cur).filter((e) => e.st !== "no");
    const isNew = (e: ClashEdge) => !was[e.a + "|" + e.b] || was[e.a + "|" + e.b].st === "no";
    const rank: Record<string, number> = { yes: 0, maybe: 1 };
    const res: ClashRes = {
      fresh: live.filter(isNew).sort((p, q) => rank[p.st] - rank[q.st]),
      old: live.filter((e) => !isNew(e)),
      apart: Object.values(cur).filter((e) => e.st === "no" && (!was[e.a + "|" + e.b] || !moved || was[e.a + "|" + e.b].st === "no")),
      short,
    };
    CLASHC.set(fid, { key, res, was, wasKey: JSON.stringify(S.data) });
    return res;
  }
  const whyNo = (k?: string) =>
    k === "STD_ID" || k === "CERT_SCHEME" ? "적용 인증 · 규격이 서로 다름" : k === "PRINT_TYPE" || k === "TAG_PUB_TYPE" ? "태그 유형이 서로 다름" : `「${colLabel(k || "")}」 조건이 서로 어긋남`;

  // ---- 글자 크기 · 칸 옮기기 ----
  function fitSize(n: TagNode) {
    const lo = Math.max(5, Math.round(n.fs0 * 0.6));
    for (let fs = n.fs - 1; fs >= lo; fs--) if (!overOf(n, fs, n.v, pageDims(S.view.size).W).over) return fs;
    return 0;
  }
  const fsRange = (n: TagNode) => ({ lo: Math.max(5, Math.round(n.fs0 * 0.6)), hi: Math.round(n.fs0 * 1.2) });
  /** 글자 크기 고치기(S.style) — store.edit 안에서 부른다. */
  function setFs(fid: string, n: TagNode, fs: number) {
    const { lo, hi } = fsRange(n);
    fs = Math.min(hi, Math.max(lo, fs));
    const sty = (S.style[fid] = S.style[fid] || {});
    if (fs === n.fs0) delete sty[n.n];
    else sty[n.n] = fs;
    if (!Object.keys(sty).length) delete S.style[fid];
  }
  const curGeo = (gid: number) => layGroups(CUR).find((g) => g.gid === gid);
  function dragGeom(Dg: DragState, dx: number, dy: number, free: boolean) {
    let { x, y, w, h } = Dg.g0;
    const hd = Dg.h;
    const MIN = 4;
    if (hd === "move") {
      x += dx;
      y += dy;
    } else {
      if (hd.includes("w")) {
        const nx = Math.min(x + w - MIN, x + dx);
        w += x - nx;
        x = nx;
      }
      if (hd.includes("e")) w = Math.max(MIN, w + dx);
      if (hd.includes("n")) {
        const ny = Math.min(y + h - MIN, y + dy);
        h += y - ny;
        y = ny;
      }
      if (hd.includes("s")) h = Math.max(MIN, h + dy);
    }
    const guides: [string, number][] = [];
    if (!free) {
      const thr = 6 / Dg.k;
      const others = layGroups(CUR).filter((g) => g.gid !== Dg.gid);
      const cx = [0, Dg.W, PAGE.w].concat(...others.map((g) => [g.x, g.x + g.w, g.x + g.w / 2]));
      const cy = [0, Dg.H, PAGE.h].concat(...others.map((g) => [g.y, g.y + g.h, g.y + g.h / 2]));
      if (hd === "move") {
        const sx = snapAxis([x, x + w, x + w / 2], cx, thr);
        if (sx) {
          x += sx.d;
          guides.push(["x", sx.at]);
        } else x = Math.round(x);
        const sy = snapAxis([y, y + h, y + h / 2], cy, thr);
        if (sy) {
          y += sy.d;
          guides.push(["y", sy.at]);
        } else y = Math.round(y);
      } else {
        const edge = (vals: number[], cands: number[], set: (d: number) => void, ax: string) => {
          const s = snapAxis(vals, cands, thr);
          if (s) {
            set(s.d);
            guides.push([ax, s.at]);
            return true;
          }
          return false;
        };
        if (hd.includes("w") && !edge([x], cx, (d) => { x += d; w -= d; }, "x")) {
          const r = Math.round(x);
          w += x - r;
          x = r;
        }
        if (hd.includes("e") && !edge([x + w], cx, (d) => { w += d; }, "x")) w = Math.round(x + w) - x;
        if (hd.includes("n") && !edge([y], cy, (d) => { y += d; h -= d; }, "y")) {
          const r = Math.round(y);
          h += y - r;
          y = r;
        }
        if (hd.includes("s") && !edge([y + h], cy, (d) => { h += d; }, "y")) h = Math.round(y + h) - y;
      }
    }
    if (hd === "move") {
      x = Math.max(0, Math.min(Dg.W - w, x));
      y = Math.max(0, Math.min(Dg.H - h, y));
    } else {
      if (x < 0) {
        w += x;
        x = 0;
      }
      if (y < 0) {
        h += y;
        y = 0;
      }
      w = Math.max(MIN, Math.min(Dg.W - x, w));
      h = Math.max(MIN, Math.min(Dg.H - y, h));
    }
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { g: { x: r1(x), y: r1(y), w: r1(w), h: r1(h) }, guides };
  }

  return {
    D, S, T, M, COILS, GEN, FI, GOLD,
    itemNm, coilOf, coilBase, coilName, run, fieldOf, fact, flat, imgVers, imgSrc, imgVer, geoOf, gName, setGeo,
    modelOf, changedSet, uniqFields, compute, cur: () => CUR, base: () => BASE, curNode, selG,
    tagSvg, layGroups, colLabel, consText, condParts, condText, usage, useTxt, impact, changesNote, sameAsBase, changes, revertChange,
    coilMeta, n12, formCoils, formRoute, formTarget, roleOk, goldKey, goldGroups, goldOpen, exCoil, pickFor, goldWhy,
    refText, decisionRows, genFor, gdiff, inGold, sqlText, fmapRows, clashScan, clashNm, whyNo, witCoil,
    fitSize, fsRange, setFs, curGeo, dragGeom,
  };
}

export type { BaseDoc };
