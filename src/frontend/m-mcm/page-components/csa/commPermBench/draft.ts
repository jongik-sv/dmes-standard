/**
 * commPermBench 초안 순수 계산(2단계 f3) — 화면 상태·API 와 떨어진 함수만 둔다(f8 이 vitest 로 시험한다).
 *
 * 초안 = 현재(CUR) 값과 다른 것만 담은 변경 목록(PermChangeRow). 키 `TP|KEY1|KEY2` 마다 한 줄.
 *   - 체크를 현재 값으로 되돌리면 그 줄을 지운다(되돌리기 = 줄 지우기).
 *   - 퍼미션(ROLE_OBJ): 현재 행 없음 → ADD, 버튼이 비면 DEL(D14 마지막 칩 끄기 = 퍼미션 빼기), 값이 다르면 UPD.
 *   - 오브젝트 밖 값(D15, 서버 ⊆ 검사): 사용자가 고친 줄만 저장 값에서 뺀다. 고친 값이 현재 값과 같으면 줄을 지워
 *     오브젝트 밖 값이 말없이 빠지지 않게 한다.
 * 화면 값 = 서버 현재 값 + 초안(overlayBench·overlayRolePerm). 서버의 DRAFT source 는 저장한 초안만 안다.
 */
import { parseTokens } from "@dk-oasis/shared/token-chip-input";
import {
  PERM_SYSADMIN_ROLE_ID,
  PermApplyError,
  fromDraftChange,
  type DraftChange,
  type ImpactRow,
  type PermChangeRow,
  type PermChangeTp,
  type RolePermRow,
} from "./types";
import { fmtNum, hasPerm, type BenchIndex, type RolePermMap } from "./model";

/** 초안 = 키 → 변경 한 줄(넣은 순서 유지). */
export type DraftMap = ReadonlyMap<string, PermChangeRow>;

export const EMPTY_DRAFT: DraftMap = new Map();

export const changeKey = (tp: PermChangeTp, key1: string, key2: string): string => `${tp}|${key1}|${key2}`;
export const keyOf = (c: PermChangeRow): string => changeKey(c.TP, c.KEY1, c.KEY2);

/** 변경 줄 목록 → 초안. 같은 키가 둘이면 뒤 것이 이긴다. */
export function draftFromRows(rows: readonly PermChangeRow[]): Map<string, PermChangeRow> {
  const out = new Map<string, PermChangeRow>();
  for (const r of rows) {
    const k = keyOf(r);
    out.delete(k);
    out.set(k, r);
  }
  return out;
}

export const draftRows = (d: DraftMap): PermChangeRow[] => [...d.values()];

// 서명 캐시 — 편집마다 새 Map 이 생기지만 바뀌지 않은 줄은 같은 객체다. 줄 글은 줄마다 한 번, 서명은 Map 마다 한 번만 만든다(f3 리뷰 4).
const rowJsonCache = new WeakMap<PermChangeRow, string>();
const rowJson = (r: PermChangeRow): string => {
  let s = rowJsonCache.get(r);
  if (s === undefined) rowJsonCache.set(r, (s = JSON.stringify(r)));
  return s;
};
/** 최근 서명 → 줄(서명 글을 다시 JSON.parse 하지 않게). 작게 둔다. */
const SIG_ROWS_MAX = 16;
const sigRows = new Map<string, readonly PermChangeRow[]>();
const sigOf = (rows: readonly PermChangeRow[]): string => {
  const sig = `[${rows.map(rowJson).join(",")}]`;
  if (!sigRows.has(sig)) {
    if (sigRows.size >= SIG_ROWS_MAX) sigRows.delete(sigRows.keys().next().value as string);
    sigRows.set(sig, rows);
  }
  return sig;
};

/** 서명 글 → 줄. 방금 만든 서명이면 그 줄을 그대로(복사 없이) 돌려주고, 모르면 JSON.parse 한다. 돌려받은 줄은 고치지 않는다. */
export const rowsOfSig = (sig: string): readonly PermChangeRow[] => sigRows.get(sig) ?? (JSON.parse(sig) as PermChangeRow[]);
function cached(cache: WeakMap<DraftMap, string>, d: DraftMap, make: () => string): string {
  let s = cache.get(d);
  if (s === undefined) cache.set(d, (s = make()));
  return s;
}
const sigCache = new WeakMap<DraftMap, string>();
const linkSigCache = new WeakMap<DraftMap, string>();
const permSigCache = new WeakMap<DraftMap, string>();
const roleSigCache = new WeakMap<DraftMap, Map<string, string>>();

