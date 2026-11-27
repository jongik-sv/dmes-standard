/**
 * commRoleMng 「이 역할의 퍼미션」 순수 로직(perm-bench f6, 시안 v16 lgRoleNext).
 *
 * 화면은 저장 전 퍼미션 변경을 이 모듈의 초안(PermDraft)으로 들고 있다.
 * - base  = 조회한 퍼미션(OBJECT_ID 별 한 건)
 * - cur   = 지금 값. base 에 있는데 cur 에 없으면 「빼기 대기(gone)」, cur 에만 있으면 「새로 추가(new)」
 * - order = 보이는 순서(조회 순서 뒤에 추가한 순서)
 *
 * 결정 반영:
 * - D14 마지막 버튼 칩을 끄면 퍼미션 빼기다(오브젝트 허용 값 안의 버튼만 센다).
 * - D15 오브젝트 밖 값은 지우지 않고 보이기만 한다(줄 가운데 선). 계산·비교에서 뺀다.
 *       그 줄을 고쳐 저장하면 서버 ⊆ 검사(PERM_NOT_IN_OBJ)를 지나도록 밖 값을 빼고 보낸다.
 * - D18 「조회만」 = 서버가 준 OBJ_READ_PERM. 비었으면 첫 허용 버튼 하나.
 * - D21 DATA_PERM 은 보이기·통과만 한다(편집 없음).
 * - D36 저장 줄은 grids.perms.rows 로 보낸다(MERGE = 추가·변경, DEL = 빼기).
 */
import type { FolderObjRow, RoleMenuLov, RolePermRow, RolePermSaveRow, RoleRow } from "./types";

// ── 값 다루기 ─────────────────────────────────────────────────────────────────

