/**
 * commPermBench 순수 계산 — 화면 상태·API 와 떨어진 함수만 둔다(f8 이 vitest 로 시험한다).
 *
 * 정본 계산 규칙 = decompose.md §0.2:
 *   - 역할×오브젝트 효과 = (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)
 *   - SYSADMIN = 퍼미션 행 없이 모든 사용 오브젝트 × 허용 값 전부
 *   - 사용 안 함(역할·그룹·오브젝트) = 빠짐. 메뉴 숨김 = 메뉴에서만 빠짐
 *
 * 2단계(f3)는 같은 함수에 DRAFT 값을 넣어 현재(CUR)와 비교한다. 그래서 함수는 값 묶음을 인자로 받고 원본을 바꾸지 않는다.
 */
import { parseTokens } from "@dk-oasis/shared/token-chip-input";
import {
  PERM_SYSADMIN_ROLE_ID,
  type BenchGroupRow,
  type BenchMenuRow,
  type BenchRoleRow,
  type BenchUserRow,
  type ExplainButtonRow,
  type ExplainResult,
  type PermReason,
  type RolePermRow,
  type SearchBenchResult,
} from "./types";

export { parseTokens };

// ── 단계 ─────────────────────────────────────────────────────

/** 1 = 보기만(f2) · 2 = 초안 편집(f3) · 3 = 원래 프로그램 링크(f4). */
export type BenchPhase = 1 | 2 | 3;

/** 보는 기준. person = 사람 → 그룹 → 역할, role = 역할만. */
export type BenchBy = "person" | "role";

/** 메뉴 칸 보기. granted = 등록된 것만, all = 모두. */
export type MenuFilter = "granted" | "all";

// ── 표시 이름 ─────────────────────────────────────────────────

/** 버튼 코드 → 화면 표시 이름(시안 BTNS·BTN_LABEL). 모르는 코드는 코드 그대로. */
export const BTN_LABEL: Readonly<Record<string, string>> = {
  search: "조회", save: "저장", delete: "삭제", import: "가져오기", export: "내보내기", confirm: "확정", cancel: "취소",
  find: "찾기", order: "생산지시", send: "전송", print: "출력", approve: "승인", reject: "반려", close: "마감", copy: "복사",
};

/** 팝업 코드 → 표시 이름(시안 POPS). */
export const POP_LABEL: Readonly<Record<string, string>> = {
  itemPop: "품목 찾기", lotPop: "LOT 찾기", custPop: "거래처 찾기", eqpPop: "설비 찾기", userPop: "사용자 찾기",
  orderPop: "지시 찾기", lineSelPop: "라인 선택", ifLogPop: "전송 이력",
};

export const btnLabel = (code: string): string => BTN_LABEL[code] ?? code;
export const popLabel = (code: string): string => POP_LABEL[code] ?? code;

export const fmtNum = (n: number): string => n.toLocaleString("ko-KR");

/** 역할 색 칩 번호(0~11). 역할 목록 순서로 정한다(시안 rcOf). */
export function roleColorIndex(roleOrder: ReadonlyMap<string, number>, roleId: string): number {
  return Math.max(0, roleOrder.get(roleId) ?? 0) % 12;
}

/** 메뉴 줄 끝 한 글자 칩의 글자(역할 이름 첫 글자). */
export const roleInitial = (name: string): string => [...name][0] ?? "?";

// ── 작업대 자료 색인 ─────────────────────────────────────────

export interface BenchIndex {
  users: BenchUserRow[];
  userById: Map<string, BenchUserRow>;
  groups: BenchGroupRow[];
  groupById: Map<string, BenchGroupRow>;
  roles: BenchRoleRow[];
  roleById: Map<string, BenchRoleRow>;
  /** ROLE_ID → 목록 순서(색 칩 번호). */
  roleOrder: Map<string, number>;
  /** USER_ID → ROLE_GROUP_ID[] */
  userGroups: Map<string, string[]>;
  /** ROLE_GROUP_ID → ROLE_ID[] */
  groupRoles: Map<string, string[]>;
  /** ROLE_ID → ROLE_GROUP_ID[] */
  roleGroups: Map<string, string[]>;
  /** 로그인한 관리자가 SYSADMIN 인가(searchBench me[0].ME_SYSADMIN === "Y"). 칸이 없으면 false 로 본다. */
  meSysadmin?: boolean;
}

