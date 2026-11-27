"use client";

/**
 * commPermBench 화면 상태 — 고른 것(사람·그룹·역할·화면)·펼침·보는 기준·단계·초안을 한 곳에 둔다.
 *
 * 고르기 규칙 = 시안 mock-v16 fix()·H 처리기:
 *   - 사람 기준: 그룹은 그 사람이 속한 그룹만, 역할은 고른 그룹에 든 역할만 고른다. 어긋나면 첫 것으로 맞춘다.
 *   - 역할 기준: 사람·그룹 없이 역할만 고른다.
 *   - 고르기는 초안을 얹은 소속(viewBench)으로 맞춘다(시안 fix 가 DRAFT 를 보는 것과 같다).
 *
 * 단계(phase): 1 = 보기만(f2) · 2 = 초안 편집(f3) · 3 = 원래 프로그램 링크(f4).
 * 편집 처리기(`edit`)는 화면 초안(useBenchDraft)을 바꾼다. 칸·칩은 「현재 값 + 화면 초안」(draft.ts overlay*)으로 그린다.
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
  type RolePermMap,
} from "./model";
import { PERM_SYSADMIN_ROLE_ID, type PermBenchApi, type PermChangeRow, type PermSource } from "./types";
import { useOpenWith, type OpenWith } from "./nav";
import { roleTreeKey, useBenchData, userTreeKey, type BenchData } from "./useBenchData";
import {
  changeKey,
  draftRoleIds,
  groupGivesSysadmin,
  linkSig,
  overlayBench,
  overlayRolePerm,
  overlayRolePerms,
  permBaseOf,
  permSig,
  rebaseDraft,
  rowsOfSig,
  revertChange,
  roleSig,
  setLink,
  setPerm,
  setRegister,
  type DraftMap,
} from "./draft";
import { useBenchDraft, type BenchDraft } from "./useBenchDraft";

/**
 * 지금 만든 단계. 3 = 편집·초안(f3) + 원래 프로그램 링크(f4, nav.ts openLegacy·받는 화면 훅 연결됨).
 */
export const BENCH_PHASE: BenchPhase = 3;

/**
 * 지금 로그인한 관리자가 SYSADMIN 인가(기본 값). SYSADMIN 이 걸린 소속 변경(GRP_ROLE·USER_GRP)은 SYSADMIN 사용자만 한다(BE PERM_FORBIDDEN).
 * 화면은 searchBench 응답 `me[0].ME_SYSADMIN === "Y"`(BenchIndex.meSysadmin)이면 그 잠금을 푼다. 칸이 없으면(옛 서버) 이 값(false)으로 본다.
 * TODO(실연결): USE_MOCK = false 로 붙인 뒤 BE 가 ME_SYSADMIN 을 주는지 확인하고, 이 상수를 지운다(ME_SYSADMIN 만 본다).
 * ROLE_OBJ 의 SYSADMIN 역할 퍼미션(ADD·UPD)은 ME_SYSADMIN 과 상관없이 늘 막는다(BE 계약 ⑤-5).
 */
export const CURRENT_USER_IS_SYSADMIN = false;

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
  /** 미리보기 「현재/초안」 보기(시안 look). 2단계부터 처음 값은 초안. */
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
  source: BENCH_PHASE >= 2 ? "DRAFT" : "CUR",
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
  /** 미리보기 「현재/초안」. */
  setSource: (source: PermSource) => void;
  /** 막대 안내를 띄운다. */
  setFlash: (text: string) => void;
}

/** 2단계(f3) 편집 처리기. canEdit 이 아니면 아무 일도 하지 않는다. */
export interface BenchEditActions {
  /** 사람 ↔ 역할 그룹 체크(USER_GRP). 켜면 그 그룹을 고른다. */
  toggleMember: (groupId: string, on: boolean) => void;
  /** 역할 그룹 ↔ 역할 체크(GRP_ROLE). 켜면 그 역할을 고른다. */
  toggleGroupRole: (roleId: string, on: boolean) => void;
  /** 메뉴 칸 체크 = 퍼미션 줄 등록·해제(ROLE_OBJ). 모듈·폴더 체크는 아래 화면 전부. */
  toggleRegister: (objectIds: readonly string[], on: boolean) => void;
  /** 퍼미션 버튼·팝업 칩(ROLE_OBJ). 버튼이 비면 등록 해제(D14). */
  setPermValues: (btn: readonly string[], popup: readonly string[]) => void;
  /** 고른 역할 × 화면 퍼미션을 현재 값으로 되돌린다. */
  resetPerm: () => void;
  /** 바꾼 것 한 줄 되돌리기(키 = TP|KEY1|KEY2). */
  revert: (key: string) => void;
}

