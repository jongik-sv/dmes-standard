"use client";

/**
 * ERD 표 노드 — 머리(이름·위반 수)와 컬럼 행. 확대율이 50% 미만이면 표 이름 한 줄만 그린다(스펙 8절, Review Focus 5) —
 * 컬럼 행·작은 이름·위반 수·이름표를 만들지 않는다(Task 12 가 노드 글자가 한 줄인지 본다).
 * 확대율은 "50% 미만인가" 만 구독한다. 확대·축소할 때마다가 아니라 경계를 넘을 때만 다시 그린다(Local-Rules §19).
 * 머리의 「감사 n」은 감사 컬럼 보기가 꺼져 가린 감사 컬럼 수다(auditHidden, 접기로 가린 수와 따로 센다).
 * 손잡이: 머리에 표 손잡이 4개(늘), 행에는 선이 쓰는 것만. 행이 바뀌면 React Flow 가 손잡이 자리를 다시 재게 한다.
 */
import { memo, useEffect, useRef } from "react";

import {
  Handle, Position, useStore, useUpdateNodeInternals, type NodeProps, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import { TABLE_HANDLES, type ErdFlowNode, type ErdRowView, type HandleSpec } from "./erd-flow";
import { ZOOM_NAMES_ONLY } from "./erd-geometry";
import { PresenceTag } from "./PresenceTag";

export const namesOnlySelector = (s: ReactFlowState): boolean => s.transform[2] < ZOOM_NAMES_ONLY;

/** 관계 도구(4·5) 동안 노드 전체를 덮는 잇기 손잡이 id. 부모 표를 누르고 자식 표를 누르거나(connectOnClick), 부모에서 자식으로 끈다. */
export const PICK_HANDLE = "pick";

const NO_ROWS: ErdRowView[] = [];

function Handles({ list }: { list: readonly HandleSpec[] }) {
  return (
    <>
      {list.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.side === "L" ? Position.Left : Position.Right}
          isConnectable={false}
          className="erd-handle"
        />
      ))}
    </>
  );
}

export const ErdTableNode = memo(function ErdTableNode({ id, data, selected, isConnectable }: NodeProps<ErdFlowNode>) {
  const namesOnly = useStore(namesOnlySelector);
  const rows = namesOnly ? NO_ROWS : data.rows;
  const updateInternals = useUpdateNodeInternals();
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true; // 처음 그릴 때는 React Flow 가 스스로 잰다
      return;
    }
    updateInternals(id);
  }, [id, rows, updateInternals]);

  return (
    <div className="erd-node" data-testid={`erd-node-${id}`} data-selected={selected ? "" : undefined} data-names-only={namesOnly ? "" : undefined}>
      {data.pickable && (
        <Handle id={PICK_HANDLE} type="source" position={Position.Top} isConnectable={isConnectable}
          className="erd-pick nodrag" data-testid={`erd-pick-${id}`} />
      )}
      {!namesOnly && data.viewers.length > 0 && (
        <div className="erd-node__viewers">
          {data.viewers.map((v) => (
            <PresenceTag key={v.session} viewer={v} />
          ))}
        </div>
      )}
      <div className="erd-node__hd">
        <Handles list={TABLE_HANDLES} />
        <span className="erd-node__title">{data.title}</span>
        {!namesOnly && data.subtitle && <span className="erd-node__sub">{data.subtitle}</span>}
        {!namesOnly && data.auditHidden > 0 && (
          <span className="erd-node__audit" data-testid={`erd-audit-badge-${id}`} title={`감사 컬럼 ${data.auditHidden}개 숨김`}>
            감사 {data.auditHidden}
          </span>
        )}
        {!namesOnly && data.violations > 0 && (
          <span className="erd-node__warn" title={`표준 위반 ${data.violations}건`}>
            {data.violations}
          </span>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="erd-col" data-tone={r.tone ?? undefined} data-testid={`erd-col-${r.id}`}>
          <span className="erd-col__key" data-key={r.key || undefined}>
            {r.key}
          </span>
          <span className="erd-col__name">
            {r.name}
            {r.nameSub && <span className="erd-col__name-sub">{r.nameSub}</span>}
          </span>
          <span className="erd-col__sub">{r.sub}</span>
          <Handles list={r.handles} />
        </div>
      ))}
      {!namesOnly && data.hiddenCount > 0 && <div className="erd-node__more">접힘 · 컬럼 {data.hiddenCount}개 숨김</div>}
    </div>
  );
});