const pushTo = (m: Map<string, string[]>, k: string, v: string) => {
  const list = m.get(k);
  if (!list) m.set(k, [v]);
  else if (!list.includes(v)) list.push(v);
};

export function indexBench(res: SearchBenchResult): BenchIndex {
  const userGroups = new Map<string, string[]>();
  for (const r of res.userGroups) pushTo(userGroups, r.USER_ID, r.ROLE_GROUP_ID);
  const groupRoles = new Map<string, string[]>();
  const roleGroups = new Map<string, string[]>();
  for (const r of res.groupRoles) {
    pushTo(groupRoles, r.ROLE_GROUP_ID, r.ROLE_ID);
    pushTo(roleGroups, r.ROLE_ID, r.ROLE_GROUP_ID);
  }
  return {
    users: res.users,
    userById: new Map(res.users.map((u) => [u.USER_ID, u])),
    groups: res.groups,
    groupById: new Map(res.groups.map((g) => [g.ROLE_GROUP_ID, g])),
    roles: res.roles,
    roleById: new Map(res.roles.map((r) => [r.ROLE_ID, r])),
    roleOrder: new Map(res.roles.map((r, i) => [r.ROLE_ID, i])),
    userGroups,
    groupRoles,
    roleGroups,
    meSysadmin: res.me?.[0]?.ME_SYSADMIN === "Y",
  };
}

export const groupsOfUser = (idx: BenchIndex, userId: string): string[] => idx.userGroups.get(userId) ?? [];
export const rolesOfGroup = (idx: BenchIndex, groupId: string | null): string[] => (groupId ? idx.groupRoles.get(groupId) ?? [] : []);

/** 사람이 받은 역할 전부(사용 여부와 상관없이, 그룹 순서). 시안 rolesOf. */
export function rolesOfUser(idx: BenchIndex, userId: string): string[] {
  const out: string[] = [];
  for (const g of groupsOfUser(idx, userId)) for (const r of rolesOfGroup(idx, g)) if (!out.includes(r)) out.push(r);
  return out;
}

/** 사용 중인 그룹의 사용 중인 역할만. 시안 activeRolesOf. 사람이 사용 안 함이면 없음. */
export function activeRolesOfUser(idx: BenchIndex, userId: string): string[] {
  if (idx.userById.get(userId)?.USE_TP === "N") return [];
  const out: string[] = [];
  for (const g of groupsOfUser(idx, userId)) {
    if (idx.groupById.get(g)?.USE_TP === "N") continue;
    for (const r of rolesOfGroup(idx, g)) if (idx.roleById.get(r)?.USE_TP !== "N" && !out.includes(r)) out.push(r);
  }
  return out;
}

/** 사람에게 역할을 준 그룹들. */
export const groupsGivingRole = (idx: BenchIndex, userId: string, roleId: string): string[] =>
  groupsOfUser(idx, userId).filter((g) => rolesOfGroup(idx, g).includes(roleId));

/** 그룹의 첫 사람(시안 firstOf). */
export const firstUserOf = (idx: BenchIndex, groupId: string): string | undefined =>
  idx.users.find((u) => groupsOfUser(idx, u.USER_ID).includes(groupId))?.USER_ID;

/** 역할을 받은 첫 사람. */
export function firstUserWithRole(idx: BenchIndex, roleId: string): string | undefined {
  const gs = new Set(idx.roleGroups.get(roleId) ?? []);
  return idx.users.find((u) => groupsOfUser(idx, u.USER_ID).some((g) => gs.has(g)))?.USER_ID;
}

