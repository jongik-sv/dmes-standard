"use client";

/**
 * 테스트 케이스 패널(3단계 계획 E6, 스펙 §4.6) — 케이스 표(`case-grid`: 이름·마지막 결과·설명, 한 줄 선택)·[지금 입력 저장]·[모두 실행]·통과 요약·
 * 고른 케이스의 [불러오기]·[디버그로 열기]·[고치기]·[삭제](두 단계, Local-Rules §9)·실패 케이스의 기대/실제 차이(`case-diff`)·케이스 팝업.
 * `DebugInputs` 가 그린다. 서버는 부르지 않고 `useTestCases`(목록·쓰기·모두 실행)와 `useSimulation`(입력·실행) 을 props 로만 쓴다.
 *
 * - 쓰기 단추는 `canEditCases`(= 서버 flags.canEditCases(담당자 ∧ 폐기 아님, 버전과 무관 — Ruling P2-18) && save 권한)일 때만 켜진다. [모두 실행]·[디버그로 열기]는 `execute` 권한.
 * - 새 케이스의 기대값은 낡지 않은 마지막 기록이 있고 그 입력이 지금 입력과 같을 때만 최종 변수로 채운다(`expectedFromFinal`, Review Focus 1).
 *   고친 값이 든 기록(4단계 E4)이면 채우지 않고 단추 title 로 이유를 보인다(스펙 §2.4 [기대값으로] 막기 — 편차 후보 1).
 * - [디버그로 열기] = 입력을 폼에 넣고 [처음부터]. 입력이 기록 입력과 다르면 훅이 새로 실행한다(P-D9).
 * - 요약 "p/t 통과" 의 분모는 기대값이 있는 케이스만이다(pass=null "실행만" 은 뺀다).
 * - 오류로 끝난 케이스는 차이 표 대신 오류 문장을 보이고 단계·코드는 title 에 둔다(Local-Rules §13).
 */
import { useMemo, useState, type CSSProperties } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";
import { uiCols } from "@/ui-meta";

import { REJECT_BADGE } from "../panels/ChecksPanel";
import type { CaseDraft, CaseRunResult, RuleSetCaseView } from "../types";
import { CaseEditModal } from "./CaseEditModal";
import { EDITED_EXPECTED_TITLE, RUN_DENIED_TITLE, expectedFromFinal } from "./debug-model";
import { loadExactInput } from "./InputForm";
import { sameInput, type Simulation } from "./useSimulation";
import type { TestCases } from "./useTestCases";

export interface TestCasePanelProps {
  sim: Simulation;
  tests: TestCases;
  canEditCases: boolean;
  canRun: boolean;
}

const EDIT_DENIED_TITLE = "케이스는 담당자가 폐기하지 않은 세트에서 저장할 수 있다";
const NEEDS_CASE = "케이스를 먼저 고른다";
/** 차이 표 실제 칸 — 결과에 그 키가 없다(값 null 과 다르다). */
export const MISSING_TEXT = "결과에 없음";

type Mark = { text: string; style: () => CSSProperties };
const MARKS: Record<"pass" | "fail" | "only" | "none", Mark> = {
  pass: { text: "통과", style: () => badgeStyle("success") },
  fail: { text: "실패", style: () => REJECT_BADGE },
  only: { text: "실행만", style: () => badgeStyle("info") },
  none: { text: "안 돌림", style: () => badgeStyle("neutral") },
};

function markOf(r: CaseRunResult | undefined): keyof typeof MARKS {
  if (!r) return "none";
  if (r.pass === true) return "pass";
  if (r.pass === false) return "fail";
  return "only";
}

/** 차이 표 칸 글자 — 글자는 그대로, null 은 NULL, 그 밖은 JSON. */
function valueText(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  return typeof v === "string" ? v : JSON.stringify(v);
}

const CASE_COLUMNS: GridColumn[] = uiCols([
  { key: "caseName", header: "이름", width: 130 },
  {
    key: "mark",
    header: "마지막 결과",
    width: 90,
    tooltip: false,
    render: (v) => {
      const m = MARKS[v as keyof typeof MARKS] ?? MARKS.none;
      return <span style={m.style()}>{m.text}</span>;
    },
  },
  { key: "description", header: "설명", width: 140 },
], ["caseName"]);

