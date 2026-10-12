"use client";

/**
 * ERD 관계선 — 직교 꺾은선(shared smoothStepPoints + routePath)과 끝 모양. 자식(source) 끝 까마귀발(+ 0 원), 부모(target) 끝 이중 막대.
 * 추정은 노란 파선(CSS)이고, 1순위 후보에는 "다른 후보 n개" 이름표를 단다. 본선 path 에 react-flow__edge-path 를 붙인다(브라우저 확인이 이 클래스로 센다).
 * 이름표는 EdgeLabelRenderer 층(pointer-events:none, Local-Rules §19)에 둔다. 누를 것이 없어 다시 켜지 않는다.
 * 두 끝이 같은 변(위아래로 쌓인 표)이면 smoothStepPoints 가 같은 Position 쌍을 ㄷ 모양으로 상자 밖을 돌려 그린다(erd-geometry relationSides).
 * 그린 변은 g 의 data-sides("rl"·"rr" 처럼 자식·부모 끝)에 단다.
 * 추정(INFERRED) 선은 RelationPickContext 가 있으면 본선 위에 투명한 두꺼운 눌림 영역(erd-rel__hit)을 얹는다. 누르면 그 관계 id 를 콜백에 넘긴다(Task 6).
 * 눌림 영역에는 react-flow__edge-path 를 붙이지 않는다(브라우저 확인이 본선만 센다). 확정 선에는 얹지 않는다.
 *
 * 선 경로 편집(erd-route, 룰 세트 편집기 FlowCanvas C14·W1 과 같은 방식):
 * - data.route 가 있으면 자식 끝 → 꺾임점들 → 부모 끝을 잇는 둥근 꺾은선(routePath, ROUTE_RADIUS)이다. 그리기 전용 꼬리는 없다.
 *   없으면 자동 경로(smoothStepPoints, ERD 꼬리 길이 offset). 손잡이의 자동 점도 같은 offset 의 autoRoute 다.
 * - 고칠 수 있으면(다이어그램 편집 권한) 선에 마우스를 올리거나(떠난 뒤 150ms 유예) 선을 고르면 저장 점(원)·자동 경로 점(점선 원)·가로·세로 선분 막대가 뜬다.
 * - 점 끌기 = 자유 이동 + 앞뒤 이웃과 화면 6px 안이면 x·y 맞춤과 안내선(snapRoutePoint, Alt 누르면 맞추지 않음).
 *   선분 막대 끌기 = 선분에 수직으로만(moveSegment — 표에 붙은 선분은 짧은 선분을 끼운다, 이웃과 6px 맞춤, clampSegmentDelta).
 * - 끄는 동안의 점은 이 선 안 state 에만 둔다(다른 선·노드는 다시 그리지 않는다). 놓을 때 한 번만 보낸다(점 = 반올림, 선분 = finishRoute 정리).
 * - 저장 점을 누르면 그 점을 고른다(버스). Delete·Backspace 는 useCanvasEditing 이 고른 점을 먼저 빼고 이웃 점을 고른 채로 둔다.
 *   선 두 번 누르기 = 그 자리에 점 더하기(경로 없는 선은 자동 경로의 꺾임을 이어받는다). 저장 점 두 번 누르기 = 빼기.
 * - 손잡이는 nodrag·nopan 이라 캔버스를 끌지 않는다. 누르면 캔버스 host 에 초점을 줘 Delete 가 닿게 한다.
 *
 * 끝점 변 바꾸기(§7.5):
 * - 손잡이가 보일 때 양 끝(자기 참조 제외)에 끝점 손잡이(네모)가 뜬다. 끄는 동안 이 선만 놓을 변(표 가운데 x 기준, sideAt)으로 미리 그린다.
 * - 놓으면 nextFixedSides 로 저장할 변을 정한다 — 자동 변에 놓으면 지정 해제, 다른 변이면 지정. 저장 값과 같으면 보내지 않는다.
 * - 경로가 있는 선은 refitRouteEnd 로 끝 마디만 다시 맞추고, 맞출 수 없으면(새 변 안쪽에 점) 점을 비운다. 변과 점은 한 묶음(commitSides)이다.
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import {
  EdgeLabelRenderer, ROUTE_RADIUS, autoRoute, clampSegmentDelta, finishRoute, insertRoutePoint, moveSegment, roundPoint, routeMidpoint, routePath,
  segmentAxis, segmentHandles, smoothStepPoints, snapRoutePoint, snapSegmentDelta, useReactFlow, useStore,
  type EdgeProps, type FlowPos, type ReactFlowState, type RoutePointGuide, type Side,
} from "@dk-oasis/shared/react-flow";

import type { ErdFlowEdge } from "./erd-flow";
import {
  END_STUB, NODE_WIDTH, crowFootPath, endStub, liveEnds, nextFixedSides, oneBarsPath, refitRouteEnd, relationSides, sideAt, zeroCirclePos,
  type FixedSides, type LiveEnd, type NodeSide,
} from "./erd-geometry";
import { MAX_ROUTE_POINTS, dropHover, hoverRoute, leaveRoute, markHandlePress, selectRoute, selectRoutePoint, useRouteSelection } from "./erd-route";

/** 선분 막대 크기(흐름 좌표) — 룰 세트 편집기 SEG_BAR_LONG·SEG_BAR_SHORT 와 같다. */
const SEG_LONG = 16;
const SEG_SHORT = 6;
const NO_GUIDES: readonly RoutePointGuide[] = Object.freeze([]);
/** 끝점 손잡이(네모) 한 변 길이와 끝에서 바깥으로 비킨 거리(흐름 좌표) — 표 상자(노드 층이 선 위다)에 덮이지 않게 바깥에 둔다. */
const END_GRIP = 8;
const END_GRIP_OUT = 6;

