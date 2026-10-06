"use client";

/**
 * 위젯 도크 창 층 — 화면 전체를 덮는 fixed 층(pointer-events 없음) 위에 창만 눌리게 놓는다.
 * 포털 셸이 탭 슬롯 바깥(AppShell 최상위)에 두므로 탭을 바꿔도 창이 그대로 남는다. z-index 는 사이드바·머리 위, Mantine 모달·팝오버 아래(styles.tsx WIDGET_DOCK_Z_INDEX).
 * 창 본문은 위젯 틀(WidgetFrame, 보기 모드)을 그대로 쓴다 — 지연 로딩·오류 경계·제목 줄·새로 고침은 틀이 맡는다.
 * 틀 컴포넌트는 호스트가 `@dk-oasis/shared/widget` 의 WidgetFrame 을 frame 으로 넘긴다. shared 는 진입점마다 따로 묶여(tsup splitting:false)
 * 이 층(portal-shell 진입점)이 틀을 직접 import 하면 틀의 WidgetFrameContext 가 위젯 본체(widget 진입점)가 읽는 것과 다른 객체가 된다.
 * 창 크기(뷰포트)는 이 층이 직접 구독한다(창이 있을 때만, rAF 로 묶어) — 화면 크기가 바뀌어도 상위 셸이 다시 그려지지 않는다.
 * 등록부에 아직 없는 창(정의 조회 전)은 그리지 않고 상태에만 남긴다.
 */
import { memo, useCallback, useMemo, type ComponentType } from "react";

import type { WidgetFrameProps } from "../widget/WidgetFrame";
import type { WidgetItem, WidgetRegistry, WidgetRegistryEntry } from "../widget/types";
import {
  clampDockWindow,
  DOCK_ICON_SIZE,
  DOCK_MIN_SIZE,
  dockItemSize,
  dockStackOrder,
  isDockableEntry,
} from "./dock-model";
import { FloatingWindow } from "./FloatingWindow";
import { WidgetDockStyle } from "./styles";
import type { DockViewport, DockWindow } from "./types";
import { useDockViewport } from "./use-dock-viewport";

export interface WidgetDockLayerProps {
  windows: DockWindow[];
  registry: WidgetRegistry;
  /** 위젯 틀 — 호스트가 위젯 본체와 같은 진입점(`@dk-oasis/shared/widget`)의 WidgetFrame 을 넘긴다. */
  frame: ComponentType<WidgetFrameProps>;
  /** 지정하면 이 크기를 쓴다(시험·고정 영역). 없으면 창이 있는 동안 화면 크기를 직접 구독한다. */
  viewport?: DockViewport;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onToggleCollapse: (id: string) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  testId?: string;
}

const noop = () => {};

interface DockWindowViewProps {
  win: DockWindow;
  entry: WidgetRegistryEntry;
  /** 그릴 쌓임 높이 — 접힌 아이콘이 펼친 창 위로 오도록 dockStackOrder 가 정한다. */
  zIndex: number;
  frame: ComponentType<WidgetFrameProps>;
  viewport: DockViewport;
  onMove: WidgetDockLayerProps["onMove"];
  onResize: WidgetDockLayerProps["onResize"];
  onToggleCollapse: WidgetDockLayerProps["onToggleCollapse"];
  onClose: WidgetDockLayerProps["onClose"];
  onFocus: WidgetDockLayerProps["onFocus"];
}

/** 창 하나. 다른 창을 옮기거나 앞으로 가져와도 다시 그리지 않게 memo 로 감싼다(props 는 모두 참조가 유지되는 값). */
const DockWindowView = memo(function DockWindowView({
  win,
  entry,
  zIndex,
  frame: Frame,
  viewport,
  onMove,
  onResize,
  onToggleCollapse,
  onClose,
  onFocus,
}: DockWindowViewProps) {
  const id = win.id;
  const size = dockItemSize(win);
  // 본체에 넘길 인스턴스 — 위치가 바뀌어도 같은 객체를 써서 위젯 틀이 다시 그려지지 않게 한다.
  const item = useMemo<WidgetItem>(
    () => ({
      instId: id,
      widgetId: win.widgetId,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h,
      locked: false,
      config: null,
    }),
    [id, win.widgetId, size.w, size.h]
  );
  const frame = useMemo(
    () => <Frame item={item} entry={entry} editing={false} onToggleLock={noop} onRemove={noop} hideTitle />,
    [Frame, item, entry]
  );
  const move = useCallback((x: number, y: number) => onMove(id, x, y), [onMove, id]);
  const resize = useCallback((w: number, h: number) => onResize(id, w, h), [onResize, id]);
  const toggle = useCallback(() => onToggleCollapse(id), [onToggleCollapse, id]);
  const close = useCallback(() => onClose(id), [onClose, id]);
  const focus = useCallback(() => onFocus(id), [onFocus, id]);
  const Icon = entry.meta.icon;
  return (
    <FloatingWindow
      title={entry.meta.title}
      x={win.x}
      y={win.y}
      width={win.w}
      height={win.h}
      collapsed={win.collapsed}
      zIndex={zIndex}
      bounds={viewport}
      minWidth={DOCK_MIN_SIZE.w}
      minHeight={DOCK_MIN_SIZE.h}
      iconSize={DOCK_ICON_SIZE}
      icon={Icon ? <Icon size={22} stroke={1.8} /> : undefined}
      testId={`widget-dock-window-${id}`}
      onMove={move}
      onResize={resize}
      onToggleCollapse={toggle}
      onClose={close}
      onFocus={focus}
    >
      {frame}
    </FloatingWindow>
  );
});

export function WidgetDockLayer({
  windows,
  registry,
  frame,
  viewport: viewportOverride,
  onMove,
  onResize,
  onToggleCollapse,
  onClose,
  onFocus,
  testId = "widget-dock",
}: WidgetDockLayerProps) {
  const liveViewport = useDockViewport(viewportOverride === undefined && windows.length > 0);
  const viewport = viewportOverride ?? liveViewport;
  const stack = useMemo(() => dockStackOrder(windows), [windows]);
  return (
    <div className="cm-widget-dock" data-testid={testId}>
      <WidgetDockStyle />
      {windows.map((win) => {
        const entry = registry[win.widgetId];
        if (!isDockableEntry(entry)) return null;
        return (
          <DockWindowView
            key={win.id}
            // 그릴 때만 뷰포트 안으로 자른다 — 창이 줄어든 화면 밖으로 사라지지 않게(상태는 그대로).
            win={clampDockWindow(win, viewport)}
            entry={entry}
            zIndex={stack.get(win.id) ?? 1}
            frame={frame}
            viewport={viewport}
            onMove={onMove}
            onResize={onResize}
            onToggleCollapse={onToggleCollapse}
            onClose={onClose}
            onFocus={onFocus}
          />
        );
      })}
    </div>
  );
}