/** 첫 화면에 고를 사람 = 사람이 가장 많은 사용 그룹의 첫 사람. 없으면 첫 사람. */
export function defaultUserId(idx: BenchIndex): string | null {
  const big = [...idx.groups].filter((g) => g.USE_TP !== "N").sort((a, b) => b.USER_CNT - a.USER_CNT)[0];
  return (big && firstUserOf(idx, big.ROLE_GROUP_ID)) ?? idx.users[0]?.USER_ID ?? null;
}

export const PEOPLE_LIMIT = 40;

/** 사람 칸 목록. 찾는 말이 없으면 고른 사람 + 그룹마다 한 명(시안 colPeople). */
export function peopleList(idx: BenchIndex, selectedUserId: string | null, query: string): { list: BenchUserRow[]; found: number | null } {
  const q = query.trim().toLowerCase();
  let list: BenchUserRow[];
  if (q) {
    list = idx.users.filter((u) => `${u.USER_NM} ${u.DEPT_NM ?? ""} ${u.USER_ID}`.toLowerCase().includes(q));
  } else {
    // 두 그룹의 첫 사람이 같을 수 있다 — 한 번만 올린다
    const ids = [...new Set(idx.groups.map((g) => firstUserOf(idx, g.ROLE_GROUP_ID)).filter((x): x is string => !!x))];
    list = ids.map((id) => idx.userById.get(id)).filter((u): u is BenchUserRow => !!u);
  }
  const sel = selectedUserId ? idx.userById.get(selectedUserId) : undefined;
  const merged = sel ? [sel, ...list.filter((u) => u.USER_ID !== sel.USER_ID)] : list;
  return { list: merged.slice(0, PEOPLE_LIMIT), found: q ? list.length : null };
}

// ── 퍼미션 계산 ──────────────────────────────────────────────

/** OBJECT_ID → 퍼미션 줄(한 역할). */
export type RolePermMap = ReadonlyMap<string, RolePermRow>;

export const toRolePermMap = (rows: readonly RolePermRow[]): Map<string, RolePermRow> => new Map(rows.map((r) => [r.OBJECT_ID, r]));

/**
 * 퍼미션 줄이 있는가. searchRolePerm 은 퍼미션 없는 오브젝트 줄도 돌려준다(오브젝트 허용 값을 보이려고) —
 * 그 줄은 BTN_PERM 이 null 이다(BE 계약, 조정 알림 2026-11-27).
 */
export const hasPerm = (row: RolePermRow | undefined): row is RolePermRow => !!row && row.BTN_PERM !== null;

/** 오브젝트 허용 값(버튼·팝업). */
export interface ObjAllowed {
  btn: string[];
  popup: string[];
}

export const allowedFromPermRow = (row: RolePermRow): ObjAllowed => ({ btn: parseTokens(row.OBJ_BTN_PERM), popup: parseTokens(row.OBJ_POPUP_PERM) });

/** explain 의 ALLOWED=Y 줄 = 오브젝트 허용 값(사람과 상관없다). */
export function allowedFromExplain(ex: ExplainResult): ObjAllowed {
  const btn: string[] = [];
  const popup: string[] = [];
  for (const b of ex.buttons) if (b.ALLOWED === "Y") (b.KIND === "BTN" ? btn : popup).push(b.CODE);
  return { btn, popup };
}

const intersect = (list: readonly string[], allowed: readonly string[]) => allowed.filter((x) => list.includes(x));

/** 역할 하나가 오브젝트에서 실제로 쓰는 값(허용 값 순서). 역할·오브젝트가 사용 안 함이면 없음. 시안 permOf. */
export function effectivePerm(
  roleId: string,
  row: RolePermRow | undefined,
  allowed: ObjAllowed | undefined,
  opts: { roleUnused?: boolean; objUnused?: boolean } = {},
): { btn: string[]; popup: string[] } {
  if (opts.roleUnused || opts.objUnused) return { btn: [], popup: [] };
  if (roleId === PERM_SYSADMIN_ROLE_ID) return { btn: [...(allowed?.btn ?? [])], popup: [...(allowed?.popup ?? [])] };
  if (!hasPerm(row)) return { btn: [], popup: [] };
  const a = allowed ?? allowedFromPermRow(row);
  return { btn: intersect(parseTokens(row.BTN_PERM), a.btn), popup: intersect(parseTokens(row.POPUP_PERM), a.popup) };
}

