"use client";

/**
 * 캔버스 노드 7종(2단계 계획 Task 9) — 시작·끝(TerminalNode)·룰·IF·병렬·합류·메모·그룹. 표시만 하고 상태를 갖지 않는다.
 * testid·data-state 는 노드 루트 요소에 둔다. 한 변 색 바는 쓰지 않는다(Local-Rules §8) — 선택·실행·오류는 전체 테두리·배경·배지로 보인다.
 */
import type { MouseEvent } from "react";

import { IconExternalLink } from "@tabler/icons-react";

import type { FlowNode } from "@/contract/engine-contract.generated";

import type { FlowNote } from "../flow-edit";
import { NODE_SIZE } from "../flow-layout";
import type { RuleIo } from "../types";
import type { NodeOverlay } from "./overlay";
import { Handle, Position, type Node, type NodeProps, type NodeTypes } from "./react-flow";

/** 접힌 블록 요약(3단계 계획 P2·D16) — 안쪽 노드 수·실행된 수·오류 여부. 그리기는 Task 11. */
export interface CollapsedBlockInfo {
  count: number;
  ran: number;
  error: boolean;
}

/** 룰·IF·병렬·합류·시작/끝 노드가 함께 받는 데이터. */
export type FlowNodeData = {
  node: FlowNode;
  io: RuleIo | undefined;
  mark: "REJECT" | "WARN" | undefined;
  overlay: NodeOverlay | undefined;
  selected: boolean;
  flash: boolean;
  onOpenRule: (ruleId: string) => void;
  /** 중단점이 걸렸는가(3단계 E2, 그리기는 Task 11). */
  breakpoint: boolean;
  /** 중단점을 걸 수 있는가 — RULE·IF·PARALLEL·MERGE 이고 디버그 모드. */
  canBreak: boolean;
  /** 접힌 분기면 블록 요약, 아니면 null(3단계 D16, 그리기는 Task 11). */
  collapsed: CollapsedBlockInfo | null;
  onToggleBreakpoint: (nodeId: string) => void;
};
export type NoteNodeData = { note: FlowNote; selected: boolean; editable: boolean; onChange: (id: string, patch: Partial<FlowNote>) => void };
export type GroupNodeData = { id: string; title: string; selected: boolean };

type FlowRfNode = Node<FlowNodeData, "rsfFlow">;
type NoteRfNode = Node<NoteNodeData, "rsfNote">;
type GroupRfNode = Node<GroupNodeData, "rsfGroup">;

const KIND_CLASS: Record<string, string> = {
  START: "rsf-terminal",
  END: "rsf-terminal",
  RULE: "rsf-rule",
  IF: "rsf-if",
  PARALLEL: "rsf-par",
  MERGE: "rsf-merge",
};

function Badges({ id, overlay }: { id: string; overlay: NodeOverlay | undefined }) {
  if (!overlay) return null;
  const showSeq = overlay.seq != null && (overlay.state === "run" || overlay.state === "current" || overlay.state === "error");
  return (
    <>
      {showSeq && <span className="rsf-seq" data-testid={`flow-node-seq-${id}`}>{overlay.seq}</span>}
      {overlay.chip && <span className="rsf-chip" data-testid={`flow-node-chip-${id}`}>{overlay.chip}</span>}
    </>
  );
}

function RuleBody({ data }: { data: FlowNodeData }) {
  const { node, io, mark, onOpenRule } = data;
  const ruleId = node.ruleId ?? "";
  const missing = !io || !io.exists;
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenRule(ruleId);
  };
  return (
    <>
      <div className="rsf-title">{missing ? "(없는 룰)" : (io.ruleName ?? ruleId)}</div>
      <div className="rsf-sub">{missing ? "룰 정보를 찾지 못했다" : [io.ruleKind, io.hitPolicy].filter(Boolean).join(" · ")}</div>
      <div className="rsf-id">{ruleId}</div>
      <button
        type="button"
        className="rsf-open nodrag"
        data-testid={`flow-rule-open-${node.id}`}
        aria-label="룰 편집 열기"
        title="룰 편집 열기"
        onClick={open}
      >
        <IconExternalLink size={12} />
      </button>
      {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} title={mark === "REJECT" ? "거부 검사 있음" : "경고 검사 있음"} />}
    </>
  );
}

/** 시작·끝·룰·IF·병렬·합류 — 모양은 kind 로 갈린다. */
export function FlowNodeView({ data }: NodeProps<FlowRfNode>) {
  const { node, overlay, selected, flash, mark } = data;
  const kind = node.kind;
  const cls = `rsf-node ${KIND_CLASS[kind]}${flash ? " rsf-flash" : ""}`;
  return (
    <div className={cls} data-testid={`flow-node-${node.id}`} data-state={overlay?.state ?? "idle"} data-selected={selected ? "true" : "false"} data-kind={kind}>
      {kind !== "START" && <Handle type="target" position={Position.Top} className="rsf-handle" />}
      {kind === "START" && <span>시작</span>}
      {kind === "END" && <span>끝</span>}
      {kind === "RULE" && <RuleBody data={data} />}
      {kind === "IF" && (
        <>
          <span className="rsf-diamond" aria-hidden="true" />
          <span className="rsf-title">{node.label ?? "조건"}</span>
          {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
        </>
      )}
      {kind === "PARALLEL" && (
        <>
          <span className="rsf-par-label">{node.label ?? "병렬"}</span>
          {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
        </>
      )}
      {kind === "MERGE" && mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
      <Badges id={node.id} overlay={overlay} />
      {kind !== "END" && <Handle type="source" position={Position.Bottom} className="rsf-handle" />}
    </div>
  );
}

export function NoteNodeView({ data }: NodeProps<NoteRfNode>) {
  const { note, selected, editable, onChange } = data;
  return (
    <div className="rsf-note" data-testid={`flow-note-${note.id}`} data-selected={selected ? "true" : "false"}>
      {editable ? (
        <textarea
          className="nodrag nowheel"
          data-testid={`flow-note-text-${note.id}`}
          value={note.text}
          onChange={(e) => onChange(note.id, { text: e.target.value })}
        />
      ) : (
        note.text
      )}
    </div>
  );
}

export function GroupNodeView({ data }: NodeProps<GroupRfNode>) {
  return (
    <div className="rsf-group" data-testid={`flow-group-${data.id}`} data-selected={data.selected ? "true" : "false"}>
      <span className="rsf-group-title">{data.title}</span>
    </div>
  );
}

export const NODE_TYPES: NodeTypes = { rsfFlow: FlowNodeView, rsfNote: NoteNodeView, rsfGroup: GroupNodeView };

/** React Flow 가 측정 없이 연결점 위치를 알도록 노드에 넘기는 핸들 정의(테스트 환경에서도 선이 그려진다). */
export function handlesOf(kind: FlowNode["kind"]): NonNullable<Node["handles"]> {
  const { w, h } = NODE_SIZE[kind];
  const s = 8;
  const target = { type: "target" as const, position: Position.Top, x: w / 2 - s / 2, y: -s / 2, width: s, height: s };
  const source = { type: "source" as const, position: Position.Bottom, x: w / 2 - s / 2, y: h - s / 2, width: s, height: s };
  if (kind === "START") return [source];
  if (kind === "END") return [target];
  return [target, source];
}
