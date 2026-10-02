"use client";

/**
 * 오른쪽 패널 — 노드·메모·그룹을 골랐을 때(2단계 계획 Task 10, P10). 보기 모드에서는 모든 입력이 읽기 전용이고 ▲▼✕·지우기·더하기가 없다.
 *
 * - 룰: 룰명·룰 ID·종류·정책·확정 버전, 입력 변수(출처 배지·어디서 오는지·걸린 검사 문구), 결과 변수, [룰 편집 열기], [지우기].
 * - IF: 분기 이름, 갈래(order 순, "그 외" 마지막)의 이름·조건식·▲▼✕·검사 문구, [갈래 더하기]. 병렬: 갈래 이름·▲▼✕·[갈래 더하기].
 * - 룰·빈 단계: 편집 모드면 「외관」 섹션(S1, NodeStylePanel)
 * - 룰·빈 단계·분기·시작·끝: 「설명」 여러 줄 입력 칸(`view.descs`, 최대 1000자). 보기 모드는 읽기 전용, 입력하는 동안은 되돌리기 한 칸으로 묶는다. 합류는 없다.
 * - 받는 노드: 제목·붙은 룰·CATCH_* 안내, 받을 예외 네 개 체크(같은 룰의 다른 받는 노드가 받는 종류는 꺼짐)·CATCH_NEVER 경고, [지우기]. 설명 칸은 없다.
 * - 합류·시작·끝: 종류 설명. 메모: 글(마크다운 — 편집 모드면 처음부터 서식 편집기, 보기 모드면 읽기 모습. shared MarkdownField fill). 그룹: 제목.
 * 갈래는 머리행 있는 표가 아니라 칸 묶음으로 쌓는다(입력 요소를 그리드 칸에 두지 않는다, Local-Rules §12).
 * 4단계 Task 8: 머리글(이름)은 `SidePanel`, 각 소제목은 접는 섹션(`Section`) — testid 는 그대로.
 */
import { useMemo } from "react";

import { IconArrowDown, IconArrowUp, IconExternalLink, IconGripVertical, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

import type { CatchKind, FlowEdge, FlowNode } from "@/contract/engine-contract.generated";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Button, Checkbox, Input, Textarea } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";
import { badgeStyle, fmtVer } from "@/shell";

import { SOURCE_LABEL, SOURCE_TONE, typeText } from "../cards/SetIoTables";
import {
  addBranch,
  moveBranch,
  removeBranch,
  removeGroup,
  removeNode,
  removeNote,
  reorderBranches,
  setCatchKinds,
  TASK_LABEL,
  updateEdge,
  updateGroup,
  updateNodeDesc,
  updateNodeLabel,
  updateNote,
  type EditFlow,
  type EditResult,
} from "../flow-edit";
import { CATCH_KIND_LABEL, catchTitle } from "../catch-text";
import { storeKeys } from "../debugger/local-store";
import { MAX_DESC } from "../node-desc";
import { restyleNode, type NodeLayoutSource } from "../flow-layout";
import { CATCH_KINDS, catchesOf, endingBranches, parseFlow, type FlowTree } from "../flow-model";
import type { NodeStylePatch } from "../node-style";
import type { IoName, RuleIo, RuleIoMap, RuleSetCheck } from "../types";
import { CheckBadge } from "./ChecksPanel";
import type { PanelKind } from "./PanelHeader";
import { NodeStylePanel } from "./NodeStylePanel";
import { Section, type SectionMemory } from "./Section";

export interface PropertyPanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  selectedId: string;
  /** 캔버스 다중 선택(흐름 노드 ID) — 그룹 [선택 노드 더하기] 가 쓴다. */
  selectedNodeIds?: readonly string[];
  /** 편집 모드 — 입력·▲▼✕·지우기를 켠다. */
  editable: boolean;
  /** 편집 모드(불러오는 동안에도 true) — 「외관」 섹션을 보인다. editable 은 불러오는 동안 false 라 섹션을 감추면 깜빡인다(계획 Ruling 13). */
  editing?: boolean;
  /** 외관 크기를 바꿀 때 그때 그린 위치(S-D6) — page 가 캔버스의 정렬 출처에서 만든다. 없으면 위치를 적지 않는다. */
  layoutSource?: () => NodeLayoutSource | null;
  onEdit: (fn: (f: EditFlow) => EditResult | EditFlow, opts?: { mergeKey?: string }) => string | null;
  onOpenRule: (ruleId: string) => void;
  /** 섹션 펼침 기억(종류별, 화면 메모리). */
  sections: SectionMemory;
}

