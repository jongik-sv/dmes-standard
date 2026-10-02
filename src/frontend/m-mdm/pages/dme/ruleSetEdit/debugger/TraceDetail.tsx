"use client";

/**
 * 노드 상세(2단계 계획 Task 11, `sim-detail`) — 실행 결과가 있을 때 노드를 누르면 오른쪽 패널에 속성 패널 대신 보인다.
 *  - 룰: 읽은 입력값(`reads`), 맞은 행(`hits`)과 기본 행 사용, 결과값(`result.results`), 행마다 평가·적중·처음 거짓 열(`result.trace`), 룰 경고, [룰 편집 열기].
 *  - IF: 갈래마다 선 이름·조건식(실행 때의 흐름 사본에서)·결과 배지(참 / 거짓 / NULL / 오류 / 평가 안 함)와 오류 문구.
 *  - 병렬: 실행 순서(`order` 의 선 이름). 합류: 합친 변수(`merged`).
 *  - 오류 노드: 위반마다 한국어 문장. 단계·코드·이름은 `title`, 원문은 접힌 `<details>` 에 둔다(Local-Rules §13, TestResultCard 와 같은 방식).
 *  - 받는 노드(spec §9): CATCH 노드는 종류·코드·메시지와 처리 갈래가 읽는 CATCH_* 값(`sim-detail-catch`). 받은 룰(CAUGHT)은 "받음" 배지와 받은 위반,
 *    위반이 비면(결과 없음) `NO_RESULT_MESSAGE` 한 줄. 룰 블록을 그대로 타므로 [룰 편집 열기]·읽은 입력값이 보이고 결과 표는 없다.
 */
import { useMemo, type ReactNode } from "react";

import { IconExternalLink } from "@tabler/icons-react";

import type { BranchOutcome, CatchKind, NodeTrace, RuleSetFlow, TypedValue, Violation } from "@/contract/engine-contract.generated";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle, fmtVer, normVer } from "@/shell";

import { CATCH_KIND_LABEL, NO_RESULT_MESSAGE } from "../catch-text";
import { REJECT_BADGE } from "../panels/ChecksPanel";
import { catchValues } from "../trace-view";
import { cellText } from "./ValueTable";

const KIND_TEXT: Record<NodeTrace["kind"], string> = {
  START: "시작",
  END: "끝",
  RULE: "룰",
  TASK: "빈 단계",
  IF: "IF 분기",
  PARALLEL: "병렬 분기",
  MERGE: "합류",
  CATCH: "받는 노드",
};

const OUTCOME: Record<BranchOutcome, { text: string; style: () => React.CSSProperties }> = {
  TRUE: { text: "참", style: () => badgeStyle("success") },
  FALSE: { text: "거짓", style: () => badgeStyle("neutral") },
  NULL: { text: "NULL", style: () => badgeStyle("warning") },
  ERROR: { text: "오류", style: () => REJECT_BADGE },
  NOT_EVALUATED: { text: "평가 안 함", style: () => badgeStyle("neutral") },
};

/** 위반 툴팁 — 본문은 사용자 문장이고 단계·코드·이름·row_id 는 문의·추적용으로 여기에만 둔다. */
function violationTip(v: Violation): string {
  return [v.stage, v.code, v.ruleId, v.name, v.rowId != null ? `row_id ${v.rowId}` : null].filter(Boolean).join(" · ");
}

