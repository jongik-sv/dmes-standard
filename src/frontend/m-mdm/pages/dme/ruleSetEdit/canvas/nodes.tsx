"use client";

/**
 * 캔버스 노드 8종(2단계 계획 Task 9, 4단계 빈 단계 더함) — 시작·끝(TerminalNode)·룰·IF·병렬·합류·메모·그룹. 표시만 하고 상태를 갖지 않는다.
 * testid·data-state 는 노드 루트 요소에 둔다. 한 변 색 바는 쓰지 않는다(Local-Rules §8) — 선택·실행·오류는 전체 테두리·배경·배지로 보인다.
 *
 * 연결점(추가 Task C1, Ruling 28) — 세 가지를 둔다. 모두 `handlesOf` 에도 같은 id·종류·자리로 적는다(React Flow 는 노드 객체가 바뀔 때마다
 * `node.handles` 로 연결점 목록을 다시 만들고, 끌기를 시작한 손잡이를 id 로 찾으므로 목록에 없으면 연결이 시작되지 않는다).
 * - 그리기 연결점 `in`(위 가운데)·`out`(아래 가운데): 선은 늘 출발 노드 `out` → 도착 노드 `in` 으로 그린다(캔버스가 선 객체에 이 id 를 준다 — 저장하지 않는다).
 *   보이지 않고 누름을 받지 않는다(연결 시작 불가).
 * - 잇기 손잡이 `top`·`right`·`bottom`·`left`(편집 모드만, END 제외): 네 변 가운데. 노드에 마우스를 올리면 보이고 어느 것을 끌어도 그 노드에서 나가는 선이다.
 * - 몸통 받기 `body`(편집 모드만, START 제외): 노드 전체를 덮는 투명 target. 평소에는 누름을 받지 않고(노드 끌기·누르기·우클릭이 그대로) 연결을 끄는 동안에만
 *   받는다(React Flow 가 붙이는 `connectionindicator` 클래스) — 몸통 어디에 놓아도 이어진다.
 */
import { useContext, useRef, useState, type MouseEvent } from "react";

import { IconExternalLink, IconPencil } from "@tabler/icons-react";

import type { FlowNode } from "@/contract/engine-contract.generated";

import { TASK_LABEL, type FlowNote } from "../flow-edit";
import { NODE_SIZE } from "../flow-layout";
import type { RuleIo, VarDisplay } from "../types";
import { GROUP_GRIPS, GroupSizeContext, type GroupGrip } from "./group-size";
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
  /** 표시 토글(끔·ID·이름) — 룰 노드 제목이 따른다(추가 Task V2). */
  varDisplay: VarDisplay;
  /** 편집 모드 — 네 변 잇기 손잡이와 몸통 받기를 그린다(추가 Task C1). */
  linkable: boolean;
  /** 룰 목록 줄을 끄는 동안 이 노드 위에 있다(4단계 T1) — 놓으면 룰 지정. */
  dropTarget: boolean;
  /** 빈 단계 제목 고치기(편집 모드만, 4단계 T1). 없으면 두 번 눌러도 칸이 열리지 않는다. */
  onRenameTask?: (nodeId: string, label: string | null) => void;
};
export type NoteNodeData = { note: FlowNote; selected: boolean; editable: boolean; onChange: (id: string, patch: Partial<FlowNote>) => void };
export type GroupNodeData = { id: string; title: string; selected: boolean; /** 편집 모드이고 고른 그룹 — 네 모서리·네 변 크기 손잡이(G2). */ resizable: boolean };

type FlowRfNode = Node<FlowNodeData, "rsfFlow">;
type NoteRfNode = Node<NoteNodeData, "rsfNote">;
type GroupRfNode = Node<GroupNodeData, "rsfGroup">;