/** 초안을 얹은 화면 값. */
export interface BenchView {
  /** 소속에 초안을 얹은 작업대 색인(칸·고르기). 소속 변경이 없으면 data.bench 와 같은 객체. */
  bench: BenchIndex | null;
  /** 읽은 역할 퍼미션 전부 + 초안. */
  rolePerms: ReadonlyMap<string, RolePermMap>;
  /** 고른 역할의 퍼미션 + 그 역할 초안(메뉴 칸 — 다른 역할을 고쳐도 같은 객체). */
  menuRolePerm: RolePermMap | undefined;
}

export interface BenchState {
  sel: BenchSelection;
  data: BenchData;
  view: BenchView;
  draft: BenchDraft;
  actions: BenchActions;
  edit: BenchEditActions;
  /** 미리보기가 실제로 보는 쪽. 「초안」이어도 서버에 저장한 초안이 없으면 CUR(현재와 같다). */
  look: PermSource;
  /** 체크·칩을 바꿀 수 있는가(2단계부터, 서버 초안을 읽은 뒤). */
  canEdit: boolean;
  /** 원래 프로그램 링크를 쓸 수 있는가(3단계부터). */
  canLink: boolean;
  /** 로그인한 관리자가 SYSADMIN 인가(ME_SYSADMIN, 모르면 CURRENT_USER_IS_SYSADMIN). */
  isSysadmin: boolean;
}

export interface BenchStateOptions {
  /** 초안 저장·영향 읽기 실패 알림(화면이 메시지로 보인다). */
  onError?: (e: unknown) => void;
}

/** 서명 → 줄(draft.ts 가 방금 만든 서명이면 JSON.parse 없이, f3 리뷰 4). */
const parseRows = (sig: string): readonly PermChangeRow[] => rowsOfSig(sig);

