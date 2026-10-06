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
import { readPopoutSnapshot, takePopoutHandoff, writePopoutSnapshot } from "../popout";
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

  // 처음 snapshot: handoff(1회) > 이 창 sessionStorage > null. 마운트 때 한 번만 정한다.
  // StrictMode 가 초기화 함수를 두 번 불러도 첫 호출이 handoff 를 sessionStorage 로 옮겨 두므로 두 번째도 같은 값을 읽는다.
  const [snapshot, setSnapshot] = useState<unknown>(() => {
    if (!token) return null;
    const handoff = takePopoutHandoff(token);
    if (handoff && handoff.pageId === pageId) {
      writePopoutSnapshot(token, handoff.snapshot);
      return handoff.snapshot;
    }
    const kept = readPopoutSnapshot(token);
    return kept.found ? kept.snapshot : null;
  });

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
        <PageComponent tabId={tabId} snapshot={snapshot} onSnapshotChange={handleSnapshotChange} />
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
