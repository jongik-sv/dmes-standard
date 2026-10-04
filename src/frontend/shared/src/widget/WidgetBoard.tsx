"use client";

/**
 * 위젯 자유 배치 격자 — react-grid-layout 2.x 를 감싼다(스펙 §3.2·§3.4).
 * - 칸 수는 폭으로 정한다(24·12·1). 24칸이 아니면 넓은 화면 배치를 다시 흘려 보기 전용으로 보인다(W-D12).
 * - 편집 가능 = editing && 넓은 화면 && 탭 잠금 아님. 잠긴 위젯은 static 이라 자리를 지킨다.
 * - 끌기 손잡이는 제목 줄(.cm-widget__head), 버튼(.cm-widget__btn)에서는 끌기가 시작되지 않는다.
 * - 서랍에서 끌어 오면(widget-dnd) 놓은 자리에 기본 크기로 추가한다.
 */
import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout";
import { useVisibleContainerWidth } from "./use-visible-container-width";

import {
  WIDGET_COLS,
  WIDGET_MARGIN,
  WIDGET_RESIZE_HANDLES,
  WIDGET_ROW_HEIGHT,
} from "./constants";
import { getDraggingWidget, setDraggingWidget } from "./widget-dnd";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetStyle } from "./styles";
import type { WidgetItem, WidgetMoveKey, WidgetRegistry } from "./types";
import {
  addItem,
  canAddWidget,
  colsForWidth,
  maxSizeOf,
  minSizeOf,
  moveByKey,
  newInstanceId,
  reflowLayout,
  removeItem,
  toggleLock,
} from "./widget-layout";

export interface WidgetBoardProps {
  items: readonly WidgetItem[];
  registry: WidgetRegistry;
  editing: boolean;
  tabLocked: boolean;
  onChange: (items: WidgetItem[]) => void;
  /** 넓은 화면(24칸) 여부가 바뀔 때. 작업 공간이 [배치 편집]을 막는 데 쓴다. */
  onWideChange?: (wide: boolean) => void;
  /** 칸 수를 바깥에서 정해 줄 때(24·12·1). 없으면 보드 자기 폭으로 판정한다. 서랍 열림이 칸 수를 흔들지 않게 한다. */
  cols?: 24 | 12 | 1;
  /** 고정 폭(px). 없으면 컨테이너 폭을 잰다. */
  width?: number;
  testId?: string;
}

function applyLayout(layout: Layout, items: readonly WidgetItem[]): WidgetItem[] {
  const pos = new Map(layout.map((l) => [l.i, l]));
  return items.map((it) => {
    const l = pos.get(it.instId);
    return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : it;
  });
}

export function WidgetBoard({ items, registry, editing, tabLocked, onChange, onWideChange, cols: colsOverride, width: fixedWidth, testId }: WidgetBoardProps) {
  const measured = useVisibleContainerWidth({ initialWidth: fixedWidth ?? 1280 });
  const width = fixedWidth ?? measured.width;
  const cols = colsOverride ?? colsForWidth(width);
  const wide = cols === WIDGET_COLS;
  const canEdit = editing && wide && !tabLocked;
  const [sizeLabel, setSizeLabel] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    onWideChange?.(wide);
  }, [wide, onWideChange]);

  const visible = useMemo(
    () => (editing ? [...items] : items.filter((it) => registry[it.widgetId])),
    [items, registry, editing]
  );
  const shown = useMemo(() => (wide ? visible : reflowLayout(visible, cols)), [visible, wide, cols]);

  const layout = useMemo<LayoutItem[]>(
    () =>
      shown.map((it) => {
        const meta = registry[it.widgetId]?.meta;
        const min = meta ? minSizeOf(meta) : { w: 1, h: 1 };
        const max = meta ? maxSizeOf(meta) : { w: cols, h: Number.POSITIVE_INFINITY };
        return {
          i: it.instId,
          x: it.x,
          y: it.y,
          w: it.w,
          h: it.h,
          minW: Math.min(min.w, cols),
          minH: min.h,
          maxW: Math.min(max.w, cols),
          maxH: max.h,
          // 등록부에 없는 칸은 잠겨 있어도 뺄 수 있어야 하므로 잠금으로 굳히지 않는다.
          static: (it.locked && Boolean(registry[it.widgetId])) || !canEdit,
          // react-grid-layout 은 손잡이를 항상 그리고 CSS 로만 숨기므로, 편집할 수 없으면 아예 넘기지 않는다.
          resizeHandles: (it.locked && Boolean(registry[it.widgetId])) || !canEdit ? [] : [...WIDGET_RESIZE_HANDLES],
        };
      }),
    [shown, registry, cols, canEdit]
  );

  const commit = (next: Layout) => onChange(applyLayout(next, items));
  const onKeyMove = (instId: string, key: WidgetMoveKey, mode: "move" | "resize") =>
    onChange(moveByKey(items, instId, key, mode, registry));

  return (
    <div
      ref={measured.containerRef}
      className="cm-widget-board"
      data-editing={canEdit ? "true" : undefined}
      data-cols={cols}
      data-testid={testId}
    >
      <WidgetStyle />
      {shown.length === 0 ? (
        <div className="cm-widget-board__empty">
          {canEdit ? "오른쪽 [위젯 추가]에서 위젯을 누르거나 끌어 놓으세요." : "놓인 위젯이 없습니다. [배치 편집]에서 위젯을 추가하세요."}
        </div>
      ) : null}
      <ReactGridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols, rowHeight: WIDGET_ROW_HEIGHT, margin: [WIDGET_MARGIN, WIDGET_MARGIN], containerPadding: [0, 0] }}
        dragConfig={{ enabled: canEdit, handle: ".cm-widget__head", cancel: ".cm-widget__btn" }}
        resizeConfig={{ enabled: canEdit, handles: WIDGET_RESIZE_HANDLES }}
        dropConfig={{ enabled: canEdit, defaultItem: { w: 6, h: 6 } }}
        compactor={verticalCompactor}
        onDropDragOver={() => {
          const id = getDraggingWidget();
          const meta = id ? registry[id]?.meta : undefined;
          if (!meta || !canAddWidget(items, meta)) return false;
          return { w: meta.defaultSize.w, h: meta.defaultSize.h };
        }}
        onDrop={(_next, dropped) => {
          const id = getDraggingWidget();
          setDraggingWidget(null);
          const meta = id ? registry[id]?.meta : undefined;
          if (!id || !meta || !dropped || !canAddWidget(items, meta)) return;
          onChange(addItem(items, id, meta, newInstanceId(), { x: dropped.x, y: dropped.y }));
        }}
        onDragStop={(next) => commit(next)}
        onResize={(_next, _old, item) => {
          if (item) setSizeLabel({ id: item.i, text: `${item.w} × ${item.h}` });
        }}
        onResizeStop={(next) => {
          setSizeLabel(null);
          commit(next);
        }}
      >
        {shown.map((it) => (
          <div key={it.instId}>
            <WidgetFrame
              item={it}
              entry={registry[it.widgetId]}
              editing={canEdit}
              sizeLabel={sizeLabel?.id === it.instId ? sizeLabel.text : null}
              onToggleLock={(instId) => onChange(toggleLock(items, instId))}
              onRemove={(instId) => onChange(removeItem(items, instId, !registry[it.widgetId]))}
              onKeyMove={onKeyMove}
            />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