/** 퍼미션 줄 그대로의 버튼 값 중 오브젝트에 없는 값(시안 orphan). */
export function orphanTokens(row: RolePermRow | undefined, allowed: ObjAllowed | undefined): { btn: string[]; popup: string[] } {
  if (!hasPerm(row) || !allowed) return { btn: [], popup: [] };
  return {
    btn: parseTokens(row.BTN_PERM).filter((x) => !allowed.btn.includes(x)),
    popup: parseTokens(row.POPUP_PERM).filter((x) => !allowed.popup.includes(x)),
  };
}

/** 메뉴 칸 줄의 「쓰는 버튼 수 / 오브젝트 버튼 수」. 퍼미션 줄이 없으면 null. */
export function permCount(roleId: string, row: RolePermRow | undefined, objUnused: boolean, roleUnused: boolean): { nb: number; total: number } | null {
  if (roleId === PERM_SYSADMIN_ROLE_ID || !hasPerm(row)) return null;
  const allowed = allowedFromPermRow(row);
  return { nb: effectivePerm(roleId, row, allowed, { objUnused, roleUnused }).btn.length, total: allowed.btn.length };
}

// ── 메뉴 트리 ────────────────────────────────────────────────

export interface MenuTree {
  rows: BenchMenuRow[];
  byId: Map<string, BenchMenuRow>;
  /** 부모 MENU_ID("" = 맨 위) → 자식(서버가 준 순서 = 그래프 메뉴 순서. 화면은 다시 정렬하지 않는다, bench-be #11 e). */
  children: Map<string, BenchMenuRow[]>;
  /** OBJECT_ID → 화면 메뉴 줄(같은 화면이 여러 메뉴에 걸리면 먼저 나온 줄). 모두는 `menusOf`. */
  byObject: Map<string, BenchMenuRow>;
  /** OBJECT_ID → 그 화면을 건 메뉴 줄 전부(순서대로). */
  menusOf: Map<string, BenchMenuRow[]>;
  /** 모듈·폴더 MENU_ID → 그 아래 화면 OBJECT_ID 들(순서대로). */
  screensUnder: Map<string, string[]>;
  /** 모듈·폴더 MENU_ID → 그 아래 화면 메뉴 줄들(순서대로). 같은 화면이 두 폴더에 걸려도 폴더마다 자기 줄만 담는다. */
  menusUnder: Map<string, BenchMenuRow[]>;
}

export function buildMenuTree(menus: readonly BenchMenuRow[]): MenuTree {
  const byId = new Map(menus.map((m) => [m.MENU_ID, m]));
  const children = new Map<string, BenchMenuRow[]>();
  for (const m of menus) {
    const p = m.PARENT_MENU_ID && byId.has(m.PARENT_MENU_ID) ? m.PARENT_MENU_ID : "";
    const list = children.get(p);
    if (list) list.push(m);
    else children.set(p, [m]);
  }
  // 줄 순서 = 서버가 준 그래프 메뉴 순서(bench-be #11 e) — SORT_SEQ 로 다시 정렬하지 않는다
  const byObject = new Map<string, BenchMenuRow>();
  const menusOf = new Map<string, BenchMenuRow[]>();
  const screensUnder = new Map<string, string[]>();
  const menusUnder = new Map<string, BenchMenuRow[]>();
  const walk = (id: string): BenchMenuRow[] => {
    const out: BenchMenuRow[] = [];
    for (const c of children.get(id) ?? []) {
      if (c.OBJECT_ID) {
        if (!byObject.has(c.OBJECT_ID)) byObject.set(c.OBJECT_ID, c);
        const same = menusOf.get(c.OBJECT_ID);
        if (same) same.push(c);
        else menusOf.set(c.OBJECT_ID, [c]);
        out.push(c);
      } else out.push(...walk(c.MENU_ID));
    }
    if (id) {
      menusUnder.set(id, out);
      screensUnder.set(id, out.map((m) => m.OBJECT_ID ?? ""));
    }
    return out;
  };
  walk("");
  return { rows: [...menus], byId, children, byObject, menusOf, screensUnder, menusUnder };
}

