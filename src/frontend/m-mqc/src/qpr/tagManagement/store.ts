/**
 * Tag관리 화면 상태 — 서버 문서(편집 문서 · 적용본 · 버전 · 상태 · 이력), 목업 편집 상태 S(보기 포함), 되돌리기 기록을 한곳에 둔다.
 * 고친 문서는 0.7초 모았다가 `save`(act DRAFT)로 보낸다. 승인 요청 · 요청 취소 · 승인 · 초기화는 밀린 저장을 먼저 보낸 뒤 보내고 다시 읽는다.
 * 서버에 문서가 없으면 목업 initS() 의 편집 문서를 `save`(act INIT)로 넣는다. 계약: docs/mqc/demo/tag-contract.md.
 * 정적 자료(DATA)는 처음 불러올 때 한 번 받는다(data.ts, 동적 import).
 */
import { useMemo, useRef, useSyncExternalStore } from "react";

import type { DocState, HistRow, SearchResult, TagApi, VersionRow } from "./api";
import { loadTagData } from "./data";
import { createSim, initDoc, type DragState, type Model, type Sim } from "./engine/sim";
import type { BaseDoc, Geo, SimState, TagData, TagDoc, View } from "./engine/types";

const DRAFT_DELAY_MS = 700;
const UNDO_GAP_MS = 700;
const UNDO_MAX = 80;
export const INIT_MSG = "현행 규칙 이관 (현행 SQL과 대조 검증)";

/** 서버 시각 `yyyy-MM-ddTHH:mm:ss` → `yyyy.MM.dd HH:mm`. */
export const fmtAt = (s: string | null | undefined) => (s ? s.replace("T", " ").replace(/-/g, ".").slice(0, 16) : "");

const DEFAULT_VIEW = (first: string): View => ({
  coil: first,
  pick: "p0",
  size: "std",
  media: "unknown",
  res: "screen",
  diff: true,
  names: false,
  tint: false,
  lay: false,
  gsel: null,
  gfid: null,
  zoom: "fit",
  itab: "field",
  sel: "STD_MRK_DESC_BIS",
  baseTab: "lic",
  lmode: "coil",
  role: "all",
  fmf: "all",
});

function parseDoc(j: string | null | undefined): TagDoc | null {
  if (!j) return null;
  try {
    const o = JSON.parse(j) as Partial<TagDoc>;
    if (!o || !o.data) return null;
    return { data: o.data, style: o.style || {}, geo: o.geo || {}, imgs: o.imgs || {}, facts: o.facts || {} };
  } catch {
    return null;
  }
}

/** 화면 쪽 임시 상태(서버에 없음) — 고객 요청 추가 입력, 칸 목록에서 고른 칸 · 찾기. */
export interface Ui {
  cusf: { f: string; who: string; v: string } | null;
  fmSel: string | null;
  fmQ: string;
  coilQ: string;
}

export class TagStore {
  D: TagData | null = null;
  S: SimState | null = null;
  sim: Sim | null = null;
  ver = 1;
  state: DocState = "APPLIED";
  versions: VersionRow[] = [];
  hist: HistRow[] = [];
  loading = false;
  ui: Ui = { cusf: null, fmSel: null, fmQ: "", coilQ: "" };
  drag: DragState | null = null;
  guides: [string, number][] = [];
  private undoS: string[] = [];
  private redoS: string[] = [];
  private lastSnap = 0;
  private prevJSON = "";
  private version = 0;
  private mVer = -1;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private lastMsg = "초안 수정";
  private chain: Promise<unknown> = Promise.resolve();
  private loadP: Promise<void> | null = null;

