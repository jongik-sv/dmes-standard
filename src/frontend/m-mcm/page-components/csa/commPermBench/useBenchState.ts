"use client";

/**
 * commPermBench 화면 상태 — 고른 것(사람·그룹·역할·화면)·펼침·보는 기준·단계를 한 곳에 둔다.
 *
 * 고르기 규칙 = 시안 mock-v16 fix()·H 처리기:
 *   - 사람 기준: 그룹은 그 사람이 속한 그룹만, 역할은 고른 그룹에 든 역할만 고른다. 어긋나면 첫 것으로 맞춘다.
 *   - 역할 기준: 사람·그룹 없이 역할만 고른다.
 *
 * 단계(phase): 1 = 보기만(f2) · 2 = 초안 편집(f3) · 3 = 원래 프로그램 링크(f4).
 * 편집 처리기(`edit`)는 2단계 자리만 잡아 둔다 — 지금은 아무 일도 하지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allowedFromPermRow,
  ancestorsOf,
  defaultUserId,
  effectivePerm,
  firstUserWithRole,
  groupsGivingRole,
  groupsOfUser,
  hasPerm,
  objUseOf,
  rolesOfGroup,
  rolesOfUser,
  type BenchBy,
  type BenchIndex,
  type BenchPhase,
  type MenuFilter,
} from "./model";
import { PERM_SYSADMIN_ROLE_ID, type PermBenchApi, type PermSource } from "./types";
import { useOpenWith, type OpenWith } from "./nav";
import { roleTreeKey, useBenchData, userTreeKey, type BenchData } from "./useBenchData";

/** 지금 만든 단계. f3·f4 가 올린다. */
export const BENCH_PHASE: BenchPhase = 1;

export interface BenchSelection {
  phase: BenchPhase;
  by: BenchBy;
  userId: string | null;
  groupId: string | null;
  roleId: string | null;
  objectId: string | null;
  /** 고른 화면의 메뉴 줄 MENU_ID. 같은 화면이 여러 메뉴에 걸릴 때 누른 줄을 가린다. 모르면 null(먼저 나온 줄). */
  menuId: string | null;
  /** 원래 프로그램에서 넘어온 화면 — 역할 메뉴 트리를 읽으면 그 화면의 모듈·폴더를 펼치고 줄로 간다. */
  reveal: string | null;
  /** 메뉴 칸에서 펼친 모듈·폴더 MENU_ID. */
  open: ReadonlySet<string>;
  /** 미리보기 메뉴에서 펼친 모듈·폴더 MENU_ID. */
  nav: ReadonlySet<string>;
  mfilter: MenuFilter;
  /** 막대에 잠깐 보이는 안내. 다음 동작에서 지운다. */
  flash: string;
  /** 2단계(f3) 「현재/초안」 보기 자리. 1단계는 늘 CUR. */
  source: PermSource;
}

const INITIAL: BenchSelection = {
  phase: BENCH_PHASE,
  by: "person",
  userId: null,
  groupId: null,
  roleId: null,
  objectId: null,
  menuId: null,
  reveal: null,
  open: new Set(),
  nav: new Set(),
  mfilter: "granted",
  flash: "",
  source: "CUR",
};

/** 고른 것이 자료와 어긋나면 맞춘다(시안 fix). 바뀐 게 없으면 같은 객체를 돌려준다. */
export function fixSelection(s: BenchSelection, idx: BenchIndex | null): BenchSelection {
  if (!idx) return s;
  if (s.by === "role") {
    if (s.roleId && idx.roleById.has(s.roleId)) return s;
    const roleId = idx.roles.find((r) => r.ROLE_ID !== PERM_SYSADMIN_ROLE_ID)?.ROLE_ID ?? null;
    return roleId === s.roleId ? s : { ...s, roleId };
  }
  const userId = s.userId && idx.userById.has(s.userId) ? s.userId : defaultUserId(idx);
  const gs = userId ? groupsOfUser(idx, userId) : [];
  const groupId = s.groupId && gs.includes(s.groupId) ? s.groupId : gs[0] ?? null;
  const rs = rolesOfGroup(idx, groupId);
  const roleId = s.roleId && rs.includes(s.roleId) ? s.roleId : rs[0] ?? null;
  return userId === s.userId && groupId === s.groupId && roleId === s.roleId ? s : { ...s, userId, groupId, roleId };
}