/**
 * 고른 화면의 메뉴 줄. 같은 화면이 여러 메뉴에 걸리면 `menuId`(누른 줄)를 우선하고, 없으면 먼저 나온 줄.
 */
export function screenRowOf(tree: MenuTree, objectId: string, menuId?: string | null): BenchMenuRow | undefined {
  const picked = menuId ? tree.byId.get(menuId) : undefined;
  return picked && picked.OBJECT_ID === objectId ? picked : tree.byObject.get(objectId);
}

/** 화면이 속한 위(모듈·폴더) MENU_ID 들, 바깥부터. `menuId` 가 있으면 그 줄의 위쪽. */
export function ancestorsOf(tree: MenuTree, objectId: string, menuId?: string | null): string[] {
  const out: string[] = [];
  let p = screenRowOf(tree, objectId, menuId)?.PARENT_MENU_ID ?? null;
  while (p && tree.byId.has(p)) {
    out.unshift(p);
    p = tree.byId.get(p)?.PARENT_MENU_ID ?? null;
  }
  return out;
}

/** 「모듈 › 폴더」 경로. */
export const menuPathOf = (tree: MenuTree, objectId: string, menuId?: string | null): string =>
  ancestorsOf(tree, objectId, menuId).map((id) => tree.byId.get(id)?.MENU_NM ?? id).join(" › ");

/**
 * 메뉴 줄이 말하는 「오브젝트 사용 안 함」. 줄에 OBJ_USE_TP 가 있으면 그 값(역할 기준 트리도 같다),
 * 없으면 undefined(모름 — 사람 기준 트리 REASON·explain 으로 판정한다).
 */
export const objUseOf = (m: BenchMenuRow | undefined): boolean | undefined => (m?.OBJ_USE_TP ? m.OBJ_USE_TP === "N" : undefined);

/** 줄의 「오브젝트 사용 안 함」. OBJ_USE_TP 가 있으면 그것이 먼저, 없으면 REASON(bench-be #11 d 부터 역할 기준 트리도 실제 이유를 준다). */
export const isObjUnused = (m: BenchMenuRow | undefined): boolean => objUseOf(m) ?? m?.REASON === "OBJ_UNUSED";

/** 읽어 둔 트리들에서 「오브젝트 사용 안 함」 OBJECT_ID 를 모은다. */
export function unusedObjectsOf(trees: Iterable<MenuTree>): Set<string> {
  const out = new Set<string>();
  for (const t of trees) for (const m of t.rows) if (m.OBJECT_ID && isObjUnused(m)) out.add(m.OBJECT_ID);
  return out;
}
/**
 * 메뉴에서 숨김(「숨김」 표시). SHOW_TP = N 또는 REASON = MENU_HIDDEN(bench-be #11):
 *   - 권한이 닿는 숨긴 화면 = VISIBLE Y · REASON MENU_HIDDEN · SHOW_TP N(주소로는 연다)
 *   - 보이는 화면의 숨긴 위 폴더 = VISIBLE Y · REASON MENU_HIDDEN
 */
export const isHidden = (m: BenchMenuRow | undefined): boolean => m?.SHOW_TP === "N" || m?.REASON === "MENU_HIDDEN";

/** 이 줄이나 위 모듈·폴더 하나가 메뉴에서 숨김인가(권한이 닿아도 메뉴에는 없다 = 주소로 여는 화면). */
export function hiddenInMenu(tree: MenuTree, m: BenchMenuRow | undefined): boolean {
  let cur = m;
  for (let i = 0; cur && i < 64; i++) {
    if (isHidden(cur)) return true;
    cur = cur.PARENT_MENU_ID ? tree.byId.get(cur.PARENT_MENU_ID) : undefined;
  }
  return false;
}

