"use client";

/**
 * ERD 관계선 — 직교 꺾은선(shared smoothStepPoints + routePath)과 끝 모양. 자식(source) 끝 까마귀발(+ 0 원), 부모(target) 끝 이중 막대.
 * 추정은 노란 파선(CSS)이고, 1순위 후보에는 "다른 후보 n개" 이름표를 단다. 본선 path 에 react-flow__edge-path 를 붙인다(브라우저 확인이 이 클래스로 센다).
 * 이름표는 EdgeLabelRenderer 층(pointer-events:none, Local-Rules §19)에 둔다. 누를 것이 없어 다시 켜지 않는다.
 */
import { memo } from "react";

import {
  EdgeLabelRenderer, ROUTE_RADIUS, routeMidpoint, routePath, smoothStepPoints, type EdgeProps,
} from "@dk-oasis/shared/react-flow";

import type { ErdFlowEdge } from "./erd-flow";
import { END_STUB, crowFootPath, oneBarsPath, zeroCirclePos } from "./erd-geometry";

export const ErdRelationEdge = memo(function ErdRelationEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<ErdFlowEdge>) {
  // 룰 세트 편집기와 같이 xyflow Position 을 그대로 넘긴다(값이 "left"·"right" 라 Side 에 맞는다).
  const pts = smoothStepPoints({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset: END_STUB });
  const childEnd = pts[0];
  const childInner = pts[1] ?? pts[0];
  const parentEnd = pts[pts.length - 1];
  const parentInner = pts[pts.length - 2] ?? parentEnd;
  const zero = data?.zeroChild ? zeroCirclePos(childEnd, childInner) : null;
  const folded = data?.folded ?? 0;
  const mid = folded > 0 ? routeMidpoint(pts) : null;
  return (
    <>
      <g className="erd-rel" data-state={data?.state} data-testid={`erd-rel-${id}`}>
        <path className="react-flow__edge-path erd-rel__line" d={routePath(pts, ROUTE_RADIUS)} fill="none" />
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