const withAdded = (set: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> =>
  ids.every((x) => set.has(x)) ? set : new Set([...set, ...ids]);

const toggled = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export interface BenchActions {
  selectUser: (userId: string) => void;
  selectGroup: (groupId: string) => void;
  selectRole: (roleId: string) => void;
  /** 역할 기준에서 아무 역할이나 고른다. */
  selectRoleAny: (roleId: string) => void;
  /** 그룹과 역할을 함께 고른다(버튼 아래 역할 칩·「고칠 역할」·「고르기」). */
  goRole: (roleId: string, groupId: string) => void;
  setBy: (by: BenchBy) => void;
  /** 화면을 고른다. menuId = 누른 메뉴 줄(같은 화면이 여러 메뉴에 걸릴 때 그 줄의 모듈·폴더를 펼친다). */
  selectObject: (objectId: string, menuId?: string) => void;
  /** 원래 프로그램 → 작업대: 역할 기준으로 그 역할(과 화면)을 연다. 모르는 역할이면 false. */
  openRole: (roleId: string, objectId?: string) => boolean;
  /** reveal 로 넘어온 화면의 모듈·폴더를 펼친다(그 역할 트리가 온 뒤). */
  revealObject: (objectId: string) => void;
  toggleOpen: (menuId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  setFilter: (f: MenuFilter) => void;
  toggleNav: (menuId: string) => void;
}

/**
 * 2단계(f3) 편집 자리. 지금(1단계)은 모두 아무 일도 하지 않는다.
 * f3 는 여기서 초안 변경(PermChangeRow)을 쌓고 saveDraft 로 보낸다.
 */
export interface BenchEditActions {
  /** 사람 ↔ 역할 그룹 체크(USER_GRP). */
  toggleMember: (groupId: string, on: boolean) => void;
  /** 역할 그룹 ↔ 역할 체크(GRP_ROLE). */
  toggleGroupRole: (roleId: string, on: boolean) => void;
  /** 메뉴 칸 체크 = 퍼미션 줄 등록·해제(ROLE_OBJ). */
  toggleRegister: (objectIds: readonly string[], on: boolean) => void;
  /** 퍼미션 버튼·팝업 칩(ROLE_OBJ UPD). */
  setPermValues: (btn: readonly string[], popup: readonly string[]) => void;
}

const noop = () => undefined;
const EDIT_STUB: BenchEditActions = { toggleMember: noop, toggleGroupRole: noop, toggleRegister: noop, setPermValues: noop };

export interface BenchState {
  sel: BenchSelection;
  data: BenchData;
  actions: BenchActions;
  edit: BenchEditActions;
  /** 체크·칩을 바꿀 수 있는가(2단계부터). */
  canEdit: boolean;
  /** 원래 프로그램 링크를 쓸 수 있는가(3단계부터). */
  canLink: boolean;
}

export function useBenchState(api: PermBenchApi): BenchState {
  const [raw, setRaw] = useState<BenchSelection>(INITIAL);
  const data = useBenchData(api, raw.source);
  const { bench, menuTrees, rolePerms, epoch, ensureMenuTree, ensureRolePerms, ensureExplain } = data;
  // 처리기(이벤트)가 최신 자료를 읽도록 커밋 뒤 맞춘다
  const benchRef = useRef(bench);
  const treesRef = useRef(menuTrees);
  useEffect(() => {
    benchRef.current = bench;
    treesRef.current = menuTrees;
  }, [bench, menuTrees]);

  const sel = useMemo(() => fixSelection(raw, bench), [raw, bench]);

  /** 바꾼 뒤 자료에 맞춘다. 안내(flash)는 동작마다 지운다. */
  const update = useCallback((fn: (s: BenchSelection) => BenchSelection) => {
    setRaw((prev) => {
      const base = fixSelection(prev, benchRef.current);
      const cleared = base.flash ? { ...base, flash: "" } : base;
      const next = fixSelection(fn(cleared), benchRef.current);
      return next === base ? prev : next;
    });
  }, []);

  /** 화면 하나의 모듈·폴더를 메뉴 칸·미리보기 메뉴에서 펼친다. */
  const ancestorsFor = useCallback((objectId: string, menuId?: string | null): string[] => {
    for (const t of treesRef.current.values()) {
      if (t.byObject.has(objectId)) return ancestorsOf(t, objectId, menuId);
    }
    return [];
  }, []);

  const actions = useMemo<BenchActions>(
    () => ({
      selectUser: (userId) =>
        update((s) => {
          const idx = benchRef.current;
          if (s.by !== "role") return { ...s, userId };
          const keep = s.roleId && idx && rolesOfUser(idx, userId).includes(s.roleId);
          const groupId = keep && idx && s.roleId ? groupsGivingRole(idx, userId, s.roleId)[0] ?? null : null;
          return { ...s, by: "person", userId, groupId, roleId: keep ? s.roleId : null };
        }),
      selectGroup: (groupId) =>
        update((s) => {
          const idx = benchRef.current;
          return idx && s.userId && groupsOfUser(idx, s.userId).includes(groupId) ? { ...s, groupId } : s;
        }),
      selectRole: (roleId) =>
        update((s) => {
          const idx = benchRef.current;
          return idx && rolesOfGroup(idx, s.groupId).includes(roleId) ? { ...s, roleId } : s;
        }),
      selectRoleAny: (roleId) => update((s) => (s.roleId === roleId ? s : { ...s, roleId })),
      goRole: (roleId, groupId) => update((s) => ({ ...s, groupId, roleId })),
      setBy: (by) =>
        update((s) => {
          if (s.by === by) return s;
          if (by === "role") return { ...s, by, flash: "사람 없이 역할만 고릅니다" };
          // 역할 기준 → 사람 기준: 고른 역할을 받은 사람으로 옮겨 같은 역할을 이어서 본다(시안 toPerson)
          const idx = benchRef.current;
          const rid = s.roleId;
          if (!idx || !rid) return { ...s, by };
          if (s.userId && rolesOfUser(idx, s.userId).includes(rid)) {
            return { ...s, by, groupId: groupsGivingRole(idx, s.userId, rid)[0] ?? null };
          }
          const h = firstUserWithRole(idx, rid);
          const rname = idx.roleById.get(rid)?.ROLE_NM ?? rid;
          if (!h) {
            const uname = (s.userId && idx.userById.get(s.userId)?.USER_NM) || "";
            return { ...s, by, flash: `「${rname}」을(를) 받은 사람이 없어 「${uname}」 기준으로 돌아갑니다` };
          }
          return {
            ...s,
            by,
            userId: h,
            groupId: groupsGivingRole(idx, h, rid)[0] ?? null,
            roleId: rid,
            flash: `「${rname}」을(를) 받은 「${idx.userById.get(h)?.USER_NM ?? h}」 기준으로 봅니다`,
          };
        }),
      selectObject: (objectId, menuId) =>
        update((s) => {
          const up = ancestorsFor(objectId, menuId);
          return { ...s, objectId, menuId: menuId ?? null, reveal: null, open: withAdded(s.open, up), nav: withAdded(s.nav, up) };
        }),
      openRole: (roleId, objectId) => {
        if (!benchRef.current?.roleById.has(roleId)) return false;
        update((s) => ({ ...s, by: "role", roleId, ...(objectId ? { objectId, menuId: null, reveal: objectId } : {}) }));
        return true;
      },
      revealObject: (objectId) =>
        update((s) => {
          if (s.reveal !== objectId) return s;
          const tree = s.roleId ? treesRef.current.get(roleTreeKey(s.roleId)) : undefined;
          if (!tree) return s;
          // 그 역할 메뉴에 없는 화면은 고르지 않는다(첫 화면 고르기가 이어받는다)
          if (!tree.byObject.has(objectId)) return { ...s, reveal: null, objectId: s.objectId === objectId ? null : s.objectId, menuId: null };
          const up = ancestorsOf(tree, objectId);
          return { ...s, reveal: null, open: withAdded(s.open, up), nav: withAdded(s.nav, up) };
        }),
      toggleOpen: (menuId) => update((s) => ({ ...s, open: toggled(s.open, menuId) })),
      expandAll: () =>
        update((s) => {
          const t = s.roleId ? treesRef.current.get(roleTreeKey(s.roleId)) : undefined;
          return t ? { ...s, open: withAdded(s.open, [...t.screensUnder.keys()]) } : s;
        }),
      collapseAll: () => update((s) => (s.open.size ? { ...s, open: new Set() } : s)),
      setFilter: (mfilter) => update((s) => (s.mfilter === mfilter ? s : { ...s, mfilter })),
      toggleNav: (menuId) => update((s) => ({ ...s, nav: toggled(s.nav, menuId) })),
    }),
    [update, ancestorsFor],
  );

  // ── 필요한 자료 읽기 ──────────────────────────────────────
  // epoch: 다시 읽기(reload)·다시 시도(retry) 뒤 지금 보는 것의 자료를 다시 요청한다(받은 키는 건너뛴다).
  const { by, userId, roleId, objectId, reveal } = sel;
  const userRoles = useMemo(() => (bench && userId ? rolesOfUser(bench, userId) : []), [bench, userId]);

  useEffect(() => {
    if (!bench) return;
    if (roleId) {
      ensureMenuTree(roleTreeKey(roleId));
      ensureRolePerms([roleId]);
    }
    if (by === "person" && userId) {
      ensureMenuTree(userTreeKey(userId));
      ensureRolePerms(userRoles);
    }
  }, [bench, epoch, by, userId, roleId, userRoles, ensureMenuTree, ensureRolePerms]);

  // 버튼 판정: 사람 기준은 그 사람. 역할 기준은 허용 값을 searchRolePerm 줄로, 오브젝트 사용 여부를 메뉴 줄 OBJ_USE_TP 로 알므로
  // 그 칸이 있으면 explain 을 부르지 않는다. 칸이 없으면(옛 서버) 아무 사람(첫 사람)으로 묻는다.
  const probeUserId = bench?.users[0]?.USER_ID ?? null;
  const roleTree = roleId ? menuTrees.get(roleTreeKey(roleId)) : undefined;
  const roleRowKnowsUse = !!roleTree && !!objectId && objUseOf(roleTree.byObject.get(objectId)) !== undefined;
  useEffect(() => {
    if (!bench || !objectId) return;
    if (by === "person" && userId) ensureExplain(userId, objectId);
    else if (by === "role" && roleTree && !roleRowKnowsUse && probeUserId) ensureExplain(probeUserId, objectId);
  }, [bench, epoch, by, userId, objectId, probeUserId, roleTree, roleRowKnowsUse, ensureExplain]);

  // 원래 프로그램에서 넘어온 화면: 역할 트리가 오면 그 화면의 모듈·폴더를 펼친다(메뉴 칸 그리드가 그 줄로 스크롤한다)
  const { revealObject } = actions;
  useEffect(() => {
    if (reveal && roleTree) revealObject(reveal);
  }, [reveal, roleTree, revealObject]);

  // 첫 화면 고르기: 고른 역할의 등록 화면 중 잠긴 버튼이 있는 첫 화면, 없으면 첫 등록 화면, 없으면 첫 화면
  const rolePermMap = roleId ? rolePerms.get(roleId) : undefined;
  useEffect(() => {
    if (objectId || !roleTree || !roleId) return;
    if (roleId !== PERM_SYSADMIN_ROLE_ID && !rolePermMap) return;
    const screens = [...roleTree.byObject.keys()];
    const rows = rolePermMap ? [...rolePermMap.values()].filter((r) => hasPerm(r) && roleTree.byObject.has(r.OBJECT_ID)) : [];
    const locked = rows.find((r) => {
      const a = allowedFromPermRow(r);
      return effectivePerm(roleId, r, a).btn.length < a.btn.length;
    });
    const pick = locked?.OBJECT_ID ?? rows[0]?.OBJECT_ID ?? screens[0];
    if (pick) actions.selectObject(pick);
  }, [objectId, roleTree, roleId, rolePermMap, actions]);

  // 원래 프로그램(사용자·역할·오브젝트 관리 등)이 넘긴 약속: 역할 기준으로 그 역할을 열고, 화면이 있으면 그 줄로 간다
  const openWithRole = useCallback(
    (ow: OpenWith) => {
      if (ow.id) actions.openRole(ow.id, ow.objectId);
    },
    [actions],
  );
  useOpenWith("commPermBench", openWithRole, !!bench && bench.roles.length > 0);

  return useMemo(
    () => ({ sel, data, actions, edit: EDIT_STUB, canEdit: sel.phase >= 2, canLink: sel.phase >= 3 }),
    [sel, data, actions],
  );
}