function Pairs({ testId, values, empty }: { testId: string; values: Readonly<Record<string, TypedValue>> | null | undefined; empty: string }) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return <p className="rsf-panel-note" data-testid={testId}>{empty}</p>;
  return (
    <table data-testid={testId} className="rsim-pairs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th>
              <code>{k}</code>
            </th>
            <td>{cellText(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="rsf-panel-sub">{children}</p>;
}

const ROW_COLUMNS: GridColumn[] = [
  { key: "row", header: "행", width: 130 },
  { key: "evaluated", header: "평가", width: 60 },
  { key: "hit", header: "적중", width: 60 },
  { key: "firstFalse", header: "처음 거짓 열", width: 110 },
];

/** 노드 설명(`view.descs`) — 있을 때만. 줄바꿈은 그대로 보인다. 지금 편집 중인 흐름의 설명이다(실행 사본에는 view 가 없다). */
export function NodeDescNote({ desc }: { desc: string | undefined }) {
  if (!desc) return null;
  return (
    <p className="rsf-panel-note rsf-node-desc" data-testid="sim-detail-desc" style={{ whiteSpace: "pre-wrap" }}>
      {desc}
    </p>
  );
}

export interface TraceDetailProps {
  nodeId: string;
  /** 이 노드의 기록. 이번 실행에서 실행되지 않았으면 null. */
  node: NodeTrace | null;
  /** 실행 때의 흐름 사본 — 지금 편집 중인 흐름이 아니다. */
  flow: RuleSetFlow;
  /** 세트 전체 위반(노드에 위반이 없을 때 대신 보인다). */
  traceViolations: readonly Violation[];
  /** 이 노드의 설명(`view.descs`). 없으면 보이지 않는다. */
  desc?: string;
  onOpenRule: (ruleId: string) => void;
  /** END 노드에 보일 끝낸 갈래 문장(R18). */
  endedBranch?: string | null;
}

export function TraceDetail({ nodeId, node, flow, traceViolations, desc, onOpenRule, endedBranch }: TraceDetailProps) {
  const edges = useMemo(() => new Map(flow.edges.map((e) => [e.id, e] as const)), [flow]);
  const edgeName = (id: string) => edges.get(id)?.label ?? id;
  const flowNode = flow.nodes.find((n) => n.id === nodeId);

  const rowData = useMemo(
    () =>
      (node?.result?.trace ?? []).map((t) => ({
        rowId: t.rowId,
        row: `${t.seq}행 (row_id ${t.rowId})`,
        evaluated: t.evaluated ? "예" : "아니오",
        hit: t.hit ? "예" : "아니오",
        firstFalse: t.firstFalseVarId != null ? `열 ${t.firstFalseVarId}` : "-",
      })),
    [node],
  );

  if (!node) {
    return (
      <div className="rsf-panel" data-testid="sim-detail">
        <p className="rsf-panel-title">
          {flowNode?.label ?? nodeId} <code>{nodeId}</code>
        </p>
        <NodeDescNote desc={desc} />
        <p className="rsf-panel-note">이번 실행에서 실행되지 않은 노드다</p>
      </div>
    );
  }

  const violations = node.violations && node.violations.length > 0 ? node.violations : node.status === "ERROR" ? [...traceViolations] : [];
  /** 받은 룰인데 받은 위반이 없으면 결과 없음이다(R2 — 결과 없음은 빈 목록). */
  const noResult = node.status === "CAUGHT" && violations.length === 0;
  const result = node.result;

  return (
    <div className="rsf-panel" data-testid="sim-detail">
      <div className="rsf-panel-head">
        <p className="rsf-panel-title">
          {flowNode?.label ?? nodeId} <code>{nodeId}</code>
        </p>
        <span className="rsim-badges">
          <span style={badgeStyle("neutral")}>{KIND_TEXT[node.kind]}</span>
          <span style={node.status === "ERROR" ? REJECT_BADGE : node.status === "CAUGHT" ? badgeStyle("warning") : badgeStyle("success")}>
            {node.status === "ERROR" ? "오류" : node.status === "CAUGHT" ? "받음" : "정상"}
          </span>
          <span style={badgeStyle("neutral")}>{`${node.seq}단계`}</span>
        </span>
      </div>
      <NodeDescNote desc={desc} />

      {node.kind === "END" && endedBranch && (
        <p className="rsf-panel-note" data-testid="sim-detail-ended-branch">
          {endedBranch}
        </p>
      )}
      {node.kind === "TASK" && (
        <p className="rsf-muted" data-testid="sim-detail-task">
          빈 단계 — 아무것도 읽거나 만들지 않고 지나갔다
        </p>
      )}
      {node.kind === "CATCH" && (
        <div data-testid="sim-detail-catch">
          <p className="rsf-panel-note">
            {`${node.catchKind ? CATCH_KIND_LABEL[node.catchKind as CatchKind] : "-"} · ${node.code ?? ""} — ${node.message ?? ""}`}
          </p>
          <Sub>처리 갈래가 읽는 값</Sub>
          <Pairs testId="sim-detail-catch-values" values={catchValues(node)} empty="값이 없다" />
        </div>
      )}
      {node.kind === "RULE" && (
        <>
          <p className="rsf-panel-note">
            <code>{node.ruleId}</code>
            {node.ver != null ? ` · 버전 ${fmtVer(normVer(node.ver))}` : ""}
          </p>
          {node.ruleId && (
            <Button size="sm" data-testid="sim-detail-open-rule" onClick={() => onOpenRule(node.ruleId!)}>
              <IconExternalLink size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
              룰 편집 열기
            </Button>
          )}
          <Sub>읽은 입력값</Sub>
          <Pairs testId="sim-detail-reads" values={node.reads} empty="읽은 값이 없다" />
          {result && (
            <>
              <Sub>맞은 행</Sub>
              <p className="rsim-hits" data-testid="sim-detail-hits">
                {result.hits.length > 0
                  ? result.hits.map((h) => `${h.seq}행 (row_id ${h.rowId})`).join(", ")
                  : result.defaultApplied
                    ? "어느 행도 참이 아니어서 기본 행을 썼다"
                    : "없음"}
              </p>
              <Sub>결과값</Sub>
              <Pairs testId="sim-detail-results" values={result.results} empty="결과값이 없다" />
              <Sub>행 판정</Sub>
              <div data-testid="sim-detail-rows">
                <AgDataGrid columns={ROW_COLUMNS} data={rowData} rowKey="rowId" height="auto" sortable={false} emptyMessage="판정한 행이 없다" ariaLabel="행 판정" />
              </div>
              {result.warnings.length > 0 && (
                <ul className="rsim-list" data-testid="sim-detail-warnings">
                  {result.warnings.map((w, i) => (
                    <li key={`${w.code}-${i}`}>
                      <span style={badgeStyle("warning")}>{w.code}</span> {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {node.kind === "IF" && (
        <>
          <Sub>갈래</Sub>
          <ul className="rsim-list" data-testid="sim-detail-branches">
            {(node.branches ?? []).map((b) => {
              const e = edges.get(b.edgeId);
              const o = OUTCOME[b.outcome];
              return (
                <li key={b.edgeId} data-testid={`sim-branch-${b.edgeId}`} data-chosen={node.chosenEdgeId === b.edgeId ? "true" : "false"}>
                  <span className="rsim-branch-head">
                    <strong>{edgeName(b.edgeId)}</strong>
                    <span style={o.style()}>{o.text}</span>
                    {node.chosenEdgeId === b.edgeId && <span style={badgeStyle("info")}>고른 갈래</span>}
                  </span>
                  <code className="rsim-cond">{e?.otherwise ? "그 외" : (e?.cond ?? "")}</code>
                  {b.message && <span className="rsim-msg">{b.message}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {node.kind === "PARALLEL" && (
        <>
          <Sub>실행 순서</Sub>
          <ol className="rsim-list" data-testid="sim-detail-order">
            {(node.order ?? []).map((id) => (
              <li key={id}>{edgeName(id)}{edges.get(id)?.label ? <code> {id}</code> : null}</li>
            ))}
          </ol>
        </>
      )}

      {node.kind === "MERGE" && (
        <>
          <Sub>합친 변수</Sub>
          <p className="rsim-hits" data-testid="sim-detail-merged">
            {(node.merged ?? []).length > 0 ? (node.merged ?? []).join(", ") : "합친 변수가 없다"}
          </p>
        </>
      )}

      {(violations.length > 0 || noResult) && (
        <>
          <Sub>{node.status === "CAUGHT" ? "받은 예외" : "오류"}</Sub>
          <ul className="rsim-list rsim-errors" data-testid="sim-detail-errors">
            {noResult && <li data-testid="sim-violation-no-result">{NO_RESULT_MESSAGE}</li>}
            {violations.map((v, i) => (
              <li key={`${v.code}-${i}`} data-testid={`sim-violation-${i}`} title={violationTip(v)}>
                {v.message}
                <details data-testid="sim-violation-detail">
                  <summary>자세히(개발자용)</summary>
                  <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(v)}</code>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