/** 추정 관계선을 눌렀을 때 부르는 콜백(관계 id). 값이 없으면 눌림 영역을 그리지 않는다. 값은 안정된 콜백이어야 선이 불필요하게 다시 그려지지 않는다. */
export const RelationPickContext = createContext<((relationId: string) => void) | null>(null);

/** 그 노드의 지금 왼쪽 x(끄는 중이면 덮개 위치). 숫자만 돌려줘 이 선이 걸린 노드가 움직일 때만 다시 그린다. */
const leftSelector = (id: string) => (s: ReactFlowState): number | undefined => s.nodeLookup.get(id)?.internals.positionAbsolute.x;
/** 그 노드의 잰 너비(표 크기 §7.4 로 바뀔 수 있다). 재기 전이면 undefined — liveEnds 가 기본 너비를 쓴다. */
const widthSelector = (id: string) => (s: ReactFlowState): number | undefined => s.nodeLookup.get(id)?.measured.width;

const endOf = (x: number, position: string): LiveEnd | null => (position === "left" || position === "right" ? { x, position } : null);

/** 끄는 동안의 상태. index = 끄는 점 번호(선분이면 -1), seg = 끄는 선분 번호(점이면 없음). */
interface RouteDrag {
  points: FlowPos[];
  index: number;
  seg?: number;
  guides: readonly RoutePointGuide[];
}