const DIFF_COLUMNS: GridColumn[] = uiCols([
  { key: "key", header: "키", width: 110 },
  { key: "expected", header: "기대", width: 100 },
  { key: "actual", header: "실제", width: 100 },
]);

/** 케이스 저장 → 입력 묶음. */
const inputOf = (c: RuleSetCaseView) => ({ recordJson: c.inputJson, evalTs: c.evalTs ?? "" });

export function TestCasePanel({ sim, tests, canEditCases, canRun }: TestCasePanelProps) {
  const { cases, results } = tests;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = cases.find((c) => c.caseId === selectedId) ?? null;
  const selectedResult = selected ? results[selected.caseId] : undefined;

  const rows = useMemo(
    () =>
      cases.map((c) => ({
        caseId: c.caseId,
        caseName: c.caseName ?? `#${c.caseId}`,
        mark: markOf(results[c.caseId]),
        description: c.description ?? "",
      })),
    [cases, results],
  );

  const summary = useMemo(() => {
    const ran = cases.map((c) => results[c.caseId]).filter((r): r is CaseRunResult => !!r);
    if (ran.length === 0) return null;
    const judged = ran.filter((r) => r.pass !== null);
    return { pass: judged.filter((r) => r.pass === true).length, total: judged.length, only: ran.length - judged.length };
  }, [cases, results]);

  // 실제 값 null 은 둘로 가른다 — 결과에 그 키가 있고 값이 null(룰이 한 줄도 맞지 않아 엔진이 null 로 둔 결과, 가장 흔한 실패)이면 "NULL",
  // 결과에 키가 아예 없으면 "결과에 없음". 키는 서버 판정처럼 대소문자 무시로 찾는다(P-D4).
  const diffRows = useMemo(() => {
    if (selectedResult?.pass !== false || selectedResult.outcome !== "OK") return [];
    const keys = new Set(Object.keys(selectedResult.finalValues ?? {}).map((k) => k.toLowerCase()));
    return selectedResult.mismatches.map((m) => ({
      key: m.key,
      expected: valueText(m.expected),
      actual: (m.actual === null || m.actual === undefined) && !keys.has(m.key.toLowerCase()) ? MISSING_TEXT : valueText(m.actual),
    }));
  }, [selectedResult]);

  const current = sim.currentInput();
  const pick = (row: Record<string, unknown>) => {
    setSelectedId(row.caseId as number);
    setConfirmDelete(false);
  };

  /** 지금 기록이 고친 값으로 나왔는가(4단계 E4) — 그 결과는 새 케이스 기대값으로 쓰지 않는다. */
  const editedRecord = !!sim.last && !sim.stale && sim.appliedEdits.length > 0;

  const openNew = () => {
    const input = sim.currentInput();
    if (!input) return;
    const last = sim.last;
    const expectedJson = last && !sim.stale && !editedRecord && sameInput(last.input, input) ? expectedFromFinal(last.trace.finalValues ?? {}) : "";
    setDraft({
      caseId: null,
      rowVersion: null,
      caseName: `케이스 ${cases.length + 1}`,
      inputJson: input.recordJson,
      evalTs: input.evalTs,
      expectedJson,
      description: "",
    });
  };

  const openEdit = () => {
    if (!selected) return;
    setDraft({
      caseId: selected.caseId,
      rowVersion: selected.rowVersion,
      caseName: selected.caseName ?? "",
      inputJson: selected.inputJson,
      evalTs: selected.evalTs ?? "",
      expectedJson: selected.expectedJson ?? "",
      description: selected.description ?? "",
    });
  };

  const onSave = async (d: CaseDraft) => {
    setBusy(true);
    try {
      return await tests.save(d);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    setConfirmDelete(false);
    await tests.remove(selected);
    setSelectedId(null);
  };

  const editTitle = canEditCases ? undefined : EDIT_DENIED_TITLE;

  return (
    <section className="rsf-case-panel" data-testid="case-panel" aria-label="테스트 케이스">
      <div className="rsf-case-head">
        <p className="rsf-dbg-title">{`테스트 케이스 ${cases.length}건`}</p>
        {summary && (
          <span className="rsf-case-summary">
            <strong data-testid="case-summary">{`${summary.pass}/${summary.total} 통과`}</strong>
            {summary.only > 0 && <span className="rsf-muted">{` · 실행만 ${summary.only}건`}</span>}
          </span>
        )}
      </div>
      <div className="rsf-case-actions">
        <Button
          size="sm"
          data-testid="case-save-current"
          disabled={!canEditCases || !current || tests.running}
          title={editTitle ?? (current ? (editedRecord ? EDITED_EXPECTED_TITLE : "지금 입력을 케이스로 저장한다") : "입력 오류를 먼저 고친다")}
          onClick={openNew}
        >
          지금 입력 저장
        </Button>
        <Button
          size="sm"
          variant="primary"
          data-testid="case-run-all"
          disabled={!canRun || cases.length === 0 || tests.running}
          title={canRun ? "저장된 케이스를 지금 흐름(저장 전 포함)으로 모두 돌린다" : RUN_DENIED_TITLE}
          onClick={() => void tests.runAll()}
        >
          {tests.running ? "실행 중…" : "모두 실행"}
        </Button>
      </div>
      <div data-testid="case-grid" className="rsf-case-grid">
        <AgDataGrid
          columns={CASE_COLUMNS}
          data={rows}
          rowKey="caseId"
          height="auto"
          sortable={false}
          highlightedRowKey={selectedId}
          onRowClick={pick}
          emptyMessage="저장한 케이스가 없다. 입력을 넣고 [지금 입력 저장]을 누른다"
          ariaLabel="테스트 케이스"
        />
      </div>
      <div className="rsf-case-actions">
        <Button size="sm" data-testid="case-load" disabled={!selected} title={selected ? "케이스 입력을 폼에 넣는다" : NEEDS_CASE} onClick={() => selected && loadExactInput(sim, inputOf(selected))}>
          불러오기
        </Button>
        <Button
          size="sm"
          data-testid="case-debug"
          disabled={!selected || !canRun || sim.running}
          title={!canRun ? RUN_DENIED_TITLE : selected ? "케이스 입력을 폼에 넣고 처음부터 단계 실행한다" : NEEDS_CASE}
          onClick={() => {
            if (!selected) return;
            loadExactInput(sim, inputOf(selected));
            void sim.restart();
          }}
        >
          디버그로 열기
        </Button>
        <Button size="sm" data-testid="case-edit" disabled={!selected || !canEditCases} title={editTitle ?? (selected ? undefined : NEEDS_CASE)} onClick={openEdit}>
          고치기
        </Button>
        {confirmDelete && selected ? (
          <span className="rsf-case-confirm" role="group" aria-label="케이스 삭제 확인">
            <span>{`"${selected.caseName ?? `#${selected.caseId}`}" 을 지운다. 되돌릴 수 없다`}</span>
            <Button size="sm" variant="danger" data-testid="case-delete-confirm" onClick={() => void doDelete()}>
              지우기
            </Button>
            <Button size="sm" data-testid="case-delete-cancel" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
          </span>
        ) : (
          <Button size="sm" data-testid="case-delete" disabled={!selected || !canEditCases} title={editTitle ?? (selected ? undefined : NEEDS_CASE)} onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        )}
      </div>
      {tests.error && !draft && (
        <p className="rsf-dbg-error" data-testid="case-error" role="alert">
          {tests.error}
        </p>
      )}
      {selected && selectedResult?.pass === false && (
        <div className="rsf-case-diff">
          <p className="rsf-panel-sub">{`기대·실제 차이 — ${selected.caseName ?? `#${selected.caseId}`}`}</p>
          {selectedResult.outcome === "ERROR" ? (
            <ul className="rsim-list" data-testid="case-diff">
              {selectedResult.errors.map((e, i) => (
                <li key={`${e.code}-${i}`} data-testid={`case-diff-error-${i}`} title={[e.stage, e.code, e.name, e.rowId != null ? `row_id ${e.rowId}` : null].filter(Boolean).join(" · ")}>
                  {e.message}
                </li>
              ))}
            </ul>
          ) : (
            <div data-testid="case-diff">
              <AgDataGrid columns={DIFF_COLUMNS} data={diffRows} rowKey="key" height="auto" sortable={false} emptyMessage="다른 값이 없다" ariaLabel="기대·실제 차이" />
            </div>
          )}
        </div>
      )}
      <CaseEditModal draft={draft} busy={busy} error={tests.error} onSave={onSave} onClose={() => setDraft(null)} />
    </section>
  );
}
