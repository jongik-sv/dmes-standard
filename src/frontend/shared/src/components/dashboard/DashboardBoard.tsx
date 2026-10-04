"use client";

/**
 * 대시보드 보드 — 위젯을 행에 배치하고, 편집 모드에서 끌어 옮기기·크기 조절·숨기기·추가를 하며 사용자별로 저장한다.
 * - 화면은 위젯 목록(DashboardWidget: id·제목·설명·기본 크기·그리는 함수)과 기본 배치(행 배열)만 선언하고
 *   useDashboardBoard 로 상태를 만든 뒤, DashboardGrid 안에 <DashboardBoard board={board} /> 를 둔다.
 * - 카드는 늘 어떤 행에 속하고 접기는 행 단위다(DashboardRow). 행 접기는 편집 모드와 상관없이 동작한다.
 * - 편집 모드(board.editing)에서만 끌기 손잡이·크기 조절 손잡이·숨기기 버튼이 보이고, 행 사이에 "새 행" 놓기 자리가 생긴다.
 * - 끌기는 포인터 이벤트로 한다. 끄는 동안 React 상태를 바꾸지 않고(모든 위젯이 다시 그려지지 않게) 표시선·끌리는 이름표를
 *   DOM 으로 직접 옮기며, 놓을 때 한 번 상태를 바꾼다. Escape·pointercancel 이면 취소한다.
 * - 키보드: 편집 모드에서 카드의 끌기 손잡이에 초점을 두고 ←→(같은 행 앞뒤) ↑↓(위·아래 행) Shift+↑↓(새 행으로 떼어 내기).
 * - 저장: layoutKey 가 있으면 localStorage `dmes:dash:v3:{userId}:{layoutKey}`(board-state.ts). 기본 배치와 같으면 지운다.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useCurrentUserState } from "../../portal-shell/use-current-user-id";
import { peekLastUserId } from "../../portal-shell/use-user-button-rbac";
import { DashboardBoardItemContext, type DashboardWidget } from "./board-context";
import {
  addWidget,
  boardFromDefaults,
  boardsEqual,
  computeDropTarget,
  hideWidget,
  keyboardMove,
  loadBoard,
  locateWidget,
  moveWidget,
  normalizeBoard,
  placedWidgetIds,
  saveBoard,
  setItemSize,
  setRowCollapsed,
  type DashboardBoardDefaultRow,
  type DashboardBoardState,
  type DashboardDropTarget,
  type DashboardMoveKey,
  type DropRowRect,
} from "./board-state";
import { DashboardRow } from "./DashboardRow";
import {
  DashboardLayoutContext,
  type DashboardCardLayout,
  type DashboardLayoutApi,
} from "./layout";
import { DashboardStyle } from "./styles";

export interface DashboardBoardOptions {
  /** 위젯 목록. 렌더할 때마다 새로 만들어도 된다(그리는 함수는 늘 최신 목록에서 부른다). */
  widgets: readonly DashboardWidget[];
  /** 기본 배치(행 배열). 여기에 없는 위젯은 처음부터 숨김이다. */
  defaultRows: readonly DashboardBoardDefaultRow[];
  /** 저장 키(화면별 고유, 예 "mcm.home.layout"). 없으면 화면을 닫을 때까지만 유지된다. */
  layoutKey?: string;
}

/** 보드가 화면에 알리는 일(초점 이동·스크롤·안내 문구). */
interface BoardSignal {
  seq: number;
  focusId?: string;
  scrollId?: string;
  message?: string;
}

