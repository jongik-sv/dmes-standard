"use client";

/**
 * ERD 관계선 — 직교 꺾은선(shared smoothStepPoints + routePath)과 끝 모양. 자식(source) 끝 까마귀발(+ 0 원), 부모(target) 끝 이중 막대.
 * 추정은 노란 파선(CSS)이고, 1순위 후보에는 "다른 후보 n개" 이름표를 단다. 본선 path 에 react-flow__edge-path 를 붙인다(브라우저 확인이 이 클래스로 센다).
 * 이름표는 EdgeLabelRenderer 층(pointer-events:none, Local-Rules §19)에 둔다. 누를 것이 없어 다시 켜지 않는다.
 * 두 끝이 같은 변(위아래로 쌓인 표)이면 smoothStepPoints 가 같은 Position 쌍을 ㄷ 모양으로 상자 밖을 돌려 그린다(erd-geometry relationSides).
 * 그린 변은 g 의 data-sides("rl"·"rr" 처럼 자식·부모 끝)에 단다.
 * 추정(INFERRED) 선은 RelationPickContext 가 있으면 본선 위에 투명한 두꺼운 눌림 영역(erd-rel__hit)을 얹는다. 누르면 그 관계 id 를 콜백에 넘긴다(Task 6).
 * 눌림 영역에는 react-flow__edge-path 를 붙이지 않는다(브라우저 확인이 본선만 센다). 확정 선에는 얹지 않는다.
 */
import { createContext, memo, useContext, useMemo } from "react";

import {
  EdgeLabelRenderer, ROUTE_RADIUS, routeMidpoint, routePath, smoothStepPoints, useStore, type EdgeProps, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import type { ErdFlowEdge } from "./erd-flow";
import { END_STUB, crowFootPath, endStub, liveEnds, oneBarsPath, zeroCirclePos, type LiveEnd } from "./erd-geometry";

/** 추정 관계선을 눌렀을 때 부르는 콜백(관계 id). 값이 없으면 눌림 영역을 그리지 않는다. 값은 안정된 콜백이어야 선이 불필요하게 다시 그려지지 않는다. */
export const RelationPickContext = createContext<((relationId: string) => void) | null>(null);

/** 그 노드의 지금 왼쪽 x(끄는 중이면 덮개 위치). 숫자만 돌려줘 이 선이 걸린 노드가 움직일 때만 다시 그린다. */
const leftSelector = (id: string) => (s: ReactFlowState): number | undefined => s.nodeLookup.get(id)?.internals.positionAbsolute.x;

const endOf = (x: number, position: string): LiveEnd | null => (position === "left" || position === "right" ? { x, position } : null);

/**
 * 관계선 양 끝의 변은 모델이 정한 손잡이 id 가 정하는데(buildFlow, 놓은 뒤에야 다시 짠다) 끄는 동안 노드는 덮개 위치로 움직인다.
 * 그래서 이 선이 걸린 두 노드의 지금 위치로 변 규칙(relationSides)을 다시 적용해 어긋난 끝을 반대편 변으로 접어 그린다(liveEnds).
 * 놓은 뒤에는 손잡이 id 가 규칙과 같아 접힘이 없다. 자기 참조는 건드리지 않는다.
 */
export const ErdRelationEdge = memo(function ErdRelationEdge({
  id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<ErdFlowEdge>) {
  const srcSel = useMemo(() => leftSelector(source), [source]);
  const tgtSel = useMemo(() => leftSelector(target), [target]);
  const srcLeft = useStore(srcSel);
  const tgtLeft = useStore(tgtSel);
  const onPick = useContext(RelationPickContext);
  const srcEnd = endOf(sourceX, String(sourcePosition));
  const tgtEnd = endOf(targetX, String(targetPosition));
  const live = source !== target && srcEnd && tgtEnd && srcLeft !== undefined && tgtLeft !== undefined
    ? liveEnds(srcEnd, srcLeft, tgtEnd, tgtLeft) : null;
  const sx = live ? live.source.x : sourceX;
  const tx = live ? live.target.x : targetX;
  // 룰 세트 편집기와 같이 xyflow Position 을 그대로 넘긴다(값이 "left"·"right" 라 Side 에 맞는다).
  const sp = live ? live.source.position : sourcePosition;
  const tp = live ? live.target.position : targetPosition;
  // 마주 보는 변(왼쪽 ↔ 오른쪽)이면 두 손잡이 점 사이 폭에 맞춰 꼬리를 줄인다(좁은 틈에서 두 꼬리가 겹치지 않게). 같은 변(ㄷ 모양)은 그대로.
  const offset = sp !== tp ? endStub(Math.abs(tx - sx)) : END_STUB;
  const pts = smoothStepPoints({ sourceX: sx, sourceY, sourcePosition: sp, targetX: tx, targetY, targetPosition: tp, offset });
  const childEnd = pts[0];
  const childInner = pts[1] ?? pts[0];
  const parentEnd = pts[pts.length - 1];
  const parentInner = pts[pts.length - 2] ?? parentEnd;
  const zero = data?.zeroChild ? zeroCirclePos(childEnd, childInner) : null;
  const folded = data?.folded ?? 0;
  const mid = folded > 0 ? routeMidpoint(pts) : null;
  const d = routePath(pts, ROUTE_RADIUS);
  return (
    <>
      <g className="erd-rel" data-state={data?.state} data-sides={`${String(sp)[0]}${String(tp)[0]}`} data-testid={`erd-rel-${id}`}>
        <path className="react-flow__edge-path erd-rel__line" d={d} fill="none" />
        {onPick && data?.state === "INFERRED" && (
          <path
            className="erd-rel__hit" data-testid={`erd-rel-hit-${id}`} d={d} fill="none" stroke="transparent" strokeWidth={12} pointerEvents="stroke"
            onClick={(e) => {
              e.stopPropagation();
              onPick(id);
            }}
          />
        )}
        <path className="erd-rel__end" d={crowFootPath(childEnd, childInner)} fill="none" />
        {zero && <circle className="erd-rel__zero" cx={zero.x} cy={zero.y} r={4} />}
        <path className="erd-rel__end" d={oneBarsPath(parentEnd, parentInner)} fill="none" />
      </g>
      {mid && (
        <EdgeLabelRenderer>
          <div className="erd-rel__label" style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}>
            다른 후보 {folded}개
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
