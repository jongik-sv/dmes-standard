"use client";

/**
 * 칸 폭 조절 — 칸 N 개를 가로 격자로 놓고 칸 사이 10px 손잡이를 끌어 폭을 바꾼다. 업무 도메인과 무관하다.
 *
 * - 폭 규칙(숫자 = px, `"fr"` = 남는 폭, 끌면 바로 옆 px 칸 하나만 바뀜)은 `column-resize.ts` 의 순수 함수가 맡는다.
 * - 컨테이너는 `width: max-content; min-width: 100%` 라 칸 합이 부모보다 넓으면 부모가 가로 스크롤을 맡는다.
 * - 손잡이: `role="separator"`, ←/→ 20px(Shift 80px), 두 번 누르면 모든 칸을 처음 폭으로. 끄는 동안은 DOM 에 직접 템플릿을 쓰고
 *   (rAF 묶음) 놓을 때 한 번만 상태·저장소를 갱신한다 — 칸 안 내용이 끌 때마다 다시 그려지지 않는다.
 * - 저장: `storageKey` 를 주면 사용자별로 px 칸 폭을 `split-sizing` 저장소(`loadSplit`·`saveSplit`)에 둔다.
 * - 바깥 단추로 「폭 초기화」 를 하려면 `ref` 의 `resetAll()` 을 부른다.
 * - 스타일은 컴포넌트가 직접 넣는다(Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import {
  Children, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref,
} from "react";
import { peekCurrentUser } from "../../portal-shell/current-user";
import { useCurrentUserId } from "../../portal-shell/use-current-user-id";
import { loadSplit, saveSplit, type SizeSpec } from "../../layout/split-sizing";
import {
  applySaved, DEFAULT_HANDLE_WIDTH, DEFAULT_MAX_COLUMN_WIDTH, DEFAULT_MIN_COLUMN_WIDTH, gridTemplate, keyDelta, resizeColumns,
  resizeTarget, sameWidths, widthsToSaved, type ColumnWidth, type ResizableColumnDef,
} from "./column-resize";

export interface ResizableColumnsHandle {
  /** 모든 칸을 처음 폭으로 되돌리고 저장된 폭을 지운다. */
  resetAll(): void;
}

export interface ResizableColumnsProps {
  /** 칸 정의(순서대로). `children` 도 같은 순서·개수로 준다. */
  columns: readonly ResizableColumnDef[];
  /** 칸마다 한 요소(순서대로). `renderCell` 이 있으면 쓰지 않는다. */
  children?: ReactNode;
  /** 칸 내용을 그린다 — `children` 대신 쓴다. */
  renderCell?: (column: ResizableColumnDef, index: number) => ReactNode;
  /** 있으면 px 칸 폭을 사용자별로 저장한다. 같은 화면에 격자가 여럿이면 서로 다른 값을 준다. */
  storageKey?: string;
  /** 모든 칸의 기본 최소 폭(px). 기본 150. 칸마다 `minWidth` 로 덮어쓴다. */
  minWidth?: number;
  /** 모든 칸의 최대 폭(px). 기본 2200. */
  maxWidth?: number;
  /** 손잡이 칸 폭(px). 기본 10. */
  handleWidth?: number;
  /** 손잡이 `aria-label`. */
  handleLabel?: string;
  /** 손잡이 마우스오버 설명. */
  handleTitle?: string;
  /** 폭이 바뀐 뒤(끌기 끝·키·초기화) 현재 폭 배열로 부른다. */
  onWidthsChange?: (widths: ColumnWidth[]) => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  /** `resetAll()` 을 부르는 핸들. */
  ref?: Ref<ResizableColumnsHandle>;
}

