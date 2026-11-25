/**
 * 품질보증서 종이 그리기와 계산 — 목업의 numbering·sub·docHtml·analyze·찾기/바꾸기를 전역 상태 없이 옮겼다.
 * 모두 순수 함수다(문서와 그리기 옵션을 받아 문자열·집합을 돌려준다). 종이 HTML 은 PaperFrame 의 iframe 안에서만 쓴다.
 */
import {
  ASSETS,
  ITEMS,
  KIND,
  MARK,
  MM,
  RULES,
  SIGNERS,
  SLIDERS,
  VARMAP,
  meta,
  signerOf,
  type Block,
  type Clause,
  type FormRule,
  type ImageBlock,
  type Half,
  type LText,
  type WtyDoc,
} from "./data";

export const esc = (s: unknown) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
export const cur = (o: LText | undefined, lang: string) => (o ? (o[lang as keyof LText] ?? o.ko ?? "") : "");
export const clauseOf = (d: WtyDoc, id: string): Clause | undefined => d.clauses.find((c) => c.id === id);
export const valOf = (d: WtyDoc, cd: string): number | "" => {
  const r = d.vals[cd];
  return r ? (r[d.brand] ?? "") : "";
};
export const bkey = (cid: string, bi: number) => `${cid}|${bi}`;

const N1 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const N2KO = ["가", "나", "다", "라", "마", "바", "사", "아", "자"];
const N2EN = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

/** 조항 번호. 끈 조항은 null, 도입문(lv0)은 "". 1단계는 1. 2. …, 2단계는 가. 나. …(영문 A. B. …), 1단계가 바뀌면 2단계를 다시 센다. */
export function numbering(d: WtyDoc): Record<string, string | null> {
  let i1 = 0;
  let i2 = 0;
  const o: Record<string, string | null> = {};
  for (const id of d.order) {
    const m = meta(id);
    const c = clauseOf(d, id);
    if (!m || !c) continue;
    if (!c.on) {
      o[id] = null;
      continue;
    }
    if (m.lv === 0) o[id] = "";
    else if (m.lv === 1) {
      o[id] = (N1[i1++] ?? String(i1)) + ".";
      i2 = 0;
    } else o[id] = ((d.lang === "ko" ? N2KO : N2EN)[i2++] ?? "?") + ".";
  }
  return o;
}

/** 대소문자를 가리지 않고 q 를 <mark> 로 감싼다(정규식 없이). */
function hlPart(t: string, q: string) {
  const lt = t.toLowerCase();
  const lq = q.toLowerCase();
  let out = "";
  let i = 0;
  let j: number;
  while ((j = lt.indexOf(lq, i)) >= 0) {
    out += t.slice(i, j) + "<mark>" + t.slice(j, j + q.length) + "</mark>";
    i = j + q.length;
  }
  return out + t.slice(i);
}
function hl(html: string, q: string) {
  if (!q) return html;
  const eq = esc(q);
  return html
    .split(/(<[^>]*>)/)
    .map((x) => (x.charAt(0) === "<" ? x : hlPart(x, eq)))
    .join("");
}

/** 변수 하나의 값. 모르는 변수는 null. */
function varValue(d: WtyDoc, k: string): string | null {
  if (k === "브랜드명") return d.brand;
  if (k === "적용지역") return d.lang === "ko" ? "대한민국" : "the Republic of Korea";
  const cd = VARMAP[k];
  if (cd == null) return null;
  const v = valOf(d, cd);
  return v === "" ? "" : String(v);
}

/** 글자만 바꾼 결과(비교·시험용). 값이 비면 [값 없음], 모르는 변수는 그대로. */
export function plainSub(text: string, d: WtyDoc) {
  return String(text).replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const k = raw.trim();
    const v = varValue(d, k);
    if (v == null) return "{{" + k + "}}";
    return v === "" ? "[값 없음]" : v;
  });
}

/** 종이용 HTML — 글자를 이스케이프하고 변수를 바꾼 뒤 찾는 문구를 형광펜으로 칠한다. */
export function subHtml(text: string, d: WtyDoc, q = "") {
  const html = esc(text).replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const k = raw.trim();
    const v = varValue(d, k);
    if (v == null) return '<span class="warnv">{{' + k + "}}</span>";
    return v === "" ? '<span class="warnv">[값 없음]</span>' : esc(v);
  });
  return hl(html, q);
}

