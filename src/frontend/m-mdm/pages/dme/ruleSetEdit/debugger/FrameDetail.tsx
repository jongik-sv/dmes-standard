"use client";

/**
 * 들어간 하위 프레임의 오른쪽(하위 세트 spec §11, 계획 Task 9) — 변수 패널(값 고치기 E4·조사식·식 평가) 대신 프레임 상태 한 줄과 고른 노드의 기록 상세만 보인다.
 * 상태 줄은 디버그 툴바와 같은 문구(`debugStatus` — 끝내는 IF 갈래로 끝난 하위 기록이면 "IF {제목}의 「{갈래}」 갈래에서 끝냈다" 를 붙인다)를 프레임 커서로 만든다.
 * 노드 상세는 프레임 커서 앞에서 실행된 노드만 보이고(P-D13), 하위 흐름 안의 SET 노드는 다시 [안으로 들어가기]를 쓴다.
 */
import { useMemo } from "react";

import { debugStatus, endedBranchText } from "./debug-model";
import { NodeDescNote, TraceDetail } from "./TraceDetail";
import { NOT_RUN_NOTE } from "./VariablePanel";
import type { CallFrame } from "./call-stack";
import type { CalledFlow } from "../types";

export interface FrameDetailProps {
  frame: CallFrame;
  selectedId: string | null;
  /** 실행 응답의 하위 세트 흐름 — 손주 세트로 다시 들어갈 수 있는지 본다. */
  calledFlows: Readonly<Record<string, CalledFlow | undefined>>;
  onOpenRule(ruleId: string): void;
  onEnter(nodeId: string): void;
}

export const FRAME_PICK_NOTE = "하위 세트 노드를 고르면 실행 기록이 보인다";

export function FrameDetail({ frame, selectedId, calledFlows, onOpenRule, onEnter }: FrameDetailProps) {
  const status = useMemo(() => debugStatus(frame.trace, frame.cursor, 0, frame.flow), [frame]);
  const endedBranch = useMemo(() => endedBranchText(frame.trace, frame.flow), [frame]);
  const flowNode = selectedId ? frame.flow.nodes.find((n) => n.id === selectedId) : undefined;
  const ranIndex = flowNode ? frame.trace.nodes.slice(0, frame.cursor).findIndex((n) => n.nodeId === flowNode.id) : -1;

  return (
    <div className="rsf-var-panel" data-testid="frame-detail">
      <section className="rsf-var-section" aria-label="하위 세트 기록">
        <p className="rsf-dbg-title">{`하위 세트 ${frame.setId}`}</p>
        <p className="rsf-panel-note" data-testid="frame-detail-status" role="status">
          {status}
        </p>
      </section>
      <section className="rsf-var-section" aria-label="노드 상세">
        {!flowNode ? (
          <p className="rsf-panel-note" data-testid="frame-detail-empty">
            {FRAME_PICK_NOTE}
          </p>
        ) : ranIndex >= 0 ? (
          <TraceDetail
            nodeId={flowNode.id}
            node={frame.trace.nodes[ranIndex]}
            flow={frame.flow}
            traceViolations={frame.trace.violations ?? []}
            desc={frame.flow.view.descs?.[flowNode.id]}
            onOpenRule={onOpenRule}
            endedBranch={endedBranch}
            onEnter={onEnter}
            calledFlows={calledFlows}
          />
        ) : (
          <div className="rsf-panel" data-testid="sim-detail">
            <p className="rsf-panel-title">
              {flowNode.label ?? flowNode.id} <code>{flowNode.id}</code>
            </p>
            <NodeDescNote desc={frame.flow.view.descs?.[flowNode.id]} />
            <p className="rsf-panel-note">{NOT_RUN_NOTE}</p>
          </div>
        )}
      </section>
    </div>
  );
}
