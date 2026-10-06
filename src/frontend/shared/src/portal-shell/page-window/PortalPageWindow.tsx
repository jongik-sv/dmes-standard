"use client";
/*
 * 포털 셸 없이 화면 하나를 탭 화면과 같은 조건(TabPageContext·MdmMetaProvider·ErrorBoundary)으로 그리는 단독 창 호스트.
 * 탭 「새 창으로 분리」 가 연 창(/popup/…)이 쓴다. 설계 2026-10-06-portal-tab-popout §5.4.
 * 포털 탭 저장소(oasis.portal.tabs.v1)를 읽거나 쓰지 않는다 — 두 창이 탭 목록을 서로 덮어쓰지 않게.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ErrorBoundary } from "../../components/error-boundary";
import { MdmMetaProvider, mdmMetaTabProps } from "../../mdm-meta/context";
import { buildMenuSearchItems } from "../menu-search";
import type { PortalShellResolvePage } from "../module";
import { CarryStateProvider, createCarryRegistry, hasCarriedBulky, type CarryRestore } from "../carry-state";
import {
  readPopoutCarry,
  readPopoutSnapshot,
  takePopoutCarryFromOpener,
  takePopoutHandoff,
  writePopoutCarry,
  writePopoutSnapshot,
} from "../popout";
import { buildServiceIdByPageId } from "../service-id";
import { TabPageContext } from "../tab-page-context";
import type { PortalShellMenuResponse, PortalShellPageComponent } from "../types";
import { installUsageActivity } from "../usage-activity";
import { UsageTracker, toUsagePageId, type UsageEmitReason, type UsageSegment } from "../usage-tracker";

export interface PortalPageWindowProps {
  pageId: string;
  menu: PortalShellMenuResponse;
  resolvePage: PortalShellResolvePage;
  handoffToken?: string | null;
  appName?: string;
  onUsageSegments?: (segments: UsageSegment[], info: { reason: UsageEmitReason }) => void | Promise<void>;
  /** 시험용 — 기본 window.opener */
  opener?: Window | null;
}

interface LoadedPage {
  component: PortalShellPageComponent | null;
  isLoading: boolean;
  errorMessage: string | null;
}

interface PopoutInitialState {
  snapshot: unknown;
  restore: CarryRestore | null;
}

// useState 초기화 함수는 StrictMode 에서 두 번 불린다. opener 보관소·handoff 는 한 번만 꺼낼 수 있으므로,
// 같은 렌더 안의 두 번째 호출(또는 버려졌다 다시 시도되는 렌더)이 첫 결과를 그대로 받게 token 별로 둔다.
// 마운트 effect 가 지우고(커밋됐으면 state 가 값을 들고 있다), 커밋되지 않고 버려진 경우를 위해 시간 제한으로도 지운다 — 큰 값을 붙잡지 않는다.
const initialStateByToken = new Map<string, PopoutInitialState>();
const INITIAL_STATE_CACHE_MS = 10_000;

/**
 * 마운트 때 한 번 정하는 처음 상태.
 * snapshot: handoff(1회) > 이 창 sessionStorage > null.
 * 화면 상태(carry): opener 보관소(light+bulky) > handoff.carry(light, bulky 없음) > 이 창 sessionStorage(light, bulky 없음) > null.
 */
function resolveInitialState(token: string | null, pageId: string, opener: Window | null | undefined): PopoutInitialState {
  if (!token) return { snapshot: null, restore: null };
  const cached = initialStateByToken.get(token);
  if (cached) return cached;
  const handoff = takePopoutHandoff(token);
  const validHandoff = handoff && handoff.pageId === pageId ? handoff : null;
  let snapshot: unknown = null;
  if (validHandoff) {
    writePopoutSnapshot(token, validHandoff.snapshot);
    snapshot = validHandoff.snapshot;
  } else {
    const kept = readPopoutSnapshot(token);
    snapshot = kept.found ? kept.snapshot : null;
  }

  let restore: CarryRestore | null = null;
  const fromOpener = takePopoutCarryFromOpener(token, opener, pageId);
  if (fromOpener) {
    restore = { light: fromOpener.light, bulky: fromOpener.bulky, hadBulky: hasCarriedBulky(fromOpener.bulky) };
  } else {
    const light = validHandoff?.carry ?? readPopoutCarry(token);
    if (light) restore = { light: light.light, bulky: null, hadBulky: light.hadBulky };
  }
  // 새로고침(F5)에서 이어받을 수 있게 정한 light 를 바로 이 창 sessionStorage 에 둔다.
  if (restore?.light) writePopoutCarry(token, { light: restore.light, hadBulky: restore.hadBulky });

  const result = { snapshot, restore };
  initialStateByToken.set(token, result);
  setTimeout(() => initialStateByToken.delete(token), INITIAL_STATE_CACHE_MS);
  return result;
}

