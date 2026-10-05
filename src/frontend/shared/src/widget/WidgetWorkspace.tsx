"use client";

/**
 * 위젯 작업 공간 — 탭 줄 + 보드 + [위젯 추가] 서랍 + 편집 흐름(스펙 §3·§4.3·§6).
 * - 저장은 주입받은 WidgetStore 로 한다. [완료]는 편집 시작 이후 바뀐 탭만 saveTab 한다.
 * - 보기 모드 탭 메뉴 작업(이름·잠금·옮기기·지우기·홈 되돌리기)은 바로 저장하고, 실패하면 화면을 되돌린다.
 * - 편집 모드 탭 메뉴는 이름 바꾸기만(이름은 [완료] 때 저장). (+) 새 탭은 편집 모드로 만들고 [취소]면 사라진다.
 * - 불러오기 실패면 기본 「홈」을 보이고 [배치 편집]을 막는다(빈 상태로 덮어쓰지 않게).
 * - 정의 위젯 목록(registryStatus)이 loading·error 면 [배치 편집]과 (+) 새 탭(둘 다 편집 진입로)·탭 메뉴를 막고, error 면 띠를 보인다(스펙 widget-admin-generic §1.1·W-D19).
 * - singleTab 이면 탭 줄 대신 제목을 보이고 「홈」 하나만 다룬다(관리자 기본 배치 편집, 스펙 §10.2).
 * - pdfTarget 을 주면 도구 줄에 [PDF] 단추를 그린다 — 대상 요소를 한 장짜리 페이지로 인쇄(printElementAsPage)하고, 편집 중에는 막는다.
 *   인쇄 창을 열지 못하면(print() 예외) 알림을 보인다. 잠금·불러오기 실패·좁은 화면에서도 켜져 있다(보기 기능이라 편집 가능 여부와 무관).
 * - 고정 탭(widget-tabs 설계 §4): 「홈」과 기본 탭(defaultTab)은 탭 줄 앞에 고정이고 지우기·이름 바꾸기·옮기기를 막는다. 기본 탭 편집은
 *   일반 탭처럼 [배치 편집]→[완료] 로 saveTab 하고, 「기본으로 되돌리기」(store.resetTab)는 조용히 다시 불러온다.
 * - 공유(store.shareTab+searchUsers)·내보내기(JSON 파일)·가져오기(JSON 파일 → 새 탭 바로 저장)는 user 모드에서만 보인다.
 * - mode="admin"(관리자 기본 탭 편집)은 잠그기·홈 되돌리기·공유·내보내기·가져오기를 숨기고, 탭 한도는 홈 + MAX_DEFAULT_TABS 다.
 */
import { IconPrinter } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVisibleContainerWidth } from "./use-visible-container-width";

import { useMessage } from "../components/message-provider";
import { today } from "../utils/libDate";
import { printElementAsPage } from "../utils/libPrint";
import { HOME_TAB_ID, MAX_DEFAULT_TABS, MAX_TABS, WIDGET_COLS } from "./constants";
import { WidgetBoard, type WidgetBoardPreview } from "./WidgetBoard";
import { WidgetPicker } from "./WidgetPicker";
import { WidgetShareDialog } from "./WidgetShareDialog";
import { WidgetStyle } from "./styles";
import { WidgetTabs } from "./WidgetTabs";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "./types";
import { readFileText, saveJsonFile } from "./widget-file";
import {
  addItem,
  buildTabExport,
  canAddWidget,
  colsForWidth,
  firstFreeSpot,
  fixedTabCount,
  homeTab,
  isFixedTab,
  newInstanceId,
  nextTabId,
  orderTabs,
  parseTabImport,
  placedSizeOf,
  reuseTabs,
  sameItemsExact,
  sanitizeLayout,
  shareResultMessage,
  tabImportMessage,
  tabsEqual,
  validateTabName,
  validateWidgetMeta,
} from "./widget-layout";

export interface WidgetWorkspaceProps {
  registry: WidgetRegistry;
  homeDefault: readonly WidgetItem[];
  store: WidgetStore;
  /** 마지막 탭 기억 키(localStorage dmes:widget:lastTab:{userId}). */
  userId?: string | null;
  confirm?: (title: string, message: string) => Promise<boolean>;
  notify?: (message: string, kind: "success" | "error") => void;
  /** 시험용 고정 폭 — 보드(react-grid-layout)에 넘기는 픽셀 폭. */
  boardWidth?: number;
  /** 시험용 고정 폭 — 서랍 자리까지 포함한 바깥 폭. 칸 수·편집 가능 판정에 쓴다(없으면 boardWidth, 그것도 없으면 잰 폭). */
  workspaceWidth?: number;
  testId?: string;
  /**
   * 정의 위젯 목록(widgetDef/list) 상태(기본 "ready"). "loading"·"error" 면 [배치 편집]을 막는다 —
   * 정의 위젯이 「없는 위젯」으로 보이는 상태에서 저장하면 사용자 배치에서 지워지기 때문이다(스펙 widget-admin-generic §1.1·W-D19).
   * "error" 면 탭 줄 위에 「위젯 정의를 불러오지 못했습니다」 띠와 [다시 시도](onRetryRegistry 가 있을 때)를 보인다.
   */
  registryStatus?: "ready" | "loading" | "error";
  /** registryStatus="error" 띠의 [다시 시도]. 없으면 버튼을 그리지 않는다. */
  onRetryRegistry?: () => void;
  /** 위젯 유형 ID → 이름("query-table" → "쿼리 표"). [위젯 추가] 서랍이 정의 위젯 옆에 작은 글씨로 보인다. */
  typeTitles?: Readonly<Record<string, string>>;
  /** 위젯 분류 코드 → 이름. 주면 [위젯 추가] 서랍이 분류별로 묶이고 분류 칩 필터가 생긴다(없으면 기존처럼 분류 없이 보인다). */
  categoryTitles?: Readonly<Record<string, string>>;
  /** 탭 줄을 숨기고 「홈」 탭 하나만 다룬다 — 관리자 기본 배치 편집용. title 은 보드 위 제목. */
  singleTab?: { title: string };
  /**
   * 인쇄(PDF) 대상 요소. 주면 도구 줄의 [배치 편집] 앞에 [PDF] 단추를 그린다(없으면 단추가 없다).
   * 누르면 대상을 그 크기의 한 장짜리 페이지로 인쇄한다 — 인쇄 창에서 「PDF로 저장」을 고르면 PDF 한 장이고,
   * 기본 파일 이름은 「{지금 탭 이름}_{yyyyMMdd}」다. ref 가 비어 있으면 작업 공간 자체를 찍는다. 편집 중에는 막는다.
   */
  pdfTarget?: RefObject<HTMLElement | null>;
  /**
   * "admin" — 관리자 기본 탭 편집(위젯관리 「기본 배치」). 잠그기·홈 되돌리기·공유·내보내기·가져오기를 숨기고 탭 한도는 홈 + MAX_DEFAULT_TABS.
   * 탭 이름 바꾸기·옮기기·지우기는 「홈」 외 탭에 된다. 기본 "user".
   */
  mode?: "user" | "admin";
}