const KIND_CLASS: Record<string, string> = {
  START: "rsf-terminal",
  END: "rsf-terminal",
  RULE: "rsf-rule",
  TASK: "rsf-task",
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
  const { node, io, mark, onOpenRule, varDisplay } = data;
  const ruleId = node.ruleId ?? "";
  const missing = !io || !io.exists;
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenRule(ruleId);
  };
  // ID 모드: 제목=룰 ID, 작은 줄=룰명(없으면 생략). 그 밖·없는 룰은 제목=룰명(없으면 ID), 작은 줄=ID.
  const idMode = !missing && varDisplay === "id";
  const title = missing ? "(없는 룰)" : idMode ? ruleId : (io.ruleName ?? ruleId);
  const small = idMode ? (io.ruleName ?? "") : ruleId;
  return (
    <>
      <div className="rsf-title">{title}</div>
      <div className="rsf-sub">{missing ? "룰 정보를 찾지 못했다" : [io.ruleKind, io.hitPolicy].filter(Boolean).join(" · ")}</div>
      {small !== "" && <div className="rsf-id">{small}</div>}
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

/**
 * 빈 단계(4단계 T1) — 점선 테두리(`rsf-task`), 제목만. 편집 모드면 제목을 두 번 눌러 고친다(Enter·칸 밖 누르기 = 저장, Esc = 취소).
 * 조건식 즉석 편집(B10)과 같은 두 번 누르기 방식이다(메모는 글 칸이 늘 열려 있어 따로 제목 고치기가 없다).
 * 제목 줄에 `nopan` 을 달아 두 번 누르기가 화면 확대(React Flow zoomOnDoubleClick)로 새지 않게 한다. 노드 끌기는 그대로다(`nodrag` 없음).
 */
function TaskBody({ data }: { data: FlowNodeData }) {
  const { node, mark, onRenameTask } = data;
  const title = node.label ?? TASK_LABEL;
  const [draft, setDraft] = useState<string | null>(null);
  /** 칸이 열려 있는가 — Enter 로 닫은 뒤 칸이 빠지며 오는 blur 가 한 번 더 저장하지 않게 ref 로 막는다. */
  const editingRef = useRef(false);
  const open = () => {
    editingRef.current = true;
    setDraft(title);
  };
  /**
   * 칸을 닫는다. Enter·Esc(`from` 을 넘김)면 초점을 캔버스로 돌려 단축키가 이어지게 한다(칸이 빠지면 초점이 body 로 간다, Local-Rules §19).
   * 칸 밖 누르기(blur)는 초점을 훔치지 않는다 — 다른 입력 칸으로 간 초점을 그대로 둔다.
   */
  const close = (save: boolean, from?: Element) => {
    if (!editingRef.current || draft === null) return;
    editingRef.current = false;
    const v = draft.trim();
    setDraft(null);
    if (from) from.closest<HTMLElement>('[data-testid="flow-canvas"]')?.focus({ preventScroll: true });
    if (!save) return;
    const next = v === "" ? null : v;
    // 보이는 제목이 그대로면(라벨 없음 + 기본 제목 그대로 등) 편집을 만들지 않는다.
    if ((next ?? TASK_LABEL) !== title) onRenameTask?.(node.id, next);
  };
  return (
    <>
      {draft !== null ? (
        <input
          className="rsf-task-input nodrag nopan"
          data-testid={`flow-task-title-input-${node.id}`}
          aria-label="빈 단계 제목"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              close(true, e.currentTarget);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(false, e.currentTarget);
            }
          }}
          onBlur={() => close(true)}
        />
      ) : (
        <div
          className="rsf-title nopan"
          data-testid={`flow-task-title-${node.id}`}
          title={onRenameTask ? "두 번 눌러 제목을 고친다" : undefined}
          onDoubleClick={
            onRenameTask
              ? (e: MouseEvent) => {
                  e.stopPropagation();
                  open();
                }
              : undefined
          }
        >
          {title}
        </div>
      )}
      <div className="rsf-sub">빈 단계 — 룰을 지정하면 룰 노드가 된다</div>
      {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
    </>
  );
}

/** 겹침 상태 → 모양 클래스(디버그 커서 겹침 — current 굵은 테두리·next 점선·pending 회색). */
const STATE_CLASS: Partial<Record<string, string>> = { current: "rsf-node-current", next: "rsf-node-next", pending: "rsf-node-pending" };

/**
 * 중단점 점(3단계 E2) — 왼쪽 가장자리 가운데. 디버그 모드(`canBreak`)에서는 눌러 켜고 끄는 단추이고(노드 선택은 바뀌지 않는다),
 * 그 밖 모드에서는 켜진 것만 작은 점으로 보이며 누를 수 없다.
 */