// ───────── 글자 단위 비교 ─────────
export const tokz = (t: string) => String(t).match(/\d+(?:[.,]\d+)?|[A-Za-z]+|[가-힣]+|\s+|[\s\S]/g) || [];

export type Op = [0 | 1 | -1, string];
/** 최장 공통 부분열로 a → b 편집 순서. 앞뒤 같은 부분은 먼저 떼고, 너무 크면 통째 삭제·삽입. */
export function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const out: Op[] = [];
  let s0 = 0;
  while (s0 < n && s0 < m && a[s0] === b[s0]) s0++;
  let e0 = 0;
  while (e0 < n - s0 && e0 < m - s0 && a[n - 1 - e0] === b[m - 1 - e0]) e0++;
  for (let i = 0; i < s0; i++) out.push([0, a[i]]);
  const A = a.slice(s0, n - e0);
  const B = b.slice(s0, m - e0);
  const N = A.length;
  const M = B.length;
  if (N && M && N * M <= 120000) {
    const dp: Uint16Array[] = [];
    for (let i = 0; i <= N; i++) dp.push(new Uint16Array(M + 1));
    for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < N && j < M) {
      if (A[i] === B[j]) {
        out.push([0, A[i]]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push([-1, A[i++]]);
      else out.push([1, B[j++]]);
    }
    while (i < N) out.push([-1, A[i++]]);
    while (j < M) out.push([1, B[j++]]);
  } else {
    A.forEach((x) => out.push([-1, x]));
    B.forEach((x) => out.push([1, x]));
  }
  for (let i = 0; i < e0; i++) out.push([0, a[n - e0 + i]]);
  return out;
}

/** 한쪽 글에 지운 글자(<del>, 변경 전 쪽) 또는 넣은 글자(<ins>, 변경 후 쪽)를 표시한 HTML. */
export function inlineDiff(before: string, after: string, side: "a" | "b") {
  const ops = lcsOps(tokz(before), tokz(after));
  const keep = side === "a" ? -1 : 1;
  const tag = side === "a" ? "del" : "ins";
  let out = "";
  let buf = "";
  const flush = () => {
    if (buf) {
      out += "<" + tag + ">" + esc(buf) + "</" + tag + ">";
      buf = "";
    }
  };
  for (const [op, t] of ops) {
    if (op === 0) {
      flush();
      out += esc(t);
    } else if (op === keep) buf += t;
  }
  flush();
  return out;
}

/** 문서의 글 칸마다 변수를 바꾼 글자: `조항|블록|칸` → 글. 칸은 "" · L · R · r{행}c{열}. */
export function collectText(d: WtyDoc) {
  const map: Record<string, string> = {};
  for (const id of d.order) {
    const c = clauseOf(d, id);
    if (!c) continue;
    c.b.forEach((b, bi) => {
      const put = (slot: string, o: LText) => {
        map[`${id}|${bi}|${slot}`] = plainSub(cur(o, d.lang), d);
      };
      if (b.t === "text") put("", b.c);
      else if (b.t === "two") {
        if (b.L.t === "text") put("L", b.L.c);
        if (b.R.t === "text") put("R", b.R.c);
      } else if (b.t === "table") b.rows.forEach((r, ri) => r.forEach((cell, ci) => put(`r${ri}c${ci}`, cell)));
    });
  }
  return map;
}

// ───────── 변경 분석 ─────────
export interface Pair {
  ka: string | null;
  kb: string | null;
  lb: string;
}
export interface Analysis {
  /** 적용본 쪽 바뀐 블록 키. */
  a: Set<string>;
  /** 현재 문서 쪽 바뀐 블록 키. */
  b: Set<string>;
  pairs: Pair[];
  c2b: Record<string, number>;
  b2c: Record<string, number>;
  rows: [tag: string, text: string][];
}