const STYLE_HREF = "cm-resizable-columns";
export const RESIZABLE_COLUMNS_CSS = `
.cm-rc { display: grid; align-items: stretch; width: max-content; min-width: 100%; box-sizing: border-box; }
.cm-rc-cell { display: flex; flex-direction: column; min-width: 0; }
.cm-rc-cell > * { flex: 1; min-width: 0; }
.cm-rc-handle { position: relative; align-self: stretch; min-height: 24px; cursor: col-resize; touch-action: none; user-select: none; outline: none; }
.cm-rc-handle::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: calc(var(--spacing-xs) / 2); transform: translateX(-50%); border-radius: var(--radius-sm); background: transparent; transition: background 0.12s; }
.cm-rc-handle:hover::before, .cm-rc-handle:focus-visible::before, .cm-rc-handle[data-active="true"]::before { background: var(--color-primary); }
.cm-rc-handle[data-disabled="true"] { cursor: default; }
.cm-rc-handle[data-disabled="true"]::before { background: transparent; }
`;

function ResizableColumnsStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {RESIZABLE_COLUMNS_CSS}
    </style>
  );
}

interface DragState {
  index: number;
  startX: number;
  base: ColumnWidth[];
  last: ColumnWidth[];
  dx: number;
  el: HTMLElement;
  /** window 에 단 move/up 듣기를 거둔다. */
  cleanup: () => void;
}