type LoadStatus = "loading" | "ready" | "error";

/** 탭 가져오기 파일 최대 크기(1MB) — 읽기 전에 거절한다. */
const IMPORT_FILE_MAX_BYTES = 1024 * 1024;

/** MessageProvider 밖(시험 등)이면 null. useMessage 는 Provider 밖에서 던진다. */
function useOptionalMessage() {
  try {
    return useMessage();
  } catch {
    return null;
  }
}

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "요청을 처리하지 못했습니다.");
/**
 * PDF 기본 파일 이름 「{탭 이름}_{yyyyMMdd}」 — 파일 이름에 못 쓰는 글자는 _ 로 바꾸고 80자(글자 단위, 서로게이트 쌍은 한 글자)로 자른 뒤
 * 앞뒤 공백과 끝 마침표를 지운다. 비면 「홈위젯」.
 */
const pdfTitle = (tabName: string) => {
  const replaced = tabName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  const base = Array.from(replaced).slice(0, 80).join("").trim().replace(/[.\s]+$/, "");
  return `${base || "홈위젯"}_${today()}`;
};
const lastTabKey = (userId?: string | null) => (userId ? `dmes:widget:lastTab:${userId}` : null);

function readLastTab(userId?: string | null): string | null {
  const key = lastTabKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLastTab(userId: string | null | undefined, tabId: string) {
  const key = lastTabKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, tabId);
  } catch {
    /* 사적 창 등 — 기억하지 않는다 */
  }
}

