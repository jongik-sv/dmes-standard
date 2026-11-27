import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useTabPage } from "@dk-oasis/shared/portal-shell";

/**
 * commPermBench 3단계 링크 — 원래 프로그램(사용자·역할 그룹·역할·메뉴·오브젝트 관리) 열기와
 * 돌아왔을 때 다시 읽기.
 *
 * 화면(f2)은 이 파일의 내보내기만 부른다.
 */

/** 링크 대상. `folder` = 메뉴 폴더 이름 연필(메뉴 관리로 간다). */
export type LegacyTarget = "user" | "group" | "role" | "menu" | "folder" | "obj";

/** `new` = 새 행 상태로 연다(칸 머리 +). `edit` = 고른 항목을 연 채로 연다. */
export type LegacyMode = "new" | "edit";

/** 대상별 원래 프로그램 이름·화면 ID(시안 mock-v16 ORIG). */
export const LEGACY_SCREENS: Record<LegacyTarget, { name: string; screenId: string }> = {
  user: { name: "사용자 관리", screenId: "commUserMng" },
  group: { name: "역할 그룹 관리", screenId: "commRoleGrpMng" },
  role: { name: "역할 관리", screenId: "commRoleMng" },
  menu: { name: "메뉴 관리", screenId: "commMenuMng" },
  folder: { name: "메뉴 관리", screenId: "commMenuMng" },
  obj: { name: "오브젝트 관리", screenId: "commObjMng" },
};

/** 링크 버튼 title·aria-label 문구. 예: `역할 편집 — 역할 관리(commRoleMng)에서 엽니다 ↗` */
export function legacyTip(target: LegacyTarget, label: string): string {
  const s = LEGACY_SCREENS[target];
  return `${label} — ${s.name}(${s.screenId})에서 엽니다 ↗`;
}

/**
 * 포털 pageId = `${moduleId}:${componentPath}`. csa 화면의 pageName 은 페이지 등록부 키(`csa/commRoleMng`,
 * m-mcm/lib/generated/page-registry.ts)와 같고, mcm 모듈 공급자(createPageMapModuleProvider("mcm", ...))가
 * `parsePageId` 로 앞의 `mcm:` 을 떼어 그 키로 찾는다. 메뉴 id·경로가 아니다.
 * 근거: shared/src/portal-shell/module.ts parsePageId·getPage, m-mcm/lib/portal-menu-store.ts 의 pageId 규칙,
 * m-mcm/app/portal/module-config.ts moduleId "mcm".
 */
export const LEGACY_MODULE_ID = "mcm";
export const LEGACY_GROUP = "csa";

export function legacyPageId(target: LegacyTarget): string {
  return `${LEGACY_MODULE_ID}:${LEGACY_GROUP}/${LEGACY_SCREENS[target].screenId}`;
}

/**
 * 약속을 보낸 화면. `commPermBench` = 작업대 → 원래 프로그램(openLegacy),
 * 나머지 = 원래 프로그램(퍼미션·역할·오브젝트 관리) → 작업대(openBench).
 */
export type OpenWithFrom = "commPermBench" | "commPermMng" | "commRoleMng" | "commObjMng";

const OPEN_WITH_FROMS: readonly OpenWithFrom[] = ["commPermBench", "commPermMng", "commRoleMng", "commObjMng"];

/** 받는 화면이 읽는 약속의 내용. */
export interface OpenWith {
  from: OpenWithFrom;
  mode: LegacyMode;
  /** 고른 항목 ID. 작업대로 올 때는 ROLE_ID. */
  id?: string;
  /** 작업대로 올 때 같이 고를 오브젝트(OBJECT_ID). */
  objectId?: string;
  at: number;
}

const OPEN_WITH_PREFIX = "dmes:open-with:";
const openWithKey = (screenId: string): string => OPEN_WITH_PREFIX + screenId;

