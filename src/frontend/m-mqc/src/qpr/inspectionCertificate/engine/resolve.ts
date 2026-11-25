/**
 * 적용 기준 계산 — 목업 app.html 의 resolve·matchRule·byPrio·rivals·formKeyFor 를 옮겼다.
 * 원칙: 단건 수정 > 예외 규칙 > 양식 기본값. 값마다 어디서 왔는지(src)와 규칙 이름(why)을 남긴다.
 */
import { COAT, COIL_EDIT, FORMNAME, FTEXT, HEADF, KIND, RF, RT } from "./constants";
import { FORMDEF } from "./formdef";
import { htmlToText, textToHtml } from "./text";
import type { Cert, Cond, EngineState, Form, FormKey, Mode, Origin, Rule, RuleBody, Snap, SnapCol } from "./types";

/** 양식 기본값(현행 양식에서 뽑은 값). */
export function baseForm(fk: FormKey, ver: number): Form {
  const D = FORMDEF[fk];
  const f = { ver, qr: fk !== "es", stamp: false } as Form; // 스페인어 QR·도장은 현행 605422 하드코딩 → 고객 규칙
  for (const [k] of FTEXT) f[k] = D.defaults[k];
  if (fk === "es") f.title = "CERTIFICADO DE MOLINO"; // 현행 기본 제목(DKDbJobHandler 1126)
  f.labels = Object.fromEntries(D.keys.map((k) => [k, htmlToText(D.cells[D.leaf[k].top].t)]));
  f.labels.coat = COAT[fk];
  f.cols = D.keys.map((k) => ({ k, on: true }));
  return f;
}

