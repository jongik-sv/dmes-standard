"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { peekCurrentUser } from "../portal-shell/current-user";
import { useCurrentUserId } from "../portal-shell/use-current-user-id";
import {
  computeResize,
  DEFAULT_MIN_COLUMN,
  DEFAULT_MIN_ROW,
  loadSplit,
  parseSizeSpec,
  saveSplit,
  specToFlex,
  type ResizeSide,
  type SizeSpec,
} from "./split-sizing";

export interface ContentBodyProps {
  direction?: "row" | "column";
  root?: boolean;
  /** true 면 레이아웃 자식(ContentPanel·ContentBody) 사이에 드래그 막대를 넣어 폭/높이를 조절한다. */
  resizable?: boolean;
  /** resizable 크기 저장 키(화면별 고유, 예: "mdm.dma.domainMng"). 없으면 저장하지 않는다. */
  storageKey?: string;
  /** 부모 ContentBody 안에 중첩될 때의 크기 — ContentPanel 과 같은 규칙. */
  flex?: string | number;
  width?: string | number;
  height?: string | number;
  /** resizable 부모 안에서의 최소 주축 크기(px). 기본 row 200 / column 120. */
  minSize?: number;
  children: React.ReactNode;
}

interface MaximizeContextValue {
  maximizedId: string | null;
  setMaximizedId: (id: string | null) => void;
}

const MaximizeContext = createContext<MaximizeContextValue>({
  maximizedId: null,
  setMaximizedId: () => {},
});

/** 가장 가까운 부모 ContentBody 의 방향과, resizable 부모가 준 크기 override. */
interface ParentBodyValue {
  direction: "row" | "column";
  resizable: boolean;
  override: SizeSpec | null;
}
const ParentBodyContext = createContext<ParentBodyValue | null>(null);

/**
 * 레이아웃 컨텍스트(부모 ContentBody 방향·resizable 크기, 최대화 상태)를 여기서 끊는다.
 * 위젯 틀(WidgetFrame)처럼 화면 레이아웃과 무관한 독립 영역이 ContentBody 분할 패널 안에 그려질 때, 영역 안 ContentBody 가
 * 바깥 규격(nested 판정·저장 비율 인라인 flex·min-width)을 받지 않고 최상위처럼 동작하게 한다.
 */
export function LayoutContextBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ParentBodyContext.Provider value={null}>
      <MaximizeContext.Provider value={DETACHED_MAXIMIZE}>{children}</MaximizeContext.Provider>
    </ParentBodyContext.Provider>
  );
}
const DETACHED_MAXIMIZE: MaximizeContextValue = { maximizedId: null, setMaximizedId: () => {} };

/**
 * ContentBody 하위 ContentPanel 들의 최대화/복원 상태에 접근한다.
 * 반환: { maximizedId, setMaximizedId, isMaximized(panelId), toggle(panelId) }
 */
export function useContentMaximize() {
  const ctx = useContext(MaximizeContext);
  return useMemo(
    () => ({
      maximizedId: ctx.maximizedId,
      setMaximizedId: ctx.setMaximizedId,
      isMaximized: (panelId: string) => ctx.maximizedId === panelId,
      toggle: (panelId: string) =>
        ctx.setMaximizedId(ctx.maximizedId === panelId ? null : panelId),
    }),
    [ctx],
  );
}

type SizeProps = { flex?: string | number; width?: string | number; height?: string | number; minSize?: number };

const px = (v: string | number) => (typeof v === "number" ? `${v}px` : v);

/**
 * 부모 ContentBody 안에서 레이아웃 자식(ContentPanel·중첩 ContentBody)의 크기 스타일.
 * - resizable 부모: 주축은 override 또는 prop 규격을 flex 로, 최소 크기는 min-width/min-height.
 * - 일반 부모: 기존 규칙(width > flex > 기본). column 부모에서 height 만 준 경우 flex-basis 로 높이를 고정.
 */