const KIND_TEXT: Record<FlowNode["kind"], string> = {
  START: "시작 — 세트를 부르면 여기서 시작한다. 지울 수 없다",
  END: "끝 — 여기까지 오면 모은 결과 변수를 돌려준다. 지울 수 없다",
  RULE: "룰",
  TASK: "빈 단계 — 입력·출력 없이 지나간다. 룰을 지정하면 룰 노드가 된다",
  IF: "IF 분기",
  PARALLEL: "병렬 분기",
  MERGE: "병렬 합류",
  CATCH: "받는 노드 — 붙은 룰이 실패하거나 결과가 없을 때 처리 갈래를 실행한다",
};

const blankToNull = (v: string) => (v === "" ? null : v);

/** ids 에서 from 을 빼 to 자리(to 의 원래 위치)에 넣는다. from·to 가 같거나 없으면 그대로. */
export function movedOrder(ids: readonly string[], from: string, to: string): string[] {
  const i = ids.indexOf(from);
  const j = ids.indexOf(to);
  if (i < 0 || j < 0 || i === j) return [...ids];
  const out = ids.filter((x) => x !== from);
  out.splice(j, 0, from);
  return out;
}

function CheckLines({ checks }: { checks: readonly RuleSetCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="rsf-prop-checks">
      {checks.map((c, i) => (
        <p key={i} title={c.code} style={{ color: c.severity === "REJECT" ? "var(--color-danger)" : "var(--color-warning)" }}>
          <CheckBadge check={c} /> {c.message}
        </p>
      ))}
    </div>
  );
}

/** 노드 설명 입력 칸 — 편집은 노드 제목 고치기처럼 입력하는 동안 mergeKey 로 한 칸에 묶는다. 보기 모드(editable 거짓)는 읽기 전용. */
function DescField({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, editable, onEdit } = props;
  return (
    <Textarea
      data-testid="flow-prop-desc"
      value={flow.view.descs?.[node.id] ?? ""}
      rows={3}
      maxLength={MAX_DESC}
      readOnly={!editable}
      placeholder={editable ? "이 노드가 하는 일을 적는다" : ""}
      aria-label="노드 설명"
      onChange={(v) => onEdit((f) => updateNodeDesc(f, node.id, v), { mergeKey: `ndesc:${node.id}` })}
    />
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button data-testid="flow-prop-delete" variant="danger" size="sm" onClick={onClick}>
      <IconTrash size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
      지우기
    </Button>
  );
}

/** 입력 변수가 어디서 오는가 — 같은 경로 앞쪽 룰이 만들면 그 룰 ID, 아니면 출처(컬럼 사전·프로그램 변수·어디에도 없음). */
function originOf(tree: FlowTree | null, rules: RuleIoMap, nodeId: string, v: IoName): string {
  if (tree) {
    const makers = tree
      .ruleSteps()
      .filter((s) => s.nodeId !== nodeId && tree.relation(s.nodeId, nodeId) === "BEFORE")
      .filter((s) => (rules[s.ruleId]?.results ?? []).some((r) => r.name === v.name))
      .map((s) => s.ruleId);
    if (makers.length > 0) return `앞 룰 ${[...new Set(makers)].join(", ")}의 결과`;
  }
  if (v.source === "DICT") return "컬럼 사전";
  if (v.source === "PROG") return "프로그램 변수";
  return "어디에도 없음";
}

