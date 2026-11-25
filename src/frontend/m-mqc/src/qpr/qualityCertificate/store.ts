/**
 * 품질보증서관리 화면 상태 — 서버 문서(현재 본문·적용본·버전·상태·이력)와 화면 선택 상태, 되돌리기 기록을 한곳에 둔다.
 * 고친 본문은 0.7초 모았다가 `save`(act DRAFT)로 보낸다. 승인 요청·요청 취소·초안 버리기·승인·초기화는 밀린 저장을 먼저 보낸 뒤 바로 보내고 다시 읽는다.
 * 서버에 문서가 없으면 기본 문서(DEF)를 `save`(act INIT)로 넣는다. 계약: docs/mqc/demo/wty-contract.md.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";

import type { DocState, HistRow, SearchResult, VersionRow, WtyApi } from "./api";
import { DEF, parseDoc, type WtyDoc } from "./engine/data";
import { analyze, clauseOf } from "./engine/doc";

export type TabKey = "clause" | "value" | "form" | "image" | "hist";

export interface Ui {
  tab: TabKey;
  /** 고른 조항 id. */
  sel: string;
  /** 고른 블록 자리. */
  selB: number;
  /** 찾을 문구. */
  q: string;
  /** 바뀐 곳 표시. */
  diffOn: boolean;
  /** 종이 쪽수(그린 뒤 잰 값). */
  pages: number;
}

const DEFAULT_UI: Ui = { tab: "clause", sel: "fade", selB: 0, q: "", diffOn: true, pages: 1 };
const DRAFT_DELAY_MS = 700;
const UNDO_GAP_MS = 700;
const UNDO_MAX = 60;

/** 서버 시각 `yyyy-MM-ddTHH:mm:ss` → `yyyy.MM.dd HH:mm`. */
export const fmtAt = (s: string | null | undefined) => (s ? s.replace("T", " ").replace(/-/g, ".").slice(0, 16) : "");

/** 보기 선택(브랜드·언어·등급) — 문서에 함께 실리지만 바꿔도 초안이 되지 않는다. */
type ViewKey = "brand" | "lang" | "grade";