export function WidgetWorkspace({
  registry,
  homeDefault,
  store,
  userId,
  confirm,
  notify,
  boardWidth,
  workspaceWidth,
  testId,
  registryStatus = "ready",
  onRetryRegistry,
  typeTitles,
  categoryTitles,
  singleTab,
  pdfTarget,
  mode = "user",
}: WidgetWorkspaceProps) {
  const message = useOptionalMessage();
  const admin = mode === "admin";
  const maxTabs = admin ? 1 + MAX_DEFAULT_TABS : MAX_TABS;
  // singleTab 은 화면이 렌더마다 새 객체로 넘기기 쉬우므로 불러오기 의존성에는 있고 없음만 쓴다.
  const single = singleTab != null;
  // 단일 탭(관리자 기본 배치)은 마지막 탭을 기억하지 않는다.
  const memoUserId = single ? null : userId;
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tabs, setTabs] = useState<WidgetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetTab[] | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  // 칸 수는 서랍 자리까지 포함한 바깥 폭으로 정한다 — 서랍이 보드 폭을 줄여도 칸 수가 바뀌지 않게(D1).
  const outer = useVisibleContainerWidth({ initialWidth: workspaceWidth ?? boardWidth ?? 1280 });
  const cols = colsForWidth(workspaceWidth ?? boardWidth ?? outer.width);
  const wide = cols === WIDGET_COLS;
  const [saving, setSaving] = useState(false);
  const loadSeq = useRef(0);
  // 서랍 항목에 마우스를 올린 위젯 — 보드의 첫 빈 자리에 스켈레톤으로 미리 보이고, 클릭해야 실제로 놓인다.
  const [previewId, setPreviewId] = useState<string | null>(null);

  const ask = useCallback(
    (title: string, text: string): Promise<boolean> => {
      if (confirm) return confirm(title, text);
      if (!message) return Promise.resolve(window.confirm(`${title}\n${text}`));
      return new Promise((resolve) =>
        message.showMessage({ title, message: text, alertType: "confirm", onConfirm: () => resolve(true), onCancel: () => resolve(false) })
      );
    },
    [confirm, message]
  );
  const tell = useCallback(
    (text: string, kind: "success" | "error") => {
      if (notify) return notify(text, kind);
      message?.showMessage({ message: text, alertType: kind === "error" ? "error" : "success", toast: true });
    },
    [notify, message]
  );

  // 등록부 메타 검사(크기 범위 등) — 개발 중 알림용.
  useEffect(() => {
    for (const entry of Object.values(registry)) {
      for (const p of validateWidgetMeta(entry.meta)) console.error(`[widget] ${p}`);
    }
  }, [registry]);

  const defaultHome = useCallback(() => homeTab(sanitizeLayout(homeDefault, registry)), [homeDefault, registry]);

  // 불러오기(store.load)는 마운트·배치 출처(store·사용자·단일 탭)가 바뀔 때만 한다. 등록부·기본 배치·사용자 확인이 늦게 도착해도
  // 다시 조회하지 않고 이미 가진 탭을 새 등록부로 다시 정리한다 — 진입 한 번에 조회 3회·보드 2회 재구성(스켈레톤 되돌림)을 막는다
  // (widget-render-findings W1, Screen-Performance-Guide R13). 그래서 load 는 등록부·기본 배치·사용자를 ref 로 읽는다.
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const homeDefaultRef = useRef(homeDefault);
  homeDefaultRef.current = homeDefault;
  const memoUserIdRef = useRef(memoUserId);
  memoUserIdRef.current = memoUserId;
  const statusRef = useRef(status);
  statusRef.current = status;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  /** 진행 중인 불러오기의 순번(없으면 0). loadSeq 와 같으면 아직 유효한 불러오기가 있다. */
  const pendingSeq = useRef(0);
  /** 마지막으로 시작한 불러오기 순번 — loadSeq 와 다르면(언마운트·취소) 다시 불러와야 한다. */
  const startedSeq = useRef(0);
  /** 「홈」이 저장한 배치가 아니라 기본 배치인지 — 기본 배치가 응답으로 바뀌면 이 홈만 새 기본 배치로 바꾼다. */
  const homeIsDefault = useRef(false);
  /** 사용자가 탭을 직접 골랐는지 — 사용자 확인이 늦게 끝나도 고른 탭을 기억한 탭으로 덮지 않는다. */
  const tabTouched = useRef(false);
  /**
   * 탭별 원래 배치(서버에서 받거나 저장한, 정리 전 항목)와 그것을 정리한 결과(cleaned, 화면 상태의 items 참조).
   * 등록부가 바뀌면 화면의 items 가 아직 cleaned 와 같은 내용일 때만 원래 배치에서 다시 정리한다 — 이전 등록부로 한 번 잘린 크기를
   * 다시 자르지 않게(새 등록부가 더 큰 크기를 허용하면 원래 크기로 돌아온다). 사용자가 바꾼 탭은 화면 값을 그대로 정리한다.
   */
  const sourceItems = useRef(new Map<string, { raw: readonly WidgetItem[]; cleaned: readonly WidgetItem[] }>());

  /** 진행 중인 조용한 다시 불러오기를 버린다 — 사용자가 편집·즉시 저장을 시작하면 늦게 온 응답이 그 변경을 덮지 않게. */
  const cancelPendingLoad = () => {
    if (pendingSeq.current === 0 || pendingSeq.current !== loadSeq.current) return;
    loadSeq.current += 1;
    startedSeq.current = loadSeq.current;
    pendingSeq.current = 0;
  };

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++loadSeq.current;
      startedSeq.current = seq;
      pendingSeq.current = seq;
      // 이미 보이는 보드는 스켈레톤으로 되돌리지 않는다(silent) — 응답이 오면 바뀐 탭만 바꾼다.
      if (!opts?.silent) setStatus("loading");
      // 다시 불러오면 편집 중이던 변경은 버려진다 — 편집 상태도 함께 정리한다.
      setEditing(false);
      setSnapshot(null);
      setRenamingTabId(null);
      try {
        const loaded = await store.load();
        if (seq !== loadSeq.current) return;
        const reg = registryRef.current;
        const cleaned = loaded.map((t) => ({ ...t, items: sanitizeLayout(t.items, reg) }));
        const home = cleaned.find((t) => t.tabId === HOME_TAB_ID);
        homeIsDefault.current = !home;
        // 단일 탭이면 「홈」만 다룬다 — 다른 탭은 상태에 두지 않으므로 저장되지도 않는다.
        // 기본 탭(서버 tabSeq 100+)이 일반 탭보다 앞에 오게 고정 탭 순서로 정렬한다.
        const others = single ? [] : orderTabs(cleaned.filter((t) => t.tabId !== HOME_TAB_ID));
        const next = [home ? { ...home, name: homeTab([]).name, seq: 0 } : homeTab(sanitizeLayout(homeDefaultRef.current, reg)), ...others];
        const final = reuseTabs(tabsRef.current, next);
        sourceItems.current = new Map(
          loaded.flatMap((t) => {
            const shown = final.find((f) => f.tabId === t.tabId);
            return shown ? [[t.tabId, { raw: t.items, cleaned: shown.items }] as const] : [];
          })
        );
        setTabs(final);
        const last = readLastTab(memoUserIdRef.current);
        setActiveTabId((cur) =>
          opts?.silent && next.some((t) => t.tabId === cur) ? cur : last && next.some((t) => t.tabId === last) ? last : HOME_TAB_ID
        );
        setStatus("ready");
      } catch {
        if (seq !== loadSeq.current) return;
        homeIsDefault.current = true;
        sourceItems.current = new Map();
        setTabs([homeTab(sanitizeLayout(homeDefaultRef.current, registryRef.current))]);
        setActiveTabId(HOME_TAB_ID);
        setStatus("error");
      } finally {
        if (pendingSeq.current === seq) pendingSeq.current = 0;
      }
    },
    [store, single]
  );

  // 등록부·기본 배치만 바뀌면(정의 새로 고침) 편집 중일 때 다시 불러오기를 편집이 끝날 때까지 미룬다 — 바로 불러오면 편집 중이던 변경이 버려진다.
  // 미루는 동안에도 서랍·보드는 새 registry prop 을 쓰므로 새 위젯은 서랍에 바로 보인다.
  // store·사용자·단일 탭 여부가 바뀌면 다른 배치이므로 예전처럼 바로 다시 불러오고 편집을 끝낸다.
  // 단 사용자가 「모름(null) → 확인됨」으로 바뀐 것은 다른 배치가 아니다 — 다시 부르지 않고 기억한 탭만 고른다.
  const editingRef = useRef(false);
  editingRef.current = editing;
  const reloadPending = useRef(false);
  const sourceRef = useRef<{ store: WidgetStore; memoUserId: string | null | undefined; single: boolean } | null>(null);

  useEffect(() => {
    const prev = sourceRef.current;
    sourceRef.current = { store, memoUserId, single };
    const alive = startedSeq.current !== 0 && startedSeq.current === loadSeq.current;
    const sameSource = prev != null && prev.store === store && prev.single === single;
    const userResolved = prev != null && prev.memoUserId == null && memoUserId != null;
    if (alive && sameSource && (prev.memoUserId === memoUserId || userResolved)) {
      if (userResolved && !tabTouched.current) {
        const last = readLastTab(memoUserId);
        if (last && tabsRef.current.some((t) => t.tabId === last)) setActiveTabId(last);
      }
      return;
    }
    reloadPending.current = false;
    void load();
  }, [load, store, memoUserId, single]);

  const shapeRef = useRef({ registry, homeDefault });
  useEffect(() => {
    const prev = shapeRef.current;
    shapeRef.current = { registry, homeDefault };
    if (prev.registry === registry && prev.homeDefault === homeDefault) return;
    // 불러오는 중이면 응답이 최신 등록부(ref)로 정리한다.
    if (pendingSeq.current !== 0 && pendingSeq.current === loadSeq.current) return;
    if (editingRef.current) {
      reloadPending.current = true;
      return;
    }
    // 불러오기 실패 상태면 예전처럼 다시 불러온다(새 정의와 함께 회복 시도).
    if (statusRef.current === "error") {
      void load();
      return;
    }
    if (statusRef.current !== "ready") return;
    const cur = tabsRef.current;
    const next = cur.map((t) => {
      if (t.tabId === HOME_TAB_ID && homeIsDefault.current) return { ...homeTab(sanitizeLayout(homeDefault, registry)), locked: t.locked };
      const src = sourceItems.current.get(t.tabId);
      // 내용으로 비교한다 — [배치 편집]→[취소]는 같은 내용의 사본으로 되돌리므로 참조가 달라도 손대지 않은 탭이다.
      return { ...t, items: sanitizeLayout(src && sameItemsExact(src.cleaned, t.items) ? src.raw : t.items, registry) };
    });
    const final = reuseTabs(cur, next);
    final.forEach((t, i) => {
      const src = sourceItems.current.get(t.tabId);
      if (src && cur[i] && sameItemsExact(src.cleaned, cur[i].items)) src.cleaned = t.items;
    });
    setTabs(final);
  }, [registry, homeDefault, load]);

  useEffect(() => {
    if (editing || !reloadPending.current) return;
    reloadPending.current = false;
    void load({ silent: true });
  }, [editing, load]);

  // 미룬 다시 불러오기가 언마운트 뒤에 상태를 쓰지 않게 한다.
  useEffect(
    () => () => {
      loadSeq.current += 1;
    },
    []
  );

  /**
   * 탭 하나 저장 — 「홈」을 저장하면 더는 기본 배치가 아니다. 저장된 탭 ID 를 돌려준다.
   * 새 탭(fresh)을 저장소가 다른 ID 로 옮겨 저장했으면(화면이 연 뒤 같은 tab-N 으로 공유 사본이 생긴 경우) 탭 상태·고른 탭·
   * 편집 기준(snapshot)·원래 배치·마지막 탭 기억을 새 ID 로 바꾼다. 위젯 instId 는 그대로다.
   * 옮긴 ID 를 같은 [완료]에서 아직 저장하지 않은 다른 새 탭(batch.pending)이 쓰고 있으면 그 탭을 먼저 빈 ID 로 비켜 준다
   * (한 화면에 같은 ID 탭이 둘이 되지 않게). 비켜 준 탭은 aside 로 돌려준다 — doneEdit 이 이어서 그 ID 로 저장한다.
   */
  const persistTab = async (
    tab: WidgetTab,
    batch?: { pending: readonly string[]; known: readonly string[] }
  ): Promise<{ id: string; aside?: { from: string; to: string } }> => {
    const res = (await store.saveTab(tab)) as { tabId?: string } | undefined;
    const savedId = typeof res?.tabId === "string" && res.tabId ? res.tabId : tab.tabId;
    const moved = savedId !== tab.tabId;
    let aside: { from: string; to: string } | undefined;
    if (moved && batch?.pending.includes(savedId)) {
      // 화면의 탭·이번 저장에서 쓰인 ID·서버가 준 ID 와 겹치지 않는 번호.
      const used = new Set([...tabsRef.current.map((t) => t.tabId), ...batch.known, savedId, tab.tabId]);
      let n = 1;
      while (used.has(`tab-${n}`)) n += 1;
      aside = { from: savedId, to: `tab-${n}` };
    }
    // 한 번에 같은 순서로 바꾼다: 겹친 새 탭 → 빈 ID, 저장한 탭 → 서버 ID.
    const rename = (id: string) => (id === tab.tabId ? savedId : aside && id === aside.from ? aside.to : id);
    if (tab.tabId === HOME_TAB_ID) homeIsDefault.current = false;
    // 저장한 배치가 새 원래 배치다.
    if (moved) sourceItems.current.delete(tab.tabId);
    sourceItems.current.set(savedId, { raw: tab.items, cleaned: tab.items });
    // 첫 저장이 끝난 새 탭은 더는 새 탭이 아니다(다음 저장에 newYn 을 다시 보내지 않게).
    // 기본 탭을 저장하면 사용자 재정의 행이 생긴다 — 다시 불러오지 않아도 「기본으로 되돌리기」가 켜지게.
    if (moved || tab.fresh || (tab.defaultTab && !tab.customized)) {
      setTabs((prev) =>
        prev.map((t) =>
          t.tabId === tab.tabId
            ? { ...t, tabId: savedId, fresh: false, ...(t.defaultTab ? { customized: true } : {}) }
            : aside && t.tabId === aside.from && t.fresh
              ? { ...t, tabId: aside.to }
              : t
        )
      );
    }
    if (moved) {
      setActiveTabId((cur) => rename(cur));
      setRenamingTabId((cur) => (cur == null ? cur : rename(cur)));
      setSnapshot((prev) => (prev ? prev.map((s) => (s.tabId === tab.tabId ? { ...s, tabId: savedId } : s)) : prev));
      const last = readLastTab(memoUserId);
      if (last && rename(last) !== last) writeLastTab(memoUserId, rename(last));
    }
    return { id: savedId, aside };
  };

  const active = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0];
  const activeItems = active?.items;
  const pickerOpen = editing && !saving && wide && active != null && !active.locked;

  // 서랍이 사라지거나(편집 종료·취소·저장 중·좁은 화면·잠긴 탭) 탭이 바뀌면 마우스 이탈 이벤트가 오지 않으므로 미리 보기를 비운다.
  const activeTabKey = active?.tabId;
  useEffect(() => {
    setPreviewId(null);
  }, [pickerOpen, activeTabKey]);

  const preview = useMemo<WidgetBoardPreview | null>(() => {
    // 등록부에서 지금 메타를 다시 찾는다 — 정의가 사라졌거나 사용 중지로 바뀌었으면 미리 보기도 없다.
    const meta = previewId ? registry[previewId]?.meta : undefined;
    if (!meta || !pickerOpen || !activeItems || !canAddWidget(activeItems, meta)) return null;
    const size = placedSizeOf(meta);
    return { meta, ...firstFreeSpot(activeItems, size), ...size };
  }, [previewId, registry, pickerOpen, activeItems]);
  const setActiveItems = (items: WidgetItem[]) =>
    setTabs((prev) => prev.map((t) => (t.tabId === active?.tabId ? { ...t, items } : t)));

  const selectTab = (tabId: string) => {
    tabTouched.current = true;
    setActiveTabId(tabId);
    writeLastTab(memoUserId, tabId);
  };

  /* ── 편집 흐름 ── */
  const startEdit = () => {
    cancelPendingLoad();
    setSnapshot(tabs.map((t) => ({ ...t, items: [...t.items] })));
    setEditing(true);
  };
  const changedTabs = useMemo(() => {
    if (!snapshot) return [];
    return tabs.filter((t) => {
      const before = snapshot.find((s) => s.tabId === t.tabId);
      return !before || !tabsEqual(before, t);
    });
  }, [tabs, snapshot]);

  const finishEdit = () => {
    setEditing(false);
    setSnapshot(null);
    setRenamingTabId(null);
  };

  // 정의 목록이 준비되지 않았으면 저장을 막는다 — 정의 위젯이 「없는 위젯」인 상태의 저장은 사용자 배치를 지운다(W-D19).
  const registryReady = registryStatus === "ready";

  const doneEdit = async () => {
    if (status !== "ready" || !registryReady) return;
    setSaving(true);
    // admin 은 기본 탭을 먼저, 「홈」을 마지막에 저장한다 — 빈 「홈」 거절(서버)이 기본 탭 저장을 막지 않게.
    const ordered = admin ? [...changedTabs.filter((t) => t.tabId !== HOME_TAB_ID), ...changedTabs.filter((t) => t.tabId === HOME_TAB_ID)] : changedTabs;
    // 이번 [완료]에서 각 탭의 지금 ID — 저장소가 새 탭을 옮겨 다른 새 탭을 비켜 주면 바뀐다.
    const idOf = new Map(ordered.map((t) => [t, t.tabId] as const));
    const done = new Set<WidgetTab>();
    try {
      for (const t of ordered) {
        const id = idOf.get(t)!;
        const seq = tabs.indexOf(t);
        const pending = ordered.filter((o) => o !== t && o.fresh && !done.has(o)).map((o) => idOf.get(o)!);
        const { id: savedId, aside } = await persistTab({ ...t, tabId: id, seq }, { pending, known: [...idOf.values()] });
        done.add(t);
        idOf.set(t, savedId);
        if (aside) {
          const other = ordered.find((o) => o !== t && !done.has(o) && idOf.get(o) === aside.from);
          if (other) idOf.set(other, aside.to);
        }
        // 저장된 탭은 되돌릴 기준(snapshot)도 새 값으로 — 뒤 탭이 실패해도 [취소]가 저장된 탭을 되돌리지 않는다.
        // 기본 탭은 저장으로 개인화됐으므로 [취소] 뒤에도 되돌리기가 켜져 있게 한다.
        const saved: WidgetTab = { ...t, seq, tabId: savedId, fresh: false, ...(t.defaultTab ? { customized: true } : {}) };
        const same = (s: WidgetTab) => s.tabId === id || s.tabId === savedId;
        setSnapshot((prev) => (prev ? (prev.some(same) ? prev.map((s) => (same(s) ? saved : s)) : [...prev, saved]) : prev));
      }
      finishEdit();
      if (changedTabs.length > 0) tell("배치를 저장했습니다.", "success");
    } catch (e) {
      tell(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (saving) return;
    if (changedTabs.length > 0 && !(await ask("변경 내용을 버릴까요?", "배치 편집을 시작한 뒤 바꾼 내용이 모두 사라집니다."))) return;
    const restored = snapshot ?? tabs;
    setTabs(restored);
    if (!restored.some((t) => t.tabId === activeTabId)) setActiveTabId(HOME_TAB_ID);
    finishEdit();
  };

  // Escape — 편집 취소(입력 칸·메뉴 안에서 누른 Escape 는 그쪽이 처리한다).
  const cancelRef = useRef(cancelEdit);
  cancelRef.current = cancelEdit;
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "Escape" || t?.closest("input, textarea, [role='menu'], [role='dialog']")) return;
      void cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  /* ── 탭 작업 ── */
  // (+) 새 탭도 편집 모드로 들어가는 길이다 — 정의 목록이 준비되지 않았으면 [배치 편집]처럼 막는다(W-D19).
  const addTab = () => {
    if (saving || tabs.length >= maxTabs || !registryReady) return;
    const tabId = nextTabId(tabs);
    let name = "새 탭";
    for (let n = 2; tabs.some((t) => t.name === name); n += 1) name = `새 탭 ${n}`;
    if (!editing) startEdit();
    tabTouched.current = true;
    setTabs((prev) => [...prev, { tabId, name, seq: prev.length, locked: false, items: [], fresh: true }]);
    setActiveTabId(tabId);
    setRenamingTabId(tabId);
  };

  /** 보기 모드 즉시 저장 — 먼저 화면에 반영하고 실패하면 되돌린다. */
  const saveNow = async (next: WidgetTab[], persist: () => Promise<unknown>): Promise<boolean> => {
    cancelPendingLoad();
    // 비동기 흐름(가져오기)에서도 지금 화면 값으로 되돌리게 ref 로 읽는다.
    const before = tabsRef.current;
    setTabs(next);
    try {
      await persist();
      return true;
    } catch (e) {
      setTabs(before);
      tell(errMsg(e), "error");
      return false;
    }
  };

  const renameCommit = (tabId: string, name: string): string | null => {
    if (saving) return null; // 저장 중 바뀐 이름은 저장 대상에서 빠지므로 반영하지 않는다.
    const target = tabs.find((t) => t.tabId === tabId);
    // 고정 탭(홈·기본 탭) 이름은 바꾸지 않는다 — 기본 탭 이름은 관리자 값이다.
    if (!target || isFixedTab(target)) {
      setRenamingTabId(null);
      return null;
    }
    const error = validateTabName(name, tabs, tabId);
    if (error) return error;
    const value = name.trim();
    setRenamingTabId(null);
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, name: value } : t));
    if (editing) setTabs(next);
    else {
      const tab = next.find((t) => t.tabId === tabId)!;
      void saveNow(next, () => persistTab({ ...tab, seq: next.indexOf(tab) }));
    }
    return null;
  };

  const toggleTabLock = (tabId: string) => {
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, locked: !t.locked } : t));
    const tab = next.find((t) => t.tabId === tabId)!;
    void saveNow(next, () => persistTab({ ...tab, seq: next.indexOf(tab) }));
  };

  // 고정 탭(홈·기본 탭)은 옮기지 않고, 일반 탭도 고정 탭 자리로는 못 간다. 순서 저장에는 일반 탭만 넘긴다(서버가 기본 탭 순서를 정한다).
  const moveTab = (tabId: string, dir: -1 | 1) => {
    const fixed = fixedTabCount(tabs);
    const i = tabs.findIndex((t) => t.tabId === tabId);
    const j = i + dir;
    if (i < fixed || j < fixed || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    void saveNow(next, () => store.reorderTabs(next.filter((t) => !isFixedTab(t)).map((t) => t.tabId)));
  };

  const deleteTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || isFixedTab(tab)) return;
    if (!(await ask("탭을 지울까요?", `「${tab.name}」 탭과 위젯 ${tab.items.length}개를 지웁니다.`))) return;
    const next = tabs.filter((t) => t.tabId !== tabId);
    if (activeTabId === tabId) selectTab(HOME_TAB_ID);
    await saveNow(next, () => store.deleteTab(tabId));
  };

  const resetHome = async () => {
    if (!(await ask("기본 배치로 되돌릴까요?", "「홈」 탭의 내 배치를 지우고 기본 배치로 돌아갑니다."))) return;
    const next = tabs.map((t) => (t.tabId === HOME_TAB_ID ? defaultHome() : t));
    if (await saveNow(next, () => store.resetHome())) homeIsDefault.current = true;
  };

  /** 기본 탭 「기본으로 되돌리기」 — 내 재정의를 지운 뒤 관리자 배치를 조용히 다시 불러온다(스켈레톤으로 되돌리지 않는다). */
  const resetTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || !tab.defaultTab || !tab.customized || !store.resetTab) return;
    if (!(await ask("기본으로 되돌릴까요?", `「${tab.name}」 탭의 내 배치를 지우고 관리자가 정한 기본 배치로 돌아갑니다.`))) return;
    cancelPendingLoad();
    // 되돌리는 동안 [배치 편집]·(+)·탭 메뉴를 막는다 — 그 사이 편집한 내용이 곧 올 재조회에 버려지지 않게.
    setSaving(true);
    try {
      await store.resetTab(tabId);
    } catch (e) {
      tell(errMsg(e), "error");
      return;
    } finally {
      setSaving(false);
    }
    await load({ silent: true });
  };

  /* ── 공유·내보내기·가져오기(user 모드) ── */
  const [shareTabId, setShareTabId] = useState<string | null>(null);
  const shareTarget = shareTabId ? tabs.find((t) => t.tabId === shareTabId) : undefined;
  const canShare = !admin && !single && store.shareTab != null && store.searchUsers != null;

  /** 공유 — 모두 성공하면 알리고 창을 닫는다. 일부·전부 실패하면 사유를 알리고 실패한 사람만 고른 채 창을 둔다. */
  const shareTo = async (userIds: string[], names: Record<string, string>): Promise<string[] | void> => {
    if (!shareTarget || !store.shareTab) return;
    const results = await store.shareTab(shareTarget.tabId, userIds).catch((e: unknown) => {
      tell(errMsg(e), "error");
      throw e; // 창을 고른 사람 그대로 열어 둔다.
    });
    const { kind, text } = shareResultMessage(results, names);
    tell(text, kind);
    const done = new Set(results.filter((r) => r.ok).map((r) => r.userId));
    const failed = userIds.filter((id) => !done.has(id));
    if (failed.length === 0) {
      setShareTabId(null);
      return;
    }
    return failed;
  };

  const exportTab = (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || editing) return;
    try {
      saveJsonFile(`${pdfTitle(tab.name)}.json`, buildTabExport(tab));
    } catch {
      tell("파일을 내려받지 못했습니다.", "error");
    }
  };

  // 정의 목록이 준비되기 전에는 정의 위젯이 「없는 위젯」으로 걸러지므로 막는다(W-D19 와 같은 이유).
  const importBlocked = editing || saving || !registryReady;
  const importTab = async (file: File) => {
    if (importBlocked || status !== "ready") return;
    if (file.size > IMPORT_FILE_MAX_BYTES) {
      tell("파일이 너무 큽니다(최대 1MB).", "error");
      return;
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      tell("파일을 읽지 못했습니다.", "error");
      return;
    }
    // 읽는 동안 편집을 시작했으면 버린다. 탭 목록은 읽은 뒤의 화면 값(ref)으로 계산한다.
    if (editingRef.current) return;
    const current = tabsRef.current;
    const result = parseTabImport(text, { registry: registryRef.current, tabs: current, maxTabs });
    if (!result.ok) {
      tell(result.error, "error");
      return;
    }
    const { dropped } = result;
    // 새 탭 표시 — 첫 저장에서 같은 ID 가 서버에 있으면 저장소가 다른 ID 로 옮긴다.
    const tab: WidgetTab = { ...result.tab, fresh: true };
    let savedId = tab.tabId;
    if (
      await saveNow([...current, tab], async () => {
        savedId = (await persistTab(tab)).id;
      })
    ) {
      selectTab(savedId);
      tell(tabImportMessage(tab.name, dropped), "success");
    }
  };

  // 서랍에서 눌러 추가한 위젯으로 스크롤한다(스펙 §3.4). 격자가 칸을 그리는 시점이 한 박자 늦을 수 있어 찾을 때까지 몇 프레임 다시 본다.
  const scrollToRef = useRef<string | null>(null);
  useEffect(() => {
    const instId = scrollToRef.current;
    if (!instId) return;
    let tries = 0;
    let frame = 0;
    const seek = () => {
      const el = outer.containerRef.current?.querySelector<HTMLElement>(`[data-inst-id="${instId}"]`);
      if (el) {
        if (scrollToRef.current === instId) scrollToRef.current = null;
        el.scrollIntoView({ block: "nearest" });
      } else if ((tries += 1) < 10) {
        frame = requestAnimationFrame(seek);
      }
    };
    seek();
    return () => cancelAnimationFrame(frame);
  }, [tabs, outer.containerRef]);

  const addFromPicker = (widgetId: string) => {
    const meta = registry[widgetId]?.meta;
    if (!active || !meta || !canAddWidget(active.items, meta)) return;
    const instId = newInstanceId();
    scrollToRef.current = instId;
    setPreviewId(null);
    // 미리 보인 자리(첫 빈 자리)에 그대로 놓는다.
    setActiveItems(addItem(active.items, widgetId, meta, instId, firstFreeSpot(active.items, placedSizeOf(meta))));
  };

  if (status === "loading" || !active) {
    return (
      <div ref={outer.containerRef} className="cm-widget-ws" data-testid={testId} aria-busy="true">
        <WidgetStyle />
        {single ? (
          <div className="cm-widget-ws__head">
            <h3 className="cm-widget-ws__title">{singleTab.title}</h3>
          </div>
        ) : (
          <div className="cm-widget-tabs" />
        )}
        <div className="cm-widget__skeleton">
          <i style={{ width: "40%" }} />
          <i />
          <i style={{ width: "70%" }} />
        </div>
      </div>
    );
  }

  const editBlockedReason =
    status === "error"
      ? "저장한 위젯 화면을 불러오지 못해 편집할 수 없습니다"
      : registryStatus === "loading"
        ? "위젯 목록을 불러오는 중입니다"
        : registryStatus === "error"
          ? "위젯 정의를 불러오지 못했습니다"
          : !wide
            ? "넓은 화면에서 편집할 수 있습니다"
            : active.locked
              ? "잠긴 탭입니다. 탭 메뉴에서 잠금을 풀어 주세요."
              : null;

  const printPdf = () => {
    const el = pdfTarget?.current ?? outer.containerRef.current;
    if (!el || editing) return;
    try {
      printElementAsPage(el, { title: pdfTitle(active.name) });
    } catch {
      tell("인쇄 창을 열지 못했습니다.", "error");
    }
  };
  // 편집 중에도 자리를 지키고 비활성으로만 바뀐다. data-print-hide — 찍힌 PDF 에는 도구 줄 단추가 나오지 않는다.
  const pdfButton = pdfTarget ? (
    <button
      type="button"
      className="cm-widget-ws__btn cm-widget-ws__btn--icon"
      data-action="print-pdf"
      data-print-hide=""
      disabled={editing}
      title={editing ? "편집 중에는 사용할 수 없습니다" : "위젯 화면을 PDF 로 저장(인쇄 창에서 'PDF로 저장' 선택)"}
      onClick={printPdf}
    >
      <IconPrinter size={14} stroke={1.8} aria-hidden="true" />
      PDF
    </button>
  ) : null;

  const trailing = editing ? (
    <>
      {pdfButton}
      <span className="cm-widget-ws__hint">배치 편집 중</span>
      <button type="button" className="cm-widget-ws__btn" data-action="cancel-edit" disabled={saving} onClick={() => void cancelEdit()}>
        취소
      </button>
      <button type="button" className="cm-widget-ws__btn cm-widget-ws__btn--primary" data-action="done-edit" disabled={saving || status !== "ready" || !registryReady} onClick={() => void doneEdit()}>
        {saving ? "저장 중…" : "완료"}
      </button>
    </>
  ) : (
    <>
      {pdfButton}
      <button
        type="button"
        className="cm-widget-ws__btn"
        data-action="start-edit"
        data-print-hide={pdfTarget ? "" : undefined}
        disabled={editBlockedReason != null || saving}
        title={editBlockedReason ?? "위젯을 옮기고 크기를 바꿉니다"}
        onClick={startEdit}
      >
        ✎ 배치 편집
      </button>
    </>
  );

  return (
    <div ref={outer.containerRef} className="cm-widget-ws" data-testid={testId}>
      <WidgetStyle />
      {status === "error" && (
        <div className="cm-widget-ws__banner" role="alert">
          저장한 위젯 화면을 불러오지 못했습니다.
          <button type="button" className="cm-widget-ws__btn" data-print-hide="" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      {registryStatus === "error" && (
        <div className="cm-widget-ws__banner" role="alert" data-testid={testId ? `${testId}-registry-error` : undefined}>
          위젯 정의를 불러오지 못했습니다
          {onRetryRegistry && (
            <button type="button" className="cm-widget-ws__btn" data-action="retry-registry" data-print-hide="" onClick={onRetryRegistry}>
              다시 시도
            </button>
          )}
        </div>
      )}
      {single ? (
        <div className="cm-widget-ws__head">
          <h3 className="cm-widget-ws__title">{singleTab.title}</h3>
          <div className="cm-widget-ws__head-trailing">{trailing}</div>
        </div>
      ) : (
        <WidgetTabs
          tabs={tabs}
          activeTabId={active.tabId}
          editing={editing}
          menuDisabled={status === "error" || saving}
          // 정의 목록이 loading·error 면 (+) 새 탭(편집 진입로)만 막는다 — ⋯ 탭 메뉴는 보기 모드에서 그대로 쓴다.
          addDisabled={!registryReady}
          addTitle={registryStatus === "loading" ? "위젯 목록을 불러오는 중입니다" : registryStatus === "error" ? "위젯 정의를 불러오지 못했습니다" : undefined}
          renamingTabId={renamingTabId}
          onSelect={selectTab}
          onAdd={addTab}
          onRenameStart={setRenamingTabId}
          onRenameCommit={renameCommit}
          onRenameCancel={() => setRenamingTabId(null)}
          onToggleLock={toggleTabLock}
          onMove={moveTab}
          onDelete={(id) => void deleteTab(id)}
          onResetHome={() => void resetHome()}
          trailing={trailing}
          mode={mode}
          maxTabs={maxTabs}
          onResetTab={!admin && store.resetTab ? (id) => void resetTab(id) : undefined}
          onShare={canShare ? setShareTabId : undefined}
          onExport={admin ? undefined : exportTab}
          onImport={admin ? undefined : (file) => void importTab(file)}
          importDisabled={importBlocked}
          importTitle={registryStatus === "loading" ? "위젯 목록을 불러오는 중입니다" : registryStatus === "error" ? "위젯 정의를 불러오지 못했습니다" : undefined}
        />
      )}
      {/* 공유 창은 열 때만 마운트한다 — MantineProvider 가 없는 곳에서 닫힌 창을 그리지 않게. */}
      {shareTarget && store.searchUsers && (
        <WidgetShareDialog
          tabName={shareTarget.name}
          searchUsers={store.searchUsers.bind(store)}
          onShare={shareTo}
          onClose={() => setShareTabId(null)}
          selfUserId={userId}
        />
      )}
      {/* 서랍에서 끌기를 시작하면 마우스 이탈 이벤트가 오지 않으므로 미리 보기를 비운다. */}
      <div
        className="cm-widget-ws__body"
        onDragStartCapture={() => setPreviewId(null)}
        // 올려 둔 서랍 항목이 검색으로 사라지면 마우스 이탈 이벤트가 오지 않는다 — 서랍 항목 밖으로 마우스가 움직이거나 검색어를 입력하면 비운다.
        onMouseOver={(e) => {
          if (previewId && !(e.target as HTMLElement).closest?.(".cm-widget-picker__item:not(:disabled)")) setPreviewId(null);
        }}
        onInput={() => setPreviewId(null)}
      >
        <div className="cm-widget-ws__board">
          <WidgetBoard
            items={active.items}
            registry={registry}
            editing={editing}
            tabLocked={active.locked || saving}
            onChange={setActiveItems}
            cols={cols}
            width={boardWidth}
            preview={preview}
          />
        </div>
        {pickerOpen && (
          <WidgetPicker
            registry={registry}
            items={active.items}
            onAdd={addFromPicker}
            typeTitles={typeTitles}
            categoryTitles={categoryTitles}
            onPreview={(meta) => setPreviewId(meta?.id ?? null)}
          />
        )}
      </div>
    </div>
  );
}