/** 초안 비교용 서명(같은 내용이면 같은 글 = JSON.stringify(draftRows(d))). */
export const draftSig = (d: DraftMap): string => cached(sigCache, d, () => sigOf(draftRows(d)));

/**
 * 서버 초안 CHANGES_JSON(camelCase) 읽기. 배열이 아니거나 JSON 이 깨졌으면 PermApplyError(PERM_DRAFT_CORRUPT).
 */
export function parseChangesJson(json: string | null | undefined): Map<string, PermChangeRow> {
  if (!json) return new Map();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new PermApplyError("PERM_DRAFT_CORRUPT", "초안 JSON 을 읽지 못했습니다.");
  }
  if (!Array.isArray(raw)) throw new PermApplyError("PERM_DRAFT_CORRUPT", "초안 JSON 이 목록이 아닙니다.");
  const rows: PermChangeRow[] = [];
  for (const x of raw as DraftChange[]) {
    if (!x || typeof x !== "object" || !x.tp || !x.key1 || !x.key2 || !x.op) throw new PermApplyError("PERM_DRAFT_CORRUPT", "초안 줄 모양이 맞지 않습니다.");
    rows.push(fromDraftChange(x));
  }
  return draftFromRows(rows);
}

const sameRow = (a: PermChangeRow | undefined, b: PermChangeRow) => !!a && a.OP === b.OP && a.BTN_PERM === b.BTN_PERM && a.POPUP_PERM === b.POPUP_PERM;

const withSet = (d: DraftMap, k: string, row: PermChangeRow): DraftMap => {
  if (sameRow(d.get(k), row)) return d;
  const next = new Map(d);
  next.delete(k);
  next.set(k, row);
  return next;
};

const withDelete = (d: DraftMap, k: string): DraftMap => {
  if (!d.has(k)) return d;
  const next = new Map(d);
  next.delete(k);
  return next;
};

/** 줄 하나 되돌리기. */
export const revertChange = (d: DraftMap, key: string): DraftMap => withDelete(d, key);

// ── 소속(사람 ↔ 그룹 · 그룹 ↔ 역할) ─────────────────────────

/**
 * 사람 ↔ 그룹(USER_GRP: KEY1 USER_ID · KEY2 ROLE_GROUP_ID) 또는 그룹 ↔ 역할(GRP_ROLE: KEY1 ROLE_GROUP_ID · KEY2 ROLE_ID) 체크.
 * curOn = 현재 값. on 이 현재 값과 같으면 줄을 지운다.
 */
export function setLink(d: DraftMap, tp: "USER_GRP" | "GRP_ROLE", key1: string, key2: string, on: boolean, curOn: boolean): DraftMap {
  const k = changeKey(tp, key1, key2);
  if (on === curOn) return withDelete(d, k);
  return withSet(d, k, { TP: tp, KEY1: key1, KEY2: key2, OP: on ? "ADD" : "DEL", BTN_PERM: null, POPUP_PERM: null });
}

/** 초안을 얹은 작업대 색인. 소속 변경이 없으면 같은 객체. */
export function overlayBench(idx: BenchIndex, d: DraftMap | readonly PermChangeRow[]): BenchIndex {
  const rows = (Array.isArray(d) ? d : draftRows(d as DraftMap)).filter((c) => c.TP === "USER_GRP" || c.TP === "GRP_ROLE");
  if (!rows.length) return idx;
  const userGroups = new Map([...idx.userGroups].map(([k, v]) => [k, [...v]]));
  const groupRoles = new Map([...idx.groupRoles].map(([k, v]) => [k, [...v]]));
  const edit = (m: Map<string, string[]>, k: string, v: string, add: boolean) => {
    const list = m.get(k) ?? [];
    if (add) {
      if (!list.includes(v)) m.set(k, [...list, v]);
    } else m.set(k, list.filter((x) => x !== v));
  };
  for (const c of rows) edit(c.TP === "USER_GRP" ? userGroups : groupRoles, c.KEY1, c.KEY2, c.OP !== "DEL");
  const roleGroups = new Map<string, string[]>();
  for (const [g, rs] of groupRoles) {
    for (const r of rs) {
      const list = roleGroups.get(r);
      if (!list) roleGroups.set(r, [g]);
      else if (!list.includes(g)) list.push(g);
    }
  }
  return { ...idx, userGroups, groupRoles, roleGroups };
}

