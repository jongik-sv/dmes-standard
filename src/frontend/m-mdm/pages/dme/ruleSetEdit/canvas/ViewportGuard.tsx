"use client";

/**
 * 화면 길잡이 — ReactFlow 의 자식으로 그린다(React Flow 저장소를 구독). 계산은 `viewport-guard.ts`.
 *
 * 1. 이동 한계: 흐름도 경계 상자·캔버스 크기·배율이 바뀔 때마다 저장소의 translateExtent 를 다시 넣는다(`setTranslateExtent`).
 *    ReactFlow 에 translateExtent prop 을 주지 않으므로 StoreUpdater 가 덮어쓰지 않는다. 한계는 휠·끌기·확대 단추(d3 scaleBy)·
 *    미니맵 끌기·노드 끌기 자동 이동(setViewportConstrained)에 걸린다. 화면 맞춤·노드로 이동(d3 transform)은 한계를 거치지 않지만
 *    목표가 흐름도 안이라 늘 한계 안에 놓인다. 노드를 끌어 경계 밖으로 옮기면 경계 상자가 커져 한계도 따라 넓어진다.
 *    d3 는 한계를 바꿔도 지금 화면을 다시 맞추지 않으므로, 접기·지우기·되돌리기·자동 정렬·캔버스 크기 변경으로 한계가 줄어
 *    지금 화면이 한계 밖에 남으면 다음 휠·끌기에서 한 번에 튄다. 그래서 경계 상자·캔버스 크기가 바뀌고 RECHECK_MS 동안
 *    더 바뀌지 않으면(끌기·영역 선택 중이 아니면) 화면이 한계 밖인지 보고 한 번 맞춘다. 화면 맞춤(200ms)·노드로 이동(300ms)
 *    애니메이션이 끝난 뒤에 보도록 RECHECK_MS 는 그보다 길다 — 애니메이션 도중에 맞추면 전환을 끊는다.
 * 2. 화면 밖 안내: 화면에 걸친 노드·메모가 하나도 없으면(그룹 틀은 세지 않는다) 캔버스 가운데에 안내와 [흐름도로 돌아가기] 를 띄운다.
 *    경계 상자는 화면에 걸쳐 있어도 그 안의 빈 곳만 보이는 경우(ㄱ자 흐름 등)와 확대·축소 도중을 위한 안전장치다.
 *    LOST_DELAY_MS 동안 이어질 때만 띄운다 — 처음 그린 뒤 화면 맞춤 전 한 순간·빈 곳을 스쳐 지나가는 이동에 깜빡이지 않게.
 *
 * 저장소 구독은 이 작은 컴포넌트만 다시 그린다(캔버스 본체는 화면 이동마다 다시 그리지 않는다).
 * 안내 상자는 `nopan` 이라 그 위에서 끌어도 화면이 움직이지 않고, 단추는 mousedown 기본 동작(초점 옮기기)을 막는다(Local-Rules §19).
 */
import { useEffect, useState } from "react";

import { keepFocusOffButtons } from "./FlowToolbar";
import { useStore, useStoreApi, type ReactFlowState } from "./react-flow";
import { isShown } from "./shortcuts";
import {
  NO_EXTENT, allOutside, boundsOfRects, insideExtent, panExtentOf, sameExtent, visibleRect, type FlowRect, type PanExtent,
} from "./viewport-guard";

/** 그룹 틀 노드 형식(nodes.tsx NODE_TYPES) — 화면 밖 판정에서 뺀다. */
const GROUP_TYPE = "rsfGroup";
/** 경계 상자·캔버스 크기가 바뀐 뒤 화면을 한계 안으로 맞추기까지 기다리는 시간(ms) — 화면 맞춤·노드로 이동 애니메이션보다 길다. */
export const RECHECK_MS = 400;
/** 화면 밖 상태가 이만큼(ms) 이어지면 안내를 띄운다. */
export const LOST_DELAY_MS = 300;

/** 숨기지 않고 크기를 잰 노드의 사각형(흐름 좌표). withGroups=false 면 그룹 틀을 뺀다. */
function nodeRects(s: ReactFlowState, withGroups: boolean): FlowRect[] {
  const out: FlowRect[] = [];
  for (const n of s.nodeLookup.values()) {
    if (n.hidden || (!withGroups && n.type === GROUP_TYPE)) continue;
    const w = n.measured?.width ?? n.width ?? 0;
    const h = n.measured?.height ?? n.height ?? 0;
    if (!(w > 0) || !(h > 0)) continue;
    const p = n.internals.positionAbsolute;
    out.push({ x: p.x, y: p.y, w, h });
  }
  return out;
}

const selectExtent = (s: ReactFlowState): PanExtent | null =>
  panExtentOf(boundsOfRects(nodeRects(s, true)), s.width, s.height, s.transform[2]);
const selectLost = (s: ReactFlowState): boolean => allOutside(nodeRects(s, false), visibleRect(s.transform, s.width, s.height));
/** 경계 상자·캔버스 크기 열쇠(배율·화면 이동에는 바뀌지 않는다). 모르면 "". */
const selectGeometry = (s: ReactFlowState): string => {
  const b = boundsOfRects(nodeRects(s, true));
  return b && s.width > 0 && s.height > 0 ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}|${s.width}x${s.height}` : "";
};
/** 노드 끌기·화면 끌기·영역 선택 중 — 이때는 화면을 맞추지 않는다(끝나면 다시 본다). */
const selectBusy = (s: ReactFlowState): boolean => {
  if (s.paneDragging || s.userSelectionActive) return true;
  for (const n of s.nodeLookup.values()) if (n.dragging) return true;
  return false;
};

/**
 * 지금 화면이 이동 한계 밖이면 한계 안으로 한 번 맞춘다(d3-zoom constrain — 휠·끌기가 쓰는 것과 같은 계산).
 * 캔버스가 숨어 있으면(고르지 않은 세트 탭·포털 탭 — display:none) 건너뛴다. 숨은 동안 React Flow 는 0 크기를 500×500 으로 바꿔 적으므로
 * 그 크기로 맞추면 화면이 엉뚱하게 옮겨진다. 다시 보이면 크기가 바뀌어(geometry) 그때 다시 본다.
 */
function recheck(s: ReactFlowState): void {
  if (!isShown(s.domNode)) return;
  const extent = selectExtent(s);
  if (!extent || insideExtent(visibleRect(s.transform, s.width, s.height), extent)) return;
  const [x, y, zoom] = s.transform;
  void s.panZoom?.setViewportConstrained({ x, y, zoom }, [[0, 0], [s.width, s.height]], extent);
}

export interface ViewportGuardProps {
  /** [흐름도로 돌아가기] — 화면 맞춤. */
  onFit: () => void;
  /** 안내에 적을 화면 맞춤 단축키 글(플랫폼별). */
  fitKeyLabel: string;
}

export function ViewportGuard({ onFit, fitKeyLabel }: ViewportGuardProps) {
  const store = useStoreApi();
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

  if (!lost || !showLost) return null;
  return (
    <div className="rsf-lost" data-testid="flow-lost">
      <div className="rsf-lost-card nopan nodrag nowheel" role="status">
        <span>흐름도가 화면 밖에 있습니다.</span>
        <button type="button" className="rsf-lost-btn" data-testid="flow-lost-fit" onMouseDown={keepFocusOffButtons} onClick={onFit}>
          흐름도로 돌아가기 <kbd>{fitKeyLabel}</kbd>
        </button>
      </div>
    </div>
  );
}
