/**
 * commPermMng 칩 상태 계산 — 화면에서 뗀 순수 함수(perm-bench f5, 시안 v16 lgPermNext).
 *
 * 퍼미션 한 건 = 역할 × 오브젝트. 버튼·팝업은 오브젝트 허용 값 안에서만 켠다(D15).
 * - 실제로 켜지는 값 = 퍼미션 값 ∩ 오브젝트 허용 값(오브젝트 순서). 밖 값은 남겨 두되 줄 그어 보이고 계산에서 뺀다.
 * - 마지막 버튼을 끄면 퍼미션을 뺀다(D14 — 버튼 없는 퍼미션 금지).
 * - 「조회만」 = 서버가 내려준 OBJ_READ_PERM(D18). 화면이 규칙을 따로 두지 않는다.
 * - 저장 줄에는 밖 값을 넣지 않는다(서버 ⊆ 검사 PERM_NOT_IN_OBJ). DATA_PERM 은 받은 그대로 넘긴다(D21).
 */
import type { PermRow, PermSaveRow } from "./types";

export type PermKind = "btn" | "pop";

/** 퍼미션 한 건의 값. has=false 면 퍼미션 행이 없다(btn·pop 은 빈 배열). */
export interface PermValue {
  has: boolean;
  btn: string[];
  pop: string[];
}

/** 화면이 들고 있는 바뀐 퍼미션 한 건(키 ROLE_ID|OBJECT_ID). */
export interface PermEntry {
  roleId: string;
  objectId: string;
  /** 조회 때 받은 값. */
  base: PermValue;
  /** 지금 값(밖 값은 건드리지 않으면 그대로 남는다). */
  cur: PermValue;
  /** 조회 때 받은 DATA_PERM — 저장 때 그대로 넘긴다. */
  dataPerm: string;
  /** 오브젝트 허용 값 — 저장 줄에서 밖 값을 뺄 때 쓴다. */
  allowedBtn: string[];
  allowedPop: string[];
}

export type PermRowState = "" | "new" | "gone" | "empty" | "changed";

/** 칩 한 개의 모습. */
export interface ChipState {
  code: string;
  /** 켜짐. */
  on: boolean;
  /** 오브젝트에서 빠진 값(줄 긋고 누를 수 없음). */
  out: boolean;
  /** 조회 때와 켜짐이 다르다. */
  changed: boolean;
  /** 버튼·팝업 코드 조회 조건에 걸린 값. */
  hit: boolean;
  /** 누를 수 없음(퍼미션 없음 또는 밖 값). */
  disabled: boolean;
}

export const NO_PERM: PermValue = Object.freeze({ has: false, btn: [], pop: [] }) as PermValue;

export const permKey = (roleId: string, objectId: string): string => `${roleId}|${objectId}`;