/**
 * 원래 프로그램을 포털 탭으로 연다. id = 고른 항목 ID(mode=new 면 생략).
 *
 * 포털 `portal-open-tab` 이벤트는 detail.pageId 만 듣는다(use-portal-tabs.ts) — 항목 ID 를 실을 자리가 없어,
 * 열기 직전에 `sessionStorage["dmes:open-with:<screenId>"]` 에 {@link OpenWith} 를 적어 둔다. 받는 화면은
 * {@link readOpenWith} 로 읽고 쓴 뒤 지운다. 이미 열린 탭이면 그 탭이 앞으로 올 뿐 다시 마운트되지 않으므로,
 * 받는 화면은 탭 활성화(`portal-tab-activated`) 때도 읽어야 한다.
 */
export function openLegacy(target: LegacyTarget, mode: LegacyMode, id?: string): void {
  if (typeof window === "undefined") return;
  const { screenId } = LEGACY_SCREENS[target];
  try {
    const payload: OpenWith = { from: "commPermBench", mode, at: Date.now() };
    if (id !== undefined) payload.id = id;
    window.sessionStorage.setItem(openWithKey(screenId), JSON.stringify(payload));
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 화면만 연다 */
  }
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: legacyPageId(target) } }));
}

/** 작업대의 화면 ID(약속을 받는 쪽). */
export const BENCH_SCREEN_ID = "commPermBench";

/**
 * 원래 프로그램 → 작업대. 작업대를 포털 탭으로 열고 그 역할(과 오브젝트)을 고르게 한다.
 * `dmes:open-with:commPermBench` 에 {from, mode:"edit", id:roleId, objectId?, at} 을 적고 portal-open-tab 을 보낸다.
 * 작업대는 열려 있으면 탭 활성화 때, 새로 열면 마운트 때 읽는다(useOpenWith).
 * from = 부르는 화면 ID(commPermMng · commRoleMng · commObjMng).
 */
export function openBench(from: Exclude<OpenWithFrom, "commPermBench">, roleId: string, objectId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: OpenWith = { from, mode: "edit", id: roleId, at: Date.now() };
    if (objectId !== undefined) payload.objectId = objectId;
    window.sessionStorage.setItem(openWithKey(BENCH_SCREEN_ID), JSON.stringify(payload));
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 화면만 연다 */
  }
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: `${LEGACY_MODULE_ID}:${LEGACY_GROUP}/${BENCH_SCREEN_ID}` } }));
}

/** 받는 화면용 — 보낸 약속을 읽는다. 없거나 깨졌으면 null. `clear` 가 참이면 읽은 뒤 지운다. */
export function readOpenWith(screenId: string, clear = false): OpenWith | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(openWithKey(screenId));
    if (raw === null) return null;
    if (clear) window.sessionStorage.removeItem(openWithKey(screenId));
    const v = JSON.parse(raw) as Partial<OpenWith> | null;
    if (!v || !OPEN_WITH_FROMS.includes(v.from as OpenWithFrom) || (v.mode !== "new" && v.mode !== "edit")) return null;
    return {
      from: v.from as OpenWithFrom,
      mode: v.mode,
      id: typeof v.id === "string" ? v.id : undefined,
      objectId: typeof v.objectId === "string" ? v.objectId : undefined,
      at: Number(v.at) || 0,
    };
  } catch {
    return null;
  }
}

/** 받는 화면용 — 약속을 지운다. */
export function clearOpenWith(screenId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(openWithKey(screenId));
  } catch {
    /* 무시 */
  }
}

/**
 * 이 탭이 비활성이었다가 다시 활성이 되면 reload 를 부른다(처음 활성은 건너뛴다).
 * `portal-tab-activated` 의 detail.tabId 를 TabPageContext.tabId 와 견준다(useErdStream.useTabActive 와 같은 규칙).
 * 포털 밖(tabId 없음)에서는 아무 일도 하지 않는다. reload 는 ref 에 두어 구독을 다시 걸지 않는다.
 */
export function useReloadOnReturn(reload: () => void): void {
  const { tabId } = useTabPage();
  const reloadRef = useRef(reload);
  useLayoutEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    if (!tabId) return;
    let away = false;
    const on = (e: Event) => {
      const active = (e as CustomEvent<{ tabId?: string }>).detail?.tabId;
      if (active !== tabId) {
        away = true;
      } else if (away) {
        away = false;
        reloadRef.current();
      }
    };
    window.addEventListener("portal-tab-activated", on);
    return () => window.removeEventListener("portal-tab-activated", on);
  }, [tabId]);
}