/** "a, b,,c" → ["a","b","c"] (앞뒤 공백 제거·빈 값 제거·중복 제거·순서 유지). */
export function csv(v: unknown): string[] {
  const out: string[] = [];
  for (const x of String(v ?? "").split(",")) {
    const t = x.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** 오브젝트 허용 값(allowed)에 없는 값. D15 — 보이되 계산에서 뺀다. */
export function outOfObject(values: string[], allowed: string[]): string[] {
  return values.filter((v) => !allowed.includes(v));
}

/** 오브젝트 허용 값 안의 값만, 허용 값 순서로. */
export function inObject(values: string[], allowed: string[]): string[] {
  return allowed.filter((a) => values.includes(a));
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => b.includes(x));
}

// ── 초안 ─────────────────────────────────────────────────────────────────────

/** 퍼미션 한 건(ROLE_ID, OBJECT_ID)의 화면 값. */
export interface PermEntry {
  OBJECT_ID: string;
  OBJECT_NM: string;
  MENU_FOLDER_ID: string;
  MENU_PATH: string;
  MENU_NM: string;
  /** 오브젝트 허용 버튼·팝업·조회만 값. */
  objBtn: string[];
  objPop: string[];
  objRead: string[];
  /** 퍼미션 값(오브젝트 밖 값이 섞여 있을 수 있다 — D15). */
  btn: string[];
  pop: string[];
  /** 데이터 권한 — 보이기·통과만(D21). */
  data: string;
}

export interface PermDraft {
  base: Readonly<Record<string, PermEntry>>;
  cur: Readonly<Record<string, PermEntry>>;
  order: readonly string[];
}

export type PermStatus = "same" | "changed" | "new" | "gone";

export const EMPTY_DRAFT: PermDraft = { base: {}, cur: {}, order: [] };

function entryFromRow(r: RolePermRow): PermEntry {
  return {
    OBJECT_ID: String(r.OBJECT_ID),
    OBJECT_NM: String(r.OBJECT_NM ?? ""),
    MENU_FOLDER_ID: String(r.MENU_FOLDER_ID ?? ""),
    MENU_PATH: String(r.MENU_PATH ?? ""),
    MENU_NM: String(r.MENU_NM ?? ""),
    objBtn: csv(r.OBJ_BTN_PERM),
    objPop: csv(r.OBJ_POPUP_PERM),
    objRead: csv(r.OBJ_READ_PERM),
    btn: csv(r.BTN_PERM),
    pop: csv(r.POPUP_PERM),
    data: String(r.DATA_PERM ?? ""),
  };
}

/** 조회 결과로 새 초안을 만든다(변경 없음). */
export function draftFromRows(rows: RolePermRow[]): PermDraft {
  const base: Record<string, PermEntry> = {};
  const order: string[] = [];
  for (const r of rows) {
    const e = entryFromRow(r);
    if (base[e.OBJECT_ID]) continue;
    base[e.OBJECT_ID] = e;
    order.push(e.OBJECT_ID);
  }
  return { base, cur: base, order };
}

/** 저장하지 않은 변경을 모두 버린다(조회 값으로). */
export function resetDraft(draft: PermDraft): PermDraft {
  if (draft.cur === draft.base) return draft;
  return { base: draft.base, cur: draft.base, order: draft.order.filter((id) => !!draft.base[id]) };
}

/** 한 건의 상태. */
export function statusOf(draft: PermDraft, objectId: string): PermStatus {
  const b = draft.base[objectId];
  const c = draft.cur[objectId];
  if (b && !c) return "gone";
  if (!b) return "new";
  if (!c) return "gone";
  return sameSet(inObject(b.btn, b.objBtn), inObject(c.btn, c.objBtn)) &&
    sameSet(inObject(b.pop, b.objPop), inObject(c.pop, c.objPop))
    ? "same"
    : "changed";
}

/** 빼기 대기가 아닌 퍼미션 수. */
export function liveCount(draft: PermDraft): number {
  return Object.keys(draft.cur).length;
}

function withoutCur(draft: PermDraft, objectId: string): PermDraft {
  if (!draft.cur[objectId]) return draft;
  const cur = { ...draft.cur };
  delete cur[objectId];
  // 새로 추가한 줄을 빼면 줄 자체가 사라진다(DEL 을 보내지 않는다).
  const order = draft.base[objectId] ? draft.order : draft.order.filter((id) => id !== objectId);
  return { ...draft, cur, order };
}

function withCur(draft: PermDraft, e: PermEntry): PermDraft {
  const cur = { ...draft.cur, [e.OBJECT_ID]: e };
  const order = draft.order.includes(e.OBJECT_ID) ? draft.order : [...draft.order, e.OBJECT_ID];
  return { ...draft, cur, order };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * 버튼 값을 통째로 바꾼다(칩 묶음 onChange). 오브젝트 밖 값은 그대로 둔다(D15).
 * 오브젝트 허용 버튼이 하나도 안 남으면 퍼미션 빼기(D14).
 */
export function setBtns(draft: PermDraft, objectId: string, values: readonly string[]): PermDraft {
  const e = draft.cur[objectId];
  if (!e) return draft;
  const nextIn = inObject([...values], e.objBtn);
  if (nextIn.length === 0) return withoutCur(draft, objectId);
  const next = [...nextIn, ...outOfObject(e.btn, e.objBtn)];
  if (sameList(next, e.btn)) return draft;
  return withCur(draft, { ...e, btn: next });
}

/** 팝업 값을 통째로 바꾼다. 팝업이 비어도 퍼미션은 남는다. */
export function setPops(draft: PermDraft, objectId: string, values: readonly string[]): PermDraft {
  const e = draft.cur[objectId];
  if (!e) return draft;
  const next = [...inObject([...values], e.objPop), ...outOfObject(e.pop, e.objPop)];
  if (sameList(next, e.pop)) return draft;
  return withCur(draft, { ...e, pop: next });
}

/** 버튼 칩 하나 켜고 끄기(setBtns 와 같은 규칙). */
export function toggleBtn(draft: PermDraft, objectId: string, code: string): PermDraft {
  const e = draft.cur[objectId];
  if (!e || !e.objBtn.includes(code)) return draft;
  return setBtns(draft, objectId, e.btn.includes(code) ? e.btn.filter((b) => b !== code) : [...e.btn, code]);
}

/** 팝업 칩 하나 켜고 끄기. */
export function togglePop(draft: PermDraft, objectId: string, code: string): PermDraft {
  const e = draft.cur[objectId];
  if (!e || !e.objPop.includes(code)) return draft;
  return setPops(draft, objectId, e.pop.includes(code) ? e.pop.filter((p) => p !== code) : [...e.pop, code]);
}

/** 빼기 — 조회한 줄은 빼기 대기, 새로 추가한 줄은 사라진다. */
export function removePerm(draft: PermDraft, objectId: string): PermDraft {
  return withoutCur(draft, objectId);
}

/** 되돌리기 — 조회한 값으로. 새로 추가한 줄은 사라진다. */
export function undoPerm(draft: PermDraft, objectId: string): PermDraft {
  const b = draft.base[objectId];
  if (!b) return withoutCur(draft, objectId);
  if (draft.cur[objectId] === b) return draft;
  return withCur(draft, b);
}

// ── 메뉴에서 오브젝트 추가 ────────────────────────────────────────────────────

/** 처음 버튼 — read = 조회만(D18), all = 허용 버튼 모두. */
export type AddLevel = "read" | "all";

/** 처음 버튼 값. 조회만이 비면 첫 허용 버튼 하나. */
export function initialBtns(objBtn: string[], objRead: string[], level: AddLevel): string[] {
  if (level === "all") return [...objBtn];
  const read = inObject(objRead, objBtn);
  if (read.length) return read;
  return objBtn.slice(0, 1);
}

/**
 * 추가 후보 — 이미 퍼미션 있음(HAS_PERM=Y)·사용 안 함(USE_TP=N)·초안에 이미 있음은 뺀다.
 * 허용 버튼이 없는 오브젝트도 뺀다(버튼 없는 퍼미션 금지 — D14).
 */
export function pickableObjs(objs: FolderObjRow[], draft: PermDraft): FolderObjRow[] {
  return objs.filter(
    (o) =>
      o.HAS_PERM !== "Y" &&
      o.USE_TP !== "N" &&
      !draft.cur[o.OBJECT_ID] &&
      !draft.base[o.OBJECT_ID] &&
      csv(o.OBJ_BTN_PERM).length > 0,
  );
}

/** 폴더 오브젝트의 메뉴 폴더 — 응답에 MENU_FOLDER_ID 가 없으면 MENU_PATH 로 lov 에서 찾고, 그래도 없으면 고른 폴더. */
export function folderOfObj(o: FolderObjRow, menus: RoleMenuLov[], pickedFolder: string): string {
  const own = o.MENU_FOLDER_ID;
  if (typeof own === "string" && own) return own;
  const byPath = o.MENU_PATH ? menus.find((m) => m.MENU_PATH === o.MENU_PATH) : undefined;
  return byPath?.MENU_ID ?? pickedFolder;
}

/** 고른 오브젝트를 새 퍼미션으로 초안에 넣는다. 팝업은 비우고 데이터 권한은 "". */
export function addFromFolder(
  draft: PermDraft,
  objs: FolderObjRow[],
  level: AddLevel,
  menus: RoleMenuLov[],
  pickedFolder: string,
): PermDraft {
  let next = draft;
  for (const o of pickableObjs(objs, draft)) {
    const objBtn = csv(o.OBJ_BTN_PERM);
    const objRead = csv(o.OBJ_READ_PERM);
    next = withCur(next, {
      OBJECT_ID: o.OBJECT_ID,
      OBJECT_NM: String(o.OBJECT_NM ?? ""),
      MENU_FOLDER_ID: folderOfObj(o, menus, pickedFolder),
      MENU_PATH: String(o.MENU_PATH ?? ""),
      MENU_NM: String(o.MENU_NM ?? ""),
      objBtn,
      objPop: csv(o.OBJ_POPUP_PERM),
      objRead,
      btn: initialBtns(objBtn, objRead, level),
      pop: [],
      data: "",
    });
  }
  return next;
}

// ── 폴더 거르기 ──────────────────────────────────────────────────────────────

export const ALL_FOLDERS = "*";

export interface FolderOption {
  value: string;
  label: string;
}

function folderLabel(id: string, menus: RoleMenuLov[]): string {
  if (!id) return "폴더 없음";
  const m = menus.find((x) => x.MENU_ID === id);
  return m?.MENU_PATH || m?.MENU_NM || id;
}

/**
 * 폴더 거르기 목록 = 이 역할의 퍼미션(빼기 대기 포함)이 있는 폴더 + 「모든 폴더 (n)」.
 * 기본 = 역할 MENU_ID 폴더(있을 때) → 첫 폴더 → 모든 폴더.
 */
export function folderFilterOptions(
  draft: PermDraft,
  menus: RoleMenuLov[],
  roleMenuId: string,
): { options: FolderOption[]; defaultValue: string } {
  const folders: string[] = [];
  for (const id of draft.order) {
    const e = draft.cur[id] ?? draft.base[id];
    if (e && !folders.includes(e.MENU_FOLDER_ID)) folders.push(e.MENU_FOLDER_ID);
  }
  const options: FolderOption[] = [
    ...folders.map((f) => ({ value: f, label: folderLabel(f, menus) })),
    { value: ALL_FOLDERS, label: `모든 폴더 (${draft.order.length})` },
  ];
  const defaultValue = roleMenuId && folders.includes(roleMenuId) ? roleMenuId : (folders[0] ?? ALL_FOLDERS);
  return { options, defaultValue };
}

/** 고른 폴더가 목록에 없으면 기본값. */
export function effectiveFolder(picked: string, opt: { options: FolderOption[]; defaultValue: string }): string {
  return picked && opt.options.some((o) => o.value === picked) ? picked : opt.defaultValue;
}

// ── 그리드 줄 ────────────────────────────────────────────────────────────────

/** 「이 역할의 퍼미션」 그리드 한 줄. 칩은 render 가 이 값으로 그린다. */
export interface PermViewRow extends Record<string, unknown> {
  OBJECT_ID: string;
  OBJECT_NM: string;
  MENU_PATH: string;
  MENU_NM: string;
  DATA_PERM: string;
  status: PermStatus;
  objBtn: string[];
  objPop: string[];
  /** 보이는 값 — gone 이면 조회 값. */
  btn: string[];
  pop: string[];
  baseBtn: string[];
  basePop: string[];
  /** 칩 칸 갱신 열쇠(값이 바뀔 때만 바뀐다). */
  __btn: string;
  __pop: string;
  /** 동작 칸 갱신 열쇠(상태가 바뀔 때만 바뀐다). */
  __act: PermStatus;
}

/** 같은 (지금 값, 조회 값, 상태) 면 같은 줄 객체 — 그리드가 바뀐 줄만 다시 그린다. */
const viewCache = new WeakMap<PermEntry, { base: PermEntry | undefined; status: PermStatus; row: PermViewRow }>();

function viewRow(e: PermEntry, base: PermEntry | undefined, status: PermStatus): PermViewRow {
  const hit = viewCache.get(e);
  if (hit && hit.base === base && hit.status === status) return hit.row;
  const row: PermViewRow = {
    OBJECT_ID: e.OBJECT_ID,
    OBJECT_NM: e.OBJECT_NM,
    MENU_PATH: e.MENU_PATH,
    MENU_NM: e.MENU_NM,
    DATA_PERM: e.data,
    status,
    objBtn: e.objBtn,
    objPop: e.objPop,
    btn: e.btn,
    pop: e.pop,
    baseBtn: base?.btn ?? [],
    basePop: base?.pop ?? [],
    __btn: `${status}|${e.btn.join(",")}|${(base?.btn ?? []).join(",")}|${e.pop.join(",")}`,
    __pop: `${status}|${e.pop.join(",")}|${(base?.pop ?? []).join(",")}`,
    __act: status,
  };
  viewCache.set(e, { base, status, row });
  return row;
}

/** 그리드 줄 — 폴더로 거른다. 같은 값이면 같은 객체를 돌려준다(그리드가 바뀐 줄만 다시 그린다). */
export function viewRows(draft: PermDraft, folder: string): PermViewRow[] {
  const out: PermViewRow[] = [];
  for (const id of draft.order) {
    const c = draft.cur[id];
    const b = draft.base[id];
    const e = c ?? b;
    if (!e) continue;
    if (folder !== ALL_FOLDERS && e.MENU_FOLDER_ID !== folder) continue;
    out.push(viewRow(e, b, statusOf(draft, id)));
  }
  return out;
}

// ── 칩 ───────────────────────────────────────────────────────────────────────

export interface ChipOptionView {
  value: string;
  /** 오브젝트 밖 값(D15) — 보이기만(누를 수 없음, 계산에서 빠짐). */
  out: boolean;
}

/** 칩 목록 = 오브젝트 허용 값(켜고 끔) 뒤에 지금 값 중 오브젝트 밖 값. */
export function chipOptions(allowed: string[], now: string[]): ChipOptionView[] {
  return [
    ...allowed.map((value) => ({ value, out: false })),
    ...outOfObject(now, allowed).map((value) => ({ value, out: true })),
  ];
}

/**
 * 오브젝트 밖 값 안내 한 줄(D15 저장 규칙 — 조정자 결정). 밖 값이 없으면 null.
 * 바뀐 줄을 저장할 때 이 값들은 빠진다(saveRows). 바뀌지 않은 줄은 보내지 않으므로 값이 남는다.
 */
export function outValueNote(objBtn: string[], btn: string[], objPop: string[], pop: string[]): string | null {
  const out = [...outOfObject(btn, objBtn), ...outOfObject(pop, objPop)];
  if (out.length === 0) return null;
  return `오브젝트에 없는 값 ${out.join(", ")} 는 저장 때 빠진다`;
}

// ── 저장 ─────────────────────────────────────────────────────────────────────

/**
 * 저장 줄(D36) — 바뀐 것만. 새로 추가·값 변경 = MERGE, 빼기 대기 = DEL.
 * MERGE 의 버튼·팝업은 오브젝트 허용 값 안의 값만 보낸다(D15 — 밖 값이 남으면 서버가 PERM_NOT_IN_OBJ 로 거절한다).
 */
export function saveRows(roleId: string, draft: PermDraft): RolePermSaveRow[] {
  const out: RolePermSaveRow[] = [];
  for (const id of draft.order) {
    const st = statusOf(draft, id);
    if (st === "same") continue;
    if (st === "gone") {
      const b = draft.base[id];
      out.push({
        ROLE_ID: roleId,
        OBJECT_ID: id,
        BTN_PERM: b.btn.join(","),
        POPUP_PERM: b.pop.join(","),
        DATA_PERM: b.data,
        OP_TP: "DEL",
      });
      continue;
    }
    const c = draft.cur[id];
    out.push({
      ROLE_ID: roleId,
      OBJECT_ID: id,
      BTN_PERM: inObject(c.btn, c.objBtn).join(","),
      POPUP_PERM: inObject(c.pop, c.objPop).join(","),
      DATA_PERM: c.data,
      OP_TP: "MERGE",
    });
  }
  return out;
}

/** 저장 전 검사 — 버튼이 빈 MERGE 줄의 OBJECT_ID(서버 PERM_EMPTY_BTN 과 같은 규칙). */
export function emptyBtnObjects(rows: RolePermSaveRow[]): string[] {
  return rows.filter((r) => r.OP_TP === "MERGE" && csv(r.BTN_PERM).length === 0).map((r) => r.OBJECT_ID);
}

/** 저장할 퍼미션 변경 수. */
export function pendingCount(draft: PermDraft): number {
  let n = 0;
  for (const id of draft.order) if (statusOf(draft, id) !== "same") n++;
  return n;
}

/**
 * 서버 거절 문구를 쉬운 말로. PERM_NOT_IN_OBJ · PERM_EMPTY_BTN 만 바꾸고 나머지는 그대로.
 * 코드(오류 객체의 code)를 먼저 보고, 없으면 문구 안의 코드 글자로 판정한다(BE 문구 = "CODE: 상세").
 */
export function permSaveErrorText(message: string, code?: string): string {
  const has = (c: string) => code === c || message.includes(c);
  if (has("PERM_NOT_IN_OBJ")) {
    return `오브젝트가 허용하지 않은 버튼·팝업 값이 있어 퍼미션을 저장하지 못했습니다. 오브젝트 관리에서 허용 값을 확인하세요.\n(${message})`;
  }
  if (has("PERM_EMPTY_BTN")) {
    return `버튼 권한이 빈 퍼미션은 저장할 수 없습니다. 버튼을 하나 이상 켜거나 「빼기」를 누르세요.\n(${message})`;
  }
  return message;
}

/** 업무 거절 오류 — 코드를 함께 싣는다. */
export interface BusinessError extends Error {
  code?: string;
}

/**
 * OASIS 업무 거절(meta.success=false) → Error. 코드는 meta.code → errors[].code 순서로 찾고,
 * 문구가 그 코드로 시작하지 않으면 「CODE: 문구」 로 앞에 붙인다. errors[].message 상세는 줄을 바꿔 덧붙인다.
 */
export function businessError(
  meta: { message?: string; code?: string } | undefined,
  errors?: readonly { code?: string; message?: string }[],
): BusinessError {
  const base = meta?.message?.trim() || "요청이 거부되었습니다.";
  const code = meta?.code?.trim() || errors?.find((e) => e?.code)?.code?.trim() || undefined;
  const head = code && !base.startsWith(code) ? `${code}: ${base}` : base;
  const details = (errors ?? [])
    .map((e) => e?.message?.trim() ?? "")
    .filter((m) => m && !head.includes(m));
  const err: BusinessError = new Error([head, ...details].join("\n"));
  if (code) err.code = code;
  return err;
}

/** 후보 그리드가 비었을 때의 글 — 조회 실패 · 폴더에 오브젝트 없음 · 모두 걸러짐을 나눈다. */
export function pickEmptyMessage(failed: boolean, total: number): string {
  if (failed) return "오브젝트를 불러오지 못했습니다. 폴더를 다시 고르거나 다시 조회하세요.";
  if (total === 0) return "이 폴더에는 오브젝트가 없습니다.";
  return "추가할 오브젝트가 없습니다. 이미 퍼미션이 있거나, 사용 안 함이거나, 허용 버튼이 없습니다.";
}

// ── 역할 ─────────────────────────────────────────────────────────────────────

export const SYSADMIN_ROLE_ID = "SYSADMIN";

/** 시스템 관리자 — 퍼미션 없이 모든 버튼(D13). PERM_CNT=-1 도 같은 뜻. */
export function isSysAdmin(row: Pick<RoleRow, "ROLE_ID" | "PERM_CNT"> | null | undefined): boolean {
  if (!row) return false;
  // 실연결 응답이 문자열("-1")로 와도 같게 본다.
  return row.ROLE_ID === SYSADMIN_ROLE_ID || Number(row.PERM_CNT) === -1;
}

/** 퍼미션 수 표시 — -1 = 「모두」(D13). */
export function permCntLabel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (n < 0) return "모두";
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

/** 사용 여부를 N 으로 둘 때의 확인 문구. */
export function roleOffMessage(roleNm: string, userCnt: number, permCnt: number): string {
  const who = `받은 사람 ${userCnt.toLocaleString()}명`;
  const what = permCnt < 0 ? "이 역할의 퍼미션(모든 화면의 모든 버튼)이" : `이 역할의 퍼미션 ${permCnt.toLocaleString()}건이`;
  return `「${roleNm}」을(를) 사용 안 함으로 두면 ${who}에게서 ${what} 모두 멈춥니다. 다른 역할로 같은 버튼을 받는 사람은 그대로입니다.`;
}

// ── 버튼·팝업 이름 ────────────────────────────────────────────────────────────

/** 자주 쓰는 action 코드의 쉬운 이름. 없으면 코드 그대로(칩 title 에는 늘 코드). */
const CODE_LABEL: Record<string, string> = {
  search: "조회",
  find: "찾기",
  save: "저장",
  delete: "삭제",
  export: "엑셀",
  import: "올리기",
  print: "인쇄",
  copy: "복사",
  confirm: "확정",
  cancel: "취소",
  approve: "승인",
  reject: "반려",
};

export function codeLabel(code: string): string {
  return CODE_LABEL[code] ?? code;
}

// ── 권한 작업대에서 열기(dmes:open-with, f7) ─────────────────────────────────

/** 작업대가 넘긴 약속을 받았을 때 할 일. */
export type OpenWithStep =
  | { kind: "new" }
  | { kind: "select"; key: string }
  | { kind: "search"; roleId: string }
  | { kind: "skip" };

/**
 * mode=new → 새 역할 행. edit → 목록에 그 ROLE_ID 행이 있으면 고르기, 없으면 첫 시도에 한 번만 다시 조회.
 * 고친 역할 행·퍼미션이 있으면(dirty) 조회가 덮으므로 다시 조회하지 않는다.
 */
export function openWithStep<R extends { ROLE_ID?: unknown; nativeeditor_status?: string }>(
  ow: { mode: "new" | "edit"; id?: string },
  rows: readonly R[],
  rowKey: (row: R) => string,
  attempt: number,
  dirty: boolean,
): OpenWithStep {
  if (ow.mode === "new") return { kind: "new" };
  const hit = rows.find((r) => r.nativeeditor_status !== "deleted" && String(r.ROLE_ID ?? "") === ow.id);
  if (hit) return { kind: "select", key: rowKey(hit) };
  if (!ow.id || attempt > 0 || dirty) return { kind: "skip" };
  return { kind: "search", roleId: ow.id };
}