/** 적용본(base)과 현재 문서를 비교한다. 블록은 자리 번호가 아니라 내용으로 짝을 찾는다. */
export function analyze(d: WtyDoc, base: WtyDoc | null): Analysis {
  const R: Analysis = { a: new Set(), b: new Set(), pairs: [], c2b: {}, b2c: {}, rows: [] };
  if (!base) return R;
  const ob = (id: string) => clauseOf(base, id);
  const nm = (b: Block | undefined) => (b ? KIND[b.t] : "?");
  for (const id of d.order) {
    const c = clauseOf(d, id);
    const m = meta(id);
    if (!c || !m) continue;
    const o = ob(id);
    if (o && o.on !== c.on) R.rows.push([c.on ? "조항 사용" : "조항 제외", m.t]);
    if (!c.on) continue;
    if (!o || !o.on) {
      c.b.forEach((b, i) => {
        R.b.add(bkey(id, i));
        R.pairs.push({ kb: bkey(id, i), ka: null, lb: `${m.t} — 새 조항 ${nm(b)}` });
      });
      continue;
    }
    const A = o.b.map((x) => JSON.stringify(x));
    const C = c.b.map((x) => JSON.stringify(x));
    let ai = 0;
    let bi = 0;
    let dl: number[] = [];
    let il: number[] = [];
    const flush = () => {
      const n = Math.max(dl.length, il.length);
      for (let i = 0; i < n; i++) {
        const x = dl[i];
        const t = il[i];
        if (x != null && t != null) {
          R.a.add(bkey(id, x));
          R.b.add(bkey(id, t));
          R.pairs.push({ kb: bkey(id, t), ka: bkey(id, x), lb: `${m.t} — ${nm(c.b[t])} 고쳐짐` });
          R.c2b[bkey(id, t)] = x;
          R.b2c[bkey(id, x)] = t;
          R.rows.push(["내용 수정", `${m.t} — ${nm(c.b[t])} 블록`]);
        } else if (x != null) {
          R.a.add(bkey(id, x));
          R.pairs.push({ kb: null, ka: bkey(id, x), lb: `${m.t} — ${nm(o.b[x])} 지워짐` });
          R.rows.push(["블록 삭제", `${m.t} — ${nm(o.b[x])} 블록`]);
        } else {
          R.b.add(bkey(id, t));
          R.pairs.push({ kb: bkey(id, t), ka: null, lb: `${m.t} — ${nm(c.b[t])} 새로 생김` });
          R.rows.push(["블록 추가", `${m.t} — ${nm(c.b[t])} 블록`]);
        }
      }
      dl = [];
      il = [];
    };
    for (const [op] of lcsOps(A, C)) {
      if (op === 0) {
        flush();
        ai++;
        bi++;
      } else if (op === -1) dl.push(ai++);
      else il.push(bi++);
    }
    flush();
  }
  for (const id of base.order) {
    const o = ob(id);
    const c = clauseOf(d, id);
    if (!o || !o.on) continue;
    if (!c || !c.on)
      o.b.forEach((b, i) => {
        R.a.add(bkey(id, i));
        R.pairs.push({ kb: null, ka: bkey(id, i), lb: `${meta(id)?.t ?? id} — 제외된 조항 ${nm(b)}` });
      });
  }
  if (base.order.join() !== d.order.join()) R.rows.push(["순서 변경", "조항 순서가 바뀌었습니다"]);
  for (const i of ITEMS)
    for (const br of Object.keys(i.v)) {
      const x = base.vals[i.cd]?.[br];
      const y = d.vals[i.cd]?.[br];
      if (String(x) !== String(y)) R.rows.push(["기준값", `${br} · ${i.ko} ${String(x)} → ${String(y)} ${i.u}`]);
    }
  for (const x of SLIDERS) if (base.layout[x.k] !== d.layout[x.k]) R.rows.push(["레이아웃", `${x.ko} ${base.layout[x.k]} → ${d.layout[x.k]}${x.u}`]);
  if (base.signer !== d.signer) R.rows.push(["서명자", `${signerOf(base.signer).ko} → ${signerOf(d.signer).ko}`]);
  for (const x of SIGNERS) {
    const a = base.sigVer?.[x.id] || 1;
    const b2 = d.sigVer?.[x.id] || 1;
    if (a !== b2) R.rows.push(["서명 그림", `${x.ko} 서명이 v${a} → v${b2} 로 바뀌었습니다`]);
  }
  for (const k of Object.keys(ASSETS)) {
    const a = base.assetVer?.[k] || 1;
    const b2 = d.assetVer?.[k] || 1;
    if (a !== b2) R.rows.push(["그림 자산", `${ASSETS[k].nm} 그림이 v${a} → v${b2} 로 바뀌었습니다`]);
  }
  if ((base.sigH || 44) !== (d.sigH || 44)) R.rows.push(["서명 크기", `${base.sigH || 44} → ${d.sigH || 44}px`]);
  if (base.showLogo !== d.showLogo || base.showMark !== d.showMark || base.logoSize !== d.logoSize || base.headerSide !== d.headerSide)
    R.rows.push(["머리말", "로고·인증마크 설정이 바뀌었습니다"]);
  if ((base.pinSign !== false) !== (d.pinSign !== false)) R.rows.push(["서명 위치", d.pinSign !== false ? "마지막 쪽 아래로 고정" : "본문 바로 뒤로"]);
  return R;
}