/** 소속 변경만 뽑은 서명(작업대 색인 memo 키 — 퍼미션 칩을 바꿔도 색인이 그대로다). */
export const linkSig = (d: DraftMap): string => cached(linkSigCache, d, () => sigOf(draftRows(d).filter((c) => c.TP !== "ROLE_OBJ")));

/** 퍼미션 변경(ROLE_OBJ)만 뽑은 서명(퍼미션 overlay memo 키). */
export const permSig = (d: DraftMap): string => cached(permSigCache, d, () => sigOf(draftRows(d).filter((c) => c.TP === "ROLE_OBJ")));

/** 역할 하나의 퍼미션 변경 서명. */
export const roleSig = (d: DraftMap, roleId: string): string => {
  let m = roleSigCache.get(d);
  if (!m) roleSigCache.set(d, (m = new Map()));
  let s = m.get(roleId);
  if (s === undefined) m.set(roleId, (s = sigOf(draftRows(d).filter((c) => c.TP === "ROLE_OBJ" && c.KEY1 === roleId))));
  return s;
};

/** 퍼미션 변경이 있는 역할 ID 들. */
export const draftRoleIds = (d: DraftMap | readonly PermChangeRow[]): string[] =>
  [...new Set((Array.isArray(d) ? d : draftRows(d as DraftMap)).filter((c) => c.TP === "ROLE_OBJ").map((c) => c.KEY1))];

/** SYSADMIN 이 걸린 그룹인가(현재 또는 초안에서 그 그룹이 SYSADMIN 역할을 준다). */
export const groupGivesSysadmin = (idx: BenchIndex, groupId: string): boolean => (idx.groupRoles.get(groupId) ?? []).includes(PERM_SYSADMIN_ROLE_ID);

// ── 퍼미션(ROLE_OBJ) ─────────────────────────────────────────

/** 한 역할 × 한 오브젝트의 현재 값(초안 계산의 기준). */
export interface PermBase {
  has: boolean;
  btn: string[];
  popup: string[];
  /** 오브젝트 허용 값. */
  allowedBtn: string[];
  allowedPopup: string[];
  /** 「조회만」 값(서버 OBJ_READ_PERM, D18). */
  readBtn: string[];
}