export function useLayoutItemStyle({ flex, width, height, minSize }: SizeProps): React.CSSProperties {
  const parent = useContext(ParentBodyContext);
  const style: React.CSSProperties = {};
  const column = parent?.direction === "column";

  if (parent?.resizable) {
    const main = column ? height : width;
    style.flex = specToFlex(parent.override ?? parseSizeSpec(main, flex));
    const min = minSize ?? (column ? DEFAULT_MIN_COLUMN : DEFAULT_MIN_ROW);
    if (column) style.minHeight = min;
    else style.minWidth = min;
    if (!column && height) style.height = px(height);
    if (column && width) style.width = px(width);
    return style;
  }

  if (width) {
    style.width = px(width);
    style.flexShrink = 0;
  } else if (flex) {
    style.flex = flex;
  } else if (column && height) {
    style.flex = `0 0 ${px(height)}`;
  } else {
    style.flex = "1 1 0";
  }
  if (height) style.height = px(height);
  return style;
}

const LAYOUT_ITEM = Symbol.for("dmes.layout-item");

/** ContentPanel·ContentBody 처럼 resizable 막대 사이에 놓이는 컴포넌트 표시. */
export function markLayoutItem(comp: object) {
  (comp as Record<symbol, boolean>)[LAYOUT_ITEM] = true;
}

function isLayoutItem(node: React.ReactNode): node is React.ReactElement<SizeProps> {
  return React.isValidElement(node) && typeof node.type !== "string" && !!(node.type as unknown as Record<symbol, boolean>)[LAYOUT_ITEM];
}