export class WtyStore {
  doc: WtyDoc | null = null;
  base: WtyDoc | null = null;
  ver = 1;
  state: DocState = "APPLIED";
  versions: VersionRow[] = [];
  hist: HistRow[] = [];
  loading = false;
  ui: Ui = { ...DEFAULT_UI };
  private undoS: string[] = [];
  private redoS: string[] = [];
  private lastSnap = 0;
  private prevJSON = "";
  private version = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private lastMsg = "초안 수정";
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    readonly api: WtyApi,
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
  setPages(n: number) {
    if (n !== this.ui.pages) this.setUi({ pages: n });
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
  /** 적용본 대비 변경(바뀐 블록·변경 목록). */
  analysis() {
    return analyze(this.doc!, this.base);
  }

  // ───────── 서버 ─────────
  /** 진행 중인 load — 화면이 처음 열릴 때 조회가 겹쳐 들어와도 기본 문서(INIT)는 한 번만 넣는다. */
  private loadP: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loadP) this.loadP = this.doLoad().finally(() => (this.loadP = null));
    return this.loadP;
  }

  private async doLoad() {
    await this.flush();
    this.loading = true;
    this.emit();
    try {
      let res = await this.api.search();
      if (!res.doc) {
        try {
          await this.api.save({ json: JSON.stringify(DEF()), state: "APPLIED", act: "INIT", msg: "기본 문서 만들기" });
        } catch (e) {
          // 다른 창·탭이 먼저 만들었으면 다시 읽어 그 문서를 쓴다.
          res = await this.api.search();
          if (!res.doc) throw e;
        }
        res = await this.api.search();
      }
      this.apply(res);
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  private apply(res: SearchResult) {
    const sd = res.doc;
    const view = this.doc ? { brand: this.doc.brand, lang: this.doc.lang, grade: this.doc.grade } : null;
    this.doc = parseDoc(sd?.json) ?? DEF();
    // 보기 선택은 다시 읽어도 유지한다(저장 전이면 서버 본문에 없다).
    if (view) Object.assign(this.doc, view);
    this.base = parseDoc(sd?.base) ?? (sd ? parseDoc(sd.json) : null);
    this.ver = sd?.ver ?? 1;
    this.state = sd?.state ?? "APPLIED";
    this.versions = res.versions;
    this.hist = res.hist;
    this.prevJSON = JSON.stringify(this.doc);
    this.fixSelection();
  }

  private fixSelection() {
    const d = this.doc!;
    let { sel, selB } = this.ui;
    if (!clauseOf(d, sel)) sel = d.order[0] ?? "";
    const c = clauseOf(d, sel);
    if (c && selB >= c.b.length) selB = Math.max(0, c.b.length - 1);
    this.ui = { ...this.ui, sel, selB };
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
    if (!this.dirty || !this.doc) return this.chain;
    this.dirty = false;
    const json = JSON.stringify(this.doc);
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

  // ───────── 편집 ─────────
  /** 본문 고치기 — 되돌리기 기록 → 고침 → 초안 표시 → 저장 예약. 승인 대기 중이면 하지 않는다. */
  edit(msg: string, fn: (d: WtyDoc) => void) {
    if (!this.doc || this.locked) return;
    const now = Date.now();
    if (now - this.lastSnap > UNDO_GAP_MS) {
      this.undoS.push(this.prevJSON);
      if (this.undoS.length > UNDO_MAX) this.undoS.shift();
    }
    this.lastSnap = now;
    this.redoS.length = 0;
    fn(this.doc);
    if (this.state === "APPLIED") this.state = "DRAFT";
    this.prevJSON = JSON.stringify(this.doc);
    this.queueSave(msg);
    this.emit();
  }

  /** 브랜드·언어·등급 고르기(보기). 다음 저장 때 본문에 함께 실린다. */
  setView(k: ViewKey, v: string) {
    if (!this.doc) return;
    (this.doc as unknown as Record<ViewKey, string>)[k] = v;
    this.prevJSON = JSON.stringify(this.doc);
    this.emit();
  }

  private restore(j: string) {
    const d = JSON.parse(j) as WtyDoc;
    const cur = this.doc!;
    this.doc = { ...d, brand: cur.brand, lang: cur.lang, grade: cur.grade };
    this.prevJSON = JSON.stringify(this.doc);
    this.lastSnap = 0;
    if (this.state === "APPLIED") this.state = "DRAFT";
    this.fixSelection();
    this.queueSave("되돌리기");
    this.emit();
  }
  undo() {
    if (!this.canUndo) return;
    this.redoS.push(JSON.stringify(this.doc));
    this.restore(this.undoS.pop()!);
  }
  redo() {
    if (!this.canRedo) return;
    this.undoS.push(JSON.stringify(this.doc));
    this.restore(this.redoS.pop()!);
  }

  select(sel: string, selB = 0) {
    this.ui = { ...this.ui, sel, selB };
    this.fixSelection();
    this.emit();
  }

  // ───────── 승인 흐름 ─────────
  private async act(act: "REQUEST" | "UNREQUEST" | "DISCARD", state: DocState, msg: string) {
    await this.flush();
    const json = act === "DISCARD" ? "" : JSON.stringify(this.doc);
    await this.enqueue(() => this.api.save({ json, state, act, msg }));
    await this.load();
  }
  request() {
    return this.act("REQUEST", "PENDING", "승인 요청");
  }
  unrequest() {
    return this.act("UNREQUEST", "DRAFT", "승인 요청 취소");
  }
  discard() {
    this.undoS = [];
    this.redoS = [];
    return this.act("DISCARD", "APPLIED", "초안 버림 — 적용본으로 되돌림");
  }
  /** 승인 — 변경 목록 앞부분을 메모로 남긴다. 새 버전 번호를 돌려준다. */
  async approve() {
    await this.flush();
    const rows = this.analysis().rows;
    const memo = rows.length ? rows.slice(0, 6).map(([t, x]) => `${t}: ${x}`).join(" / ") + (rows.length > 6 ? ` 외 ${rows.length - 6}건` : "") : "변경 없음";
    const out = await this.enqueue(() => this.api.approve(memo));
    await this.load();
    return out.ver ?? this.ver;
  }
  /** 시연 초기화 — 서버 문서·버전·이력을 지우고 기본 문서로 다시 만든다. */
  async reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dirty = false;
    await this.enqueue(() => this.api.reset());
    this.undoS = [];
    this.redoS = [];
    this.doc = null;
    this.ui = { ...DEFAULT_UI, tab: this.ui.tab };
    await this.load();
  }
}

/** 화면에서 상태를 쓰는 훅. 값이 바뀔 때마다 다시 그린다(목업 drawAll 과 같은 단위). */
export function useWtyStore(api: WtyApi, onSaveError: (e: unknown) => void) {
  const errRef = useRef(onSaveError);
  errRef.current = onSaveError;
  const store = useMemo(() => new WtyStore(api, (e) => errRef.current(e)), [api]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return { store, version };
}