function RuleProps({ node, io, tree, props }: { node: FlowNode; io: RuleIo | undefined; tree: FlowTree | null; props: PropertyPanelProps }) {
  const { checks, editable, onEdit, onOpenRule, rules, sections } = props;
  const ruleId = node.ruleId ?? "";
  const missing = !io || !io.exists;
  const mine = checks.filter((c) => c.nodeId === node.id);
  return (
    <div className="rsf-panel" data-testid="flow-prop-rule">
      <Section kind="RULE" id="rule-basic" title="룰 정보" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>이름</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-rule-label"
                  value={node.label ?? ""}
                  placeholder={missing ? ruleId : (io.ruleName ?? ruleId)}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>설명</th>
              <td style={DETAIL_VALUE_CELL}>
                <DescField node={node} props={props} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>룰 ID</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{ruleId}</code> <span className="rsf-muted">{`(노드 ${node.id})`}</span>
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>종류·정책</th>
              <td style={DETAIL_VALUE_CELL}>{missing ? "-" : [io.ruleKind ?? "-", io.hitPolicy ?? "-"].join(" · ")}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>확정 버전</th>
              <td style={DETAIL_VALUE_CELL}>
                {missing ? "-" : io.releasedVer != null ? fmtVer(io.releasedVer) : <span style={badgeStyle("warning")}>RELEASED 없음</span>}
                {!missing && io.status && <span style={{ ...badgeStyle("neutral"), marginLeft: 4 }}>{io.status}</span>}
              </td>
            </tr>
          </tbody>
        </table>
        <CheckLines checks={mine.filter((c) => !c.varName)} />
        <div className="rsf-panel-actions">
          <Button data-testid="flow-prop-rule-open" size="sm" disabled={!ruleId} onClick={() => onOpenRule(ruleId)}>
            <IconExternalLink size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
            룰 편집 열기
          </Button>
          {editable && <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />}
        </div>
      </Section>

      <Section kind="RULE" id="rule-inputs" title={`입력 변수 ${(io?.conds ?? []).length}개`} memory={sections}>
        {(io?.conds ?? []).length === 0 ? (
          <p className="rsf-muted">없음</p>
        ) : (
          <ul className="rsf-vars">
            {(io?.conds ?? []).map((v) => (
              <li key={v.name} data-testid={`flow-prop-input-${v.name}`}>
                <div className="rsf-var-row">
                  <code>{v.name}</code>
                  {v.source && <span style={badgeStyle(SOURCE_TONE[v.source])}>{SOURCE_LABEL[v.source]}</span>}
                  <span className="rsf-muted">{typeText(v)}</span>
                </div>
                <div className="rsf-var-origin">{`← ${originOf(tree, rules, node.id, v)}`}</div>
                <CheckLines checks={mine.filter((c) => c.varName === v.name)} />
              </li>
            ))}
          </ul>
        )}

      </Section>

      <Section kind="RULE" id="rule-results" title={`결과 변수 ${(io?.results ?? []).length}개`} memory={sections}>
        {(io?.results ?? []).length === 0 ? (
          <p className="rsf-muted">없음</p>
        ) : (
          <ul className="rsf-vars">
            {(io?.results ?? []).map((v) => (
              <li key={v.name} data-testid={`flow-prop-result-${v.name}`}>
                <div className="rsf-var-row">
                  <code>{v.name}</code>
                  <span className="rsf-muted">{typeText(v)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <StyleSection node={node} props={props} />
    </div>
  );
}

/** 갈래 선 — IF 는 order 순 뒤 "그 외", 병렬은 order 순. */
function branchesOf(flow: EditFlow, splitId: string): FlowEdge[] {
  const outs = flow.edges.filter((e) => e.from === splitId);
  const key = (e: FlowEdge) => (e.otherwise ? Number.POSITIVE_INFINITY : (e.order ?? Number.MAX_SAFE_INTEGER));
  return [...outs].sort((a, b) => key(a) - key(b));
}

/** 「외관」 섹션(S1 §3) — 편집 모드의 룰·빈 단계에서만. 조작 하나 = 편집 한 번(restyleNode — 크기가 바뀌면 그린 위치 전부 고정). */
function StyleSection({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, editing, editable, onEdit, layoutSource, sections } = props;
  if (!editing) return null;
  const change = (patch: NodeStylePatch | null) => {
    const src = layoutSource?.() ?? null;
    onEdit((f) => restyleNode(f, node.id, patch, src?.drawn ?? {}, src?.blocks ?? {}));
  };
  return (
    <Section kind={node.kind as PanelKind} id="node-style" title="외관" memory={sections}>
      <NodeStylePanel node={node} style={flow.view.styles?.[node.id]} disabled={!editable} onChange={change} />
    </Section>
  );
}

/** 빈 단계(4단계 T1) — 제목·노드 ID·설명·검사 문구·[지우기]. 룰은 위 「룰 지정」 섹션에서 고른다. */
function TaskProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { checks, editable, onEdit, sections } = props;
  return (
    <div className="rsf-panel" data-testid="flow-prop-task">
      <Section kind="TASK" id="task-basic" title="빈 단계" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>제목</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-task-title"
                  value={node.label ?? ""}
                  placeholder={TASK_LABEL}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>설명</th>
              <td style={DETAIL_VALUE_CELL}>
                <DescField node={node} props={props} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>노드 ID</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{node.id}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note">
          실행 때 아무것도 읽거나 만들지 않고 지나간다(디버거는 한 단계로 멈춘다). 「룰 지정」 에서 룰을 고르면 같은 자리의 룰 노드가 된다
        </p>
        <CheckLines checks={checks.filter((c) => c.nodeId === node.id)} />
        {editable && (
          <div className="rsf-panel-actions">
            <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />
          </div>
        )}
      </Section>
      <StyleSection node={node} props={props} />
    </div>
  );
}

function SplitProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, checks, editable, onEdit, sections } = props;
  const kind: PanelKind = node.kind === "IF" ? "IF" : "PARALLEL";
  const isIf = node.kind === "IF";
  const branches = branchesOf(flow, node.id);
  const ordered = branches.filter((e) => !e.otherwise);
  const ending = new Set(isIf ? (endingBranches(flow, node.id) ?? []) : []);
  const endId = flow.nodes.find((n) => n.kind === "END")?.id;
  /** 몸 있는 끝내는 갈래가 있을 때만 안내한다(R21 — END 앞에 끼운 IF 의 END 직행 「그 외」 는 고칠 것이 없다). */
  const endingHelp = [...ending].some((id) => flow.edges.find((x) => x.id === id)?.to !== endId);
  const nodeChecks = checks.filter((c) => c.nodeId === node.id && !c.edgeId);

  const handleDrop = (toEdgeId: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editable) return;
    const fromEdgeId = e.dataTransfer.getData("application/x-rsf-branch");
    // "그 외" 줄에 놓으면 마지막 조건 갈래 자리로 본다
    const toId = branches.find((x) => x.id === toEdgeId)?.otherwise ? ordered[ordered.length - 1]?.id : toEdgeId;
    if (fromEdgeId && toId && fromEdgeId !== toId) {
      const orderIds = ordered.map((x) => x.id);
      onEdit((f) => reorderBranches(f, node.id, movedOrder(orderIds, fromEdgeId, toId)));
    }
  };

  return (
    <div className="rsf-panel" data-testid={isIf ? "flow-prop-if" : "flow-prop-par"}>
      <Section kind={kind} id="split-basic" title="분기" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>분기 이름</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-label"
                  value={node.label ?? ""}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>설명</th>
              <td style={DETAIL_VALUE_CELL}>
                <DescField node={node} props={props} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note rsf-muted">
          {isIf
            ? "갈래는 위에서부터 조건식을 차례로 보고 처음 참인 갈래 하나만 탄다. 모두 거짓이면 \"그 외\" 로 간다"
            : "갈래는 분기 직전 값의 사본에서 위에서부터 차례로 돌고, 합류에서 갈래 순서대로 결과를 덮어쓴다"}
        </p>
        <CheckLines checks={nodeChecks} />
        {editable && (
          <div className="rsf-panel-actions">
            <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />
          </div>
        )}
      </Section>

      <Section kind={kind} id="split-branches" title={`갈래 ${branches.length}개`} memory={sections}>
        <div className="rsf-branches">
          {branches.map((e) => {
            const i = ordered.indexOf(e);
            const edgeChecks = checks.filter((c) => c.edgeId === e.id);
            const other = isIf && e.otherwise;
            return (
              <div
                key={e.id}
                className="rsf-branch-box"
                data-testid={`flow-prop-branch-${e.id}`}
                onDragOver={editable ? (ev) => ev.preventDefault() : undefined}
                onDrop={editable ? handleDrop(e.id) : undefined}
              >
                <div className="rsf-branch-head">
                  {editable && !other && (
                    <div
                      draggable
                      className="rsf-branch-grip"
                      data-testid={`flow-prop-branch-${e.id}-handle`}
                      aria-label="갈래 순서 끌기"
                      onDragStart={(ev) => ev.dataTransfer.setData("application/x-rsf-branch", e.id)}
                    >
                      <IconGripVertical size={14} aria-hidden="true" />
                    </div>
                  )}
                  <Input
                    data-testid={`flow-prop-branch-${e.id}-label`}
                    value={e.label ?? (other ? "그 외" : "")}
                    readOnly={!editable}
                    aria-label="갈래 이름"
                    style={{ flex: 1, minWidth: 0 }}
                    onChange={(v) => onEdit((f) => updateEdge(f, e.id, { label: blankToNull(v) }), { mergeKey: `elabel:${e.id}` })}
                  />
                  {ending.has(e.id) && (
                    <span data-testid={`flow-prop-branch-${e.id}-ending`} style={badgeStyle("neutral")} title="이 갈래를 타면 세트를 여기서 끝낸다">
                      끝냄
                    </span>
                  )}
                  {editable && !other && (
                    <>
                      <Button
                        size="mini"
                        data-testid={`flow-prop-branch-${e.id}-up`}
                        ariaLabel="갈래 위로"
                        disabled={i <= 0}
                        onClick={() => onEdit((f) => moveBranch(f, node.id, e.id, -1))}
                      >
                        <IconArrowUp size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        size="mini"
                        data-testid={`flow-prop-branch-${e.id}-down`}
                        ariaLabel="갈래 아래로"
                        disabled={i < 0 || i >= ordered.length - 1}
                        onClick={() => onEdit((f) => moveBranch(f, node.id, e.id, 1))}
                      >
                        <IconArrowDown size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        size="mini"
                        data-testid={`flow-prop-branch-${e.id}-remove`}
                        ariaLabel="갈래 지우기"
                        onClick={() => onEdit((f) => removeBranch(f, node.id, e.id))}
                      >
                        <IconX size={12} aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
                {isIf &&
                  (other ? (
                    <p className="rsf-muted rsf-branch-else">위 갈래가 모두 거짓이면 이 갈래로 간다(조건식 없음)</p>
                  ) : (
                    <Textarea
                      data-testid={`flow-prop-branch-${e.id}-cond`}
                      value={e.cond ?? ""}
                      rows={2}
                      readOnly={!editable}
                      placeholder='조건식 예: S_GRD = "A"'
                      aria-label="조건식"
                      onChange={(v) => onEdit((f) => updateEdge(f, e.id, { cond: v }), { mergeKey: `cond:${e.id}` })}
                    />
                  ))}
                <CheckLines checks={edgeChecks} />
              </div>
            );
          })}
        </div>
        {isIf && endingHelp && (
          <p className="rsf-panel-note rsf-muted" data-testid="flow-prop-if-ending-help">
            흐름을 이어 갈 갈래는 「그 외」로 둔다. 끝낼 갈래는 조건 갈래로 두고 끝 노드로 잇는다.
          </p>
        )}

        {editable && (
          <div className="rsf-panel-actions">
            <Button data-testid="flow-prop-add-branch" size="sm" onClick={() => onEdit((f) => addBranch(f, node.id))}>
              <IconPlus size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
              갈래 더하기
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

/** 받는 노드(받는 노드 spec §8): 제목·붙은 룰·CATCH_* 안내, 받을 예외 네 개 체크, 종류 옆 CATCH_NEVER 경고, 검사 문구·[지우기]. */
function CatchProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { flow, checks, editable, onEdit, sections } = props;
  const mine = (node.catches ?? []) as CatchKind[];
  const owners = new Map<CatchKind, string>();
  for (const other of node.attachTo ? catchesOf(flow, node.attachTo) : []) {
    if (other.id === node.id) continue;
    for (const k of (other.catches ?? []) as CatchKind[]) owners.set(k, other.id);
  }
  const own = checks.filter((c) => c.nodeId === node.id);
  const host = node.attachTo ? flow.nodes.find((n) => n.id === node.attachTo) : undefined;
  const onTask = host?.kind === "TASK";
  /** 빈 단계에 붙은 받는 노드 경고(implicit-join spec §6) — 종류 이름이 없어 종류 옆이 아니라 섹션 머리에 한 줄씩 보인다(R19). */
  const taskNever = own.filter((c) => c.code === "CATCH_NEVER" && c.ruleId == null);
  // CATCH_NEVER 는 한 코드를 두 종류가 나눠 쓰므로 종류는 문구의 종류 이름으로만 가른다(R12).
  const neverOf = (k: CatchKind) => own.find((c) => c.code === "CATCH_NEVER" && c.message.includes(CATCH_KIND_LABEL[k]));
  return (
    <div className="rsf-panel" data-testid="flow-prop-catch">
      <Section kind="CATCH" id="catch-basic" title="받는 노드" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>제목</th>
              <td style={DETAIL_VALUE_CELL}>
                <Input
                  data-testid="flow-prop-catch-title"
                  value={node.label ?? ""}
                  placeholder={catchTitle({ label: null, catches: node.catches })}
                  readOnly={!editable}
                  onChange={(v) => onEdit((f) => updateNodeLabel(f, node.id, blankToNull(v)), { mergeKey: `nlabel:${node.id}` })}
                />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>{onTask ? "붙은 노드" : "붙은 룰"}</th>
              <td style={DETAIL_VALUE_CELL}>
                <code>{node.attachTo ?? "-"}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note">
          붙은 룰이 받는 예외로 실패하면(결과 없음은 받을 때만) 룰 결과를 쓰지 않고 처리 갈래를 실행한다. 처리 갈래에서 CATCH_KIND·CATCH_RULE·CATCH_CODE·CATCH_MSG 를 읽을 수 있다
        </p>
      </Section>
      <Section kind="CATCH" id="catch-kinds" title="받을 예외" memory={sections}>
        {taskNever.map((c) => (
          <p key={c.message} className="rsf-panel-note" data-testid="flow-prop-catch-never-task" style={badgeStyle("warning")}>
            {c.message}
          </p>
        ))}
        <div className="rsf-catch-kinds">
          {CATCH_KINDS.map((k) => {
            const owner = owners.get(k);
            const never = neverOf(k);
            return (
              <div key={k} className="rsf-catch-kind" data-testid={`flow-prop-catch-kind-${k}`}>
                <Checkbox
                  label={CATCH_KIND_LABEL[k]}
                  aria-label={`${CATCH_KIND_LABEL[k]} 받기`}
                  checked={mine.includes(k)}
                  disabled={!editable || owner != null}
                  onChange={(on) => onEdit((f) => setCatchKinds(f, node.id, on ? [...mine, k] : mine.filter((x) => x !== k)))}
                />
                {owner && <span className="rsf-muted" data-testid={`flow-prop-catch-owner-${k}`}>{`${owner}가 받는다`}</span>}
                {never && (
                  <p className="rsf-panel-note" data-testid={`flow-prop-catch-never-${k}`} style={badgeStyle("warning")}>
                    {never.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <CheckLines checks={own.filter((c) => c.code !== "CATCH_NEVER")} />
        {editable && (
          <div className="rsf-panel-actions">
            <DeleteButton onClick={() => onEdit((f) => removeNode(f, node.id))} />
          </div>
        )}
      </Section>
    </div>
  );
}

function PlainNodeProps({ node, props }: { node: FlowNode; props: PropertyPanelProps }) {
  const { sections } = props;
  const text = node.kind === "MERGE" ? `병렬 합류 — 병렬 ${node.splitId ?? "-"}의 갈래가 모두 끝나면 결과를 갈래 순서대로 합친다. 병렬 분기를 지우면 함께 없어진다` : KIND_TEXT[node.kind];
  return (
    <div className="rsf-panel" data-testid="flow-prop-node">
      <Section kind={node.kind as PanelKind} id="node-basic" title="설명" memory={sections}>
        <p className="rsf-panel-note">{text}</p>
        {node.kind !== "MERGE" && <DescField node={node} props={props} />}
      </Section>
    </div>
  );
}

export function PropertyPanel(props: PropertyPanelProps) {
  const { flow, rules, selectedId, selectedNodeIds = [], editable, onEdit } = props;
  const tree = useMemo(() => parseFlow(flow).tree, [flow]);

  const node = flow.nodes.find((n) => n.id === selectedId);
  if (node) {
    if (node.kind === "TASK") return <TaskProps node={node} props={props} />;
    if (node.kind === "CATCH") return <CatchProps node={node} props={props} />;
    if (node.kind === "RULE") return <RuleProps node={node} io={node.ruleId ? rules[node.ruleId] : undefined} tree={tree} props={props} />;
    if (node.kind === "IF" || node.kind === "PARALLEL") return <SplitProps node={node} props={props} />;
    return <PlainNodeProps node={node} props={props} />;
  }

  const note = flow.view.notes.find((n) => n.id === selectedId);
  if (note) {
    return (
      // 메모 패널은 남은 높이를 모두 쓴다(rsf-panel-fill — styles/note-editor.ts): 편집 칸이 늘고 「지우기」는 맨 아래.
      <div className="rsf-panel rsf-panel-fill" data-testid="flow-prop-note">
        <Section kind="NOTE" id="note-basic" title="메모" memory={props.sections}>
          <MarkdownField
            key={note.id}
            testId="flow-prop-note-text"
            viewTestId="flow-prop-note-view"
            modeStorageKey={storeKeys.noteEditMode}
            fill
            value={note.text}
            editable={editable}
            ariaLabel="메모 글"
            onChange={(v) => onEdit((f) => updateNote(f, note.id, { text: v }), { mergeKey: `note:${note.id}` })}
          />
          {note.attach && <p className="rsf-panel-note rsf-muted">{`노드 ${note.attach} 옆에 붙였다`}</p>}
          {editable && (
            <div className="rsf-panel-actions">
              <DeleteButton onClick={() => onEdit((f) => removeNote(f, note.id))} />
            </div>
          )}
        </Section>
      </div>
    );
  }

  const group = flow.view.groups.find((g) => g.id === selectedId);
  if (group) {
    const kinds = new Map(flow.nodes.map((n) => [n.id, n.kind] as const));
    // 더할 수 있는 선택 노드 — 흐름에 있고 시작·끝이 아니며 아직 그룹에 없는 것.
    const addable = selectedNodeIds.filter((id) => {
      const k = kinds.get(id);
      return !!k && k !== "START" && k !== "END" && !group.nodeIds.includes(id);
    });
    // updateGroup 은 빈 그룹을 남기므로 마지막 노드를 빼면 그룹을 지운다.
    const without = (id: string) => (f: EditFlow) => {
      const g = f.view.groups.find((x) => x.id === group.id);
      if (!g) return f;
      const rest = g.nodeIds.filter((x) => x !== id);
      return rest.length === 0 ? removeGroup(f, group.id) : updateGroup(f, group.id, { nodeIds: rest });
    };
    return (
      <div className="rsf-panel" data-testid="flow-prop-group">
        <Section kind="GROUP" id="group-basic" title="그룹" memory={props.sections}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>제목</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    data-testid="flow-prop-group-title"
                    value={group.title}
                    readOnly={!editable}
                    onChange={(v) => onEdit((f) => updateGroup(f, group.id, { title: v }), { mergeKey: `group:${group.id}` })}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          {editable && (
            <div className="rsf-panel-actions">
              <DeleteButton onClick={() => onEdit((f) => removeGroup(f, group.id))} />
            </div>
          )}
        </Section>
        <Section kind="GROUP" id="group-members" title={`구성 노드 ${group.nodeIds.length}개`} memory={props.sections}>
          <ul className="rsf-vars">
            {group.nodeIds.map((id) => {
              const n = flow.nodes.find((x) => x.id === id);
              return (
                <li key={id} data-testid={`flow-prop-group-member-${id}`}>
                  <div className="rsf-var-row">
                    <code>{id}</code>
                    <span className="rsf-muted">{n ? (n.ruleId ?? n.label ?? n.kind) : "-"}</span>
                    {editable && (
                      <Button
                        size="mini"
                        data-testid={`flow-prop-group-remove-${id}`}
                        ariaLabel={`${id} 를 그룹에서 빼기`}
                        style={{ marginLeft: "auto" }}
                        onClick={() => onEdit(without(id))}
                      >
                        빼기
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="rsf-panel-note rsf-muted">
            그룹은 보기용 묶음이다. 실행 순서에 영향을 주지 않는다.
            {editable && " 캔버스에서 Shift+누르기·Shift+끌기로 노드를 여럿 고른 뒤 [선택 노드 더하기] 로 넣는다"}
          </p>
          {editable && addable.length > 0 && (
            <div className="rsf-panel-actions">
              <Button
                data-testid="flow-prop-group-add"
                size="sm"
                onClick={() => onEdit((f) => updateGroup(f, group.id, { nodeIds: [...group.nodeIds, ...addable] }))}
              >
                <IconPlus size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
                {`선택 노드 더하기 (${addable.length})`}
              </Button>
            </div>
          )}
        </Section>
      </div>
    );
  }

  return null;
}