/** 콤마·공백으로 나눈 코드 목록(빈 값·중복 제거, 처음 나온 순서). */
export function splitCodes(v: unknown): string[] {
  const out: string[] = [];
  for (const raw of String(v ?? "").split(/[\s,]+/)) {
    const t = raw.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export const joinCodes = (list: readonly string[]): string => list.join(",");

/** 실제로 켜지는 값 = values ∩ allowed, 오브젝트(allowed) 순서. */
export function effective(values: readonly string[], allowed: readonly string[]): string[] {
  const set = new Set(values);
  return allowed.filter((a) => set.has(a));
}

/** 오브젝트에서 빠진 값(values 중 allowed 밖). */
export function outOfObject(values: readonly string[], allowed: readonly string[]): string[] {
  const set = new Set(allowed);
  return values.filter((v) => !set.has(v));
}

/** 순서를 보지 않는 같음. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** 조회 줄 → 조회 때 값. */
export function baseValue(row: PermRow): PermValue {
  if (row.HAS_PERM !== "Y") return NO_PERM;
  return { has: true, btn: splitCodes(row.BTN_PERM), pop: splitCodes(row.POPUP_PERM) };
}

export interface ObjAllowed {
  btn: string[];
  pop: string[];
  /** 「조회만」 값(허용 값 안으로 좁힌 것). */
  read: string[];
}

export function allowedOf(row: PermRow): ObjAllowed {
  const btn = splitCodes(row.OBJ_BTN_PERM);
  return { btn, pop: splitCodes(row.OBJ_POPUP_PERM), read: effective(splitCodes(row.OBJ_READ_PERM), btn) };
}

/** 바뀐 것이 있나(둘 다 퍼미션 없음이면 같다). */
export function isDirty(base: PermValue, cur: PermValue): boolean {
  if (base.has !== cur.has) return true;
  if (!cur.has) return false;
  return !sameSet(base.btn, cur.btn) || !sameSet(base.pop, cur.pop);
}

export function rowState(base: PermValue, cur: PermValue): PermRowState {
  if (cur.has && !base.has) return "new";
  if (!cur.has && base.has) return "gone";
  if (!cur.has) return "empty";
  return isDirty(base, cur) ? "changed" : "";
}

/**
 * 칩 한 줄. 허용 값(오브젝트 순서) 먼저, 그 뒤에 퍼미션에 남은 밖 값.
 * codeQ 는 대소문자를 보지 않는 부분 일치.
 */
export function chipStates(
  allowed: readonly string[],
  cur: readonly string[],
  base: readonly string[],
  has: boolean,
  codeQ: string,
): ChipState[] {
  const q = codeQ.trim().toLowerCase();
  const hit = (c: string) => !!q && c.toLowerCase().includes(q);
  const curSet = new Set(cur);
  const baseSet = new Set(base);
  const chips: ChipState[] = allowed.map((code) => {
    const on = has && curSet.has(code);
    return { code, on, out: false, changed: on !== baseSet.has(code), hit: hit(code), disabled: !has };
  });
  for (const code of outOfObject(cur, allowed)) {
    chips.push({ code, on: false, out: true, changed: false, hit: hit(code), disabled: true });
  }
  return chips;
}

/**
 * 칩 묶음·토큰 입력이 준 켜진 값으로 바꾼다. 허용 밖 값은 받지 않고, 퍼미션에 원래 있던 밖 값은 그대로 남긴다.
 * 버튼이 하나도 안 남으면 퍼미션 빼기(D14 — 마지막 칩 끄기·「모두 지우기」). 퍼미션이 없으면 그대로.
 */
export function setCodes(cur: PermValue, kind: PermKind, next: readonly string[], allowed: readonly string[]): PermValue {
  if (!cur.has) return cur;
  const kept = effective(next, allowed);
  if (kind === "btn" && kept.length === 0) return NO_PERM;
  const keptOut = outOfObject(cur[kind], allowed);
  const merged = [...kept, ...keptOut];
  if (sameSet(merged, cur[kind]) && merged.length === cur[kind].length) return cur;
  return { ...cur, [kind]: merged };
}

/** 칩 하나 켜고 끄기(setCodes 를 거친다). */
export function toggleCode(cur: PermValue, kind: PermKind, code: string, allowed: readonly string[]): PermValue {
  if (!cur.has || !allowed.includes(code)) return cur;
  const eff = effective(cur[kind], allowed);
  return setCodes(cur, kind, eff.includes(code) ? eff.filter((x) => x !== code) : [...eff, code], allowed);
}

/** 퍼미션 만들기. read = 「조회만」, all = 오브젝트 값 모두(버튼·팝업). 만들 수 없으면 null. */
export function makeValue(level: "read" | "all", a: ObjAllowed): PermValue | null {
  if (level === "read") return a.read.length ? { has: true, btn: [...a.read], pop: [] } : null;
  return a.btn.length ? { has: true, btn: [...a.btn], pop: [...a.pop] } : null;
}

/** 버튼 값이 「모두」·「조회만」 과 같은가(밖 값은 보지 않는다). */
export function presetMatch(btn: readonly string[], a: ObjAllowed): { all: boolean; read: boolean } {
  const eff = effective(btn, a.btn);
  return {
    all: eff.length > 0 && eff.length === a.btn.length,
    read: a.read.length > 0 && sameSet(eff, a.read),
  };
}

/** 바뀐 한 건을 만든다. 조회 때와 같으면 null(목록에서 뺀다). */
export function entryOf(row: PermRow, cur: PermValue): PermEntry | null {
  const base = baseValue(row);
  if (!isDirty(base, cur)) return null;
  const a = allowedOf(row);
  return {
    roleId: row.ROLE_ID,
    objectId: row.OBJECT_ID,
    base,
    cur,
    dataPerm: String(row.DATA_PERM ?? ""),
    allowedBtn: a.btn,
    allowedPop: a.pop,
  };
}

/** 바뀐 건 → 저장 줄. 있음 = MERGE(허용 값 안만), 없어짐 = DEL. 바뀌지 않은 건은 보내지 않는다. */
export function toSaveRows(entries: Iterable<PermEntry>): PermSaveRow[] {
  const out: PermSaveRow[] = [];
  for (const e of entries) {
    if (!isDirty(e.base, e.cur)) continue;
    if (e.cur.has) {
      out.push({
        ROLE_ID: e.roleId,
        OBJECT_ID: e.objectId,
        BTN_PERM: joinCodes(effective(e.cur.btn, e.allowedBtn)),
        POPUP_PERM: joinCodes(effective(e.cur.pop, e.allowedPop)),
        DATA_PERM: e.dataPerm,
        OP_TP: "MERGE",
      });
    } else if (e.base.has) {
      out.push({
        ROLE_ID: e.roleId,
        OBJECT_ID: e.objectId,
        BTN_PERM: joinCodes(e.base.btn),
        POPUP_PERM: joinCodes(e.base.pop),
        DATA_PERM: e.dataPerm,
        OP_TP: "DEL",
      });
    }
  }
  return out;
}

/**
 * 저장하면 버튼이 하나도 남지 않는 MERGE 건(D14 — 서버가 PERM_EMPTY_BTN 으로 거절).
 * 버튼 값이 모두 오브젝트 밖이 된 퍼미션에서 팝업만 고치면 생긴다. 저장 전에 막는다.
 */
export function findEmptyBtn(entries: Iterable<PermEntry>): PermEntry[] {
  const out: PermEntry[] = [];
  for (const e of entries) {
    if (isDirty(e.base, e.cur) && e.cur.has && effective(e.cur.btn, e.allowedBtn).length === 0) out.push(e);
  }
  return out;
}

/** 오브젝트 밖 값 안내 한 줄(D15 — 바꿔 저장하면 빠진다). 밖 값이 없으면 null. */
export function outNotice(values: readonly string[], allowed: readonly string[]): string | null {
  const out = outOfObject(values, allowed);
  return out.length ? `오브젝트에 없는 값 ${out.join(", ")} 는 저장 때 빠집니다` : null;
}

/**
 * 저장이 끝난 값을 조회 줄에 접어 넣는다 — 다시 조회가 늦거나 실패해도 화면이 저장 전 값으로 돌아가 보이지 않게.
 * 접은 값 = 서버에 간 값(허용 값 안만). 바뀐 건이 없는 줄은 같은 객체를 돌려준다.
 */
export function foldSaved(rows: readonly PermRow[], pending: ReadonlyMap<string, PermEntry>): PermRow[] {
  return rows.map((r) => {
    const e = pending.get(permKey(r.ROLE_ID, r.OBJECT_ID));
    if (!e || !isDirty(e.base, e.cur)) return r;
    if (!e.cur.has) return { ...r, HAS_PERM: "N", BTN_PERM: "", POPUP_PERM: "" };
    return {
      ...r,
      HAS_PERM: "Y",
      BTN_PERM: joinCodes(effective(e.cur.btn, e.allowedBtn)),
      POPUP_PERM: joinCodes(effective(e.cur.pop, e.allowedPop)),
    };
  });
}

/** 다른 역할 퍼미션 짧은 표시: 모두 · 조회 · n/m. */
export function shortSummary(btn: unknown, a: ObjAllowed): string {
  const eff = effective(splitCodes(btn), a.btn);
  if (!eff.length) return "0";
  const m = presetMatch(eff, a);
  if (m.all) return "모두";
  if (m.read) return "조회";
  return `${eff.length}/${a.btn.length}`;
}

/** 그리드·오른쪽 패널이 읽는 줄 — 조회 줄 + 지금 값·칩 모습(렌더 함수는 이 줄만 읽는다). */
export interface PermViewRow extends PermRow {
  __key: string;
  __state: PermRowState;
  __cur: PermValue;
  __base: PermValue;
  __allowed: ObjAllowed;
  __btnChips: ChipState[];
  __popChips: ChipState[];
  /** 오브젝트 밖 값 안내(없으면 null). */
  __btnOut: string | null;
  __popOut: string | null;
  /** AgDataGrid 행 상태 표시(added·modified·deleted) — 값이 바뀐 줄만 그리드가 다시 그린다. */
  _rowState: "" | "added" | "modified" | "deleted";
}

const GRID_ROW_STATE: Record<PermRowState, PermViewRow["_rowState"]> = {
  "": "",
  empty: "",
  new: "added",
  changed: "modified",
  gone: "deleted",
};

/** 조회 줄 + 바뀐 건(없으면 조회 때 값) → 보기 줄. */
export function toViewRow(row: PermRow, entry: PermEntry | undefined, codeQ: string): PermViewRow {
  const base = entry?.base ?? baseValue(row);
  const cur = entry?.cur ?? base;
  const a = allowedOf(row);
  const state = rowState(base, cur);
  return {
    ...row,
    // 칸 값 = 지금 값(밖 값 포함, 퍼미션 없으면 ""). AG Grid 는 칸 값이 바뀔 때만 칸을 다시 그리므로
    // 조회 때 문자열을 두면 같은 줄을 두 번째로 고칠 때부터 칩이 낡는다. 엑셀·빠른 검색도 지금 값을 본다.
    BTN_PERM: joinCodes(cur.btn),
    POPUP_PERM: joinCodes(cur.pop),
    __key: permKey(row.ROLE_ID, row.OBJECT_ID),
    __state: state,
    _rowState: GRID_ROW_STATE[state],
    __cur: cur,
    __base: base,
    __allowed: a,
    __btnChips: chipStates(a.btn, cur.btn, base.btn, cur.has, codeQ),
    __popChips: chipStates(a.pop, cur.pop, base.pop, cur.has, codeQ),
    __btnOut: cur.has ? outNotice(cur.btn, a.btn) : null,
    __popOut: cur.has ? outNotice(cur.pop, a.pop) : null,
  };
}