/** 메뉴 칸 그리드 한 줄. */
export interface MenuGridRow extends Record<string, unknown> {
  MENU_ID: string;
  LEVEL: number;
  NAME: string;
  OBJECT_ID: string | null;
  /** 모듈·폴더: 펼쳤는지. */
  OPEN: boolean;
  /** 등록 상태. Y = 모두(화면은 등록) · P = 일부 · N = 없음. */
  REG: "Y" | "P" | "N";
  /** 모듈·폴더: 아래 화면 수. */
  SCREEN_CNT: number;
  /** 모듈·폴더: 등록 화면 수. */
  REG_CNT: number;
  /** 화면: "쓰는 수/버튼 수" · "모두"(SYSADMIN) · ""(미등록). */
  BTN_TXT: string;
  HIDDEN: boolean;
  OBJ_UNUSED: boolean;
  /** 초안 차이(화면 줄만). add = 새로 등록 · del = 등록 해제 · mod = 값 바뀜. */
  CHG: "add" | "del" | "mod" | null;
}

export interface FlattenMenuOptions {
  open: ReadonlySet<string>;
  filter: MenuFilter;
  query: string;
  /** 화면이 이 역할에 등록(퍼미션 줄 있음)인지. */
  isReg: (objectId: string) => boolean;
  /** 화면 「버튼」 칸 글. */
  btnText: (objectId: string) => string;
  /**
   * 오브젝트 사용 안 함 판정. 줄에 OBJ_USE_TP 가 있으면 그 값이 먼저다. 없으면(옛 서버) 화면이 다른 출처(사람 기준 트리·explain 등)를
   * 합쳐 넘긴다. 이것도 없으면 줄의 REASON 을 본다(bench-be #11 d 부터 역할 기준 트리도 실제 이유를 준다).
   */
  objUnused?: (objectId: string) => boolean;
  /** 2단계: 화면의 초안 차이. 없으면 늘 null. */
  changeOf?: (objectId: string) => "add" | "del" | "mod" | null;
}

/** 메뉴 칸에 보일 줄을 펼침 상태대로 편다(시안 colMenu). 찾는 말이 있으면 모두 펼친다. */
export function flattenMenuRows(tree: MenuTree, o: FlattenMenuOptions): MenuGridRow[] {
  const q = o.query.trim().toLowerCase();
  const keep = (m: BenchMenuRow) =>
    (!q || m.MENU_NM.toLowerCase().includes(q) || (m.OBJECT_ID ?? "").toLowerCase().includes(q)) && (o.filter === "all" || o.isReg(m.OBJECT_ID ?? ""));
  const out: MenuGridRow[] = [];
  const visit = (parent: string, level: number) => {
    for (const m of tree.children.get(parent) ?? []) {
      if (m.OBJECT_ID) {
        if (!keep(m)) continue;
        const reg = o.isReg(m.OBJECT_ID);
        out.push({
          MENU_ID: m.MENU_ID, LEVEL: level, NAME: m.MENU_NM, OBJECT_ID: m.OBJECT_ID, OPEN: false,
          REG: reg ? "Y" : "N", SCREEN_CNT: 1, REG_CNT: reg ? 1 : 0, BTN_TXT: reg ? o.btnText(m.OBJECT_ID) : "",
          HIDDEN: isHidden(m), OBJ_UNUSED: objUseOf(m) ?? (o.objUnused ? o.objUnused(m.OBJECT_ID) : isObjUnused(m)),
          CHG: o.changeOf ? o.changeOf(m.OBJECT_ID) : null,
        });
        continue;
      }
      const all = tree.screensUnder.get(m.MENU_ID) ?? [];
      // 폴더마다 자기 아래 줄로 거른다(같은 화면이 다른 폴더에도 걸려 있어도 그 줄의 이름을 쓰지 않는다)
      if (!(tree.menusUnder.get(m.MENU_ID) ?? []).some(keep)) continue;
      const regCnt = all.filter(o.isReg).length;
      const open = o.open.has(m.MENU_ID) || !!q;
      out.push({
        MENU_ID: m.MENU_ID, LEVEL: level, NAME: m.MENU_NM, OBJECT_ID: null, OPEN: open,
        REG: all.length && regCnt === all.length ? "Y" : regCnt > 0 ? "P" : "N", SCREEN_CNT: all.length, REG_CNT: regCnt, BTN_TXT: "",
        HIDDEN: isHidden(m), OBJ_UNUSED: false, CHG: null,
      });
      if (open) visit(m.MENU_ID, level + 1);
    }
  };
  visit("", 0);
  return out;
}