  constructor(
    readonly api: TagApi,
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

  /** 지금 코일의 TAG(지금 · 적용본) — 상태가 바뀐 뒤 한 번만 다시 계산한다. */
  model(): { CUR: Model; BASE: Model } {
    if (this.mVer !== this.version) {
      this.sim!.compute();
      this.mVer = this.version;
    }
    return { CUR: this.sim!.cur(), BASE: this.sim!.base() };
  }

  get view() {
    return this.S!.view;
  }
  /** 승인 대기 중에는 고칠 수 없다(서버도 거부한다). */
  get locked() {
    return this.state === "PENDING";
  }
  get canUndo() {
    return !this.locked && this.undoS.length > 0;
  }
  get canRedo() {
    return !this.locked && this.redoS.length > 0;
  }
  private docJSON() {
    const S = this.S!;
    return JSON.stringify({ data: S.data, style: S.style, geo: S.geo, imgs: S.imgs, facts: S.facts });
  }

  // ───────── 서버 ─────────
  /** 진입 때 포털이 두 번 겹쳐 불러도 한 번만 읽는다(겹친 INIT 이 PK 오류를 내지 않게). */
  load(): Promise<void> {
    if (!this.loadP) this.loadP = this.doLoad().finally(() => (this.loadP = null));
    return this.loadP;
  }

  private async doLoad() {
    await this.flush();
    this.loading = true;
    this.emit();
    try {
      const D = this.D ?? (await loadTagData());
      let res = await this.api.search();
      if (!res.doc) {
        try {
          await this.api.save({ json: JSON.stringify(initDoc(D)), state: "APPLIED", act: "INIT", msg: INIT_MSG });
        } catch (e) {
          // 다른 창 · 탭이 먼저 만들었으면 다시 읽어 그 문서를 쓴다.
          res = await this.api.search();
          if (!res.doc) throw e;
        }
        res = await this.api.search();
      }
      this.apply(D, res);
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  private apply(D: TagData, res: SearchResult) {
    const sd = res.doc;
    const doc = parseDoc(sd?.json) ?? initDoc(D);
    const b = parseDoc(sd?.base) ?? doc;
    const base: BaseDoc = { data: b.data, style: b.style, geo: b.geo, imgs: b.imgs };
    if (!this.S || !this.sim) {
      this.D = D;
      this.S = { ...doc, base, view: DEFAULT_VIEW(D.first), review: {}, wit: {} };
      this.sim = createSim(D, this.S);
    } else Object.assign(this.S, doc, { base });
    this.ver = sd?.ver ?? 1;
    this.state = sd?.state ?? "APPLIED";
    this.versions = res.versions;
    this.hist = res.hist;
    this.prevJSON = this.docJSON();
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** 밀린 초안 저장을 보낸다. */
  flush(): Promise<unknown> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty || !this.S) return this.chain;
    this.dirty = false;
    const json = this.docJSON();
    const state: DocState = this.state === "PENDING" ? "DRAFT" : this.state;
    const msg = this.lastMsg;
    return this.enqueue(() => this.api.save({ json, state, act: "DRAFT", msg }));
  }

  private queueSave(msg: string) {
    this.dirty = true;
    this.lastMsg = msg;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush().catch(this.onSaveError), DRAFT_DELAY_MS);
  }

  /** 적용본과 같으면 적용본, 다르면 초안(목업 commit). 코일 조건(facts)은 비교하지 않는다. */
  private settle(msg: string) {
    this.state = this.sim!.sameAsBase() ? "APPLIED" : "DRAFT";
    this.prevJSON = this.docJSON();
    this.queueSave(msg);
    this.emit();
  }

  private snap(before: string) {
    const now = Date.now();
    if (now - this.lastSnap > UNDO_GAP_MS) {
      this.undoS.push(before);
      if (this.undoS.length > UNDO_MAX) this.undoS.shift();
      this.redoS.length = 0;
    }
    this.lastSnap = now;
  }

  // ───────── 편집 ─────────
  /** 문서 고치기 — 되돌리기 기록 → 고침 → 초안 표시 → 저장 예약. 승인 대기 중이면 하지 않는다(코일 조건은 시험 입력이라 예외). */
  edit(msg: string, fn: (S: SimState, sim: Sim) => void, opts: { factsOnly?: boolean } = {}) {
    if (!this.S || (this.locked && !opts.factsOnly)) return;
    const before = this.prevJSON;
    fn(this.S, this.sim!);
    if (this.docJSON() === before) {
      this.emit();
      return;
    }
    if (this.locked) {
      // 승인 대기 중 코일 조건만 바꾼 것 — 서버가 저장을 거부하므로 화면에만 둔다.
      this.prevJSON = this.docJSON();
      this.emit();
      return;
    }
    this.snap(before);
    this.settle(msg);
  }

  /** 보기 바꾸기(저장하지 않음). */
  setView(patch: Partial<View>) {
    if (!this.S) return;
    Object.assign(this.S.view, patch);
    this.emit();
  }
  setUi(patch: Partial<Ui>) {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }
  /** 현행과 다른 것 판정 · 메모(이 화면을 연 동안만 남는다). */
  setReview(k: string, patch: { v?: string; memo?: string }) {
    const rv = this.S!.review;
    rv[k] = { ...rv[k], ...patch };
    if (!rv[k].v && !rv[k].memo) delete rv[k];
    this.emit();
  }

  /** 코일 · 양식으로 가기(현행과 다른 것 · 예시 코일 · 겹침 예시에서). field 를 주면 그 칸을 연다. */
  showCoilForm(id: string, form: string, field?: string) {
    const pick = this.sim!.pickFor(id, form);
    this.ui = { ...this.ui, cusf: null };
    Object.assign(this.S!.view, { coil: id, pick, ...(field ? { sel: field, itab: "field" } : {}) });
    this.emit();
  }

  private restore(j: string) {
    const o = JSON.parse(j) as TagDoc;
    Object.assign(this.S!, { data: o.data, style: o.style, geo: o.geo || {}, imgs: o.imgs, facts: o.facts || {} });
    this.lastSnap = 0;
    this.settle("되돌리기");
  }
  undo() {
    if (!this.canUndo) return;
    this.redoS.push(this.docJSON());
    this.restore(this.undoS.pop()!);
  }
  redo() {
    if (!this.canRedo) return;
    this.undoS.push(this.docJSON());
    this.restore(this.redoS.pop()!);
  }

  // ───────── 칸 옮기기(끌기) ─────────
  startDrag(d: Omit<DragState, "before" | "moved">) {
    if (this.locked) return;
    this.drag = { ...d, before: this.prevJSON, moved: false };
  }
  /** 끄는 중 — 배치만 바꾸고 다시 그린다(저장 · 되돌리기 기록은 놓을 때). */
  dragTo(g: Geo, guides: [string, number][]) {
    if (!this.drag) return;
    this.drag.moved = true;
    this.sim!.setGeo(this.drag.key, this.drag.gid, g);
    this.guides = guides;
    this.emit();
  }
  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.guides = [];
    Object.assign(this.S!.view, { gsel: d.gid, gfid: this.model().CUR.fid });
    if (d.moved && this.docJSON() !== d.before) {
      this.snap(d.before);
      this.settle("칸 옮기기");
    } else this.emit();
  }