/** 양식 선택 규칙 — 우선이 작은 규칙부터 보고 먼저 걸리는 것. */
export function matchRule(d: Pick<WtyDoc, "brand" | "lang" | "grade">, rules: FormRule[] = RULES): FormRule {
  return (
    rules
      .slice()
      .sort((a, b) => a.p - b.p)
      .find((r) => (r.b === "*" || r.b === d.brand) && (r.l === "*" || r.l === d.lang) && (r.g === "*" || r.g === d.grade)) ?? rules[rules.length - 1]
  );
}

// ───────── 종이 그리기 ─────────
export interface CompareCtx {
  side: "a" | "b";
  map: Analysis;
  txa: Record<string, string>;
  txb: Record<string, string>;
}
export interface RenderOpt {
  /** 적용본 버전(종이 아래 「적용 기준 v」). */
  ver: number;
  /** 선택한 블록(테두리). */
  sel?: { c: string; b: number } | null;
  /** 바뀐 블록 키(주황 띠). */
  diff?: Set<string>;
  /** 찾는 문구(형광펜). */
  q?: string;
  /** 나란히 비교 — 글자 단위 표시. */
  cmp?: CompareCtx | null;
  /** 블록을 끌 수 있게(draggable). */
  drag?: boolean;
}

function txt(o: LText, d: WtyDoc, opt: RenderOpt, cid: string, bi: number, slot: string) {
  const cmp = opt.cmp;
  if (cmp) {
    let ka: string | null = null;
    let kb: string | null = null;
    if (cmp.side === "b") {
      kb = bkey(cid, bi);
      const x = cmp.map.c2b[kb];
      if (x != null) ka = bkey(cid, x);
    } else {
      ka = bkey(cid, bi);
      const x = cmp.map.b2c[ka];
      if (x != null) kb = bkey(cid, x);
    }
    if (ka && kb) {
      const A = cmp.txa[ka + "|" + slot];
      const C = cmp.txb[kb + "|" + slot];
      if (A != null && C != null && A !== C) return inlineDiff(A, C, cmp.side);
    }
  }
  return subHtml(cur(o, d.lang), d, opt.q);
}

function figHtml(b: ImageBlock | Half, d: WtyDoc, fs: number, inCol: boolean, attr = "", extra = "") {
  const k = b.t === "image" ? b.k : "";
  const a = ASSETS[k];
  if (!a) return '<span class="warnv">[없는 그림]</span>';
  const src = d.assetImg?.[k];
  const art = src ? `<img src="${esc(src)}" alt="${esc(a.nm)}" draggable="false">` : a.svg;
  const ib = b as ImageBlock;
  const al = ib.al || "center";
  const cls = "fig " + (inCol ? "" : al.startsWith("fl-") ? al : "al-" + al) + extra;
  const w = inCol ? "100%" : `${ib.w || 300}px`;
  const dy = !inCol && ib.dy ? `margin-top:${ib.dy}px;` : "";
  return `<figure class="${cls.trim()}" style="width:${w};${dy}"${attr}>${art}<figcaption style="font-size:${fs * 0.76}px">${esc(cur(a.cap, d.lang))}</figcaption></figure>`;
}