/** 끝점 끄는 동안의 상태 — 어느 끝을(end) 처음 변(from)에서 어느 변(side)으로 미리 그리는가. */
interface EndDrag {
  end: "child" | "parent";
  from: NodeSide;
  side: NodeSide;
}

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
  const srcWidth = useStore(useMemo(() => widthSelector(source), [source]));
  const tgtWidth = useStore(useMemo(() => widthSelector(target), [target]));
  const onPick = useContext(RelationPickContext);
  const rf = useReactFlow();
  const { selected, hovered, pointIndex, editable, bus } = useRouteSelection(id);
  const route = data?.route ?? null;
  const fixed = data?.fixed ?? null;
  // 끝점 끌기를 놓을 때 견줄 지금 값(렌더마다 갱신).
  const latest = useRef({ route, fixed });
  useEffect(() => {
    latest.current = { route, fixed };
  }, [route, fixed]);
  // 끄는 동안의 점. 보낸 뒤 모델(낙관 반영)이 바뀌거나 응답이 오면 비운다 — 다음 끌기가 이미 시작했으면 그 미리보기는 그대로 둔다(dragSeq).
  const [drag, setDrag] = useState<RouteDrag | null>(null);
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  const dragSeq = useRef(0);
  useEffect(() => {
    if (!stopDrag.current) {
      setDrag(null);
      setEndDrag(null);
    }
  }, [route, fixed]);
  // 끄는 중 선이 사라지면(화면 밖·관계 지움) window 듣기를 뗀다. 올려진 선이었으면 비운다.
  useEffect(() => () => {
    stopDrag.current?.();
    dropHover(bus, id);
  }, [bus, id]);
  // 고른 점이 경로에서 사라지면(되돌리기·자동 경로로 되돌리기·자동 배치·남의 편집) 고름을 푼다.
  useEffect(() => {
    if (pointIndex >= 0 && pointIndex >= (route?.length ?? 0)) selectRoutePoint(bus, null);
  }, [bus, pointIndex, route]);
  const showHandles = editable && (selected || hovered || drag !== null || endDrag !== null);
  // 배율은 손잡이를 그릴 때만 구독한다(다른 선은 확대에 다시 그리지 않는다).
  const zoom = useStore((s) => (showHandles ? s.transform[2] : 1));
  const srcEnd = endOf(sourceX, String(sourcePosition));
  const tgtEnd = endOf(targetX, String(targetPosition));
  // 끝점을 끄는 동안은 그 끝을 놓을 변으로 미리 그린다.
  const shownFixed: FixedSides | null = endDrag ? { ...fixed, [endDrag.end]: endDrag.side } : fixed;
  const live = source !== target && srcEnd && tgtEnd && srcLeft !== undefined && tgtLeft !== undefined
    ? liveEnds(srcEnd, srcLeft, tgtEnd, tgtLeft, srcWidth, tgtWidth, shownFixed) : null;
  const sx = live ? live.source.x : sourceX;
  const tx = live ? live.target.x : targetX;
  // 룰 세트 편집기와 같이 xyflow Position 을 그대로 넘긴다(값이 "left"·"right" 라 Side 에 맞는다).
  const sp = (live ? live.source.position : sourcePosition) as Side;
  const tp = (live ? live.target.position : targetPosition) as Side;
  // 마주 보는 변(왼쪽 ↔ 오른쪽)이면 두 손잡이 점 사이 폭에 맞춰 꼬리를 줄인다(좁은 틈에서 두 꼬리가 겹치지 않게). 같은 변(ㄷ 모양)은 그대로.
  const offset = sp !== tp ? endStub(Math.abs(tx - sx)) : END_STUB;
  const autoInput = { sourceX: sx, sourceY, sourcePosition: sp, targetX: tx, targetY, targetPosition: tp, offset };
  const src: FlowPos = { x: sx, y: sourceY };
  const tgt: FlowPos = { x: tx, y: targetY };
  const stored: readonly FlowPos[] | null = route && route.length > 0 ? route : null;
  // 끝점을 반대 변으로 끄는 동안 저장 경로는 놓았을 때 보낼 모양(끝 마디 다시 맞춤, 못 맞추면 자동 경로)으로 미리 그린다.
  const bends: readonly FlowPos[] | null = drag ? drag.points
    : stored && endDrag && endDrag.side !== endDrag.from ? refitRouteEnd(stored, endDrag.end, endDrag.side, src, tgt, MAX_ROUTE_POINTS) : stored;
  const pts: FlowPos[] = bends ? [src, ...bends, tgt] : smoothStepPoints(autoInput);
  const childEnd = pts[0];
  const childInner = pts[1] ?? pts[0];
  const parentEnd = pts[pts.length - 1];
  const parentInner = pts[pts.length - 2] ?? parentEnd;
  const zero = data?.zeroChild ? zeroCirclePos(childEnd, childInner) : null;
  const folded = data?.folded ?? 0;
  const mid = folded > 0 ? routeMidpoint(pts) : null;
  const d = routePath(pts, ROUTE_RADIUS);
  // 손잡이 — 자동 경로면 autoRoute 점(같은 offset), 편집 꺾은선 = 양 끝 + 저장 점(또는 자동 점).
  const autoPts = showHandles && !bends ? autoRoute(autoInput) : null;
  const full = showHandles ? [src, ...(bends ?? autoPts ?? []), tgt] : null;
  // 선분 막대는 끝점 손잡이 자리를 비킨다.
  const gripAt = (at: FlowPos, pos: string): FlowPos => ({ x: at.x + (pos === "left" ? -END_GRIP_OUT : END_GRIP_OUT), y: at.y });
  const grips = showHandles && live ? [gripAt(childEnd, sp), gripAt(parentEnd, tp)] : [];
  const segs = full ? segmentHandles(full, zoom, grips) : [];

  /** 누르기 공통 — 캔버스 끌기를 막고, 손잡이 누름을 적고(f1), 캔버스 host 에 초점을 준다. */
  const press = (e: ReactPointerEvent): boolean => {
    if (e.button !== 0) return false;
    e.stopPropagation();
    e.preventDefault();
    markHandlePress(bus);
    bus.handlers?.pressed();
    // 다른 끌기가 돌고 있었으면(두 번째 포인터) 그 미리 그림도 비운다 — 남으면 새 끌기의 미리 그림을 가린다.
    if (stopDrag.current) {
      stopDrag.current();
      setDrag(null);
      setEndDrag(null);
    }
    dragSeq.current += 1;
    return true;
  };
  /** window 끌기 듣기. 단추가 모두 떨어진 채 움직이면 pointerup 을 잃은 것이다(창 밖에서 놓음) — 보내지 않고 버린다. */
  const track = (move: (ev: PointerEvent) => void, end: (commit: boolean) => void) => {
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons === 0) finish(false);
      else move(ev);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      stopDrag.current = null;
    };
    function finish(commit: boolean) {
      detach();
      markHandlePress(bus);
      end(commit);
    }
    stopDrag.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
  /** 보내고 응답(또는 낙관 반영) 뒤 끄는 상태를 비운다. */
  const send = (points: FlowPos[]) => {
    const h = bus.handlers;
    if (!h) {
      setDrag(null);
      return;
    }
    const seq = dragSeq.current;
    void Promise.resolve(h.commit(id, points.map((p) => ({ x: p.x, y: p.y })))).finally(() => {
      if (dragSeq.current === seq) setDrag(null);
    });
  };

  /** 점 끌기. base = 저장 점(또는 자동 점), auto 면 고른 점으로 두지 않는다. */
  const startPoint = (e: ReactPointerEvent, base: readonly FlowPos[], index: number, auto: boolean) => {
    if (!press(e)) return;
    if (auto) {
      selectRoutePoint(bus, null);
      selectRoute(bus, id);
    } else selectRoutePoint(bus, { relation: id, index });
    const original = base.map((p) => ({ x: p.x, y: p.y }));
    // 맞춤 이웃 — 앞뒤 점, 맨 앞·맨 뒤 점이면 선의 시작·끝(그린 선 끝 좌표).
    const prev = index > 0 ? original[index - 1] : src;
    const next = index < original.length - 1 ? original[index + 1] : tgt;
    let cur: FlowPos[] | null = null;
    track((ev) => {
      const raw = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }, { snapToGrid: false });
      const snap = ev.altKey ? { point: raw, guides: NO_GUIDES } : snapRoutePoint(raw, prev, next, rf.getZoom());
      const at = roundPoint(snap.point);
      const was = (cur ?? original)[index];
      if (at.x === was.x && at.y === was.y) return;
      cur = original.map((p, k) => (k === index ? at : p));
      setDrag({ points: cur, index, guides: snap.guides.length > 0 ? snap.guides : NO_GUIDES });
    }, (commit) => {
      // 제자리로 돌아와 놓으면 보내지 않는다(되돌리기 기록·자동 경로 → 저장 경로 바꿈 없음).
      const at = cur?.[index];
      if (commit && cur && at && (at.x !== original[index].x || at.y !== original[index].y)) send(cur.map(roundPoint));
      else setDrag(null);
    });
  };
  /** 선분 막대 끌기. origin = 양 끝을 포함한 지금 꺾은선. */
  const startSegment = (e: ReactPointerEvent, seg: number, origin: readonly FlowPos[]) => {
    const axis = origin[seg] && origin[seg + 1] ? segmentAxis(origin[seg], origin[seg + 1]) : null;
    if (!axis || !press(e)) return;
    // 선분을 옮기면 점 번호가 바뀐다(끼움·합치기) — 고른 점을 비워 Delete 가 엉뚱한 점을 빼지 않게 한다.
    selectRoutePoint(bus, null);
    selectRoute(bus, id);
    const sx0 = e.clientX;
    const sy0 = e.clientY;
    let lastDelta = 0;
    let cur: FlowPos[] | null = null;
    track((ev) => {
      const k = rf.getZoom() || 1;
      const raw = (axis === "h" ? ev.clientY - sy0 : ev.clientX - sx0) / k;
      const delta = clampSegmentDelta(origin, seg, snapSegmentDelta(origin, seg, raw, k));
      if (delta === lastDelta) return;
      const r = moveSegment(origin, seg, delta);
      if (!r) return;
      lastDelta = delta;
      cur = r.points;
      setDrag({ points: r.points, index: -1, seg: r.seg, guides: NO_GUIDES });
    }, (commit) => {
      if (commit && cur && lastDelta !== 0) send(finishRoute(origin[0], cur, origin[origin.length - 1]));
      else setDrag(null);
    });
  };
  /** 선 두 번 누르기 — 누른 자리에 점을 더한다. 경로 없는 선은 자동 경로의 꺾임을 이어받는다. */
  const addPoint = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const base = bends ?? autoRoute(autoInput).map(roundPoint);
    const at = roundPoint(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false }));
    void bus.handlers?.commit(id, insertRoutePoint(base, src, tgt, at));
  };
  /**
   * 끝점 끌기(§7.5). 놓은 x 가 그 끝 표 가운데보다 왼쪽이면 L. 자동 변(지금 위치의 relationSides)에 놓으면 지정을 푼다.
   * 그린 변이 바뀌면 저장 경로를 끝 마디만 다시 맞추고(못 맞추면 비운다) 변과 한 묶음으로 보낸다.
   */
  const startEnd = (e: ReactPointerEvent, end: "child" | "parent") => {
    if (srcLeft === undefined || tgtLeft === undefined || !press(e)) return;
    selectRoutePoint(bus, null);
    selectRoute(bus, id);
    const left = end === "child" ? srcLeft : tgtLeft;
    const width = (end === "child" ? srcWidth : tgtWidth) ?? NODE_WIDTH;
    const from: NodeSide = (end === "child" ? sp : tp) === "left" ? "L" : "R";
    const auto = relationSides(srcLeft, tgtLeft, false, srcWidth ?? NODE_WIDTH, tgtWidth ?? NODE_WIDTH);
    const base: FixedSides = fixed ?? {};
    const stored0 = route;
    // 놓을 때 보낼 경로의 양 끝 — 바꾼 끝은 표 가운데로 접은 반대편 점(liveEnds 와 같은 접기)이다.
    const at0 = end === "child" ? src : tgt;
    const flipped: FlowPos = { x: 2 * (left + width / 2) - at0.x, y: at0.y };
    let side: NodeSide = from;
    // 누르고 움직이지 않은 채 떼면 보내지 않는다(지정 변이 지금 자동 변과 같아도 누르기만으로 지정이 풀리지 않게).
    let moved = false;
    const x0 = e.clientX;
    const y0 = e.clientY;
    setEndDrag({ end, from, side });
    track((ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      moved = true;
      const next = sideAt(rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }, { snapToGrid: false }).x, left, width);
      if (next === side) return;
      side = next;
      setEndDrag({ end, from, side });
    }, (commit) => {
      const h = bus.handlers;
      // 끄는 사이 남의 편집(SSE)으로 이 선의 경로·변이 바뀌었으면 낡은 값으로 보내지 않는다.
      const changed = latest.current.route !== stored0 || latest.current.fixed !== fixed;
      const sides = commit && moved && !changed ? nextFixedSides(base, end, side, auto) : null;
      if (!h || !sides) {
        setEndDrag(null);
        return;
      }
      // 그린 변이 그대로면(지정 ↔ 자동만 바뀜) 점은 건드리지 않는다. 바뀌면 끝 마디를 다시 맞춘 경로를 보낸다 — 못 맞추면 빈 목록(비우기).
      const points = side === from || !stored ? undefined
        : refitRouteEnd(stored, end, side, end === "child" ? flipped : src, end === "parent" ? flipped : tgt, MAX_ROUTE_POINTS) ?? [];
      const seq = dragSeq.current;
      void Promise.resolve(h.commitSides(id, sides, points)).finally(() => {
        if (dragSeq.current === seq) setEndDrag(null);
      });
    });
  };
  const removePoint = (e: ReactMouseEvent, index: number) => {
    e.stopPropagation();
    if (!route) return;
    selectRoutePoint(bus, null);
    void bus.handlers?.commit(id, route.filter((_, k) => k !== index).map((p) => ({ x: p.x, y: p.y })));
  };
  const hoverProps = editable ? { onMouseEnter: () => hoverRoute(bus, id), onMouseLeave: () => leaveRoute(bus, id) } : {};
  const stop = (e: ReactMouseEvent) => e.stopPropagation();
  // 선 두 번 누르기는 선 몸통(고르기 영역·본선·추정 눌림 영역)에서만 받는다 — 끝 모양(까마귀발·막대·0 원)은 표 바로 옆이라 점을 더하지 않는다.
  const dbl = editable ? addPoint : undefined;
  return (
    <>
      <g className="erd-rel" data-state={data?.state} data-sides={`${String(sp)[0]}${String(tp)[0]}`} data-testid={`erd-rel-${id}`}
        data-selected={selected ? "" : undefined} data-routed={bends ? "" : undefined} data-handles={showHandles ? "" : undefined} {...hoverProps}>
        <path className="erd-rel__sel" d={d} fill="none" stroke="transparent" strokeWidth={10} pointerEvents="stroke" onDoubleClick={dbl} />
        <path className="react-flow__edge-path erd-rel__line" d={d} fill="none" onDoubleClick={dbl} />
        {onPick && data?.state === "INFERRED" && (
          <path
            className="erd-rel__hit" data-testid={`erd-rel-hit-${id}`} d={d} fill="none" stroke="transparent" strokeWidth={12} pointerEvents="stroke" onDoubleClick={dbl}
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
        {drag?.guides.map((g) => (
          <line key={g.axis} className="erd-rel__guide" data-testid={`erd-rel-guide-${id}-${g.axis}`}
            x1={g.axis === "x" ? g.at : g.from} y1={g.axis === "x" ? g.from : g.at} x2={g.axis === "x" ? g.at : g.to} y2={g.axis === "x" ? g.to : g.at} />
        ))}
        {segs.map((s) => (
          <rect key={`s${s.index}`} className="erd-rel__seg nodrag nopan" data-testid={`erd-rel-seg-${id}-${s.index}`} data-axis={s.axis}
            data-dragging={drag?.seg === s.index ? "" : undefined}
            x={s.at.x - (s.axis === "h" ? SEG_LONG : SEG_SHORT) / 2} y={s.at.y - (s.axis === "h" ? SEG_SHORT : SEG_LONG) / 2}
            width={s.axis === "h" ? SEG_LONG : SEG_SHORT} height={s.axis === "h" ? SEG_SHORT : SEG_LONG} rx={2}
            onClick={stop} onDoubleClick={stop} onPointerDown={(e) => startSegment(e, s.index, full!)} />
        ))}
        {autoPts?.map((p, k) => (
          <circle key={`a${k}`} className="erd-rel__pt nodrag nopan" data-auto="" data-testid={`erd-rel-auto-${id}-${k}`} cx={p.x} cy={p.y} r={5}
            onClick={stop} onDoubleClick={stop} onPointerDown={(e) => startPoint(e, autoPts, k, true)} />
        ))}
        {showHandles && bends?.map((p, k) => (
          <circle key={`p${k}`} className="erd-rel__pt nodrag nopan" data-testid={`erd-rel-pt-${id}-${k}`} cx={p.x} cy={p.y} r={5}
            data-selected={pointIndex === k ? "" : undefined} data-dragging={drag && drag.seg === undefined && drag.index === k ? "" : undefined}
            onClick={stop} onDoubleClick={(e) => removePoint(e, k)} onPointerDown={(e) => startPoint(e, bends, k, false)} />
        ))}
        {showHandles && live && ([["child", childEnd, sp], ["parent", parentEnd, tp]] as const).map(([end, at, pos]) => (
          <rect key={`e-${end}`} className="erd-rel__endgrip nodrag nopan" data-testid={`erd-rel-end-${id}-${end}`}
            data-fixed={fixed?.[end] ? "" : undefined} data-dragging={endDrag?.end === end ? "" : undefined}
            x={gripAt(at, pos).x - END_GRIP / 2} y={at.y - END_GRIP / 2} width={END_GRIP} height={END_GRIP} rx={1}
            onClick={stop} onDoubleClick={stop} onPointerDown={(e) => startEnd(e, end)} />
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