export function ContentBody(props: ContentBodyProps) {
  const { direction = "row", root, resizable, children } = props;
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const parent = useContext(ParentBodyContext);
  const itemStyle = useLayoutItemStyle(props);

  const className = [
    "content-body",
    direction === "column" ? "content-body--column" : "",
    root ? "content-body--root" : "",
    parent?.resizable ? "content-body--nested" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const value = useMemo<MaximizeContextValue>(
    () => ({ maximizedId, setMaximizedId }),
    [maximizedId],
  );

  // 중첩일 때만 크기 스타일을 준다(최상위는 page-layout.css 규칙 그대로).
  const hasOwnSize = parent?.resizable || props.flex != null || props.width != null || props.height != null;
  const style = parent && hasOwnSize ? itemStyle : undefined;

  return (
    <MaximizeContext.Provider value={value}>
      {resizable ? (
        <ResizableBody className={className} style={style} direction={direction} storageKey={props.storageKey} maximized={maximizedId !== null}>
          {children}
        </ResizableBody>
      ) : (
        <ParentBodyContext.Provider value={{ direction, resizable: false, override: null }}>
          <div className={className} style={style}>{children}</div>
        </ParentBodyContext.Provider>
      )}
    </MaximizeContext.Provider>
  );
}
markLayoutItem(ContentBody);

const KEY_STEP = 10;

interface ResizableBodyProps {
  className: string;
  style?: React.CSSProperties;
  direction: "row" | "column";
  storageKey?: string;
  maximized: boolean;
  children: React.ReactNode;
}

function ResizableBody({ className, style, direction, storageKey, maximized, children }: ResizableBodyProps) {
  // 저장 키용 사용자 ID 만 쓴다 — 패널마다 RBAC 구독을 늘리지 않는다(Screen-Performance-Guide K4).
  const userId = useCurrentUserId();
  // 첫 렌더는 이 세션에서 이미 확인된 사용자의 저장값으로 그린다 — 다시 마운트될 때(상세 영역 교체·탭 복귀)
  // 사용자 확인(비동기)을 기다리면 기본 크기로 그렸다가 저장 크기로 바뀌며 깜빡인다.
  const loadedFor = useRef("");
  const [overrides, setOverrides] = useState<Record<string, SizeSpec>>(() => {
    const lastUserId = peekCurrentUser()?.id ?? "";
    if (!lastUserId || !storageKey) return {};
    loadedFor.current = `${lastUserId}:${storageKey}`;
    return loadSplit(lastUserId, storageKey);
  });
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const containerRef = useRef<HTMLDivElement>(null);
  const column = direction === "column";

  // 확인된 사용자 ID 로 다시 읽는다(첫 렌더에 읽은 것과 같으면 건너뛴다). 쓰기는 확인된 ID 로만 한다(persist).
  useEffect(() => {
    if (!userId || !storageKey) return;
    const key = `${userId}:${storageKey}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setOverrides(loadSplit(userId, storageKey));
  }, [userId, storageKey]);

  const persist = (map: Record<string, SizeSpec>) => {
    if (userId && storageKey) saveSplit(userId, storageKey, map);
  };

  const items = React.Children.toArray(children);

  /** 막대 양옆 패널의 현재 규격·크기·최소값과 컨테이너 안쪽 크기를 잰다. */
  const measure = (bar: HTMLElement, prevIdx: number, nextIdx: number) => {
    const sib = (dir: "previousElementSibling" | "nextElementSibling") => {
      let cur = bar[dir];
      while (cur && !cur.matches(".content-panel, .content-body")) cur = cur[dir];
      return cur as HTMLElement | null;
    };
    const prevEl = sib("previousElementSibling");
    const nextEl = sib("nextElementSibling");
    const box = containerRef.current;
    if (!prevEl || !nextEl || !box) return null;
    const cs = getComputedStyle(box);
    const inner = column
      ? box.clientHeight - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0")
      : box.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
    const side = (idx: number, el: HTMLElement): ResizeSide => {
      const child = items[idx] as React.ReactElement<SizeProps>;
      const key = String(child.key);
      const p = child.props;
      const r = el.getBoundingClientRect();
      return {
        key,
        spec: overridesRef.current[key] ?? parseSizeSpec(column ? p.height : p.width, p.flex),
        size: column ? r.height : r.width,
        min: p.minSize ?? (column ? DEFAULT_MIN_COLUMN : DEFAULT_MIN_ROW),
      };
    };
    return { prev: side(prevIdx, prevEl), next: side(nextIdx, nextEl), inner };
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, prevIdx: number, nextIdx: number) => {
    if (e.button !== 0) return;
    const m = measure(e.currentTarget, prevIdx, nextIdx);
    if (!m) return;
    e.preventDefault();
    const start = column ? e.clientY : e.clientX;
    const base = overridesRef.current;
    let latest = base;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const delta = (column ? ev.clientY : ev.clientX) - start;
      latest = { ...base, ...computeResize(m.prev, m.next, delta, m.inner) };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setOverrides(latest));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      cancelAnimationFrame(raf);
      setOverrides(latest);
      if (latest !== base) persist(latest);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = column ? "row-resize" : "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, prevIdx: number, nextIdx: number) => {
    const dec = column ? "ArrowUp" : "ArrowLeft";
    const inc = column ? "ArrowDown" : "ArrowRight";
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const m = measure(e.currentTarget, prevIdx, nextIdx);
    if (!m) return;
    const next = { ...overridesRef.current, ...computeResize(m.prev, m.next, e.key === inc ? KEY_STEP : -KEY_STEP, m.inner) };
    setOverrides(next);
    persist(next);
  };

  /** 더블클릭: 막대 양옆 패널을 기본 크기로 되돌린다. */
  const reset = (prevIdx: number, nextIdx: number) => {
    const next = { ...overridesRef.current };
    delete next[String((items[prevIdx] as React.ReactElement).key)];
    delete next[String((items[nextIdx] as React.ReactElement).key)];
    setOverrides(next);
    persist(next);
  };

  const out: React.ReactNode[] = [];
  let prevIdx = -1;
  items.forEach((child, idx) => {
    if (!isLayoutItem(child)) {
      out.push(child);
      return;
    }
    if (prevIdx >= 0 && !maximized) {
      const p = prevIdx;
      out.push(
        <div
          key={`split-bar${String(child.key)}`}
          className={`content-split-bar content-split-bar--${direction}`}
          role="separator"
          aria-orientation={column ? "horizontal" : "vertical"}
          tabIndex={0}
          title="드래그하여 크기 조절 · 더블클릭하면 기본 크기"
          onPointerDown={(e) => startDrag(e, p, idx)}
          onKeyDown={(e) => onKey(e, p, idx)}
          onDoubleClick={() => reset(p, idx)}
        >
          <div className="content-split-bar__grip" />
        </div>,
      );
    }
    out.push(
      <ParentBodyContext.Provider key={child.key} value={{ direction, resizable: true, override: overrides[String(child.key)] ?? null }}>
        {child}
      </ParentBodyContext.Provider>,
    );
    prevIdx = idx;
  });

  return (
    <div ref={containerRef} className={className} style={style}>
      {out}
    </div>
  );
}