export interface DashboardBoardApi {
  /** 지금 배치. */
  state: DashboardBoardState;
  /** 위젯 목록(화면이 넘긴 최신 값). */
  widgets: readonly DashboardWidget[];
  /** 숨긴 위젯(선언 순서) — [위젯 추가] 목록. */
  hiddenWidgets: DashboardWidget[];
  /** 편집 모드인지. */
  editing: boolean;
  /** 편집 모드를 켜고 끈다. */
  setEditing: (editing: boolean) => void;
  /** 기본 배치와 다른지. */
  customized: boolean;
  /** 위젯을 놓을 자리로 옮긴다(바뀌면 true). */
  move: (id: string, target: DashboardDropTarget) => boolean;
  /** 키보드 이동(바뀌면 true). */
  moveByKey: (id: string, key: DashboardMoveKey) => boolean;
  /** 위젯을 숨긴다. */
  hide: (id: string) => boolean;
  /** 숨긴 위젯을 마지막 행 끝(칸이 모자라면 새 행)에 다시 놓는다. */
  add: (id: string) => boolean;
  /** 위젯이 보이게 한다 — 숨겼으면 다시 놓고, 행이 접혔으면 펼치고, 그 자리로 스크롤한다. */
  reveal: (id: string) => void;
  /** 행 접힘을 바꾼다. */
  setRowCollapsed: (rowId: string, collapsed: boolean) => void;
  /** 기본 배치로 되돌리고 저장값을 지운다. */
  reset: () => void;
  /** 보드 안 카드·행이 쓰는 배치 어댑터(내부용 — useDashboardLayout 계약). */
  layoutApi: DashboardLayoutApi;
  /** 마지막 알림(내부용). */
  signal: BoardSignal | null;
}

const ROW_PREFIX = "row:";

function widgetTitle(widgets: readonly DashboardWidget[], id: string): string {
  return widgets.find((w) => w.id === id)?.title ?? id;
}