/** 받은 약속을 이 시간(ms)이 지나도록 처리하지 못하면 버린다(조회가 끝나지 않은 화면에서 뒤늦게 터지는 것을 막는다). */
export const OPEN_WITH_MAX_AGE_MS = 60_000;

/**
 * 받는 화면용 — 보낸 약속({@link OpenWith})을 마운트 때 한 번, 그리고 이 탭의 `portal-tab-activated` 때마다 읽어
 * `handler` 로 넘긴다(읽으면서 지운다). 이미 열린 탭은 다시 마운트되지 않아 활성화 이벤트도 듣는다.
 *
 * - `ready` 가 참일 때만 `handler` 를 부른다. 화면의 첫 조회가 끝난 뒤(행을 찾을 수 있는 때)에 참이 되게 준다.
 * - `handler(ow, attempt)` — attempt 는 0부터. `"wait"` 를 돌려주면 약속을 쥔 채 다음 `ready` 변화(예: 조회가 끝남) 때 다시 부른다.
 * - handler 는 ref 에 둔다. 구독은 tabId 가 바뀔 때만 다시 건다.
 */
export function useOpenWith(
  screenId: string,
  handler: (ow: OpenWith, attempt: number) => "wait" | void,
  ready = true,
): void {
  const { tabId } = useTabPage();
  const handlerRef = useRef(handler);
  const readyRef = useRef(ready);
  const pendingRef = useRef<PendingOpenWith | null>(null);
  // 최신 handler·ready 는 렌더가 아니라 layout effect 에서 ref 에 옮긴다(아래 effect 보다 먼저 돈다).
  useLayoutEffect(() => {
    handlerRef.current = handler;
    readyRef.current = ready;
  });

  // 마운트 때 한 번 읽는다. 이 탭이 다시 활성이 되면(이미 열린 탭) 읽고 바로 처리한다.
  useEffect(() => {
    takeOpenWith(screenId, pendingRef);
    if (!tabId) return;
    const on = (e: Event) => {
      if ((e as CustomEvent<{ tabId?: string }>).detail?.tabId !== tabId) return;
      if (takeOpenWith(screenId, pendingRef)) runOpenWith(pendingRef, readyRef, handlerRef);
    };
    window.addEventListener("portal-tab-activated", on);
    return () => window.removeEventListener("portal-tab-activated", on);
  }, [screenId, tabId]);

  // ready 가 바뀔 때마다(첫 조회 끝남·조회 시작/끝남) 쥐고 있는 약속을 처리한다. 마운트 때는 위 effect 다음에 돈다.
  useEffect(() => {
    runOpenWith(pendingRef, readyRef, handlerRef);
  }, [ready]);
}

interface PendingOpenWith {
  ow: OpenWith;
  attempt: number;
}

type OpenWithHandler = (ow: OpenWith, attempt: number) => "wait" | void;

/** 약속을 읽어(지우며) 쥔다. 읽은 게 있으면 true. */
function takeOpenWith(screenId: string, pendingRef: RefObject<PendingOpenWith | null>): boolean {
  const ow = readOpenWith(screenId, true);
  if (ow) pendingRef.current = { ow, attempt: 0 };
  return ow !== null;
}

/** 쥔 약속을 ready 일 때 handler 로 넘긴다. 너무 오래됐으면 버린다. `"wait"` 면 계속 쥔다. */
function runOpenWith(
  pendingRef: RefObject<PendingOpenWith | null>,
  readyRef: RefObject<boolean>,
  handlerRef: RefObject<OpenWithHandler>,
): void {
  const p = pendingRef.current;
  if (!p || !readyRef.current) return;
  if (Date.now() - p.ow.at > OPEN_WITH_MAX_AGE_MS) {
    pendingRef.current = null;
    return;
  }
  const attempt = p.attempt++;
  if (handlerRef.current(p.ow, attempt) !== "wait") pendingRef.current = null;
}