/** 미리보기 메뉴(그 사람·역할이 보는 화면만). 모듈·폴더는 아래에 보이는 화면이 있을 때만. */
export interface NavItem {
  MENU_ID: string;
  LEVEL: number;
  NAME: string;
  OBJECT_ID: string | null;
  OPEN: boolean;
  /** 모듈·폴더: 보이는 화면 수. */
  CNT: number;
  /** 비교(초안 보기): 초안에서 새로 보임. */
  NEW?: boolean;
  /** 비교(초안 보기): 현재는 보이지만 초안에서 메뉴에서 사라짐. */
  GONE?: boolean;
  /** 화면: 권한은 닿지만 메뉴에서 숨김(이 줄이나 위 폴더가 숨김 — 주소로 여는 화면, bench-be #11 a·b). */
  HIDDEN?: boolean;
}

/**
 * base 를 주면(초안 보기) 현재 트리와 비교한다 — 현재만 보이는 화면도 GONE 으로 남기고, 초안에서만 보이는 화면에 NEW 를 단다(시안 rightPreview cmp).
 * visibleCnt 는 tree 기준. newCnt·goneCnt 는 비교할 때만 센다.
 * 숨긴 화면(VISIBLE Y + 메뉴에서 숨김)은 줄로 보이되 HIDDEN 을 달고, 메뉴 수(visibleCnt·CNT)에는 넣지 않는다.
 */
export function flattenNav(
  tree: MenuTree,
  open: ReadonlySet<string>,
  base?: MenuTree,
): { items: NavItem[]; visibleCnt: number; newCnt: number; goneCnt: number } {
  const vis = (m: BenchMenuRow) => m.VISIBLE === "Y";
  const was = (m: BenchMenuRow) => !!base && base.byId.get(m.MENU_ID)?.VISIBLE === "Y";
  const any = (m: BenchMenuRow) => vis(m) || was(m);
  // 숨긴 줄 아래 화면 MENU_ID(위 폴더 숨김까지) — 한 번만 훑는다
  const hiddenIds = new Set<string>();
  const mark = (parent: string, up: boolean) => {
    for (const m of tree.children.get(parent) ?? []) {
      const h = up || isHidden(m);
      if (h) hiddenIds.add(m.MENU_ID);
      if (!m.OBJECT_ID) mark(m.MENU_ID, h);
    }
  };
  mark("", false);
  const shown = (m: BenchMenuRow) => vis(m) && !hiddenIds.has(m.MENU_ID);
  const out: NavItem[] = [];
  let visibleCnt = 0;
  let newCnt = 0;
  let goneCnt = 0;
  const visit = (parent: string, level: number, show: boolean) => {
    for (const m of tree.children.get(parent) ?? []) {
      if (m.OBJECT_ID) {
        if (!any(m)) continue;
        const isNew = !!base && vis(m) && !was(m);
        const gone = !!base && !vis(m);
        if (isNew) newCnt += 1;
        if (gone) goneCnt += 1;
        const hid = hiddenIds.has(m.MENU_ID);
        if (show) {
          out.push({
            MENU_ID: m.MENU_ID, LEVEL: level, NAME: m.MENU_NM, OBJECT_ID: m.OBJECT_ID, OPEN: false, CNT: 0,
            ...(base ? { NEW: isNew, GONE: gone } : {}), ...(hid ? { HIDDEN: true } : {}),
          });
        }
        continue;
      }
      const under = tree.menusUnder.get(m.MENU_ID) ?? [];
      if (!under.some(any)) continue;
      const cnt = under.filter(shown).length;
      if (level === 0) visibleCnt += cnt;
      const isOpen = open.has(m.MENU_ID);
      if (show) out.push({ MENU_ID: m.MENU_ID, LEVEL: level, NAME: m.MENU_NM, OBJECT_ID: null, OPEN: isOpen, CNT: cnt });
      visit(m.MENU_ID, level + 1, show && isOpen);
    }
  };
  visit("", 0, true);
  return { items: out, visibleCnt, newCnt, goneCnt };
}

