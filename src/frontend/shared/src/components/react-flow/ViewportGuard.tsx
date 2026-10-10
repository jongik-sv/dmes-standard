"use client";

/**
 * 화면 길잡이(룰 세트 편집기 canvas/ViewportGuard.tsx 복사본) — ReactFlow 의 자식으로 그린다. 계산은 viewport-guard.ts.
 * 1. 이동 한계: 노드 경계 상자·캔버스 크기·배율이 바뀔 때마다 저장소의 translateExtent 를 다시 넣는다. 한계가 줄어 지금 화면이
 *    한계 밖에 남으면 RECHECK_MS 동안 더 바뀌지 않을 때(끌기·영역 선택 중이 아니면) 한 번 맞춘다(화면 맞춤 애니메이션보다 길다).
 * 2. 화면 밖 안내: 화면에 걸친 노드가 하나도 없으면(ignoreNodeTypes 형식은 세지 않는다) LOST_DELAY_MS 뒤 안내와 [전체 보기] 를 띄운다.
 * 저장소 구독은 이 작은 컴포넌트만 다시 그린다. 안내 상자는 React Flow 예외 클래스라 그 위에서 끌어도 화면이 움직이지 않는다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useStore, useStoreApi, type ReactFlowState } from "./react-flow";
import { isShown } from "./shortcuts";
import { DEFAULT_CLASS_PREFIX, styleHref, viewportCss } from "./styles";
import { keepFocusOffButtons } from "./ToolButton";
import {
  NO_EXTENT, allOutside, boundsOfRects, insideExtent, panExtentOf, sameExtent, visibleRect, type FlowRect, type PanExtent,
} from "./viewport-guard";

/** 경계 상자·캔버스 크기가 바뀐 뒤 화면을 한계 안으로 맞추기까지 기다리는 시간(ms). */
export const RECHECK_MS = 400;
/** 화면 밖 상태가 이만큼(ms) 이어지면 안내를 띄운다. */
export const LOST_DELAY_MS = 300;

const NO_TYPES: readonly string[] = [];
const NO_IGNORE: ReadonlySet<string> = new Set();

/** 숨기지 않고 크기를 잰 노드의 사각형(흐름 좌표). ignore 형식은 뺀다. */
function nodeRects(s: ReactFlowState, ignore: ReadonlySet<string>): FlowRect[] {
  const out: FlowRect[] = [];
  for (const n of s.nodeLookup.values()) {
    if (n.hidden || (n.type !== undefined && ignore.has(n.type))) continue;
    const w = n.measured?.width ?? n.width ?? 0;
    const h = n.measured?.height ?? n.height ?? 0;
    if (!(w > 0) || !(h > 0)) continue;
    const pos = n.internals.positionAbsolute;
    out.push({ x: pos.x, y: pos.y, w, h });
  }
  return out;
}

const selectExtent = (s: ReactFlowState): PanExtent | null =>
  panExtentOf(boundsOfRects(nodeRects(s, NO_IGNORE)), s.width, s.height, s.transform[2]);
/** 경계 상자·캔버스 크기 열쇠(배율·화면 이동에는 바뀌지 않는다). 모르면 "". */
const selectGeometry = (s: ReactFlowState): string => {
  const b = boundsOfRects(nodeRects(s, NO_IGNORE));
  return b && s.width > 0 && s.height > 0 ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}|${s.width}x${s.height}` : "";
};
/** 노드 끌기·화면 끌기·영역 선택 중 — 이때는 화면을 맞추지 않는다. */
const selectBusy = (s: ReactFlowState): boolean => {
  if (s.paneDragging || s.userSelectionActive) return true;
  for (const n of s.nodeLookup.values()) if (n.dragging) return true;
  return false;
};

/** 지금 화면이 이동 한계 밖이면 한계 안으로 한 번 맞춘다. 캔버스가 숨어 있으면(display:none 탭) 건너뛴다. */
function recheck(s: ReactFlowState): void {
  if (!isShown(s.domNode)) return;
  const extent = selectExtent(s);
  if (!extent || insideExtent(visibleRect(s.transform, s.width, s.height), extent)) return;
  const [x, y, zoom] = s.transform;
  void s.panZoom?.setViewportConstrained({ x, y, zoom }, [[0, 0], [s.width, s.height]], extent);
}

export interface ViewportGuardProps {
  /** [전체 보기] — 화면 맞춤. */
  onFit: () => void;
  /** 안내에 적을 화면 맞춤 단축키 글(플랫폼별). */
  fitKeyLabel: string;
  /** 화면 밖 판정에서 뺄 노드 형식(그룹 틀 등). 기본 없음. 이동 한계에는 넣는다. */
  ignoreNodeTypes?: readonly string[];
  /** 안내 글(기본 "화면에 보이는 요소가 없습니다."). */
  lostText?: string;
  /** 단추 글(기본 "전체 보기"). */
  fitText?: string;
  /** 안내 틀 data-testid(기본 "flow-lost"). 단추는 `${testId}-fit`. */
  testId?: string;
  /** 안내 상자에 붙일 React Flow 예외 클래스(기본 "nopan nodrag nowheel"). ReactFlow 의 noPanClassName 등을 바꿨으면 같이 바꾼다. */
  flowExemptClassName?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function ViewportGuard({
  onFit, fitKeyLabel, ignoreNodeTypes = NO_TYPES, lostText = "화면에 보이는 요소가 없습니다.", fitText = "전체 보기",
  testId = "flow-lost", flowExemptClassName = "nopan nodrag nowheel", classPrefix = DEFAULT_CLASS_PREFIX,
}: ViewportGuardProps) {
  const store = useStoreApi();
  const ignoreKey = ignoreNodeTypes.join("\n");
  const ignore = useMemo<ReadonlySet<string>>(() => (ignoreKey === "" ? NO_IGNORE : new Set(ignoreKey.split("\n"))), [ignoreKey]);
  const selectLost = useCallback(
    (s: ReactFlowState) => allOutside(nodeRects(s, ignore), visibleRect(s.transform, s.width, s.height)),
    [ignore],
  );
  const extent = useStore(selectExtent, sameExtent);
  const lost = useStore(selectLost);
  const geometry = useStore(selectGeometry);
  const busy = useStore(selectBusy);
  const [showLost, setShowLost] = useState(false);
  useEffect(() => {
    if (!lost) {
      setShowLost(false);
      return;
    }
    const t = setTimeout(() => setShowLost(true), LOST_DELAY_MS);
    return () => clearTimeout(t);
  }, [lost]);

  useEffect(() => {
    store.getState().setTranslateExtent(extent ?? NO_EXTENT);
  }, [store, extent]);
  useEffect(() => {
    if (!geometry || busy) return;
    const t = setTimeout(() => recheck(store.getState()), RECHECK_MS);
    return () => clearTimeout(t);
  }, [store, geometry, busy]);
  // 캔버스를 내릴 때 한계를 풀어 둔다(같은 저장소를 다시 쓰는 경우 대비).
  useEffect(() => () => store.getState().setTranslateExtent(NO_EXTENT), [store]);

  const p = classPrefix;
  return (
    <>
      <style href={styleHref("viewport", p)} precedence="default">
        {viewportCss(p)}
      </style>
      {lost && showLost ? (
        <div className={`${p}-lost`} data-testid={testId}>
          <div className={`${p}-lost-card ${flowExemptClassName}`} role="status">
            <span>{lostText}</span>
            <button type="button" className={`${p}-lost-btn`} data-testid={`${testId}-fit`} onMouseDown={keepFocusOffButtons} onClick={onFit}>
              {fitText} <kbd>{fitKeyLabel}</kbd>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