export function useBenchState(api: PermBenchApi, opts: BenchStateOptions = {}): BenchState {
  const [raw, setRaw] = useState<BenchSelection>(INITIAL);
  const data = useBenchData(api);
  const { bench, benchLoading, menuTrees, rolePerms, epoch, ensureMenuTree, ensureRolePerms, ensureExplain, invalidateDraft } = data;
  const phaseEdit = raw.phase >= 2;
  const draft = useBenchDraft(api, { enabled: phaseEdit, onSaved: invalidateDraft, onError: opts.onError });
  // 다시 읽는 동안(benchLoading)에는 앞 현재 값이 보여 낡은 기준으로 OP 를 정하게 되므로 편집을 막는다(f3 리뷰 5). 버리는 중도 막는다(리뷰 2)
  const canEdit = phaseEdit && draft.status === "ready" && !draft.discarding && !benchLoading;
  // TODO(ME_SYSADMIN): 실연결 뒤 CURRENT_USER_IS_SYSADMIN 을 지우고 bench.meSysadmin 만 본다
  const isSysadmin = CURRENT_USER_IS_SYSADMIN || bench?.meSysadmin === true;

  // 초안을 얹은 값 — 소속 변경·역할별 퍼미션 변경의 서명으로 memo 해서, 칩 하나를 바꿔도 작업대 색인은 그대로 둔다
  const d = draft.draft;
  const linkKey = useMemo(() => linkSig(d), [d]);
  const permKey = useMemo(() => permSig(d), [d]);
  const viewBench = useMemo(() => (bench ? overlayBench(bench, parseRows(linkKey)) : null), [bench, linkKey]);
  const viewRolePerms = useMemo(() => overlayRolePerms(rolePerms, parseRows(permKey)), [rolePerms, permKey]);

  // 처리기(이벤트)가 최신 자료를 읽도록 커밋 뒤 맞춘다
  const benchRef = useRef(viewBench);
  const baseRef = useRef(bench);
  const treesRef = useRef(menuTrees);
  const curPermsRef = useRef(rolePerms);
  const draftRef = useRef<DraftMap>(d);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    benchRef.current = viewBench;
    baseRef.current = bench;
    treesRef.current = menuTrees;
    curPermsRef.current = rolePerms;
    draftRef.current = d;
    canEditRef.current = canEdit;
  }, [viewBench, bench, menuTrees, rolePerms, d, canEdit]);

  const sel = useMemo(() => fixSelection(raw, viewBench), [raw, viewBench]);
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  // 고른 역할(sel — 초안 소속으로 맞춘 값)의 퍼미션 변경 서명
  const roleKey = useMemo(() => (sel.roleId ? roleSig(d, sel.roleId) : "[]"), [d, sel.roleId]);
  const menuRolePerm = useMemo(() => {
    const m = sel.roleId ? rolePerms.get(sel.roleId) : undefined;
    return m && sel.roleId ? overlayRolePerm(m, sel.roleId, parseRows(roleKey)) : undefined;
  }, [rolePerms, sel.roleId, roleKey]);

  /** 바꾼 뒤 자료에 맞춘다. 안내(flash)는 동작마다 지운다. */
  const update = useCallback((fn: (s: BenchSelection) => BenchSelection) => {
    setRaw((prev) => {
      const base = fixSelection(prev, benchRef.current);
      const cleared = base.flash ? { ...base, flash: "" } : base;
      const next = fixSelection(fn(cleared), benchRef.current);
      return next === base ? prev : next;
    });
  }, []);

  /** 편집 뒤 고르기: 초안을 얹은 색인은 다음 그리기에서야 바뀌므로 여기서는 맞추지 않는다(sel memo 가 맞춘다). */
  const updateRaw = useCallback((fn: (s: BenchSelection) => BenchSelection) => {
    setRaw((prev) => fn(fixSelection(prev, benchRef.current)));
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
      setSource: (source) => update((s) => (s.source === source ? s : { ...s, source })),
      setFlash: (flash) => update((s) => ({ ...s, flash })),
    }),
    [update, ancestorsFor],
  );

  // ── 편집(2단계) ──────────────────────────────────────────
  const { mutate } = draft;
  const edit = useMemo<BenchEditActions>(() => {
    const rname = (id: string) => benchRef.current?.roleById.get(id)?.ROLE_NM ?? id;
    return {
      toggleMember: (groupId, on) => {
        const s = selRef.current;
        const base = baseRef.current;
        const view = benchRef.current;
        if (!canEditRef.current || !s.userId || !base || !view) return;
        // SYSADMIN 을 주는 그룹의 소속은 SYSADMIN 사용자만 바꾼다(BE PERM_FORBIDDEN)
        if (!isSysadmin && (groupGivesSysadmin(base, groupId) || groupGivesSysadmin(view, groupId))) return;
        const uid = s.userId;
        const curOn = groupsOfUser(base, uid).includes(groupId);
        mutate((x) => setLink(x, "USER_GRP", uid, groupId, on, curOn));
        if (on) updateRaw((x) => ({ ...x, groupId, flash: "" }));
      },
      toggleGroupRole: (roleId, on) => {
        const s = selRef.current;
        const base = baseRef.current;
        if (!canEditRef.current || !s.groupId || !base) return;
        if (!isSysadmin && roleId === PERM_SYSADMIN_ROLE_ID) return;
        const gid = s.groupId;
        const curOn = rolesOfGroup(base, gid).includes(roleId);
        mutate((x) => setLink(x, "GRP_ROLE", gid, roleId, on, curOn));
        if (on) updateRaw((x) => ({ ...x, roleId, flash: "" }));
      },
      toggleRegister: (objectIds, on) => {
        const s = selRef.current;
        const rid = s.roleId;
        if (!canEditRef.current || !rid || rid === PERM_SYSADMIN_ROLE_ID) return;
        const cur = curPermsRef.current.get(rid);
        if (!cur) return;
        const baseOf = (oid: string) => permBaseOf(cur.get(oid));
        const regIn = (x: DraftMap) => (oid: string) => {
          const c = x.get(changeKey("ROLE_OBJ", rid, oid));
          return c ? c.OP !== "DEL" : hasPerm(cur.get(oid));
        };
        // 한 번만 계산한다 — updater 가 받은 초안이 계산한 기준과 같으면 결과를 그대로 쓴다(StrictMode 두 번 부름도 싸다, f3 리뷰 4)
        const from = draftRef.current;
        const probe = setRegister(from, rid, objectIds, on, baseOf, regIn(from));
        mutate((x) => (x === from ? probe.draft : setRegister(x, rid, objectIds, on, baseOf, regIn(x)).draft));
        if (objectIds.length === 1) {
          if (on) actions.selectObject(objectIds[0]);
          if (probe.skipped) actions.setFlash("버튼이 없는 화면이라 등록할 수 없습니다");
          return;
        }
        const skip = probe.skipped ? ` · 버튼이 없는 화면 ${probe.skipped}개는 건너뜀` : "";
        actions.setFlash(`${rname(rid)}: 메뉴 ${probe.changed}개를 ${on ? "등록" : "등록 해제"}했습니다(초안)${skip}`);
      },
      setPermValues: (btn, popup) => {
        const { roleId: rid, objectId: oid } = selRef.current;
        if (!canEditRef.current || !rid || !oid || rid === PERM_SYSADMIN_ROLE_ID) return;
        const cur = curPermsRef.current.get(rid);
        if (!cur) return;
        const base = permBaseOf(cur.get(oid));
        mutate((x) => setPerm(x, rid, oid, btn, popup, base));
      },
      resetPerm: () => {
        const { roleId: rid, objectId: oid } = selRef.current;
        if (!canEditRef.current || !rid || !oid) return;
        mutate((x) => revertChange(x, changeKey("ROLE_OBJ", rid, oid)));
      },
      revert: (key) => {
        if (!canEditRef.current) return;
        mutate((x) => revertChange(x, key));
        actions.setFlash("되돌렸습니다");
      },
    };
  }, [mutate, updateRaw, actions, isSysadmin]);

  // ── 다시 읽은 현재 값에 초안 맞추기(f3 리뷰 3) ──────────────
  // 현재 값(bench·역할 퍼미션)이 새로 오면 초안 줄의 OP 를 새 현재 값에 맞추고, 현재와 같아진 줄을 지운다.
  // 서버 응답(새 현재 값)에 맞춘 동기화라 효과에서 부른다. rebaseDraft 는 바뀐 게 없으면 같은 초안을 돌려줘 다시 그리지 않는다.
  // draft 를 deps 에 두지 않는다(편집마다 돌지 않는다 — 편집은 처리기가 현재 값으로 OP 를 정한다).
  const { rebase } = draft;
  const draftReady = draft.status === "ready";
  useEffect(() => {
    if (!bench || benchLoading || !draftReady) return;
    rebase((x) => rebaseDraft(x, bench, rolePerms));
  }, [bench, benchLoading, rolePerms, draftReady, rebase]);

  // ── 필요한 자료 읽기 ──────────────────────────────────────
  // epoch: 다시 읽기(reload)·다시 시도(retry)·초안 저장 뒤 지금 보는 것의 자료를 다시 요청한다(받은 키는 건너뛴다).
  const { by, userId, roleId, objectId, reveal } = sel;
  const look: PermSource = phaseEdit && sel.source === "DRAFT" && draft.savedCount > 0 ? "DRAFT" : "CUR";
  // 보는 사람이 받은 역할(현재 + 초안) — 초안에서 더한 역할의 퍼미션도 읽는다
  const userRoles = useMemo(() => {
    if (!userId) return [];
    const a = bench ? rolesOfUser(bench, userId) : [];
    const b = viewBench ? rolesOfUser(viewBench, userId) : [];
    return [...new Set([...a, ...b])];
  }, [bench, viewBench, userId]);
  // 초안에 든 역할(바꾼 것 글의 현재 값·화면 이름)
  const changedRoles = useMemo(() => draftRoleIds(parseRows(permKey)), [permKey]);

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
    ensureRolePerms(changedRoles);
    if (look === "DRAFT") {
      if (by === "person" && userId) ensureMenuTree(userTreeKey(userId), "DRAFT");
      else if (by === "role" && roleId) ensureMenuTree(roleTreeKey(roleId), "DRAFT");
    }
  }, [bench, epoch, by, userId, roleId, userRoles, changedRoles, look, ensureMenuTree, ensureRolePerms]);

  // 버튼 판정: 사람 기준은 그 사람(초안 보기면 서버 DRAFT 도). 역할 기준은 허용 값을 searchRolePerm 줄로, 오브젝트 사용 여부를
  // 메뉴 줄 OBJ_USE_TP 로 알므로 그 칸이 있으면 explain 을 부르지 않는다. 칸이 없으면(옛 서버) 아무 사람(첫 사람)으로 묻는다.
  const probeUserId = bench?.users[0]?.USER_ID ?? null;
  const roleTree = roleId ? menuTrees.get(roleTreeKey(roleId)) : undefined;
  const roleRowKnowsUse = !!roleTree && !!objectId && objUseOf(roleTree.byObject.get(objectId)) !== undefined;
  useEffect(() => {
    if (!bench || !objectId) return;
    if (by === "person" && userId) {
      ensureExplain(userId, objectId);
      if (look === "DRAFT") ensureExplain(userId, objectId, "DRAFT");
    } else if (by === "role" && roleTree && !roleRowKnowsUse && probeUserId) ensureExplain(probeUserId, objectId);
  }, [bench, epoch, by, userId, objectId, probeUserId, roleTree, roleRowKnowsUse, look, ensureExplain]);

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

  const view = useMemo<BenchView>(() => ({ bench: viewBench, rolePerms: viewRolePerms, menuRolePerm }), [viewBench, viewRolePerms, menuRolePerm]);

  return useMemo(
    () => ({ sel, data, view, draft, actions, edit, look, canEdit, canLink: sel.phase >= 3, isSysadmin }),
    [sel, data, view, draft, actions, edit, look, canEdit, isSysadmin],
  );
}