// ── 버튼이 왜 켜졌나·잠겼나 ──────────────────────────────────

/** 잠긴 버튼 아래 짧은 이유. */
export const REASON_SHORT: Readonly<Record<PermReason, string>> = {
  PERM: "",
  SYSADMIN: "",
  NO_PERM: "켠 역할 없음",
  NOT_IN_OBJ: "오브젝트에 없음",
  ROLE_UNUSED: "역할 사용 안 함",
  GROUP_UNUSED: "그룹 사용 안 함",
  OBJ_UNUSED: "오브젝트 사용 안 함",
  MENU_HIDDEN: "메뉴 숨김",
  NO_ROLE: "받은 역할 없음",
};

export interface WhyNames {
  roleName: (id: string) => string;
  groupName: (id: string) => string;
}

/** 사람 기준 버튼 마우스오버 글(시안 btnWhy). 길(그룹 → 역할)은 explain paths 로 잇는다. */
export function buttonWhy(b: ExplainButtonRow, ex: ExplainResult, userUnused: boolean, n: WhyNames): string {
  const c = b.CODE;
  if (b.ALLOWED === "N") return `${c} — 오브젝트에서 빠진 값이라 아무도 못 씁니다`;
  if (b.REASON === "OBJ_UNUSED") return `${c} — 오브젝트가 「사용 안 함」이라 못 씁니다`;
  if (userUnused) return `${c} — 사용자가 「사용 안 함」(USE_TP = N)이라 못 씁니다`;
  const roles = parseTokens(b.ROLES);
  const groups = parseTokens(b.GROUPS);
  const via = (r: string) => {
    const gs = ex.paths.filter((p) => p.ROLE_ID === r && groups.includes(p.ROLE_GROUP_ID)).map((p) => p.ROLE_GROUP_ID);
    const list = gs.length ? gs : groups.slice(0, 1);
    return list.map((g) => `${n.groupName(g)} → ${n.roleName(r)}`).join(", ");
  };
  if (b.GRANTED === "Y") {
    if (b.REASON === "SYSADMIN") return `${c} — 쓰는 길: ${groups.map((g) => `${n.groupName(g)} → ${n.roleName(PERM_SYSADMIN_ROLE_ID)}`).join(", ")} (시스템 관리자는 퍼미션 없이 모든 값)`;
    return `${c} — 쓰는 길: ${roles.map(via).join(", ")}`;
  }
  switch (b.REASON) {
    case "ROLE_UNUSED":
      return `${c} — 잠김: 이 값을 켠 역할 ${roles.map((r) => `「${n.roleName(r)}」`).join(", ")}이(가) 「사용 안 함」입니다`;
    case "GROUP_UNUSED":
      return `${c} — 잠김: ${groups.map((g) => `「${n.groupName(g)}」`).join(", ")} 그룹이 「사용 안 함」이라 그 그룹으로 받은 역할이 빠집니다`;
    case "NO_ROLE":
      return `${c} — 잠김: 받은 역할이 없습니다`;
    default:
      return `${c} — 잠김: 받은 역할의 퍼미션에 없습니다. 아래 퍼미션에서 켜거나 역할 그룹을 바꿉니다`;
  }
}

/** 역할 기준 버튼 마우스오버 글(시안 roleWhy). */
export function roleButtonWhy(code: string, on: boolean, roleName: string, objUnused: boolean, roleUnused: boolean): string {
  if (objUnused) return `${code} — 오브젝트가 「사용 안 함」이라 못 씁니다`;
  if (roleUnused) return `${code} — 「${roleName}」이(가) 「사용 안 함」이라 못 씁니다`;
  return on ? `${code} — 「${roleName}」의 퍼미션에 있습니다` : `${code} — 잠김: 「${roleName}」의 퍼미션에 없습니다`;
}
