"use client";

/**
 * 화면 길잡이 — ReactFlow 의 자식으로 그린다(React Flow 저장소를 구독). 계산은 `viewport-guard.ts`.
 *
 * 1. 이동 한계: 흐름도 경계 상자·캔버스 크기·배율이 바뀔 때마다 저장소의 translateExtent 를 다시 넣는다(`setTranslateExtent`).
 *    ReactFlow 에 translateExtent prop 을 주지 않으므로 StoreUpdater 가 덮어쓰지 않는다. 화면 맞춤·노드로 이동·미니맵 이동도
 *    d3-zoom 이 같은 한계로 맞춘다. 노드를 끌어 경계 밖으로 옮기면 경계 상자가 커져 한계도 따라 넓어진다.
 * 2. 화면 밖 안내: 화면에 걸친 노드·메모가 하나도 없으면(그룹 틀은 세지 않는다) 캔버스 가운데에 안내와 [흐름도로 돌아가기] 를 띄운다.
 *    경계 상자는 화면에 걸쳐 있어도 그 안의 빈 곳만 보이는 경우(ㄱ자 흐름 등)와 확대·축소 도중을 위한 안전장치다.
 *
 * 저장소 구독은 이 작은 컴포넌트만 다시 그린다(캔버스 본체는 화면 이동마다 다시 그리지 않는다).
 * 안내 상자는 `nopan` 이라 그 위에서 끌어도 화면이 움직이지 않고, 단추는 mousedown 기본 동작(초점 옮기기)을 막는다(Local-Rules §19).
 */
import { useEffect } from "react";

import { keepFocusOffButtons } from "./FlowToolbar";
import { useStore, useStoreApi, type ReactFlowState } from "./react-flow";
import { NO_EXTENT, allOutside, boundsOfRects, panExtentOf, sameExtent, visibleRect, type FlowRect, type PanExtent } from "./viewport-guard";

/** 그룹 틀 노드 형식(nodes.tsx NODE_TYPES) — 화면 밖 판정에서 뺀다. */
const GROUP_TYPE = "rsfGroup";

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

  useEffect(() => {
    store.getState().setTranslateExtent(extent ?? NO_EXTENT);
  }, [store, extent]);
  // 캔버스를 내릴 때 한계를 풀어 둔다(같은 저장소를 다시 쓰는 경우 대비).
  useEffect(() => () => store.getState().setTranslateExtent(NO_EXTENT), [store]);

  if (!lost) return null;
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