function blockHtml(b: Block, d: WtyDoc, opt: RenderOpt, fs: number, lh: number, cid: string, bi: number) {
  const at = ` data-c="${esc(cid)}" data-b="${bi}"${opt.drag ? ' draggable="true"' : ""}`;
  const sl = opt.sel?.c === cid && opt.sel.b === bi;
  const k = (sl ? " sel" : "") + (opt.diff?.has(bkey(cid, bi)) ? " chg" : "");
  if (b.t === "text") return `<p class="${k.trim()}" style="font-size:${fs}px;line-height:${lh}"${at}>${txt(b.c, d, opt, cid, bi, "")}</p>`;
  if (b.t === "image") return figHtml(b, d, fs, false, at, k);
  if (b.t === "two") {
    const r = b.ratio || 40;
    const va = b.va || "start";
    const one = (x: Half, slot: string) =>
      x.t === "image" ? figHtml(x, d, fs, true) : `<div style="font-size:${fs}px;line-height:${lh}"><p>${txt(x.c, d, opt, cid, bi, slot)}</p></div>`;
    return `<div class="two${k}" style="grid-template-columns:${r}fr ${100 - r}fr;align-items:${va}"${at}>${one(b.L, "L")}${one(b.R, "R")}</div>`;
  }
  if (b.t === "table") {
    return (
      `<table class="wt${k}" style="font-size:${fs * 0.92}px"${at}>` +
      b.rows
        .map((row, i) => `<tr class="${b.head && i === 0 ? "h" : ""}">` + row.map((cell, ci) => `<td>${txt(cell, d, opt, cid, bi, `r${i}c${ci}`)}</td>`).join("") + "</tr>")
        .join("") +
      "</table>"
    );
  }
  return "";
}

/** 종이 본문 HTML(목업 docHtml). 쪽 나눔·서명 고정은 그린 뒤 PaperFrame 이 잰다. */
export function docHtml(d: WtyDoc, opt: RenderOpt) {
  const Lo = d.layout;
  const n = numbering(d);
  const s = signerOf(d.signer);
  const rule = matchRule(d);
  const ko = d.lang === "ko";
  const pad = Lo.margin * MM;
  const fs = Lo.fontSize * (96 / 72);
  const gap = Lo.gap * MM;
  const lh = Lo.lineHeight;
  const body = d.order
    .map((id) => {
      const c = clauseOf(d, id);
      const m = meta(id);
      if (!c || !c.on || !m) return "";
      const inner = c.b.map((b, bi) => blockHtml(b, d, opt, fs, lh, id, bi)).join("");
      if (m.lv === 0) return `<div class="bstack">${inner}</div>`;
      return `<div class="cl${m.lv === 2 ? " l2" : ""}" style="font-size:${fs}px;line-height:${lh}"><span class="n">${n[id] ?? ""}</span><div class="bstack">${inner}</div></div>`;
    })
    .join("");
  const left = d.headerSide === "left";
  const sig = d.sigImg?.[d.signer];
  const perf = valOf(d, "PERFORATION");
  return `<div class="doc" style="padding:${pad}px;display:flex;flex-direction:column;gap:${gap}px">
    <div class="hd" style="${left ? "flex-direction:row-reverse" : ""}">
      <div data-go="form" title="양식 탭으로 이동" class="hdl" style="font-size:${fs * 0.82}px;text-align:${left ? "right" : "left"}">${esc(rule.tpl)}<br>${ko ? "발행번호" : "No."} 20261022-001</div>
      <div data-go="image" title="이미지·서명 탭으로 이동" style="display:flex;align-items:center;gap:10px">
        ${d.showMark ? `<span style="width:${d.logoSize * 2.4}px;display:block">${MARK}</span>` : ""}
        ${d.showLogo ? `<div class="logo" style="font-size:${d.logoSize}px">DONGKUK CM</div>` : ""}</div></div>
    <h1 data-go="value" title="기준값 탭으로 이동" style="font-size:${fs * 2}px;line-height:1.25">${ko ? `${esc(perf)}년 품질보증서` : `${esc(perf)} YEAR LIMITED WARRANTY`}</h1>
    <div class="sub" style="font-size:${fs * 0.95}px;margin-top:${-gap * 0.5}px">${esc(d.brand)} · ${esc(d.grade)}</div>
    <hr class="rule">${body}<div class="tailpad" style="height:0"></div><hr class="rule">
    <div class="sign" data-go="image" title="이미지·서명 탭으로 이동" style="font-size:${fs}px"><div class="col">
      <div style="margin-bottom:10px">${ko ? "동 국 씨 엠 주 식 회 사" : "DONGKUK COATED METAL CO., LTD."}</div>
      ${
        sig
          ? `<img class="sigimg" src="${esc(sig)}" alt="${esc(ko ? s.ko : s.en)} 서명" style="max-height:${d.sigH || 44}px">`
          : `<div class="sig" style="font-size:${fs * 1.25}px">${esc(ko ? s.ko : s.en)}</div>`
      }
      <div class="sgt" style="margin-top:6px;font-size:${fs * 0.88}px">${esc(ko ? s.tk : s.te)}</div></div></div>
    <div class="meta" style="font-size:${fs * 0.8}px"><span>${ko ? "발행일" : "Issued"} 2026-10-22</span>
      <span>${ko ? "적용 기준" : "Standard"} v${opt.ver}</span></div></div>`;
}