  // ───────── 승인 흐름 ─────────
  private async act(act: "REQUEST" | "UNREQUEST", state: DocState, msg: string) {
    await this.flush();
    const json = this.docJSON();
    await this.enqueue(() => this.api.save({ json, state, act, msg }));
    await this.load();
  }
  request() {
    return this.act("REQUEST", "PENDING", "승인 요청 — 바꾼 것 " + this.sim!.changes().length + "건");
  }
  unrequest() {
    return this.act("UNREQUEST", this.sim!.sameAsBase() ? "APPLIED" : "DRAFT", "승인 요청 취소");
  }
  /** 승인 — 바꾼 것 앞부분 + 가상 코일 영향 수를 메모로 남긴다. 새 버전 번호를 돌려준다. */
  async approve() {
    await this.flush();
    const memo = this.sim!.changesNote();
    const out = await this.enqueue(() => this.api.approve(memo));
    this.undoS = [];
    this.redoS = [];
    await this.load();
    return out.ver ?? this.ver;
  }
  /** 시연 초기화 — 서버 문서 · 버전 · 이력을 지우고 현행 규칙 이관본으로 다시 만든다. */
  async reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dirty = false;
    await this.enqueue(() => this.api.reset());
    this.undoS = [];
    this.redoS = [];
    if (this.S) {
      this.S.review = {};
      this.S.view.lay = false;
    }
    await this.load();
  }
}

/** 화면에서 상태를 쓰는 훅. 값이 바뀔 때마다 다시 그린다(목업 redraw 와 같은 단위). */
export function useTagStore(api: TagApi, onSaveError: (e: unknown) => void) {
  const errRef = useRef(onSaveError);
  errRef.current = onSaveError;
  const store = useMemo(() => new TagStore(api, (e) => errRef.current(e)), [api]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return { store, version };
}