export function permBaseOf(row: RolePermRow | undefined): PermBase {
  const allowedBtn = parseTokens(row?.OBJ_BTN_PERM);
  return {
    has: hasPerm(row),
    btn: hasPerm(row) ? parseTokens(row.BTN_PERM) : [],
    popup: hasPerm(row) ? parseTokens(row.POPUP_PERM) : [],
    allowedBtn,
    allowedPopup: parseTokens(row?.OBJ_POPUP_PERM),
    readBtn: parseTokens(row?.OBJ_READ_PERM).filter((x) => allowedBtn.includes(x)),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** 허용 값 안만 남긴다(허용 값 순서). */
const keepAllowed = (list: readonly string[], allowed: readonly string[]) => allowed.filter((x) => list.includes(x));

/** 오브젝트 밖 값(현재 줄에 있지만 허용 값에 없는 값). */
export const outsideOf = (b: PermBase): string[] => [...b.btn.filter((x) => !b.allowedBtn.includes(x)), ...b.popup.filter((x) => !b.allowedPopup.includes(x))];

/**
 * 퍼미션 값을 바꾼다. btn·popup 에 오브젝트 밖 값이 있어도 저장 줄에서는 뺀다(D15).
 * - 버튼이 비면: 현재 행이 있으면 DEL, 없으면 줄 지움(D14)
 * - 허용 값 안의 값이 현재와 같으면 줄 지움(오브젝트 밖 값을 말없이 빼지 않는다)
 * - 그 밖: 현재 행이 있으면 UPD, 없으면 ADD
 */
export function setPerm(d: DraftMap, roleId: string, objectId: string, btn: readonly string[], popup: readonly string[], base: PermBase): DraftMap {
  if (roleId === PERM_SYSADMIN_ROLE_ID) return d;
  const k = changeKey("ROLE_OBJ", roleId, objectId);
  const row = permRowOf(roleId, objectId, btn, popup, base);
  return row ? withSet(d, k, row) : withDelete(d, k);
}

/** setPerm 의 줄 계산. null = 그 키의 줄을 지운다(현재 값과 같음·현재 행 없이 버튼이 빔). */
function permRowOf(roleId: string, objectId: string, btn: readonly string[], popup: readonly string[], base: PermBase): PermChangeRow | null {
  const b = keepAllowed(btn, base.allowedBtn);
  const p = b.length ? keepAllowed(popup, base.allowedPopup) : [];
  if (!b.length) return base.has ? { TP: "ROLE_OBJ", KEY1: roleId, KEY2: objectId, OP: "DEL", BTN_PERM: null, POPUP_PERM: null } : null;
  if (base.has && sameSet(b, keepAllowed(base.btn, base.allowedBtn)) && sameSet(p, keepAllowed(base.popup, base.allowedPopup))) return null;
  return { TP: "ROLE_OBJ", KEY1: roleId, KEY2: objectId, OP: base.has ? "UPD" : "ADD", BTN_PERM: b.join(","), POPUP_PERM: p.join(",") };
}

/** 메뉴 체크로 등록할 때 처음 값 = search 가 있으면 search, 없으면 첫 버튼(시안 reg). 버튼이 없으면 빈 목록(등록할 수 없다). */
export const registerDefault = (b: PermBase): string[] => (b.allowedBtn.includes("search") ? ["search"] : b.allowedBtn.slice(0, 1));

/**
 * 메뉴 칸 체크(화면 하나 또는 모듈·폴더 아래 전부)로 등록·해제한다.
 * - 등록: 지금(초안 얹은 값) 미등록인 화면만. 현재 행이 있던 화면은 현재 값으로 돌아가고, 없던 화면은 registerDefault 로 ADD
 * - 해제: 지금 등록된 화면만. 현재 행이 있으면 DEL, 초안에서 더한 것이면 줄 지움
 * changed = 바뀐 화면 수, skipped = 버튼이 없어 등록하지 못한 화면 수.
 */
export function setRegister(
  d: DraftMap,
  roleId: string,
  objectIds: readonly string[],
  on: boolean,
  baseOf: (objectId: string) => PermBase,
  isRegNow: (objectId: string) => boolean,
): { draft: DraftMap; changed: number; skipped: number } {
  if (roleId === PERM_SYSADMIN_ROLE_ID) return { draft: d, changed: 0, skipped: 0 };
  // 한 화면이 하위 폴더 두 곳에 걸리면 같은 ID 가 두 번 온다 — 한 번만 센다(f3 리뷰 8)
  const ids = [...new Set(objectIds)];
  // Map 은 한 번만 복사해 직접 고친다(화면마다 복사하면 1,000개 모듈에서 O(n²), f3 리뷰 4)
  let next: Map<string, PermChangeRow> | null = null;
  const own = () => (next ??= new Map(d));
  let changed = 0;
  let skipped = 0;
  for (const oid of ids) {
    if (isRegNow(oid) === on) continue;
    const b = baseOf(oid);
    const k = changeKey("ROLE_OBJ", roleId, oid);
    let row: PermChangeRow | null;
    if (on && b.has) row = null;
    else if (on) {
      const v = registerDefault(b);
      if (!v.length) {
        skipped += 1;
        continue;
      }
      row = permRowOf(roleId, oid, v, [], b);
    } else row = permRowOf(roleId, oid, [], [], b);
    const cur: DraftMap = next ?? d;
    if (!row) {
      if (cur.has(k)) own().delete(k);
    } else if (!sameRow(cur.get(k), row)) {
      const m = own();
      m.delete(k);
      m.set(k, row);
    }
    changed += 1;
  }
  return { draft: next ?? d, changed, skipped };
}

/**
 * 현재 값을 다시 읽은 뒤 초안을 새 현재 값에 맞춘다(f3 리뷰 3 — PERM_CONFLICT 뒤 다시 읽기·원래 프로그램에서 돌아옴).
 * - 소속 줄(USER_GRP·GRP_ROLE): 이제 현재 값과 같으면(ADD 인데 이미 있음·DEL 인데 이미 없음) 줄을 지운다.
 * - 퍼미션 줄(ROLE_OBJ): 현재 행 여부에 맞춰 ADD ↔ UPD 를 바꾸고, 현재 값과 같아졌거나 지울 행이 없으면(DEL) 줄을 지운다.
 *   그 역할 퍼미션을 아직 읽지 않았거나 그 오브젝트 줄이 없으면 그대로 둔다(모르는 채로 지우지 않는다 — 서버가 판정한다).
 *   저장 값(BTN_PERM·POPUP_PERM)은 고치지 않는다.
 * 바뀐 것이 없으면 같은 객체.
 */
export function rebaseDraft(d: DraftMap, idx: BenchIndex, perms: ReadonlyMap<string, RolePermMap>): DraftMap {
  let next: Map<string, PermChangeRow> | null = null;
  const own = () => (next ??= new Map(d));
  for (const [k, c] of d) {
    if (c.TP === "USER_GRP" || c.TP === "GRP_ROLE") {
      const list = (c.TP === "USER_GRP" ? idx.userGroups : idx.groupRoles).get(c.KEY1) ?? [];
      if (list.includes(c.KEY2) === (c.OP !== "DEL")) own().delete(k);
      continue;
    }
    if (c.KEY1 === PERM_SYSADMIN_ROLE_ID) continue;
    const row = perms.get(c.KEY1)?.get(c.KEY2);
    if (!row) continue;
    const b = permBaseOf(row);
    if (c.OP === "DEL") {
      if (!b.has) own().delete(k);
      continue;
    }
    if (b.has && sameSet(parseTokens(c.BTN_PERM), keepAllowed(b.btn, b.allowedBtn)) && sameSet(parseTokens(c.POPUP_PERM), keepAllowed(b.popup, b.allowedPopup))) {
      own().delete(k);
      continue;
    }
    const op = b.has ? "UPD" : "ADD";
    if (op !== c.OP) own().set(k, { ...c, OP: op });
  }
  return next ?? d;
}

/** 역할 하나의 퍼미션 줄에 초안을 얹는다. 그 역할 변경이 없으면 같은 객체. */
export function overlayRolePerm(map: RolePermMap, roleId: string, d: DraftMap | readonly PermChangeRow[]): RolePermMap {
  const rows = (Array.isArray(d) ? d : draftRows(d as DraftMap)).filter((c) => c.TP === "ROLE_OBJ" && c.KEY1 === roleId);
  if (!rows.length) return map;
  const next = new Map(map);
  for (const c of rows) {
    const row: RolePermRow = next.get(c.KEY2) ?? {
      ROLE_ID: roleId, OBJECT_ID: c.KEY2, OBJECT_NM: c.KEY2, MENU_PATH: "", OBJ_BTN_PERM: null, OBJ_POPUP_PERM: null, OBJ_READ_PERM: null,
      BTN_PERM: null, POPUP_PERM: null, DATA_PERM: null,
    };
    next.set(c.KEY2, c.OP === "DEL" ? { ...row, BTN_PERM: null, POPUP_PERM: null } : { ...row, BTN_PERM: c.BTN_PERM ?? "", POPUP_PERM: c.POPUP_PERM ?? "" });
  }
  return next;
}

/** 읽어 둔 역할 퍼미션 전부에 초안을 얹는다. 변경이 없는 역할은 같은 객체. */
export function overlayRolePerms(maps: ReadonlyMap<string, RolePermMap>, d: DraftMap | readonly PermChangeRow[]): ReadonlyMap<string, RolePermMap> {
  const rows = (Array.isArray(d) ? d : draftRows(d as DraftMap)).filter((c) => c.TP === "ROLE_OBJ");
  if (!rows.length) return maps;
  const next = new Map(maps);
  for (const rid of new Set(rows.map((c) => c.KEY1))) {
    const m = maps.get(rid);
    if (m) next.set(rid, overlayRolePerm(m, rid, rows));
  }
  return next;
}

/** 현재 → 초안 퍼미션 줄 차이. add = 새로 등록 · del = 등록 해제 · mod = 값 바뀜. */
export type ChangeKind = "add" | "del" | "mod";

export function permDiffKind(base: RolePermRow | undefined, view: RolePermRow | undefined): ChangeKind | null {
  const a = hasPerm(base);
  const b = hasPerm(view);
  if (!a && !b) return null;
  if (!a) return "add";
  if (!b) return "del";
  return sameSet(parseTokens(base.BTN_PERM), parseTokens(view.BTN_PERM)) && sameSet(parseTokens(base.POPUP_PERM), parseTokens(view.POPUP_PERM)) ? null : "mod";
}

/** 소속 체크 차이. */
export const linkDiffKind = (cur: boolean, view: boolean): ChangeKind | null => (cur === view ? null : view ? "add" : "del");

// ── 바꾼 것 글(시안 changeText) ─────────────────────────────

export interface ChangeNames {
  user: (id: string) => string;
  group: (id: string) => string;
  role: (id: string) => string;
  object: (id: string) => string;
}

/** 바꾼 것 한 줄의 글. base = 그 퍼미션의 현재 값(모르면 undefined — 값만 보인다). */
export function changeText(c: PermChangeRow, n: ChangeNames, base?: PermBase): string {
  if (c.TP === "USER_GRP") return `「${n.user(c.KEY1)}」을(를) 「${n.group(c.KEY2)}」${c.OP === "DEL" ? "에서 뺌" : "에 넣음"}`;
  if (c.TP === "GRP_ROLE") return `「${n.group(c.KEY1)}」${c.OP === "DEL" ? "에서" : "에"} 「${n.role(c.KEY2)}」 ${c.OP === "DEL" ? "뺌" : "넣음"}`;
  const head = `「${n.role(c.KEY1)}」 × 「${n.object(c.KEY2)}」 ${c.KEY2}`;
  if (c.OP === "DEL") return `${head} 등록 해제`;
  const after = [...parseTokens(c.BTN_PERM), ...parseTokens(c.POPUP_PERM)];
  const before = base ? [...base.btn, ...base.popup] : [];
  const plus = after.filter((x) => !before.includes(x)).map((x) => `+${x}`);
  const minus = before.filter((x) => !after.includes(x)).map((x) => `−${x}`);
  const diff = [...plus, ...minus].join(" ");
  return `${head} ${c.OP === "ADD" ? "등록" : "버튼"}${diff ? ` ${diff}` : ""}`;
}

// ── 영향(impact) ─────────────────────────────────────────────

export interface ImpactPerson extends Record<string, unknown> {
  USER_ID: string;
  USER_NM: string;
  /** 얻는 화면 글(앞 2개 + 외 n개). */
  GAIN_TXT: string;
  LOSE_TXT: string;
  GAIN_CNT: number;
  LOSE_CNT: number;
}

const screensText = (list: Array<{ name: string; codes: string; sign: string }>): string => {
  const head = list.slice(0, 2).map((x) => `${x.name} ${x.sign}${x.codes}`);
  return list.length > 2 ? `${head.join(" · ")} 외 ${list.length - 2}개 화면` : head.join(" · ");
};

/** 영향 줄(사람 × 화면)을 사람마다 묶는다. 바뀐 화면이 많은 사람부터(시안 impactOf). */
export function impactPeople(rows: readonly ImpactRow[]): ImpactPerson[] {
  const by = new Map<string, { nm: string; gain: Array<{ name: string; codes: string; sign: string }>; lose: Array<{ name: string; codes: string; sign: string }> }>();
  for (const r of rows) {
    let p = by.get(r.USER_ID);
    if (!p) by.set(r.USER_ID, (p = { nm: r.USER_NM, gain: [], lose: [] }));
    if (r.GAINED) p.gain.push({ name: r.OBJECT_NM, codes: r.GAINED, sign: "+" });
    if (r.LOST) p.lose.push({ name: r.OBJECT_NM, codes: r.LOST, sign: "−" });
  }
  return [...by]
    .map(([id, p]) => ({ USER_ID: id, USER_NM: p.nm, GAIN_TXT: screensText(p.gain), LOSE_TXT: screensText(p.lose), GAIN_CNT: p.gain.length, LOSE_CNT: p.lose.length }))
    .sort((a, b) => b.GAIN_CNT + b.LOSE_CNT - (a.GAIN_CNT + a.LOSE_CNT));
}

// ── 실패 안내 ────────────────────────────────────────────────

/** PERM_NEED_CONFIRM 상세 → 사람이 읽는 글. 서버 상세 = 잃는 사람 수(숫자)뿐이면 「잃는 사람 N명」. */
export function needConfirmText(detail: string): string {
  const t = detail.trim();
  return /^\d+$/.test(t) ? `잃는 사람 ${fmtNum(+t)}명` : t;
}

/** 실패를 사람이 읽는 글로. reload = 「현재 값 다시 읽기」를 권할지. */
export function benchErrorText(e: unknown): { message: string; reload: boolean } {
  if (!(e instanceof PermApplyError)) return { message: e instanceof Error ? e.message : "요청을 처리하지 못했습니다.", reload: false };
  const d = e.message;
  switch (e.code) {
    case "PERM_CONFLICT":
      // 범위를 읽었으면(scopes) 상세 「group:G,…」 원문은 붙이지 않는다 — 범위 이름은 충돌 막대가 보인다
      return { message: `다른 관리자가 먼저 바꾼 범위가 있습니다. 현재 값을 다시 읽고 초안을 확인한 뒤 다시 적용합니다.${e.scopes.length || !d ? "" : ` (${d})`}`, reload: true };
    case "PERM_NEED_CONFIRM":
      return { message: `버튼을 잃는 사람이 있어 한 번 더 확인합니다. (${needConfirmText(d)})`, reload: false };
    case "PERM_NOT_IN_OBJ":
      return { message: `오브젝트에 없는 값이 있어 저장하지 못했습니다. 그 퍼미션의 칩을 다시 고릅니다. (${d})`, reload: false };
    case "PERM_EMPTY_BTN":
      return { message: `버튼이 하나도 없는 퍼미션은 둘 수 없습니다. 버튼을 하나 이상 켜거나 「없음」으로 등록을 해제합니다. (${d})`, reload: false };
    case "PERM_FORBIDDEN":
      return { message: `시스템 관리자(SYSADMIN) 역할이 걸린 변경은 할 수 없습니다. 그 변경을 되돌립니다. (${d})`, reload: false };
    case "PERM_LAST_SYSADMIN":
      // perm-crudfix c5 c — 적용 결과 활성 시스템관리자 0명 = 서버가 적용 전체를 거절(초안 남음)
      return { message: `적용하면 사용 중인 시스템관리자가 한 명도 남지 않아 적용하지 않았습니다. 초안은 그대로 있습니다. 시스템관리자를 빼는 변경을 되돌립니다. (${d})`, reload: false };
    case "PERM_SELF_LOCKOUT":
      return { message: "본인 계정의 시스템관리자 권한은 뺄 수 없어 적용하지 않았습니다. 초안은 그대로 있습니다. 본인 시스템관리자 그룹을 빼는 변경을 되돌립니다.", reload: false };
    case "PERM_DRAFT_BUSY":
      return { message: "다른 창에서 같은 초안을 저장하는 중입니다. 잠시 뒤 「다시 저장」을 누릅니다.", reload: false };
    case "PERM_NO_USER":
      return { message: "로그인 정보가 없습니다. 다시 로그인한 뒤 시도합니다.", reload: false };
    case "PERM_DRAFT_CORRUPT":
      return { message: "저장된 초안이 깨졌거나 지금 현재 값과 맞지 않습니다. 초안 막대의 「초안 버리기」로 초안을 버리고 다시 만들어 주세요.", reload: false };
    case "PERM_BAD_VALUE":
      return { message: `입력 값의 형식이 맞지 않습니다(기간 등). 값을 고친 뒤 다시 시도합니다. (${d})`, reload: false };
    case "PERM_BUSY":
      // 서버 문구가 두 가지다(잠금 대기·교착 「다른 적용이 진행 중입니다」 · APPLY_ID 충돌 「다른 적용과 겹쳤습니다. 다시 시도해 주세요」) — 코드로 가르고 문구는 그대로 보인다
      // 서버 문구에 「다시 시도」가 없으면(잠금 대기 문구) 뒤에 붙인다. 빈 문구면 기본 글
      if (!d.trim() || /^PERM_BUSY\s*:?\s*$/.test(d.trim())) return { message: "잠시 뒤 다시 시도해 주세요.", reload: false };
      return { message: d.includes("다시 시도") ? d : `${d.trim().replace(/[.。]?$/, ".")} 잠시 뒤 다시 시도해 주세요.`, reload: false };
    case "NOT_FOUND":
      return { message: `변경 대상이 없습니다. 다른 화면에서 지웠을 수 있습니다. 현재 값을 다시 읽거나 그 변경을 되돌립니다. (${d})`, reload: true };
    case "VALIDATION_ERROR":
      // 적용할 초안 없음·메모 1,000자 넘음 등 — 서버 설명이 사람이 읽는 글이다
      return { message: `값을 확인한 뒤 다시 시도합니다. (${d})`, reload: false };
    case "PERM_REQUIRED":
      return { message: `필요한 값이 빠졌습니다. (${d})`, reload: false };
    case "PERM_BAD_SOURCE":
      return { message: `보기 기준(현재·초안) 값이 맞지 않습니다. (${d})`, reload: false };
    case "PERM_NOT_READY":
    case "PERM_DRAFT_NOT_READY":
      return { message: `서버에 작업대 기능이 아직 준비되지 않았습니다. 시스템 담당자에게 알립니다. (${d})`, reload: false };
    default:
      return { message: d, reload: false };
  }
}

/**
 * 적용 충돌(PERM_CONFLICT) 막대 글. 범위 이름이 있으면 붙이고, 없으면(범위를 읽지 못함) 일반 안내만.
 * 어느 쪽이든 초안은 두고 「현재 값 다시 읽기」를 권한다.
 */
export function conflictText(names: readonly string[]): string {
  const head = names.length ? `다른 관리자가 먼저 바꾼 범위가 있습니다: ${names.join(", ")}.` : "적용하는 사이 다른 변경과 겹쳤습니다.";
  return `${head} 초안은 그대로 둡니다. 현재 값을 다시 읽고 초안을 확인한 뒤 다시 적용합니다.`;
}

/**
 * 충돌 범위 → 「사람 홍길동」·「그룹 냉연 조업」·「역할 냉연 조업자」. 모르는 ID 는 그대로.
 * 서버 범위 = 「user:ID」·「group:ID」·「role:ID」(접두가 있으면 그 종류에서만 찾는다). 접두 없는 ID 는 사람 → 그룹 → 역할 순.
 */
export function scopeNames(scopes: readonly string[], idx: BenchIndex): string[] {
  const names = scopes.map((scope) => {
    const m = /^(user|group|role):(.+)$/.exec(scope);
    if (m) {
      const id = m[2].trim();
      if (m[1] === "user") return `사람 ${idx.userById.get(id)?.USER_NM ?? id}`;
      if (m[1] === "group") return `그룹 ${idx.groupById.get(id)?.ROLE_GROUP_NM ?? id}`;
      return `역할 ${idx.roleById.get(id)?.ROLE_NM ?? id}`;
    }
    const id = scope;
    const u = idx.userById.get(id);
    if (u) return `사람 ${u.USER_NM}`;
    const g = idx.groupById.get(id);
    if (g) return `그룹 ${g.ROLE_GROUP_NM}`;
    const r = idx.roleById.get(id);
    if (r) return `역할 ${r.ROLE_NM}`;
    return id;
  });
  return [...new Set(names)];
}

// ── 적용 이력 기간(bench-be b5) ──────────────────────────────

/** 이력 기본 기간(일). toDt = 오늘, fromDt = toDt − 30일(둘 다 포함). */
export const HISTORY_DEFAULT_DAYS = 30;
/** 이력 기간 최대 길이(일, fromDt·toDt 양 끝 포함). 넘으면 서버가 PERM_BAD_VALUE(BE between+1 > 366). */
export const HISTORY_MAX_DAYS = 366;
/** 이력 최대 줄 수(APPLY_AT 내림차순 앞 500줄). */
export const HISTORY_MAX_ROWS = 500;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 보는 사람 시각의 날짜(YYYY-MM-DD). toISOString 은 UTC 라 KST 09시 전에는 어제가 된다. */
export const localDate = (d: Date = new Date()): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** YYYY-MM-DD → UTC 자정 ms. 모양·날짜가 틀리면 null. */
export function parseYmd(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const back = new Date(t);
  return back.getUTCFullYear() === +m[1] && back.getUTCMonth() === +m[2] - 1 && back.getUTCDate() === +m[3] ? t : null;
}

const DAY_MS = 86_400_000;

/** 날짜 글에서 n 일 앞. */
export function minusDays(ymd: string, n: number): string {
  const t = parseYmd(ymd);
  if (t === null) return ymd;
  const d = new Date(t - n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 이력 기본 기간. */
export const defaultHistoryRange = (today: string = localDate()): { fromDt: string; toDt: string } => ({ fromDt: minusDays(today, HISTORY_DEFAULT_DAYS), toDt: today });

/** 이력 기간 검사(서버 PERM_BAD_VALUE 와 같은 규칙). 맞으면 null, 틀리면 사람이 읽는 글. */
export function historyRangeError(fromDt: string, toDt: string): string | null {
  const a = parseYmd(fromDt);
  const b = parseYmd(toDt);
  if (a === null || b === null) return "기간은 YYYY-MM-DD 모양의 날짜로 넣습니다.";
  if (a > b) return "시작일이 종료일보다 늦습니다.";
  if ((b - a) / DAY_MS + 1 > HISTORY_MAX_DAYS) return `기간은 ${HISTORY_MAX_DAYS}일까지 볼 수 있습니다. 기간을 좁혀 주세요.`;
  return null;
}