/** 증명서 날짜 = 증명서번호 7~12자리(YYMMDD). */
export const certDate = (c: Cert) => (c.head.mtc ?? "").slice(6, 12);
export const fmtD = (d: string) => `${+d.slice(0, 2) < 50 ? "20" : "19"}${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
export function validYmd(d: string) {
  if (!/^\d{6}$/.test(d)) return false;
  const y = 2000 + +d.slice(0, 2);
  const m = +d.slice(2, 4);
  const dd = +d.slice(4, 6);
  const t = new Date(y, m - 1, dd);
  return t.getMonth() === m - 1 && t.getDate() === dd;
}

/** 양식 자동 선택 = 언어 우선(S → 스페인어), 그다음 수출/내수(현행 DKDbJobHandler 992·1139). */
export const autoFormKey = (c: Cert): FormKey => (c.at.lang === "S" ? "es" : c.kind === 2 ? "ko" : "en");
export const autoWhy = (c: Cert) => (c.at.lang === "S" ? "언어 S (스페인어)" : `${KIND[c.kind]} · 언어 ${c.at.lang}`);

function ruleView(r: Rule, st: EngineState, mode: Mode): RuleBody | null {
  if (mode === "rule" && r.id === st.rSel) return r.draft || r;
  return r.st === "ACTIVE" ? r : null;
}
export const hasCust = (r: RuleBody) => r.cond.some((c) => c[0] === "cust");
export const dateFrom = (r: RuleBody) => (r.cond.find((c) => c[0] === "date" && c[1] === "≥") || ["", "", ""])[2];
export const prioOf = (r: RuleBody) => r.prio ?? 50;
/** 우선순위: 숫자가 작을수록 이김 > 같으면 날짜 시작일이 늦은 규칙 > 목록 뒤쪽. 정렬 뒤 마지막이 이긴다. */
export const byPrio = (a: RuleBody, b: RuleBody) => prioOf(b) - prioOf(a) || dateFrom(a).localeCompare(dateFrom(b));

export function matchRule(r: RuleBody, ctx: Record<string, unknown>): { ok: boolean; fails: Cond[] } {
  const ok = (a: string, op: string, v: string) => (op === "=" ? a === v : op === "≠" ? a !== v : op === "≥" ? a >= v : a < v);
  const fails = r.cond.filter(([f, op, v]) => !ok(String(ctx[f]), op, String(v)));
  return { ok: !fails.length, fails };
}

/** 조건이 서로 배타적인가(같은 항목에 다른 값). */
function excl(a: RuleBody, b: RuleBody) {
  return a.cond.some(([f, op, v]) =>
    b.cond.some(
      ([g, op2, w]) => f === g && !RF[f]?.date && ((op === "=" && op2 === "=" && String(v) !== String(w)) || (op !== op2 && String(v) === String(w))),
    ),
  );
}

export interface Rival {
  o: Rule;
  win: boolean;
  why: string;
  tie: boolean;
}
/** 같은 대상에 함께 걸릴 수 있는 사용 중 규칙(REMARK 줄은 모두 들어가므로 제외). */
export function rivals(rules: Rule[], id: string): Rival[] {
  const r = rules.find((x) => x.id === id);
  if (!r) return [];
  const v = r.draft || r;
  const idx = (x: Rule) => rules.indexOf(x);
  if (v.tgt === "remarkLine") return [];
  return rules
    .filter((o) => o !== r && o.st === "ACTIVE" && o.tgt === v.tgt && !excl(v, o))
    .map((o) => {
      const c = byPrio(v, o);
      const win = c ? c > 0 : idx(r) > idx(o);
      const why = prioOf(v) !== prioOf(o) ? "우선순위" : dateFrom(v) !== dateFrom(o) ? "같은 우선순위 → 날짜 시작일이 늦은 쪽" : "같은 우선순위 → 목록 뒤쪽";
      return { o, win, why, tie: prioOf(v) === prioOf(o) && dateFrom(v) === dateFrom(o) };
    });
}

export function formRule(st: EngineState, id: string, mode: Mode = "applied"): RuleBody | null {
  const c = st.certs[id];
  const bctx = { ...c.at, cust: c.cust, date: certDate(c) };
  const h = st.rules.map((r) => ruleView(r, st, mode)).filter((r): r is RuleBody => !!r && r.tgt === "useForm" && !!r.val && matchRule(r, bctx).ok);
  return h.sort(byPrio)[h.length - 1] || null;
}

/** 단건 수정 양식 지정 > 규칙 「사용 양식」 > 자동 선택. */
export function formKeyFor(st: EngineState, id: string, mode: Mode = "applied"): FormKey {
  const o = st.ovr[id];
  if (o && o.form) return o.form as FormKey;
  const r = formRule(st, id, mode);
  return r ? (r.val as FormKey) : autoFormKey(st.certs[id]);
}

export function ctxOf(st: EngineState, id: string, mode: Mode = "applied"): Record<string, string> {
  const c = st.certs[id];
  return { ...c.at, form: formKeyFor(st, id, mode), cust: c.cust, date: certDate(c) };
}

interface Line {
  t: string;
  s: Origin;
  w?: string;
}

export function resolve(st: EngineState, id: string, mode: Mode = "applied"): Snap {
  const c = st.certs[id];
  const o = st.ovr[id] || {};
  const oh = o.head || {};
  const fk = formKeyFor(st, id, mode);
  const fs = st.forms[fk];
  const F = (mode === "draft" && fs.draft) || fs.applied;
  const D = FORMDEF[fk];
  const src: Record<string, Origin> = { form: o.form ? "ovr" : "base" };
  const why: Record<string, string | undefined> = {};
  const T: Record<string, string> = {};
  const ctx = ctxOf(st, id, mode);
  const hits = st.rules
    .map((r) => ruleView(r, st, mode))
    .filter((r): r is RuleBody => !!r && r.tgt !== "useForm" && matchRule(r, ctx).ok)
    .sort(byPrio); // 뒤 = 이김
  const rl = (t: string) => {
    const h = hits.filter((r) => r.tgt === t);
    return h.length ? h[h.length - 1] : null;
  };
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  const pick = (key: string, ov: string | undefined, rv: RuleBody | null, fv: string) => {
    if (has(ov)) {
      src[key] = "ovr";
      return ov as string;
    }
    if (rv) {
      src[key] = "rule";
      why[key] = rv.code + " " + rv.name;
      return rv.val;
    }
    src[key] = "base";
    return fv;
  };
  for (const [k] of HEADF[fk]) T["h." + k] = pick("h." + k, oh[k], rl(k), c.head[k] || "");
  T["h.mtc"] = c.head.mtc;
  if (fk === "ko") {
    T["h.commodityKo"] = [T["h.commodity"], T["h.commodity2"]].filter(Boolean).join("\n");
    src["h.commodityKo"] = src["h.commodity"] !== "base" ? src["h.commodity"] : src["h.commodity2"];
    why["h.commodityKo"] = why["h.commodity"];
  }
  T["f.title"] = pick("f.title", o.title, rl("title"), F.title);
  for (const [k] of FTEXT) if (k !== "title") T["f." + k] = F[k] as string;
  for (let i = 1; i <= 7; i++) T["n." + i] = c.notes["n." + i] || "";
  // REMARK: 걸린 규칙 줄을 차례로. 단건 수정이 있으면 그 글이 REMARK 전체
  const ruleLines: Line[] = [];
  const lines: Line[] = [];
  hits
    .filter((r) => r.tgt === "remarkLine")
    .reverse()
    .forEach((r) => r.val.split("\n").forEach((l) => ruleLines.push({ t: l, s: "rule", w: r.code + " " + r.name })));
  if (o.remark !== undefined) {
    src.remark = "ovr";
    (o.remark === "" ? [] : o.remark.split("\n")).forEach((l) => lines.push(ruleLines.find((x) => x.t === l) || { t: l, s: "ovr" }));
  } else lines.push(...ruleLines);
  for (let i = 0; i < D.nRemark; i++) {
    const l = lines[i];
    T["rm." + i] = l ? l.t : "";
    src["rm." + i] = l ? l.s : "base";
    if (l && l.w) why["rm." + i] = l.w;
  }
  const overflow = Math.max(0, lines.length - D.nRemark);
  const mk = rl("mark");
  const ml = mk ? mk.val.split("\n") : [];
  T["m.1"] = ml[0] || "";
  T["m.2"] = ml[1] || "";
  if (mk) {
    src["m.1"] = src["m.2"] = src.mark = "rule";
    why["m.1"] = why["m.2"] = why.mark = mk.code + " " + mk.name;
  }
  // 표 칸
  const hidden: [string, string][] = [];
  const cols: SnapCol[] = [];
  for (const col of F.cols) {
    let on = col.on;
    let s: Origin | null = null;
    let w: string | null = null;
    const vr = rl("col:" + col.k);
    if (vr && (vr.val === "show") !== on) {
      on = vr.val === "show";
      s = "rule";
      w = vr.code + " " + vr.name;
      if (!on) hidden.push([F.labels[col.k], "예외 규칙 " + w]);
    }
    if (on) cols.push({ k: col.k, l: F.labels[col.k], s, w });
  }
  const zr = rl("zinc");
  const coat = cols.find((x) => x.k === "coat");
  if (zr && coat) {
    coat.l = zr.val;
    coat.s = "rule";
    coat.w = zr.code + " " + zr.name;
  }
  const cellOv: Snap["cellOv"] = {};
  const ur = rl("unit");
  if (ur) {
    const cid = D.cells.findIndex((x) => /N\/㎜/.test(x.t));
    if (cid >= 0) cellOv[cid] = { t: textToHtml(ur.val), s: "rule", w: ur.code + " " + ur.name };
  }
  const vis = (k: string, base: boolean) => {
    const r = rl(k);
    if (!r) {
      src[k] = "base";
      return base;
    }
    src[k] = "rule";
    why[k] = r.code + " " + r.name;
    return r.val === "show";
  };
  const qr = vis("qr", F.qr);
  const stamp = vis("stamp", F.stamp);
  const fr = formRule(st, id, mode);
  const oc = o.coil || {};
  const coilOv: Record<string, number> = {};
  // 표 데이터 단건 수정은 COIL_EDIT 칸만(시험값·화학성분은 막음)
  const coils = c.coils.map((cl, i) => {
    const n = { ...cl };
    for (const k in cl)
      if (COIL_EDIT.includes(k) && oc[i + "." + k] !== undefined) {
        n[k] = oc[i + "." + k];
        coilOv[i + "." + k] = 1;
      }
    return n;
  });
  const sr = rl("signImg");
  const tr = rl("stampImg");
  const res: Snap = {
    id,
    fk,
    fname: FORMNAME[fk],
    fver: F.ver,
    T,
    src,
    why,
    cols,
    cellOv,
    hidden,
    overflow,
    mark: !!mk,
    qr,
    stamp,
    coils,
    coilOv,
    rules: (fr ? [fr] : []).concat(hits).map((r) => r.code + " " + r.name),
    signImg: sr ? sr.val : "",
    stampImg: tr ? tr.val : "cm_stamp.png",
    signWhy: sr ? sr.code + " " + sr.name : "",
    stampWhy: tr ? tr.code + " " + tr.name : "양식 기본 (구도장)",
    nOvr: 0,
    nRule: hits.length,
  };
  const v = (Object.values(src) as (Origin | null)[]).concat(cols.map((x) => x.s));
  res.nOvr = v.filter((x) => x === "ovr").length + Object.keys(coilOv).length;
  return res;
}

/** 규칙 조건 문장. */
export const condVal = (f: string, v: string) => (RF[f]?.date ? (validYmd(String(v)) ? fmtD(String(v)) : v) : RF[f]?.o[v] || v);
export function condText(r: RuleBody) {
  return r.cond.length ? r.cond.map(([f, op, v]) => `${RF[f]?.n ?? f} ${op} ${condVal(f, v)}`).join(" 그리고 ") : "모든 증명서";
}
export function resText(r: RuleBody) {
  const t = RT[r.tgt];
  if (!t) return `${r.tgt} = ${r.val}`;
  return t.vis ? `${t.n} ${r.val === "show" ? "보이기" : "숨기기"}` : t.opts ? `${t.n} = ${t.opts[r.val] || r.val}` : `${t.n} = ${r.val.replace(/\n/g, " ⏎ ")}`;
}

/** REMARK 의 규칙 기준 글(단건 수정 REMARK 를 뺀 계산). */
export function baseRemark(st: EngineState, id: string) {
  const o = st.ovr[id] || { head: {} };
  const R = resolve({ ...st, ovr: { ...st.ovr, [id]: { ...o, remark: undefined } } }, id);
  return Object.keys(R.T)
    .filter((k) => k.startsWith("rm."))
    .map((k) => R.T[k])
    .filter(Boolean)
    .join("\n");
}
