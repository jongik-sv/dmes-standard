/**
 * 검사증명서관리 화면 상태 — 서버 저장값(양식·규칙·증명서·단건 수정·이미지·발행본·이력)과 화면 선택 상태를 한곳에 둔다.
 * 목업 app.html 의 이벤트 처리(양식 초안·칸 이동·규칙 초안·단건 수정·이미지 등록)를 옮겼다. 고친 값은 잠시 모았다가 `save` 로 보낸다
 * (초안 입력은 0.7초 뒤, 승인·적용 같은 처리는 바로). 발행·재발행·신규 수신·초기화 뒤에는 `search` 로 다시 읽는다.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";

import { BASE_IMGS, type Issued, type MtcApi, type MtcData, type SaveParams, type VerifyResult } from "./api";
import { EXTRA, FORMNAME, RF, RT, kindOf } from "./engine/constants";
import { formDiff } from "./engine/diff";
import { baseRemark, formKeyFor, resolve } from "./engine/resolve";
import { clone } from "./engine/text";
import type { EngineState, Form, FormKey, Mode, Ovr, Rule, RuleBody, Snap } from "./engine/types";

export type TabKey = "issue" | "form" | "ovr" | "rule" | "sign";

export interface Ui {
  tab: TabKey;
  sel: string;
  formSel: FormKey;
  colSel: number;
  ovrSel: string;
  ovrCoil: number;
  rSel: string;
  rFilter: string;
  imgSel: string;
  imgKind: "서명" | "도장";
  origin: boolean;
  copy: "원본" | "사본";
  arrSrc: string;
}

const DEFAULT_UI: Ui = {
  tab: "issue",
  sel: "C1",
  formSel: "ko",
  colSel: 0,
  ovrSel: "C1",
  ovrCoil: 0,
  rSel: "R1",
  rFilter: "전체",
  imgSel: "Z_MTC_SIGN_20251229.png",
  imgKind: "서명",
  origin: false,
  copy: "원본",
  arrSrc: "C3",
};

const DRAFT_DELAY_MS = 700;
const pad = (n: number) => String(n).padStart(2, "0");
/** 오늘 날짜 `YYYY.MM.DD`. */
export const todayDot = () => {
  const d = new Date();
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
/** 서버 시각(ISO) → `YYYY.MM.DD HH:mm`. */
export const fmtAt = (s: string | null | undefined) => (s ? s.replace("T", " ").replace(/-/g, ".").slice(0, 16) : "");

export class MtcStore {
  data: MtcData | null = null;
  ui: Ui = { ...DEFAULT_UI };
  loading = false;
  private version = 0;
  private listeners = new Set<() => void>();
  private pending = new Map<string, SaveParams>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly api: MtcApi,
    private onSaveError: (e: unknown) => void = () => {},
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  setUi(patch: Partial<Ui>) {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  // ───────── 서버 ─────────
  async load() {
    await this.flush();
    this.loading = true;
    this.emit();
    try {
      this.data = await this.api.search();
      this.fixSelection();
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  /** 고친 값 저장 예약. `now` 면 바로 보낸다. 같은 대상은 마지막 것만 보낸다. */
  queue(p: SaveParams, now = false) {
    this.pending.set(`${p.kind}:${p.key}`, p);
    if (this.timer) clearTimeout(this.timer);
    if (now) {
      void this.flush().catch(this.onSaveError);
      return;
    }
    this.timer = setTimeout(() => void this.flush().catch(this.onSaveError), DRAFT_DELAY_MS);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const items = [...this.pending.values()];
    this.pending.clear();
    for (const p of items) await this.api.save(p);
  }

  private fixSelection() {
    const d = this.data;
    if (!d) return;
    const ids = this.issuedIds();
    const ui = { ...this.ui };
    if (!ids.includes(ui.sel)) ui.sel = ids[0] ?? "";
    if (!ids.includes(ui.ovrSel)) ui.ovrSel = ids[0] ?? "";
    if (!d.rules.some((r) => r.id === ui.rSel)) ui.rSel = d.rules[0]?.id ?? "";
    if (!d.imgs.some((x) => x.name === ui.imgSel)) ui.imgSel = d.imgs[0]?.name ?? "";
    if (!d.certs[ui.arrSrc]) ui.arrSrc = Object.keys(d.certs)[0] ?? "";
    this.ui = ui;
  }

  // ───────── 계산 ─────────
  st(): EngineState {
    const d = this.data!;
    return { forms: d.forms, rules: d.rules, ovr: d.ovrs, certs: d.certs, imgs: d.imgs, rSel: this.ui.rSel };
  }
  resolve(id: string, mode: Mode = "applied", st = this.st()): Snap {
    return resolve(st, id, mode);
  }
  issuedOf(id: string): Issued | undefined {
    return this.data?.issued.find((x) => x.certId === id);
  }
  /** 발행된 증명서 id — 최근 발행 먼저. */
  issuedIds() {
    return [...(this.data?.issued ?? [])].sort((a, b) => b.issueNo - a.issueNo).map((x) => x.certId);
  }
  imgSrc = (name: string) => this.data?.imgs.find((x) => x.name === name)?.data || "";

  // ───────── 1 발행 ─────────
  /** 신규 수신 흉내: 원천 증명서를 새 번호로 복제(reg) → 현재 규칙으로 계산 → 발행(issue). */
  async arrive(src: string) {
    await this.flush();
    const { certId, cert } = await this.api.reg(src);
    this.data!.certs[certId] = cert;
    const snap = this.resolve(certId);
    await this.api.issue(certId, snap, `수신 → 자동 발행 (${snap.fname} v${snap.fver})`);
    this.ui = { ...this.ui, sel: certId };
    await this.load();
    return cert.head.mtc;
  }

  ovrReason(id: string) {
    return (this.data?.ovrs[id]?.reason ?? "").trim();
  }

  async reissue(id: string) {
    await this.flush();
    const snap = this.resolve(id);
    const reason = snap.nOvr ? this.ovrReason(id) : "";
    await this.api.reissue(id, snap, reason, `재발행 — 현재 규칙 (${snap.fname} v${snap.fver})${reason ? " · 수정 사유: " + reason : ""}`);
    await this.load();
  }

  async reset() {
    this.pending.clear();
    if (this.timer) clearTimeout(this.timer);
    await this.api.reset();
    this.ui = { ...DEFAULT_UI, tab: this.ui.tab, origin: this.ui.origin };
    await this.load();
  }

  confirm(code: string, snap?: Snap): Promise<VerifyResult> {
    return this.api.confirm(code, snap);
  }

  // ───────── 2 양식 편집 ─────────
  private saveForm(fk: FormKey, act: string, msg: string, now = false) {
    this.queue({ kind: "FORM", key: fk, json: this.data!.forms[fk], act, msg }, now);
  }
  formDraft(): Form {
    const fs = this.data!.forms[this.ui.formSel];
    if (!fs.draft) fs.draft = clone(fs.applied);
    return fs.draft;
  }
  private formChanged() {
    const fk = this.ui.formSel;
    const fs = this.data!.forms[fk];
    if (fs.draft && !formDiff(fs.applied, fs.draft).length) fs.draft = null;
    this.saveForm(fk, "FORM_DRAFT", `${FORMNAME[fk]} 양식 초안 수정`);
    this.emit();
  }
  setFormText(key: string, value: string) {
    this.formDraft()[key] = value;
    this.formChanged();
  }
  setColOn(i: number, on: boolean) {
    const d = this.formDraft();
    if (d.cols[i].k === "coil") return; // COIL 칸은 숨길 수 없다
    d.cols[i].on = on;
    this.formChanged();
  }
  setColLabel(i: number, label: string) {
    const d = this.formDraft();
    d.labels[d.cols[i].k] = label;
    this.formChanged();
  }
  moveCol(i: number, j: number) {
    const d = this.formDraft();
    if (j < 0 || j >= d.cols.length || i === j) return;
    const [c] = d.cols.splice(i, 1);
    d.cols.splice(j, 0, c);
    this.ui = { ...this.ui, colSel: j };
    this.formChanged();
  }
  /** 칸 순서를 키 목록으로 다시 맞춘다(끌어서 옮기기). */
  reorderCols(keys: string[]) {
    const d = this.formDraft();
    const by = new Map(d.cols.map((c) => [c.k, c]));
    const next = keys.map((k) => by.get(k)).filter((c): c is Form["cols"][number] => !!c);
    if (next.length !== d.cols.length) return;
    d.cols = next;
    this.formChanged();
  }
  addCol(k: string) {
    const d = this.formDraft();
    const x = EXTRA.find((e) => e.k === k);
    if (!x) return;
    d.labels[k] = x.lb[this.ui.formSel];
    let at = x.after ? Math.max(...d.cols.map((c, i) => (x.after!.includes(c.k) ? i : -1))) + 1 : d.cols.findIndex((c) => c.k === "surf");
    if (at <= 0) at = d.cols.length;
    d.cols.splice(at, 0, { k, on: true });
    this.ui = { ...this.ui, colSel: at };
    this.formChanged();
  }
  delCol(i: number) {
    const d = this.formDraft();
    const [c] = d.cols.splice(i, 1);
    delete d.labels[c.k];
    this.ui = { ...this.ui, colSel: Math.max(0, i - 1) };
    this.formChanged();
  }
  formRequest() {
    const fk = this.ui.formSel;
    this.data!.forms[fk].pending = true;
    this.saveForm(fk, "FORM_REQUEST", `${FORMNAME[fk]} 양식 승인 요청`, true);
    this.emit();
  }
  formUnrequest() {
    const fk = this.ui.formSel;
    this.data!.forms[fk].pending = false;
    this.saveForm(fk, "FORM_UNREQUEST", `${FORMNAME[fk]} 양식 승인 요청 취소`, true);
    this.emit();
  }
  async formApprove() {
    const fk = this.ui.formSel;
    const fs = this.data!.forms[fk];
    if (!fs.draft) return 0;
    const diff = formDiff(fs.applied, fs.draft);
    const v = fs.applied.ver + 1;
    fs.applied = { ...clone(fs.draft), ver: v };
    fs.draft = null;
    fs.pending = false;
    fs.hist.unshift({ v, at: todayDot(), memo: diff.map((x) => x.name).join(", ") });
    this.saveForm(fk, "FORM_APPROVE", `${FORMNAME[fk]} 양식 v${v} 승인 — 이후 발행분부터 적용`, true);
    this.emit();
    await this.load();
    return v;
  }
  formDiscard() {
    const fk = this.ui.formSel;
    this.data!.forms[fk].draft = null;
    this.saveForm(fk, "FORM_DISCARD", `${FORMNAME[fk]} 양식 초안 버림`, true);
    this.emit();
  }

  // ───────── 3 단건 수정 ─────────
  private ovrOf(id: string): Ovr {
    const o = this.data!.ovrs;
    return o[id] || (o[id] = { head: {} });
  }
  private cleanOvr(id: string) {
    const all = this.data!.ovrs;
    const o = all[id];
    if (!o) return;
    o.head = o.head || {};
    for (const k in o.head) if (!o.head[k]) delete o.head[k];
    if (!o.title) delete o.title;
    if (o.remark === undefined) delete o.remark;
    if (!o.form) delete o.form;
    if (o.coil && !Object.keys(o.coil).length) delete o.coil;
    if (!o.reason) delete o.reason;
    if (!Object.keys(o.head).length && !o.title && o.remark === undefined && !o.form && !o.coil && !o.reason) delete all[id];
  }
  private ovrChanged(id: string, act = "OVR_DRAFT", now = false) {
    this.cleanOvr(id);
    const o = this.data!.ovrs[id];
    const mtc = this.data!.certs[id]?.head.mtc ?? id;
    this.queue({ kind: "OVR", key: id, json: o ?? null, act: o ? act : "OVR_DELETE", msg: o ? `${mtc} 단건 수정` : `${mtc} 단건 수정 모두 지움`, reason: o?.reason ?? "" }, now || !o);
    this.emit();
  }
  setOvr(field: "reason" | "title" | "form", value: string) {
    const id = this.ui.ovrSel;
    this.ovrOf(id)[field] = value;
    this.ovrChanged(id);
  }
  setOvrHead(k: string, value: string) {
    const id = this.ui.ovrSel;
    const o = this.ovrOf(id);
    (o.head = o.head || {})[k] = value;
    this.ovrChanged(id);
  }
  setOvrRemark(value: string) {
    const id = this.ui.ovrSel;
    const o = this.ovrOf(id);
    o.remark = value;
    if (value === baseRemark(this.st(), id)) delete o.remark;
    this.ovrChanged(id);
  }
  setOvrCell(key: string, value: string) {
    const id = this.ui.ovrSel;
    const [i, k] = key.split(".");
    const org = String(this.data!.certs[id].coils[+i][k] ?? "");
    const o = this.ovrOf(id);
    o.coil = o.coil || {};
    if (value === "" || value === org) delete o.coil[key];
    else o.coil[key] = value;
    this.ovrChanged(id);
  }
  /** 한 항목 되돌리기: `head.po` · `coil.0.net` · `title` · `remark` · `form`. */
  clearOvr(key: string) {
    const id = this.ui.ovrSel;
    const o = this.ovrOf(id);
    if (key.startsWith("head.")) delete o.head?.[key.slice(5)];
    else if (key.startsWith("coil.")) delete o.coil?.[key.slice(5)];
    else delete (o as Record<string, unknown>)[key];
    this.ovrChanged(id);
  }
  clearOvrAll() {
    delete this.data!.ovrs[this.ui.ovrSel];
    this.ovrChanged(this.ui.ovrSel);
  }

  // ───────── 4 예외 규칙 ─────────
  rule(id = this.ui.rSel): Rule | undefined {
    return this.data?.rules.find((r) => r.id === id);
  }
  private saveRule(r: Rule, act: string, msg: string, now = false) {
    this.queue({ kind: "RULE", key: r.id, json: r, act, msg }, now);
  }
  rDraft(): RuleBody {
    const r = this.rule()!;
    if (!r.draft) {
      const { draft: _d, ...rest } = r;
      r.draft = clone(rest);
    }
    return r.draft;
  }
  /** 규칙 초안을 고친 뒤: 적용본과 같아지면 초안을 지운다. */
  ruleChanged() {
    const r = this.rule();
    if (!r) return;
    if (r.draft && r.ver !== 0) {
      const { draft, ...rest } = r;
      if (JSON.stringify(rest) === JSON.stringify({ ...draft })) r.draft = null;
    }
    this.saveRule(r, "RULE_DRAFT", `예외 규칙 「${(r.draft || r).name}」 초안 수정`);
    this.emit();
  }
  setRuleField(field: "name" | "val" | "prio", value: string) {
    const d = this.rDraft();
    if (field === "prio") d.prio = Math.min(99, Math.max(1, parseInt(value, 10) || 50));
    else d[field] = value;
    this.ruleChanged();
  }
  setCond(i: number, part: 0 | 1 | 2, value: string) {
    const d = this.rDraft();
    const c = d.cond[i];
    if (part === 0) {
      c[0] = value;
      if (value === "date") {
        c[1] = "≥";
        c[2] = "261101";
      } else {
        if (!["=", "≠"].includes(c[1])) c[1] = "=";
        c[2] = Object.keys(RF[value]?.o ?? {})[0] ?? "";
      }
    } else c[part] = part === 2 ? value.trim() : value;
    this.ruleChanged();
  }
  addCond() {
    this.rDraft().cond.push(["nat", "=", "IN"]);
    this.ruleChanged();
  }
  delCond(i: number) {
    this.rDraft().cond.splice(i, 1);
    this.ruleChanged();
  }
  /** 결과 종류 또는 대상을 바꾼다 — 결과 값도 그 종류에 맞게 초기화한다. */
  setTarget(kindOrTgt: { kind?: string; tgt?: string }) {
    const d = this.rDraft();
    const tg = kindOrTgt.tgt ?? Object.keys(RT).find((k) => kindOf(k) === kindOrTgt.kind)!;
    const T = RT[tg];
    const was = RT[d.tgt];
    d.tgt = tg;
    d.grp = kindOf(tg);
    if (T.vis) d.val = "hide";
    else if (T.opts) d.val = Object.keys(T.opts)[0];
    else if (T.img) d.val = this.data!.imgs.filter((x) => x.kind === T.img).pop()?.name ?? "";
    else if (was?.vis || was?.opts || was?.img) d.val = "";
    this.ruleChanged();
  }
  ruleApply() {
    const r = this.rule()!;
    const d = r.draft!;
    Object.assign(r, d, { st: "ACTIVE", ver: r.ver + 1, draft: null });
    this.saveRule(r, "RULE_APPLY", `예외 규칙 「${r.name}」 적용 (v${r.ver})`, true);
    this.emit();
  }
  ruleDiscard() {
    const r = this.rule()!;
    if (r.ver === 0) return this.ruleDelete();
    r.draft = null;
    this.saveRule(r, "RULE_DISCARD", `예외 규칙 「${r.name}」 초안 버림`, true);
    this.emit();
  }
  ruleOnOff(on: boolean) {
    const r = this.rule()!;
    r.st = on ? "ACTIVE" : "OFF";
    this.saveRule(r, on ? "RULE_ON" : "RULE_OFF", `예외 규칙 「${r.name}」 ${on ? "사용" : "사용 안 함"}`, true);
    this.emit();
  }
  ruleDelete() {
    const d = this.data!;
    const r = this.rule()!;
    d.rules = d.rules.filter((x) => x !== r);
    this.queue({ kind: "RULE", key: r.id, json: null, act: "RULE_DELETE", msg: `예외 규칙 「${r.name}」 삭제` }, true);
    this.ui = { ...this.ui, rSel: d.rules[0]?.id ?? "" };
    this.emit();
  }
  private nextUid() {
    return "U" + (Math.max(0, ...this.data!.rules.filter((r) => r.id.startsWith("U")).map((r) => Number(r.id.slice(1)) || 0)) + 1);
  }
  ruleAdd() {
    const cust = this.ui.rFilter === "고객";
    const r: Rule = {
      id: this.nextUid(),
      code: "신규",
      grp: "값",
      name: "새 규칙",
      where: "(신규 — 화면에서 등록)",
      cond: [cust ? ["cust", "=", "US-4001"] : ["nat", "=", "IN"]],
      prio: cust ? 10 : 50,
      tgt: "remarkLine",
      val: "",
      st: "OFF",
      ver: 0,
      draft: null,
    };
    this.data!.rules.push(r);
    this.ui = { ...this.ui, rSel: r.id, rFilter: "전체" };
    this.rDraft();
    this.ruleChanged();
  }

  // ───────── 5 서명·스탬프 ─────────
  isBaseImg = (name: string) => BASE_IMGS.includes(name);
  imgRules(name: string) {
    return (this.data?.rules ?? []).filter((r) => (r.tgt === "signImg" || r.tgt === "stampImg") && r.val === name);
  }
  imgInSnap(name: string) {
    return (this.data?.issued ?? []).some((I) => I.snap.signImg === name || I.snap.stampImg === name);
  }
  addImg(name: string, kind: "서명" | "도장", data: string, remark: string) {
    const d = this.data!;
    let n = name;
    let i = 2;
    while (d.imgs.some((y) => y.name === n)) n = name.replace(/(\.\w+)?$/, `_${i++}$1`);
    d.imgs.push({ name: n, kind, data, remark });
    this.ui = { ...this.ui, imgSel: n };
    this.queue({ kind: "IMG", key: n, json: { kind, remark, data }, act: "IMG_ADD", msg: `${kind} 이미지 등록 (${n})` }, true);
    this.emit();
    return n;
  }
  delImg() {
    const d = this.data!;
    const n = this.ui.imgSel;
    d.imgs = d.imgs.filter((x) => x.name !== n);
    this.ui = { ...this.ui, imgSel: "Z_MTC_SIGN_20251229.png" };
    this.queue({ kind: "IMG", key: n, json: null, act: "IMG_DELETE", msg: `이미지 삭제 (${n})` }, true);
    this.emit();
  }
  /** 「이 이미지로 규칙 만들기」 — 증명서 날짜 ≥ 261101 → 서명(도장) 이미지 = 이 파일, 초안으로. */
  imgMakeRule() {
    const x = this.data!.imgs.find((y) => y.name === this.ui.imgSel);
    if (!x) return;
    const sign = x.kind === "서명";
    const r: Rule = {
      id: this.nextUid(),
      code: "신규",
      grp: "이미지",
      name: "새 인사발령",
      where: "(신규 — 화면에서 등록)",
      cond: [["date", "≥", "261101"]],
      prio: 50,
      tgt: sign ? "signImg" : "stampImg",
      val: x.name,
      st: "OFF",
      ver: 0,
      draft: null,
    };
    this.data!.rules.push(r);
    this.ui = { ...this.ui, rSel: r.id, rFilter: "이미지", tab: "rule" };
    this.rDraft();
    this.ruleChanged();
  }

  /** 양식 편집 미리보기에 쓸 예시 증명서(그 양식을 쓰는 첫 예시). */
  formSample(fk: FormKey) {
    const st = this.st();
    return Object.keys(this.data!.certs)
      .filter((k) => k.startsWith("C"))
      .find((k) => formKeyFor(st, k) === fk);
  }
}

/** 화면에서 상태를 쓰는 훅. 값이 바뀔 때마다 다시 그린다(목업 drawAll 과 같은 단위). */
export function useMtcStore(api: MtcApi, onSaveError: (e: unknown) => void) {
  // 저장 오류 알림은 최신 함수를 쓰되 store 는 api 가 같으면 그대로 둔다(다시 만들면 고치던 값이 사라진다).
  const errRef = useRef(onSaveError);
  errRef.current = onSaveError;
  const store = useMemo(() => new MtcStore(api, (e) => errRef.current(e)), [api]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return { store, version };
}
