"use client";

/**
 * ERD 관계선 — 직교 꺾은선(shared smoothStepPoints + routePath)과 끝 모양. 자식(source) 끝 까마귀발(+ 0 원), 부모(target) 끝 이중 막대.
 * 추정은 노란 파선(CSS)이고, 1순위 후보에는 "다른 후보 n개" 이름표를 단다. 본선 path 에 react-flow__edge-path 를 붙인다(브라우저 확인이 이 클래스로 센다).
 * 이름표는 EdgeLabelRenderer 층(pointer-events:none, Local-Rules §19)에 둔다. 누를 것이 없어 다시 켜지 않는다.
 * 두 끝이 같은 변(위아래로 쌓인 표)이면 smoothStepPoints 가 같은 Position 쌍을 ㄷ 모양으로 상자 밖을 돌려 그린다(erd-geometry relationSides).
 * 그린 변은 g 의 data-sides("rl"·"rr" 처럼 자식·부모 끝)에 단다.
 * 추정(INFERRED) 선은 RelationPickContext 가 있으면 본선 위에 투명한 두꺼운 눌림 영역(erd-rel__hit)을 얹는다. 누르면 그 관계 id 를 콜백에 넘긴다(Task 6).
 * 눌림 영역에는 react-flow__edge-path 를 붙이지 않는다(브라우저 확인이 본선만 센다). 확정 선에는 얹지 않는다.
 * 경유점(2차 c5): data.route 가 있으면 자식 끝 → 꺾임점 → 부모 끝 꺾은선으로 그리고, 끝 모양은 끝 마디 방향을 따른다.
 * 선 누르기 = 고르기(onEdgeClick, 투명한 두꺼운 고르기 영역 erd-rel__sel). 고른 선에 꺾임점(원)·마디 가운데(네모) 손잡이를 그린다.
 * 꺾임점 끌기 = 옮기기, 마디 가운데 끌기 = 새 꺾임점, 꺾임점 두 번 누르기 = 지우기. 놓을 때 한 번만 보낸다(useCanvasEditing 의 commit).
 * 끄는 동안의 점은 이 선 안 state 에만 둔다(다른 선·노드는 다시 그리지 않는다). 손잡이는 nodrag·nopan 이라 캔버스를 끌지 않는다.
 * 꺾임점 선의 두 끝에는 그리기 전용 꼬리(변 방향 END_STUB)를 넣는다 — 끝 모양이 늘 표 바깥을 향하고 표에 가리지 않는다(저장하지 않는다).
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  EdgeLabelRenderer, ROUTE_RADIUS, routeMidpoint, routePath, smoothStepPoints, useReactFlow, useStore, type EdgeProps, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import type { ErdRoutePoint } from "../types";
import type { ErdFlowEdge } from "./erd-flow";
import { END_STUB, crowFootPath, endStub, liveEnds, oneBarsPath, zeroCirclePos, type LiveEnd } from "./erd-geometry";
import {
  MAX_ROUTE_POINTS, insertPoint, movePoint, polylinePath, removePoint, segmentMids, selectRoute, tidyPoints, useRouteSelection, type Pt,
} from "./erd-route";

/** 이만큼(px, 화면) 넘게 움직여야 끌기로 본다 — 손잡이를 누르기만 하면 보내지 않는다. */
const DRAG_SLOP = 3;

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
  const rf = useReactFlow();
  const { selected, editable, bus } = useRouteSelection(id);
  const route = data?.route ?? null;
  // 끄는 동안의 꺾임점. 보낸 뒤 모델(낙관 반영)이 바뀌거나 응답이 오면 비운다.
  const [drag, setDrag] = useState<readonly ErdRoutePoint[] | null>(null);
  useEffect(() => setDrag(null), [route]);
  // 끄는 중 선이 사라지면(화면 밖·관계 지움) window 듣기를 뗀다.
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  const bends = drag ?? route;
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
  const auto = bends ? null : smoothStepPoints({ sourceX: sx, sourceY, sourcePosition: sp, targetX: tx, targetY, targetPosition: tp, offset });
  const stub = (x: number, pos: unknown): number => x + (String(pos) === "left" ? -END_STUB : END_STUB);
  // 꺾임점 선 = 손잡이 → 꼬리 → 꺾임점들 → 꼬리 → 손잡이. core = 꼬리 사이(손잡이 마디 번호·정리 기준).
  const core: Pt[] | null = bends ? [{ x: stub(sx, sp), y: sourceY }, ...bends, { x: stub(tx, tp), y: targetY }] : null;
  const pts: Pt[] = auto ?? [{ x: sx, y: sourceY }, ...core!, { x: tx, y: targetY }];
  const childEnd = pts[0];
  const childInner = pts[1] ?? pts[0];
  const parentEnd = pts[pts.length - 1];
  const parentInner = pts[pts.length - 2] ?? parentEnd;
  const zero = data?.zeroChild ? zeroCirclePos(childEnd, childInner) : null;
  const folded = data?.folded ?? 0;
  const mid = folded > 0 ? routeMidpoint(pts) : null;
  const d = auto ? routePath(auto, ROUTE_RADIUS) : polylinePath(pts);
  const handles = selected && editable;

  /** 꺾임점 index 를 끌기 시작한다. base = 끌기 전 꺾임점 목록(새 점이면 넣은 뒤 목록). */
  const begin = (e: ReactPointerEvent, base: readonly ErdRoutePoint[], index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    stopDrag.current?.();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let cur: readonly ErdRoutePoint[] = base;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) { // 창 밖에서 놓아 up 을 못 받았다
        up();
        return;
      }
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_SLOP) return;
      moved = true;
      cur = movePoint(cur, index, rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
      setDrag(cur);
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stopDrag.current = null;
    };
    function up() {
      detach();
      const h = bus.handlers;
      if (!moved || !h) {
        setDrag(null);
        return;
      }
      // 앞뒤와 한 줄이 된 점·겹친 점은 지운다(모양이 같다). 다 지워지면 자동 경로.
      const drop = new Set(tidyPoints([core ? core[0] : pts[0], ...cur, core ? core[core.length - 1] : pts[pts.length - 1]]));
      const next = cur.filter((_, k) => !drop.has(k));
      void Promise.resolve(h.commit(id, next)).finally(() => setDrag(null));
    }
    stopDrag.current = detach;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // 상한(50)이면 새 꺾임점 손잡이를 두지 않는다.
  const mids = !handles ? [] : auto ? [routeMidpoint(auto)] : bends!.length >= MAX_ROUTE_POINTS ? [] : segmentMids(core!);
  return (
    <>
      <g className="erd-rel" data-state={data?.state} data-sides={`${String(sp)[0]}${String(tp)[0]}`} data-testid={`erd-rel-${id}`}
        data-selected={selected ? "" : undefined} data-routed={bends ? "" : undefined}>
        <path className="erd-rel__sel" d={d} fill="none" stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
        <path className="react-flow__edge-path erd-rel__line" d={d} fill="none" />
        {onPick && data?.state === "INFERRED" && (
          <path
            className="erd-rel__hit" data-testid={`erd-rel-hit-${id}`} d={d} fill="none" stroke="transparent" strokeWidth={12} pointerEvents="stroke"
            onClick={(e) => {
              e.stopPropagation();
              selectRoute(bus, id); // 추정 선도 눌러 고른다(꺾임점 손잡이)
              onPick(id);
            }}
          />
        )}
        <path className="erd-rel__end" d={crowFootPath(childEnd, childInner)} fill="none" />
        {zero && <circle className="erd-rel__zero" cx={zero.x} cy={zero.y} r={4} />}
        <path className="erd-rel__end" d={oneBarsPath(parentEnd, parentInner)} fill="none" />
        {mids.map((m, k) => m && (
          <rect key={`m${k}`} className="erd-rel__mid nodrag nopan" data-testid={`erd-rel-mid-${id}-${k}`} x={m.x - 4} y={m.y - 4} width={8} height={8}
            onPointerDown={(e) => (auto ? begin(e, [{ x: Math.round(m.x), y: Math.round(m.y) }], 0) : begin(e, insertPoint(bends ?? [], k, m), k))} />
        ))}
        {handles && bends?.map((b, k) => (
          <circle key={`b${k}`} className="erd-rel__bend nodrag nopan" data-testid={`erd-rel-bend-${id}-${k}`} cx={b.x} cy={b.y} r={5}
            onPointerDown={(e) => begin(e, bends, k)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              void bus.handlers?.commit(id, removePoint(bends, k));
            }} />
        ))}
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