function BreakpointDot({ data }: { data: FlowNodeData }) {
  const { node, breakpoint, canBreak, onToggleBreakpoint } = data;
  if (canBreak) {
    return (
      <button
        type="button"
        className="rsf-bp nodrag nopan"
        data-testid={`flow-bp-${node.id}`}
        data-on={breakpoint ? "true" : "false"}
        aria-label="중단점"
        aria-pressed={breakpoint}
        title={breakpoint ? "중단점 끄기" : "중단점 켜기"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleBreakpoint(node.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }
  if (!breakpoint) return null;
  return <span className="rsf-bp rsf-bp-static" data-testid={`flow-bp-${node.id}`} data-on="true" aria-label="중단점" title="중단점" />;
}

/** 접힌 분기 블록 본문(D16) — 안쪽 노드 수, 디버그 기록이 있으면 실행된 안쪽 수, 안쪽 오류는 빨간 테두리. */
function CollapsedBody({ data, info }: { data: FlowNodeData; info: CollapsedBlockInfo }) {
  const { node, overlay } = data;
  const kindText = node.kind === "PARALLEL" ? "병렬" : "IF 조건";
  return (
    <div className="rsf-collapsed-wrap">
      <span className="rsf-collapsed" data-testid={`flow-collapsed-${node.id}`} data-error={info.error ? "true" : "false"}>
        {`${kindText} · 노드 ${info.count}개`}
      </span>
      {overlay && (
        <span className="rsf-collapsed-ran" data-testid={`flow-collapsed-ran-${node.id}`}>{`안쪽 실행 ${info.ran}개`}</span>
      )}
    </div>
  );
}

/** 그리기 연결점 id — 선은 출발 노드 `out` → 도착 노드 `in` 으로 그린다(C1). */
export const ANCHOR_IN = "in";
export const ANCHOR_OUT = "out";
/** 몸통 받기 연결점 id(C1). */
export const BODY_HANDLE = "body";
/** 네 변 잇기 손잡이 — id = 변 이름. testid `flow-handle-{nodeId}-{변}`. */
export const LINK_SIDES = ["top", "right", "bottom", "left"] as const;
const SIDE_POSITION: Record<(typeof LINK_SIDES)[number], Position> = {
  top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left,
};
/** 그리기 연결점 한 변(px) — 선 끝은 이 점의 바깥 가장자리다(2단계와 같은 값). */
const ANCHOR_PX = 8;
/** 잇기 손잡이 지름(px) — `styles/connect.ts` 와 같은 값. */
export const LINK_HANDLE_PX = 10;

/** 편집 모드 잇기 손잡이·몸통 받기(C1). START 는 들어오는 선이 없어 몸통 받기가 없고, END 는 나가는 선이 없어 잇기 손잡이가 없다. */
function LinkHandles({ node, isConnectable }: { node: FlowNode; isConnectable: boolean }) {
  return (
    <>
      {node.kind !== "START" && (
        <Handle
          id={BODY_HANDLE}
          type="target"
          position={Position.Top}
          className="rsf-drop"
          isConnectable={isConnectable}
          isConnectableStart={false}
          data-testid={`flow-drop-${node.id}`}
        />
      )}
      {node.kind !== "END" &&
        LINK_SIDES.map((side) => (
          <Handle
            key={side}
            id={side}
            type="source"
            position={SIDE_POSITION[side]}
            className="rsf-link"
            isConnectable={isConnectable}
            data-testid={`flow-handle-${node.id}-${side}`}
            title="끌어서 다른 노드에 놓으면 선을 잇는다"
          />
        ))}
    </>
  );
}

/** 값 고친 지점 표시(4단계 E4) — 디버그 겹침 `overlay.edited` 가 있을 때 오른쪽 아래 작은 원. */
export const EDITED_NODE_TITLE = "이 노드 직전에 값을 고쳤다";

/** 시작·끝·룰·IF·병렬·합류 — 모양은 kind 로 갈린다. */
export function FlowNodeView({ data, isConnectable }: NodeProps<FlowRfNode>) {
  const { node, overlay, selected, flash, mark, collapsed } = data;
  const kind = node.kind;
  const stateCls = overlay ? STATE_CLASS[overlay.state] : undefined;
  const cls = `rsf-node ${collapsed ? "rsf-block" : KIND_CLASS[kind]}${stateCls ? ` ${stateCls}` : ""}${flash ? " rsf-flash" : ""}${data.dropTarget ? " rsf-node-drop" : ""}`;
  return (
    <div className={cls} data-testid={`flow-node-${node.id}`} data-state={overlay?.state ?? "idle"} data-selected={selected ? "true" : "false"} data-kind={kind}>
      {kind !== "START" && <Handle id={ANCHOR_IN} type="target" position={Position.Top} className="rsf-anchor" isConnectableStart={false} />}
      <BreakpointDot data={data} />
      {collapsed && <CollapsedBody data={data} info={collapsed} />}
      {collapsed && mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
      {!collapsed && kind === "START" && <span>시작</span>}
      {!collapsed && kind === "END" && <span>끝</span>}
      {!collapsed && kind === "RULE" && <RuleBody data={data} />}
      {!collapsed && kind === "TASK" && <TaskBody data={data} />}
      {!collapsed && kind === "IF" && (
        <>
          <span className="rsf-diamond" aria-hidden="true" />
          <span className="rsf-title">{node.label ?? "조건"}</span>
          {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
        </>
      )}
      {!collapsed && kind === "PARALLEL" && (
        <>
          <span className="rsf-par-label">{node.label ?? "병렬"}</span>
          {mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
        </>
      )}
      {!collapsed && kind === "MERGE" && mark && <span className="rsf-mark" data-severity={mark} data-testid={`flow-node-mark-${node.id}`} />}
      <Badges id={node.id} overlay={overlay} />
      {overlay?.edited && (
        <span className="rsf-edited" data-testid={`flow-node-edited-${node.id}`} title={EDITED_NODE_TITLE} aria-label={EDITED_NODE_TITLE}>
          <IconPencil size={10} aria-hidden="true" />
        </span>
      )}
      {kind !== "END" && <Handle id={ANCHOR_OUT} type="source" position={Position.Bottom} className="rsf-anchor" isConnectableStart={false} />}
      {data.linkable && <LinkHandles node={node} isConnectable={isConnectable} />}
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

/** 크기 손잡이 이름(aria-label). */
const GRIP_LABEL: Record<GroupGrip, string> = {
  nw: "왼쪽 위 모서리", n: "위 변", ne: "오른쪽 위 모서리", e: "오른쪽 변", se: "오른쪽 아래 모서리", s: "아래 변", sw: "왼쪽 아래 모서리", w: "왼쪽 변",
};

export function GroupNodeView({ data }: NodeProps<GroupRfNode>) {
  const size = useContext(GroupSizeContext);
  return (
    <div className="rsf-group" data-testid={`flow-group-${data.id}`} data-selected={data.selected ? "true" : "false"}>
      <span className="rsf-group-title">{data.title}</span>
      {data.resizable &&
        size &&
        GROUP_GRIPS.map((g) => (
          <span
            key={g}
            className="rsf-group-grip nodrag nopan"
            role="button"
            data-grip={g}
            data-testid={`flow-group-grip-${data.id}-${g}`}
            aria-label={`그룹 크기 — ${GRIP_LABEL[g]}`}
            title="끌어 그룹 크기를 바꾼다"
            onPointerDown={(e) => size.startDrag(e, data.id, g)}
          />
        ))}
    </div>
  );
}

export const NODE_TYPES: NodeTypes = { rsfFlow: FlowNodeView, rsfNote: NoteNodeView, rsfGroup: GroupNodeView };

/**
 * 노드에 넘기는 연결점 목록 — React Flow 가 측정 없이 연결점 위치를 알고(테스트 환경에서도 선이 그려진다), 끌기를 시작한 손잡이를 id 로 찾는다.
 * 그리는 연결점(`FlowNodeView`)과 id·종류·자리가 같아야 한다(C1). 잇기 손잡이·몸통 받기는 편집 모드에서만 그리지만 목록에는 늘 둔다
 * (없는 요소는 누를 수 없으니 해가 없고, 모드가 바뀔 때 목록을 다시 맞추지 않아도 된다).
 */
export function handlesOf(kind: FlowNode["kind"]): NonNullable<Node["handles"]> {
  const { w, h } = NODE_SIZE[kind];
  const s = ANCHOR_PX;
  const g = LINK_HANDLE_PX;
  const into = { id: ANCHOR_IN, type: "target" as const, position: Position.Top, x: w / 2 - s / 2, y: -s / 2, width: s, height: s };
  const out = { id: ANCHOR_OUT, type: "source" as const, position: Position.Bottom, x: w / 2 - s / 2, y: h - s / 2, width: s, height: s };
  const body = { id: BODY_HANDLE, type: "target" as const, position: Position.Top, x: 0, y: 0, width: w, height: h };
  const side = (id: (typeof LINK_SIDES)[number], x: number, y: number) =>
    ({ id, type: "source" as const, position: SIDE_POSITION[id], x: x - g / 2, y: y - g / 2, width: g, height: g });
  const sides = [side("top", w / 2, 0), side("right", w, h / 2), side("bottom", w / 2, h), side("left", 0, h / 2)];
  if (kind === "START") return [out, ...sides];
  if (kind === "END") return [into, body];
  return [into, body, out, ...sides];
}
