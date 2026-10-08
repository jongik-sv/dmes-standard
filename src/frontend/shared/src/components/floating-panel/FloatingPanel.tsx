"use client";

/**
 * 떠 있는 창(비모달) — 업무 도메인과 무관한 범용 부품(Part B §18).
 * 화면 위에 뜨고, 막대를 끌어 옮기고, 오른쪽 아래 손잡이로 크기를 바꾸며, 접으면 아이콘만 남는다.
 * 모달과 달리 배경을 막지 않는다 — 창이 떠 있는 동안에도 뒤 화면을 누르고 입력할 수 있다.
 *
 * - `open` 이 false 면 아무것도 그리지 않는다(자식도 언마운트). true 면 `document.body` 로 포털해 화면 전체 층(`pointer-events: none`) 안에 창을 둔다.
 * - 위치·크기·접힘 상태는 이 컴포넌트 안에 있고 `children` 은 그대로 통과시킨다. 끄는 동안은 FloatingWindow 가 자체 상태로 그리고
 *   놓을 때 한 번만 여기 상태가 바뀌므로, 상위가 같은 children 요소를 주는 한 본문은 끌기·크기 조절로 다시 그려지지 않는다.
 * - `storageKey` 가 있으면 끌기·크기 조절·접기를 마친 시점에 localStorage `dmes:floating-panel:{storageKey}` 에 저장하고, 창을 열 때 복원한다.
 *   저장값이 깨졌거나 화면보다 크면 기본값·화면 안으로 자른다. 저장소를 못 쓰는 환경(private 창 등)은 조용히 넘어간다.
 * - 포털 탭 안에서 쓰면 그 탭이 활성일 때만 보인다. 포털 셸은 탭을 닫지 않고 숨기기만 하는데 이 창은 body 에 포털되므로,
 *   자기 탭이 아닌 탭이 활성화되면(`portal-tab-activated`) 창을 `display: none` 으로 숨긴다(언마운트하지 않아 안의 그리드·입력이 남는다).
 * - 접힌 채 닫았더라도 다시 열 때는 펼친 창으로 시작한다(아이콘만 보이면 열렸는지 알기 어렵다). 위치·크기만 복원한다.
 * - 화면이 줄어 창이 밖으로 나가면 그릴 때 자른다(저장값은 건드리지 않아 화면이 다시 커지면 원래 자리로 돌아온다).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { GridPanelBoundary } from "../grid/grid-panel-context";
import { useTabPage } from "../../portal-shell/tab-page-context";
import { FloatingWindow } from "../../widget-dock/FloatingWindow";
import { readDockViewport, useDockViewport } from "../../widget-dock/use-dock-viewport";
import {
  FLOATING_PANEL_MIN_HEIGHT,
  FLOATING_PANEL_MIN_WIDTH,
  clampPanelRect,
  floatingPanelStorageKey,
  resolveInitialPanelState,
  serializePanelState,
  type PanelRect,
  type PanelState,
} from "./floating-panel-model";

/**
 * 창 층의 쌓임 높이. 화면 머리(100)·사이드바(150) 위, 모달 아래다.
 * 모달 아래인 근거: Mantine 모달 200(`--mantine-z-index-modal`)·메뉴/팝오버/Select 드롭다운 300·DetailPopover 9000·공용 Modal 9999·
 * MessageModal 알림 10000(modal.css `.cm-message-modal-overlay`). 모달이 열리면 배경을 막는 쪽이 이겨야 하므로 창이 그 뒤로 깔려야 한다.
 * 창 안에서 연 드롭다운(300, body 포털)은 창 위에 보인다. 위젯 도크 층(WIDGET_DOCK_Z_INDEX)과 같은 높이대.
 */
export const FLOATING_PANEL_Z_INDEX = 160;

export interface FloatingPanelProps {
  title: string;
  open: boolean;
  onClose: () => void;
  /** 있으면 위치·크기·접힘을 localStorage `dmes:floating-panel:{storageKey}` 에 저장·복원한다. */
  storageKey?: string;
  /** 저장값이 없을 때의 위치·크기(px). 없으면 480×360 을 화면 오른쪽 위에 놓는다. 일부만 줘도 된다. */
  defaultRect?: Partial<PanelRect>;
  /** 크기 조절 최소 너비(기본 240). */
  minWidth?: number;
  /** 크기 조절 최소 높이(기본 160). */
  minHeight?: number;
  /** 층의 z-index(기본 160 — 모달 아래). */
  zIndex?: number;
  testId?: string;
  children: ReactNode;
}