/** 위젯 보드 상태를 만든다 — 저장값 읽기·병합, 편집 동작, 저장. */
export function useDashboardBoard({
  widgets,
  defaultRows,
  layoutKey,
}: DashboardBoardOptions): DashboardBoardApi {
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  // 위젯 배열은 렌더마다 새로 만들어지므로, 상태 계산의 의존값은 ID 목록·기본 배치 문자열로 둔다.
  const idSig = widgets.map((w) => w.id).join("\n");
  const defSig = JSON.stringify(defaultRows);
  const spanOf = useCallback(
    (id: string) => widgetsRef.current.find((w) => w.id === id)?.span ?? 12,
    []
  );
  const merge = useCallback(
    (s: DashboardBoardState) =>
      normalizeBoard(
        s,
        idSig ? idSig.split("\n") : [],
        JSON.parse(defSig) as DashboardBoardDefaultRow[],
        spanOf
      ),
    [idSig, defSig, spanOf]
  );
  const defaults = useMemo(
    () =>
      boardFromDefaults(
        JSON.parse(defSig) as DashboardBoardDefaultRow[],
        idSig ? idSig.split("\n") : []
      ),
    [idSig, defSig]
  );

  const { userId } = useCurrentUserState(Boolean(layoutKey));
  const loadedFor = useRef("");
  const [state, setState] = useState<DashboardBoardState>(() => {
    const last = peekLastUserId();
    if (!layoutKey || !last) return defaults;
    loadedFor.current = `${last}:${layoutKey}`;
    const saved = loadBoard(last, layoutKey);
    return saved ? merge(saved) : defaults;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [editing, setEditingState] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [signal, setSignal] = useState<BoardSignal | null>(null);

  const replace = useCallback((next: DashboardBoardState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // 확인된 사용자로 다시 읽는다(첫 렌더에 읽은 것과 같으면 건너뛴다).
  useEffect(() => {
    if (!layoutKey || !userId) return;
    const key = `${userId}:${layoutKey}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    const saved = loadBoard(userId, layoutKey);
    replace(saved ? merge(saved) : defaults);
  }, [userId, layoutKey, merge, defaults, replace]);

  // 코드의 위젯 목록·기본 배치가 바뀌면 지금 배치에 맞춘다(새 위젯 붙이기, 사라진 위젯 버리기).
  useEffect(() => {
    const cur = stateRef.current;
    const next = merge(cur);
    if (!boardsEqual(cur, next)) replace(next);
  }, [merge, replace]);

  const persist = useCallback(
    (next: DashboardBoardState) => {
      if (layoutKey && userId)
        saveBoard(userId, layoutKey, boardsEqual(next, defaults) ? null : next);
    },
    [layoutKey, userId, defaults]
  );
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const emit = useCallback((s: Omit<BoardSignal, "seq">) => {
    setSignal((prev) => ({ seq: (prev?.seq ?? 0) + 1, ...s }));
  }, []);

  /** 상태를 바꾼다. 바뀌지 않으면 false. */
  const apply = useCallback(
    (fn: (s: DashboardBoardState) => DashboardBoardState, doPersist = true) => {
      const cur = stateRef.current;
      const next = fn(cur);
      if (next === cur) return false;
      replace(next);
      if (doPersist) persistRef.current(next);
      return true;
    },
    [replace]
  );

  const where = useCallback((id: string) => {
    const at = locateWidget(stateRef.current, id);
    return at ? `${at.rowIndex + 1}번째 줄 ${at.index + 1}번째 자리` : "";
  }, []);

  const move = useCallback(
    (id: string, target: DashboardDropTarget) => {
      const ok = apply((s) => moveWidget(s, id, target));
      if (ok)
        emit({ message: `${widgetTitle(widgetsRef.current, id)}: ${where(id)}로 옮겼습니다.` });
      return ok;
    },
    [apply, emit, where]
  );

  const moveByKey = useCallback(
    (id: string, key: DashboardMoveKey) => {
      const ok = apply((s) => keyboardMove(s, id, key));
      emit({
        focusId: id,
        message: ok
          ? `${widgetTitle(widgetsRef.current, id)}: ${where(id)}로 옮겼습니다.`
          : "이 방향으로는 더 옮길 수 없습니다.",
      });
      return ok;
    },
    [apply, emit, where]
  );

  const hide = useCallback(
    (id: string) => {
      const order = placedWidgetIds(stateRef.current);
      const i = order.indexOf(id);
      const neighbor = i >= 0 ? (order[i + 1] ?? order[i - 1]) : undefined;
      const ok = apply((s) => hideWidget(s, id));
      if (ok)
        emit({
          focusId: neighbor,
          message: `${widgetTitle(widgetsRef.current, id)} 위젯을 숨겼습니다. [위젯 추가]에서 다시 놓을 수 있습니다.`,
        });
      return ok;
    },
    [apply, emit]
  );

  const add = useCallback(
    (id: string) => {
      const ok = apply((s) => addWidget(s, id, spanOf));
      if (ok) {
        const at = locateWidget(stateRef.current, id);
        emit({
          focusId: editingRef.current ? id : undefined,
          scrollId: id,
          message: `${widgetTitle(widgetsRef.current, id)} 위젯을 ${at ? at.rowIndex + 1 : ""}번째 줄에 놓았습니다.`,
        });
      }
      return ok;
    },
    [apply, emit, spanOf]
  );

  const reveal = useCallback(
    (id: string) => {
      apply((s) => {
        let n = s.hidden.includes(id) ? addWidget(s, id, spanOf) : s;
        const at = locateWidget(n, id);
        if (at) n = setRowCollapsed(n, n.rows[at.rowIndex].id, false);
        return n;
      });
      emit({ scrollId: id });
    },
    [apply, emit, spanOf]
  );

  const setRowCollapsedCb = useCallback(
    (rowId: string, collapsed: boolean) => {
      apply((s) => setRowCollapsed(s, rowId, collapsed));
    },
    [apply]
  );

  const reset = useCallback(() => {
    replace(defaults);
    if (layoutKey && userId) saveBoard(userId, layoutKey, null);
    emit({ message: "기본 배치로 되돌렸습니다." });
  }, [replace, defaults, layoutKey, userId, emit]);

  const setEditing = useCallback((v: boolean) => setEditingState(v), []);

  const customized = !boardsEqual(state, defaults);

  // 보드 안 DashboardRow·DashboardCard 는 useDashboardLayout 계약으로 행 접힘·카드 크기를 읽고 바꾼다.
  const layoutApi = useMemo<DashboardLayoutApi>(
    () => ({
      get: (key) => {
        if (key.startsWith(ROW_PREFIX)) {
          const row = state.rows.find((r) => r.id === key.slice(ROW_PREFIX.length));
          return row?.collapsed ? { collapsed: true } : {};
        }
        const at = locateWidget(state, key);
        if (!at) return {};
        const it = state.rows[at.rowIndex].items[at.index];
        const out: DashboardCardLayout = {};
        if (it.span != null) out.span = it.span;
        if (it.height != null) out.height = it.height;
        return out;
      },
      update: (key, patch, doPersist = true) => {
        if (key.startsWith(ROW_PREFIX)) {
          const rowId = key.slice(ROW_PREFIX.length);
          apply((s) => setRowCollapsed(s, rowId, patch.collapsed === true), doPersist);
          return;
        }
        const p: { span?: number; height?: number } = {};
        if ("span" in patch) p.span = patch.span;
        if ("height" in patch) p.height = patch.height;
        apply((s) => setItemSize(s, key, p), doPersist);
      },
      commit: () => persistRef.current(stateRef.current),
      reset,
      customized,
    }),
    [state, apply, reset, customized]
  );

  const hiddenWidgets = widgets.filter((w) => state.hidden.includes(w.id));

  return {
    state,
    widgets,
    hiddenWidgets,
    editing,
    setEditing,
    customized,
    move,
    moveByKey,
    hide,
    add,
    reveal,
    setRowCollapsed: setRowCollapsedCb,
    reset,
    layoutApi,
    signal,
  };
}

/* ── 끌기 ── */

/** 격자 바로 아래 보드 행·카드의 화면 사각형(위→아래). */
function collectRows(grid: HTMLElement): DropRowRect[] {
  const rows: DropRowRect[] = [];
  for (const el of Array.from(grid.children)) {
    if (!(el instanceof HTMLElement) || !el.classList.contains("cm-dash-board-row")) continue;
    const r = el.getBoundingClientRect();
    const cards: DropRowRect["cards"] = [];
    for (const c of Array.from(el.children)) {
      if (!(c instanceof HTMLElement) || !c.dataset.widgetId) continue;
      const cr = c.getBoundingClientRect();
      cards.push({
        id: c.dataset.widgetId,
        left: cr.left,
        top: cr.top,
        right: cr.right,
        bottom: cr.bottom,
      });
    }
    rows.push({
      id: el.dataset.rowId ?? "",
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      cards,
    });
  }
  return rows;
}

function findCard(root: ParentNode, id: string): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-widget-id]"))) {
    if (el.dataset.widgetId === id) return el;
  }
  return null;
}

const DRAG_THRESHOLD = 5;
const SCROLL_EDGE = 48;

export interface DashboardBoardProps {
  /** useDashboardBoard 가 돌려준 보드. */
  board: DashboardBoardApi;
  /** 놓인 위젯이 하나도 없을 때 안내. */
  emptyText?: ReactNode;
  /** 끌기 손잡이의 키보드 안내(스크린 리더). */
  keyboardHint?: string;
}

const DEFAULT_HINT =
  "편집 모드에서 방향키로 옮깁니다. 왼쪽·오른쪽은 같은 줄 안에서 앞뒤로, 위·아래는 위·아래 줄로, Shift 와 위·아래는 새 줄로 떼어 냅니다. 마우스로 끌어 옮길 수도 있습니다.";

/** 보드의 행·위젯을 그린다. DashboardGrid 바로 안에 둔다(행이 격자 한 줄씩 차지한다). */
export function DashboardBoard({
  board,
  emptyText = "표시할 위젯이 없습니다. [배치 편집] → [위젯 추가]로 위젯을 놓으세요.",
  keyboardHint = DEFAULT_HINT,
}: DashboardBoardProps) {
  const hintId = useId();
  const markerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => dragCleanup.current?.();
  }, []);

  // 편집 모드를 끄면 끄는 중인 끌기를 멈춘다.
  useEffect(() => {
    if (!board.editing) dragCleanup.current?.();
  }, [board.editing]);

  // 초점 이동·스크롤 알림 — 행이 바뀐 카드는 다시 마운트되므로 위젯 ID 로 다시 찾는다.
  const seq = board.signal?.seq ?? 0;
  useEffect(() => {
    const s = boardRef.current.signal;
    const grid = markerRef.current?.parentElement;
    if (!s || !grid) return;
    const id = s.focusId ?? s.scrollId;
    if (!id) return;
    const card = findCard(grid, id);
    if (!card) return;
    if (s.focusId) card.querySelector<HTMLElement>(".cm-dash-card__drag")?.focus();
    card.scrollIntoView?.({ block: "nearest" });
  }, [seq]);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (!boardRef.current.editing || e.button !== 0) return;
    const grid = markerRef.current?.parentElement;
    const card = grid ? findCard(grid, id) : null;
    if (!grid || !card) return;
    e.preventDefault();
    dragCleanup.current?.();
    const sx = e.clientX;
    const sy = e.clientY;
    let x = sx;
    let y = sy;
    let active = false;
    let target: DashboardDropTarget | null = null;
    let raf = 0;
    const scroller = grid.closest<HTMLElement>(".cm-dash-scroll");
    const gap = parseFloat(getComputedStyle(grid).rowGap || "") || 8;
    const ghost = ghostRef.current;
    const indicator = indicatorRef.current;

    const clearGaps = () => {
      grid
        .querySelectorAll("[data-gap-index][data-active]")
        .forEach((el) => el.removeAttribute("data-active"));
    };
    const paint = () => {
      const res = computeDropTarget(x, y, collectRows(grid), id, gap);
      target = res?.target ?? null;
      clearGaps();
      if (indicator) indicator.hidden = true;
      if (res?.indicator.kind === "gap") {
        grid
          .querySelector(`[data-gap-index="${res.indicator.rowIndex}"]`)
          ?.setAttribute("data-active", "true");
      } else if (res && indicator) {
        const l = res.indicator;
        indicator.hidden = false;
        indicator.style.left = `${l.dir === "v" ? l.x - 1.5 : l.x}px`;
        indicator.style.top = `${l.dir === "v" ? l.y : l.y - 1.5}px`;
        indicator.style.width = l.dir === "v" ? "3px" : `${l.length}px`;
        indicator.style.height = l.dir === "v" ? `${l.length}px` : "3px";
      }
      if (ghost) {
        ghost.style.left = `${x + 14}px`;
        ghost.style.top = `${y + 14}px`;
      }
    };
    const tick = () => {
      raf = 0;
      if (!active) return;
      let scrolled = false;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        let d = 0;
        if (y < r.top + SCROLL_EDGE) d = -Math.min(20, Math.ceil((r.top + SCROLL_EDGE - y) / 3));
        else if (y > r.bottom - SCROLL_EDGE)
          d = Math.min(20, Math.ceil((y - (r.bottom - SCROLL_EDGE)) / 3));
        if (d !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop = before + d;
          scrolled = scroller.scrollTop !== before;
        }
      }
      paint();
      // 가장자리에 머무는 동안 계속 스크롤한다.
      if (scrolled) raf = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const activate = () => {
      active = true;
      card.setAttribute("data-drag-source", "true");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      if (ghost) {
        ghost.textContent = widgetTitle(boardRef.current.widgets, id);
        ghost.hidden = false;
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("keydown", onKey, true);
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      card.removeAttribute("data-drag-source");
      clearGaps();
      if (indicator) indicator.hidden = true;
      if (ghost) ghost.hidden = true;
      if (active) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
      active = false;
      if (dragCleanup.current === cleanup) dragCleanup.current = null;
    };
    const onMove = (ev: PointerEvent) => {
      x = ev.clientX;
      y = ev.clientY;
      if (!active) {
        if (Math.abs(x - sx) + Math.abs(y - sy) < DRAG_THRESHOLD) return;
        activate();
      }
      schedule();
    };
    const onUp = () => {
      const t = active ? target : null;
      cleanup();
      if (t) boardRef.current.move(id, t);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("keydown", onKey, true);
    dragCleanup.current = cleanup;
  };

  const { rows } = board.state;
  const editing = board.editing;
  const out: ReactNode[] = [];
  rows.forEach((row, i) => {
    const widgets = row.items
      .map((it) => board.widgets.find((w) => w.id === it.id))
      .filter((w): w is DashboardWidget => w != null);
    if (widgets.length === 0) return;
    if (editing) out.push(<BoardGap key={`gap:${row.id}`} index={i} />);
    out.push(
      <DashboardRow
        key={row.id}
        rowId={row.id}
        className="cm-dash-board-row"
        ariaLabel={widgets.map((w) => w.title).join("·")}
      >
        {widgets.map((w) => (
          <DashboardBoardItemContext.Provider
            key={w.id}
            value={{
              widget: w,
              editing,
              hintId,
              hide: () => board.hide(w.id),
              moveByKey: (k) => board.moveByKey(w.id, k),
              startDrag: (e) => startDrag(e, w.id),
            }}
          >
            {w.render()}
          </DashboardBoardItemContext.Provider>
        ))}
      </DashboardRow>
    );
  });
  if (editing) out.push(<BoardGap key="gap:end" index={rows.length} />);

  return (
    <DashboardLayoutContext.Provider value={board.layoutApi}>
      <DashboardStyle />
      <div ref={markerRef} className="cm-dash-board__sr">
        <span id={hintId}>{keyboardHint}</span>
        <span role="status" aria-live="polite">
          {board.signal?.message ?? ""}
        </span>
      </div>
      {rows.length === 0 && <div className="cm-dash-board__empty">{emptyText}</div>}
      {out}
      {mounted &&
        createPortal(
          <>
            <div ref={ghostRef} className="cm-dash-board__ghost" hidden aria-hidden="true" />
            <div
              ref={indicatorRef}
              className="cm-dash-board__indicator"
              hidden
              aria-hidden="true"
            />
          </>,
          document.body
        )}
    </DashboardLayoutContext.Provider>
  );
}

/** 행 사이 "새 행" 놓기 자리(편집 모드에서만, 끄는 동안 놓을 자리면 data-active). */
function BoardGap({ index }: { index: number }) {
  return <div className="cm-dash-board__gap" data-gap-index={index} aria-hidden="true" />;
}

/* ── 위젯 추가 목록 ── */

export interface DashboardWidgetPickerTrigger {
  /** 목록이 열렸는지. */
  open: boolean;
  /** 숨긴 위젯 수. */
  count: number;
  /** 목록 열기·닫기. */
  onClick: () => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
}

export interface DashboardWidgetPickerProps {
  board: DashboardBoardApi;
  /** 여는 버튼을 그린다 — 화면이 shared Button 으로 그리고 받은 속성을 그대로 넘긴다. */
  renderTrigger: (trigger: DashboardWidgetPickerTrigger) => ReactNode;
  /** 목록 제목(기본 "위젯 추가"). */
  title?: string;
  /** 숨긴 위젯이 없을 때 문구. */
  emptyText?: ReactNode;
  /** 목록 data-testid. */
  testId?: string;
}

/** 숨긴 위젯 목록(드롭다운). 고르면 마지막 행 끝(칸이 모자라면 새 행)에 다시 놓는다. */
export function DashboardWidgetPicker({
  board,
  renderTrigger,
  title = "위젯 추가",
  emptyText = "숨긴 위젯이 없습니다.",
  testId,
}: DashboardWidgetPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const hidden = board.hiddenWidgets;

  const focusTrigger = () => wrapRef.current?.querySelector<HTMLElement>("button")?.focus();
  const items = () =>
    Array.from(wrapRef.current?.querySelectorAll<HTMLElement>(".cm-dash-picker__item") ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      focusTrigger();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = items();
    if (list.length === 0) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next]?.focus();
  };

  return (
    <span className="cm-dash-picker" ref={wrapRef}>
      <DashboardStyle />
      {renderTrigger({
        open,
        count: hidden.length,
        onClick: () => setOpen((v) => !v),
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-controls": popId,
      })}
      {open && (
        <div
          id={popId}
          className="cm-dash-picker__pop"
          role="dialog"
          aria-label={title}
          onKeyDown={onKeyDown}
          data-testid={testId}
        >
          <div className="cm-dash-picker__head">{title}</div>
          {hidden.length === 0 ? (
            <div className="cm-dash-picker__empty">{emptyText}</div>
          ) : (
            <ul className="cm-dash-picker__list">
              {hidden.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="cm-dash-picker__item"
                    data-widget-option={w.id}
                    onClick={() => {
                      setOpen(false);
                      board.add(w.id);
                    }}
                  >
                    <span className="cm-dash-picker__name">{w.title}</span>
                    {w.description && <span className="cm-dash-picker__desc">{w.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