export function PortalPageWindow({
  pageId,
  menu,
  resolvePage,
  handoffToken,
  appName = "DMES",
  onUsageSegments,
  opener,
}: PortalPageWindowProps): ReactNode {
  const token = handoffToken ?? null;
  const tabId = token ? `popout-${token}` : "popout";
  const menuItem = useMemo(
    () => buildMenuSearchItems(menu.items).find((item) => item.pageId === pageId) ?? null,
    [menu, pageId]
  );
  const serviceId = useMemo(() => buildServiceIdByPageId(menu.items).get(pageId) ?? "", [menu, pageId]);
  const allowed = menuItem != null;
  const title = menuItem?.title ?? null;

  // 처음 상태(snapshot·이어받은 화면 상태): 마운트 때 한 번만 정한다. 같은 take 결과를 함께 쓴다(resolveInitialState).
  // 결과 객체를 state 로 들고 있지 않는다 — 큰 값(bulky)을 등록소가 다 쓴 뒤 놓을 수 있게 snapshot 과 등록소로 나눠 담는다.
  const resolveInitial = () =>
    resolveInitialState(token, pageId, opener !== undefined ? opener : typeof window === "undefined" ? null : window.opener);
  const [snapshot, setSnapshot] = useState<unknown>(() => resolveInitial().snapshot);
  // 화면 상태 등록소 — 이어받은 값을 들고 있다가 화면이 key 별로 한 번씩 가져간다. 화면이 useCarryState 로 올린 값을
  // pagehide 때 모아 새로고침(F5)용으로 이 창 sessionStorage 에 둔다.
  const [carryRegistry] = useState(() => createCarryRegistry(resolveInitial().restore));
  // 커밋됐다 — 이제 state 가 값을 들고 있으니 재시도용 보관을 지운다.
  useEffect(() => {
    if (token) initialStateByToken.delete(token);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const onPageHide = () => {
      const collected = carryRegistry.collect();
      // 지금 조회 결과가 있거나, 이어받은 hadBulky 의 재조회가 아직 안 끝났으면 true — 새로고침 때 행을 다시 조회한다.
      const hadBulky = carryRegistry.hadBulkyForReload(collected.bulky);
      // 등록이 하나도 없으면(훅을 쓰지 않는 화면) 건드리지 않는다.
      if (Object.keys(collected.bulky).length === 0 && Object.keys(collected.light).length === 0) return;
      writePopoutCarry(token, { light: collected.light, hadBulky });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [token, carryRegistry]);

  // resolvePage 가 매 렌더 새 함수여도 화면을 다시 불러오지 않게 ref 로 읽는다.
  const resolvePageRef = useRef(resolvePage);
  resolvePageRef.current = resolvePage;
  const [loaded, setLoaded] = useState<LoadedPage>({ component: null, isLoading: true, errorMessage: null });

  // 화면 불러오기 — 권한 있는 pageId 만. React 19 StrictMode 의 effect 두 번 실행에 대비해 cancelled 로 앞 결과를 버린다.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoaded({ component: null, isLoading: true, errorMessage: null });
    void (async () => {
      let component: PortalShellPageComponent | null = null;
      let loadError: string | null = null;
      try {
        component = await resolvePageRef.current(pageId);
      } catch (err) {
        // 화면 chunk 로드 실패 시 로딩 상태로 멈추지 않도록 오류로 표시한다.
        console.error("[PortalPageWindow] page load failed", pageId, err);
        loadError = `화면을 불러오지 못했습니다: ${pageId}`;
      }
      if (cancelled) return;
      if (!component) {
        setLoaded({ component: null, isLoading: false, errorMessage: loadError ?? `등록된 페이지를 찾을 수 없습니다: ${pageId}` });
        return;
      }
      setLoaded({ component, isLoading: false, errorMessage: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, pageId]);

  // 창 제목 — 탭 이름과 같은 메뉴 표시명.
  useEffect(() => {
    if (title) document.title = `${title} - ${appName}`;
  }, [title, appName]);

  // 창 안의 portal-open-tab 은 이 창에 탭이 없으므로 포털 창(opener)으로 넘기고 앞으로 가져온다. opener 가 없거나 닫혔으면 아무 일 없다.
  useEffect(() => {
    const handler = (event: Event) => {
      // opener 가 다른 출처로 이동했으면 dispatchEvent·focus 가 SecurityError 를 던진다 — 넘기지 못해도 이 창은 그대로 둔다.
      try {
        const target = opener !== undefined ? opener : window.opener;
        if (!target || target.closed) return;
        const detail = (event as CustomEvent).detail;
        let forwarded: Event;
        try {
          // opener 창의 생성자로 만들어야 그 창의 리스너가 같은 실행 영역의 이벤트로 받는다. 없으면 이 창 것을 쓴다.
          const Ctor = (target as Window & typeof globalThis).CustomEvent ?? CustomEvent;
          forwarded = new Ctor("portal-open-tab", { detail });
        } catch {
          forwarded = new CustomEvent("portal-open-tab", { detail });
        }
        target.dispatchEvent(forwarded);
        target.focus();
      } catch (err) {
        console.warn("[PortalPageWindow] opener 로 화면 열기를 넘기지 못했다", err);
      }
    };
    window.addEventListener("portal-open-tab", handler);
    return () => window.removeEventListener("portal-open-tab", handler);
  }, [opener]);

  // 화면 사용 추적기 — onUsageSegments 가 있고 권한 있는 화면일 때만. 셸과 같이 첫 업무 호출부터 OPEN 구간을 잰다.
  const onUsageSegmentsRef = useRef(onUsageSegments);
  onUsageSegmentsRef.current = onUsageSegments;
  const isUsageTrackingEnabled = onUsageSegments != null && allowed;
  useEffect(() => {
    if (!isUsageTrackingEnabled) return;
    const tracker = new UsageTracker({
      onSegments: (segments) => {
        void onUsageSegmentsRef.current?.(segments, { reason: "normal" });
      },
      doc: document,
      win: window,
    });
    let activated = false;
    const uninstall = installUsageActivity({
      getScope: () => tabId,
      onBusinessCall: () => {
        if (activated) return;
        activated = true;
        tracker.activate({ key: tabId, pageId: toUsagePageId(pageId) }, "OPEN");
      },
    });
    return () => {
      uninstall();
      tracker.dispose();
    };
  }, [isUsageTrackingEnabled, tabId, pageId]);

  const handleSnapshotChange = useCallback(
    (next: unknown) => {
      if (token) writePopoutSnapshot(token, next);
      setSnapshot(next);
    },
    [token]
  );

  const contextValue = useMemo(() => ({ pageId, serviceId, tabId }), [pageId, serviceId, tabId]);

  if (!allowed) return <div className="portal-shell__error">이 화면을 열 권한이 없습니다.</div>;

  const { component: PageComponent, isLoading, errorMessage } = loaded;
  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="portal-shell__loading">
        <div className="portal-shell__loading-spinner" />
        로딩 중...
      </div>
    );
  } else if (errorMessage) {
    body = <div className="portal-shell__error">{errorMessage}</div>;
  } else if (!PageComponent) {
    body = <div className="portal-shell__error">화면을 로드할 수 없습니다.</div>;
  } else {
    // 탭과 같이 경계를 둔다. 화면의 렌더 오류가 창 전체를 하얗게 만들지 않게 한다.
    body = (
      <ErrorBoundary>
        <CarryStateProvider registry={carryRegistry}>
          <PageComponent tabId={tabId} snapshot={snapshot} onSnapshotChange={handleSnapshotChange} />
        </CarryStateProvider>
      </ErrorBoundary>
    );
  }

  return (
    <div className="portal-page-window" style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <TabPageContext.Provider value={contextValue}>
        <MdmMetaProvider {...mdmMetaTabProps(pageId)}>{body}</MdmMetaProvider>
      </TabPageContext.Provider>
    </div>
  );
}