/** 이 컴포넌트가 속한 포털 탭이 활성인지. 포털 밖(tabId 없음)이면 늘 true. 마운트될 때 탭은 활성이라고 본다. */
function useOwnTabActive(): boolean {
  const { tabId } = useTabPage();
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!tabId || typeof window === "undefined") return;
    const onActivated = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string }>).detail;
      if (detail?.tabId) setActive(detail.tabId === tabId);
    };
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [tabId]);
  return !tabId || active;
}

function readStored(storageKey: string | undefined): string | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(floatingPanelStorageKey(storageKey));
  } catch {
    return null;
  }
}

function writeStored(storageKey: string | undefined, state: PanelState): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(floatingPanelStorageKey(storageKey), serializePanelState(state));
  } catch {
    // 저장소를 못 쓰는 환경(private 창·용량 초과) — 이번 열림 동안만 기억한다.
  }
}

type PanelBodyProps = Omit<FloatingPanelProps, "open">;

/** 열려 있는 동안만 마운트된다 — 닫으면 상태·자식이 함께 사라지고, 다시 열면 저장값(또는 기본값)에서 시작한다. */
function FloatingPanelBody({
  title,
  onClose,
  storageKey,
  defaultRect,
  minWidth = FLOATING_PANEL_MIN_WIDTH,
  minHeight = FLOATING_PANEL_MIN_HEIGHT,
  zIndex = FLOATING_PANEL_Z_INDEX,
  testId,
  children,
}: PanelBodyProps) {
  const min = useMemo(() => ({ minWidth, minHeight }), [minWidth, minHeight]);
  const viewport = useDockViewport(true);
  const tabActive = useOwnTabActive();
  const [state, setState] = useState<PanelState>(() => ({
    ...resolveInitialPanelState(readStored(storageKey), readDockViewport(), min, defaultRect),
    collapsed: false, // 열 때는 늘 펼친 창으로 시작한다(위치·크기만 복원)
  }));

  const shown = useMemo(() => clampPanelRect(state, viewport, min), [state, viewport, min]);

  // 최신 상태를 ref 로 들고 있어 콜백이 상태마다 새로 만들어지지 않고, 저장(부수 효과)을 상태 갱신 함수 밖에서 한다.
  const stateRef = useRef(state);
  const commit = useCallback(
    (patch: Partial<PanelState>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      setState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  // 화면이 줄어 그릴 때만 잘려 있던 창을 끌면, 보이던 자리를 기준으로 저장한다(shown 은 클로저 값 — 끌기를 놓는 순간의 것).
  const onMove = useCallback((x: number, y: number) => commit({ x, y }), [commit]);
  const onResize = useCallback(
    (width: number, height: number) => commit({ x: shown.x, y: shown.y, width, height }),
    [commit, shown.x, shown.y],
  );
  const onToggleCollapse = useCallback(
    () => commit({ collapsed: !stateRef.current.collapsed }),
    [commit],
  );

  return (
    <div
      className="cm-floating-panel-layer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        pointerEvents: "none",
        display: tabActive ? undefined : "none",
      }}
    >
      <FloatingWindow
        title={title}
        x={shown.x}
        y={shown.y}
        width={shown.width}
        height={shown.height}
        collapsed={state.collapsed}
        bounds={viewport}
        minWidth={minWidth}
        minHeight={minHeight}
        onMove={onMove}
        onResize={onResize}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
        testId={testId}
      >
        {children}
      </FloatingWindow>
    </div>
  );
}

export function FloatingPanel({ open, ...rest }: FloatingPanelProps) {
  // 서버 렌더·하이드레이션 불일치를 피하려고 마운트 뒤에만 포털한다(open 이 처음부터 true 여도 안전).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted || typeof document === "undefined") return null;
  // 포털로 body 에 뜨지만 React 트리로는 부른 쪽(GridPanel 안일 수 있다)의 자손 — 그 등록부를 끊어 안의 그리드가 자기 머리줄을 그리게 한다.
  return createPortal(
    <GridPanelBoundary>
      <FloatingPanelBody {...rest} />
    </GridPanelBoundary>,
    document.body,
  );
}