export function ResizableColumns({
  columns, children, renderCell, storageKey, minWidth = DEFAULT_MIN_COLUMN_WIDTH, maxWidth = DEFAULT_MAX_COLUMN_WIDTH,
  handleWidth = DEFAULT_HANDLE_WIDTH, handleLabel = "칸 폭 조절 — 끌거나 ← → 키, 두 번 누르면 처음 폭",
  handleTitle = "끌어서 폭 조절 · 두 번 누르면 처음 폭", onWidthsChange, className, style, testId = "resizable-columns", ref,
}: ResizableColumnsProps) {
  // 저장 키용 사용자 ID — ContentBody 분할과 같이, 이미 확인된 사용자의 저장값으로 첫 렌더를 그려 깜빡임을 막는다.
  const userId = useCurrentUserId();
  const loadedFor = useRef("");
  const [saved, setSaved] = useState<Record<string, SizeSpec>>(() => {
    const last = peekCurrentUser()?.id ?? "";
    if (!last || !storageKey) return {};
    loadedFor.current = `${last}:${storageKey}`;
    return loadSplit(last, storageKey);
  });
  useEffect(() => {
    if (!userId || !storageKey) return;
    const key = `${userId}:${storageKey}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setSaved(loadSplit(userId, storageKey));
  }, [userId, storageKey]);

  // columns 배열이 렌더마다 새로 와도 내용이 같으면 같은 것으로 본다.
  const sig = columns.map((c) => `${c.key}:${c.width}:${c.minWidth ?? ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sig 가 columns 내용을 대신한다
  const cols = useMemo(() => columns.slice(), [sig]);
  const mins = useMemo(() => cols.map((c) => c.minWidth), [cols]);
  const widths = useMemo(() => applySaved(cols, saved, { min: minWidth, max: maxWidth }), [cols, saved, minWidth, maxWidth]);

  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);
  const handlersRef = useRef({ userId, storageKey, onWidthsChange });
  handlersRef.current = { userId, storageKey, onWidthsChange };

  const commit = useCallback((next: ColumnWidth[]) => {
    const map = widthsToSaved(colsRef.current, next);
    setSaved(map);
    const h = handlersRef.current;
    if (h.userId && h.storageKey) saveSplit(h.userId, h.storageKey, map);
    h.onWidthsChange?.(next);
  }, []);

  const resetAll = useCallback(() => {
    commit(colsRef.current.map((c) => c.width));
  }, [commit]);
  useImperativeHandle(ref, () => ({ resetAll }), [resetAll]);

  const limits = useMemo(() => ({ min: minWidth, max: maxWidth, mins }), [minWidth, maxWidth, mins]);
  const limitsRef = useRef(limits);
  limitsRef.current = limits;

  const bodyRestore = useRef<{ cursor: string; userSelect: string } | null>(null);
  const releaseBody = () => {
    if (!bodyRestore.current) return;
    document.body.style.cursor = bodyRestore.current.cursor;
    document.body.style.userSelect = bodyRestore.current.userSelect;
    bodyRestore.current = null;
  };
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    dragRef.current?.cleanup();
    dragRef.current?.el.removeAttribute("data-active");
    dragRef.current = null;
    releaseBody();
  }, []);

  const paint = () => {
    rafRef.current = 0;
    const d = dragRef.current;
    if (!d) return;
    d.last = resizeColumns(d.base, d.index, d.dx, limitsRef.current);
    if (gridRef.current) gridRef.current.style.gridTemplateColumns = gridTemplate(d.last, handleWidth);
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    d.cleanup();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    releaseBody();
    d.el.removeAttribute("data-active");
    const final = resizeColumns(d.base, d.index, d.dx, limitsRef.current);
    if (gridRef.current) gridRef.current.style.gridTemplateColumns = gridTemplate(final, handleWidth);
    if (!sameWidths(final, d.base)) commit(final);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, index: number) => {
    if (e.button !== 0 || dragRef.current) return;
    if (resizeTarget(widthsRef.current, index) < 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.dx = ev.clientX - d.startX;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(paint);
    };
    // 손잡이 캡처가 안 되거나 풀려도 끌기가 끝나도록 window 에서도 받는다.
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    dragRef.current = { index, startX: e.clientX, base: [...widthsRef.current], last: [...widthsRef.current], dx: 0, el, cleanup };
    try { el.setPointerCapture(e.pointerId); } catch { /* 캡처가 안 돼도 window 듣기로 끌기는 된다 */ }
    bodyRestore.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // 상태를 쓰지 않는다 — 끌기 시작·끝에 칸 내용이 다시 그려지지 않게 DOM 속성만 바꾼다.
    el.setAttribute("data-active", "true");
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
    const dx = keyDelta(e.key, e.shiftKey);
    if (dx === null) return;
    e.preventDefault();
    const next = resizeColumns(widthsRef.current, index, dx, limitsRef.current);
    if (!sameWidths(next, widthsRef.current)) commit(next);
  };

  // 칸 내용은 폭·끌기와 무관하게 같은 요소로 두어, 폭이 바뀌어도 칸 안(그리드 등)이 다시 그려지지 않게 한다.
  const cells = useMemo(() => {
    const kids = renderCell ? null : Children.toArray(children);
    return cols.map((c, i) => (
      <div key={`c-${c.key}`} className="cm-rc-cell" data-testid={`${testId}-cell-${c.key}`}>
        {renderCell ? renderCell(c, i) : kids?.[i]}
      </div>
    ));
  }, [children, renderCell, cols, testId]);

  const px = widths.reduce<number>((a, w) => a + (typeof w === "number" ? w : 0), 0);
  const parts: ReactNode[] = [];
  cells.forEach((cell, i) => {
    if (i > 0) {
      const b = i - 1;
      const enabled = resizeTarget(widths, b) >= 0;
      // 값은 경계 위치(왼쪽 px 칸 폭의 합) — ArrowRight 로 늘어나는 방향과 같다.
      const pos = widths.slice(0, i).reduce<number>((a, w) => a + (typeof w === "number" ? w : 0), 0);
      parts.push(
        <div
          key={`h-${i}`}
          className="cm-rc-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={handleLabel}
          aria-disabled={enabled ? undefined : true}
          aria-valuenow={enabled ? pos : undefined}
          aria-valuemin={enabled ? 0 : undefined}
          aria-valuemax={enabled ? px : undefined}
          title={enabled ? handleTitle : undefined}
          tabIndex={enabled ? 0 : -1}
          data-disabled={!enabled}
          data-testid={`${testId}-handle-${b}`}
          onPointerDown={(e) => onPointerDown(e, b)}
          onLostPointerCapture={endDrag}
          onDoubleClick={resetAll}
          onKeyDown={(e) => onKeyDown(e, b)}
        />,
      );
    }
    parts.push(cell);
  });

  return (
    <>
      <ResizableColumnsStyle />
      <div
        ref={gridRef}
        className={className ? `cm-rc ${className}` : "cm-rc"}
        style={{ ...style, gridTemplateColumns: gridTemplate(widths, handleWidth) }}
        data-testid={testId}
      >
        {parts}
      </div>
    </>
  );
}