/** 초안·승인 대기 띠(발행에 쓰지 않는다는 표시). */
export function ribbonHtml(state: string) {
  if (state === "DRAFT") return '<div class="ribbon">초안 — 발행에 사용되지 않습니다</div>';
  if (state === "PENDING") return '<div class="ribbon">승인 대기 — 발행에 사용되지 않습니다</div>';
  return "";
}

// ───────── 찾기 · 바꾸기 ─────────
export interface Hit {
  id: string;
  bi: number;
  lab: string;
  lg: "ko" | "en";
  t: string;
  j: number;
}

/** 글 칸마다 fn(글, 조항, 블록, 위치 이름). 꺼둔 조항도 돈다. */
export function eachText(d: WtyDoc, fn: (o: LText, id: string, bi: number, lab: string) => void) {
  for (const id of d.order) {
    const c = clauseOf(d, id);
    if (!c) continue;
    c.b.forEach((b, bi) => {
      if (b.t === "text") fn(b.c, id, bi, "문단");
      else if (b.t === "two") {
        if (b.L.t === "text") fn(b.L.c, id, bi, "2단 왼쪽");
        if (b.R.t === "text") fn(b.R.c, id, bi, "2단 오른쪽");
      } else if (b.t === "table") b.rows.forEach((r, ri) => r.forEach((cell, ci) => fn(cell, id, bi, `표 ${ri + 1}행 ${ci + 1}열`)));
    });
  }
}

/** 한글·영문 모두에서 q 를 찾는다(대소문자 무시). */
export function findHits(d: WtyDoc, q: string): Hit[] {
  if (!q) return [];
  const lq = q.toLowerCase();
  const out: Hit[] = [];
  eachText(d, (o, id, bi, lab) => {
    for (const lg of ["ko", "en"] as const) {
      const t = o[lg] || "";
      const j = t.toLowerCase().indexOf(lq);
      if (j >= 0) out.push({ id, bi, lab, lg, t, j });
    }
  });
  return out;
}

/** 모두 바꾸기 — 문서를 고치고 바꾼 곳 수를 돌려준다. */
export function replaceAllText(d: WtyDoc, q: string, to: string) {
  if (!q) return 0;
  const lq = q.toLowerCase();
  let n = 0;
  eachText(d, (o) => {
    for (const lg of ["ko", "en"] as const) {
      const t = o[lg] || "";
      if (!t) continue;
      const lt = t.toLowerCase();
      if (lt.indexOf(lq) < 0) continue;
      let out = "";
      let i = 0;
      let j: number;
      while ((j = lt.indexOf(lq, i)) >= 0) {
        out += t.slice(i, j) + to;
        i = j + q.length;
        n++;
      }
      o[lg] = out + t.slice(i);
    }
  });
  return n;
}

/** 블록을 다른 자리로 옮긴다(목업 끌어 놓기 계산: 놓은 블록의 위·아래 절반). 옮긴 뒤 자리를 돌려준다. */
export function moveBlock(arr: Block[], from: number, to: number, top: boolean) {
  if (from === to) return from;
  const [m] = arr.splice(from, 1);
  const at = Math.max(0, Math.min(arr.length, to > from ? (top ? to - 1 : to) : top ? to : to + 1));
  arr.splice(at, 0, m);
  return at;
}

/** 쓰는 변수·그림이 켠 조항에 있는지(기준값·그림 자산 「사용 중」 표시). */
export function usedText(d: WtyDoc) {
  return JSON.stringify(d.clauses.filter((c) => c.on).map((c) => c.b));
}
