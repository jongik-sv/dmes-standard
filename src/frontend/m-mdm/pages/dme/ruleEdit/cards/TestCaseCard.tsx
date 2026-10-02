"use client";

/**
 * 카드 ⑥ 테스트 케이스(TSK-08-04 design §6.6·§6.7, 시안 H7). `TB_MDM_RULE_TEST_CASE` 는 버전과 무관하다 — view 의 `testCases` 를 그린다.
 *
 * "모두 실행" 은 값 테스트 카드(④)가 고른 대상·입력(`valueTestInput`)에 `runCases` 를 실어 한 번 돌리고, 케이스마다 서버 비교 결과로
 * 배지("실행만"/"통과"/"실패 · 불일치 키")를 보인다(I24 — 비교는 서버가 결과 변수 타입으로 한다). "불러오기" 는 케이스 입력을 ④ 입력 칸에
 * 채운다. "수정" 은 팝업에서 이름·설명·입력·기대 JSON 을 고친다. "기대값 갱신" 은 마지막 결과로 기대 JSON 을 다시 쓰고, "삭제" 는 한 번 더 눌러야 보낸다. 쓰기는 row_version 조건(MDM001)이고 뒤에
 * view 를 다시 불러온다.
 *
 * "경계값 생성" 은 "모두 실행" 과 같은 대상의 표·변수와 ④ 입력으로 경계값 후보(`planBoundaryCases`, 서버 안 부름)를 만들어
 * `BoundaryCaseModal` 에서 골라 실행·저장하게 한다. 저장 묶음은 쓰기 한 번(`runWrite`)으로 감싸 view 를 한 번만 다시 불러온다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { copyTestCase, deleteTestCase, runValueTest, saveTestCase } from "../api";
import type { RuleEditCardProps } from "../cards";
import { useRuleWorkbench } from "../state/workbench-context";
import type { DraftCaseResult, TestCaseView, ValueTestCaseResult, ValueTestResult } from "../types";
import { caseBadge, caseBadgeCss as badgeCss, expectedFromResult, mismatchText, type CaseBadge, type CaseEditFields } from "../value-test/case-model";
import { mergeMissingInputKeys } from "../value-test/test-input";
import { planBoundaryCases } from "../value-test/boundary-cases";
import { emptyResultInputs } from "../value-test/boundary-run";
import { bodyTable, defaultRowIdOf, prepareRun, resolveTarget, targetLabel, targetOptions, useTargetView } from "../value-test/run-request";
import { BoundaryCaseModal, type BoundarySession } from "./BoundaryCaseModal";
import { CardFrame, MutedText } from "./CardFrame";
import { TestCaseEditModal } from "./TestCaseEditModal";

/** 카드 ④ 의 입력 JSON → 객체(경계값 후보의 기본 입력). 못 읽거나 객체가 아니면 빈 객체. */
function inputObject(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 판정 오류는 서버가 옮긴 사용자 문장만 보인다 — 단계·코드·엔진 원문(`detail`)은 표 칸에 싣지 않는다. */
function errorText(r: ValueTestCaseResult): string {
  return (r.errors ?? []).map((e) => e.message || e.code).join(" · ");
}

/** 셀 버튼이 부르는 동작 — 열 정의를 렌더마다 새로 만들지 않도록 ref 로 넘긴다. 케이스는 누른 순간의 최신 값으로 찾는다. */
interface CaseActions {
  load: (caseId: number) => void;
  runOne: (caseId: number) => void;
  copy: (caseId: number) => void;
  edit: (caseId: number) => void;
  updateExpected: (caseId: number) => void;
  remove: (caseId: number) => void;
}

/** 케이스 표 한 행. ag-grid 는 칸 값이 바뀐 셀만 다시 그리므로, 버튼 상태·결과 표시는 글자 칸 값(`actions`·`result`)에 담는다. */
interface CaseRow {
  caseId: number;
  name: string;
  caseName: string;
  description: string;
  inputJson: string;
  expectedJson: string;
  result: string;
  badge: CaseBadge | null;
  mismatches: string;
  errors: string;
  actions: string;
  runDisabled: boolean;
  runLabel: string;
  writeDisabled: boolean;
  updateDisabled: boolean;
  confirmingDelete: boolean;
}

// 열은 `columnSizing="fit"` + 작은 `minWidth` 로 카드 폭에 맞춰 줄인다(RuleListGrid 선례) — 열 합이 카드보다 넓으면 ag-grid 가
// 가로로 보이지 않는 동작 열을 그리지 않는다. 동작 열 minWidth 는 버튼 여섯 개가 잘리지 않는 폭이다.
function caseColumns(resultLabel: string, actions: { current: CaseActions | null }): GridColumn[] {
  return [
    { key: "caseId", header: "case_id", width: 70, minWidth: 60 },
    {
      key: "name", header: "이름", width: 160, minWidth: 100,
      render: (_v, row) => {
        const r = row as unknown as CaseRow;
        return (
          <>
            {r.caseName}
            {r.description && <MutedText> · {r.description}</MutedText>}
          </>
        );
      },
    },
    { key: "inputJson", header: "입력", width: 200, minWidth: 120, render: (v) => <code>{String(v)}</code> },
    {
      key: "expectedJson", header: "기대", width: 160, minWidth: 100,
      render: (v) => (v ? <code>{String(v)}</code> : <MutedText>(기대값 없음)</MutedText>),
    },
    {
      key: "result", header: `결과(${resultLabel})`, width: 200, minWidth: 120,
      render: (_v, row) => {
        const r = row as unknown as CaseRow;
        if (!r.badge) return <MutedText>-</MutedText>;
        return (
          <>
            <span data-testid={`tc-badge-${r.caseId}`} style={badgeCss(r.badge)}>
              {r.badge.text}
            </span>
            {r.mismatches && <MutedText> {r.mismatches}</MutedText>}
            {r.errors && <span style={{ color: "var(--color-danger)" }}> {r.errors}</span>}
          </>
        );
      },
    },
    {
      key: "actions", header: "동작", width: 330, minWidth: 330, tooltip: false,
      render: (_v, row) => {
        const r = row as unknown as CaseRow;
        const id = r.caseId;
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button size="mini" onClick={() => actions.current?.load(id)}>
              불러오기
            </Button>
            <Button size="mini" disabled={r.runDisabled} data-testid={`tc-run-${id}`} onClick={() => actions.current?.runOne(id)}>
              {r.runLabel}
            </Button>
            <Button size="mini" disabled={r.writeDisabled} data-testid={`tc-copy-${id}`} onClick={() => actions.current?.copy(id)}>
              복사
            </Button>
            <Button size="mini" disabled={r.writeDisabled} data-testid={`tc-edit-${id}`} onClick={() => actions.current?.edit(id)}>
              수정
            </Button>
            <Button size="mini" disabled={r.updateDisabled} onClick={() => actions.current?.updateExpected(id)}>
              기대값 갱신
            </Button>
            <Button size="mini" variant={r.confirmingDelete ? "danger" : "default"} disabled={r.writeDisabled} onClick={() => actions.current?.remove(id)}>
              {r.confirmingDelete ? "삭제 확인" : "삭제"}
            </Button>
          </span>
        );
      },
    },
  ];
}

/** 케이스 결과 → 기대값 계산용 결과(hit 은 서버가 §6.5 표현으로 준 값 — 한 행·기본 행이면 숫자, 여럿이면 배열). */
function asResult(c: ValueTestCaseResult): ValueTestResult {
  const ids = c.hit == null ? [] : Array.isArray(c.hit) ? c.hit : [c.hit];
  return {
    target: "BODY",
    ver: null,
    evalTs: "",
    outcome: c.outcome,
    results: c.results,
    hits: ids.map((rowId) => ({ rowId, seq: 0, groupChoices: {} })),
    defaultApplied: false,
  };
}

export function TestCaseCard({ view, editable, canDo, busy, runWrite }: RuleEditCardProps) {
  const { testRun, tableDraft, valueTestInput, setTestRun, loadCase } = useRuleWorkbench();
  const ruleId = view.rule.maruRuleId;
  const cases: TestCaseView[] = view.testCases ?? [];
  const [running, setRunning] = useState(false);
  const [runningCase, setRunningCase] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // 수정 팝업 대상과 열 때의 칸 — [수정]을 누른 순간 한 번 고정한다(열려 있는 동안 ④ 입력 줄이 늦게 바뀌어도 고치던 칸을 덮지 않게).
  const [editing, setEditing] = useState<{ c: TestCaseView; initial: CaseEditFields } | null>(null);
  // 경계값 후보 팝업 — [경계값 생성] 을 누른 순간의 후보·대상으로 고정한다. 닫으면 null(팝업 언마운트로 진행 중 실행을 멈춘다).
  const [boundary, setBoundary] = useState<BoundarySession | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const boundarySeq = useRef(0);
  // 팝업이 열린 채 룰이 바뀌면(룰 고르기·대상 이벤트) 닫는다 — 언마운트로 진행 중 실행·저장도 멈춘다. 저장은 세션의 룰로만 한다.
  useEffect(() => {
    setBoundary((prev) => (prev && prev.ruleId !== ruleId ? null : prev));
    setBoundaryError(null);
  }, [ruleId]);

  // 대상은 값 테스트 카드가 고른 것, 없으면(카드 ④ 없이) 같은 기본값.
  const fallback = resolveTarget(targetOptions(view, editable), null, view)?.choice ?? null;
  const input = valueTestInput && valueTestInput.ruleId === ruleId ? valueTestInput : null;
  const choice = input ? { target: input.target, ver: input.ver } : fallback;

  const run = testRun && testRun.ruleId === ruleId ? testRun : null;
  const byCase = new Map((run?.result.cases ?? []).map((c) => [c.caseId, c] as const));
  const { def } = useTargetView(view, run ? { target: run.target, ver: run.ver } : null);
  // 수정 팝업의 기대 폼 — 결과 변수와 hit 로 고를 행은 값 테스트가 고른 대상 정의의 것(편집본이면 편집 중인 표)이다.
  const { def: choiceDef } = useTargetView(view, choice);
  const editVars = choiceDef?.vars ?? view.vars;
  // 결과 열 그룹은 그룹 이름 한 줄로 비교한다(엔진 결과 이름) — 그룹은 varMeta, 그룹 표시명은 컬럼 사전 후보에서 읽는다.
  const editMeta = choiceDef ? choiceDef.varMeta : view.varMeta;
  const editCandidates = choiceDef ? choiceDef.varCandidates : view.varCandidates;
  const editRows = useMemo(
    () => (choice?.target === "BODY" ? bodyTable(view, choice.ver, tableDraft).rows : (choiceDef?.rows ?? view.rows)),
    [choice?.target, choice?.ver, view, tableDraft, choiceDef],
  );

  const handleRunAll = useCallback(async () => {
    if (!choice) return;
    const prepared = prepareRun(view, choice, tableDraft, input?.inputJson ?? "{}", true);
    setRunning(true);
    setError(null);
    try {
      const result = await runValueTest(prepared.request);
      // ④ 입력의 판정은 케이스 결과가 아니다 — ⑤ 는 케이스 요약만 보이고 표에 칠하지 않는다.
      setTestRun({ ...prepared.run, result, casesOnly: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [choice, view, tableDraft, input, setTestRun]);

  const handleUpdateExpected = useCallback(
    async (c: TestCaseView, r: ValueTestCaseResult) => {
      const expected = expectedFromResult(asResult(r), def?.vars ?? view.vars, null);
      if (!expected) return;
      await runWrite(() =>
        saveTestCase(ruleId, {
          caseId: c.caseId,
          rowVersion: c.rowVersion,
          caseName: c.caseName,
          inputJson: c.inputJson,
          expectedJson: expected,
          description: c.description ?? null,
        }),
      );
    },
    [def, view.vars, runWrite, ruleId],
  );

  const handleEdit = useCallback(
    async (c: TestCaseView, f: CaseEditFields) => {
      const saved = await runWrite(() =>
        saveTestCase(ruleId, {
          caseId: c.caseId,
          rowVersion: c.rowVersion,
          caseName: f.caseName.trim(),
          inputJson: f.inputJson.trim(),
          expectedJson: f.expectedJson.trim() || null,
          description: f.description.trim() || null,
        }),
      );
      return saved !== undefined;
    },
    [runWrite, ruleId],
  );

  // 수정 팝업의 "테스트 실행" — 저장하지 않은 입력·기대로 값 테스트(④)가 고른 대상을 판정한다. 비교는 서버가 한다(I24).
  // 결과는 팝업 안에만 보인다 — setTestRun 을 부르면 ⑥ 배지와 표 칠이 이 한 건으로 바뀐다.
  const handleRunDraft = useCallback(
    async (f: Pick<CaseEditFields, "inputJson" | "expectedJson">): Promise<DraftCaseResult> => {
      if (!choice) throw new Error("값 테스트(④)에서 대상을 고르세요.");
      const prepared = prepareRun(view, choice, tableDraft, f.inputJson.trim());
      const result = await runValueTest({ ...prepared.request, judge: { expectedJson: f.expectedJson.trim() } });
      if (!result.draftCase) throw new Error("서버가 판정 결과를 돌려주지 않았습니다. 백엔드를 다시 시작했는지 확인하세요.");
      return result.draftCase;
    },
    [choice, view, tableDraft],
  );

  // "실행"(이 케이스만) — 케이스가 가진 입력 JSON 으로 그 케이스 하나만 판정한다.
  // 값을 테스트 카드(④) 의 입력이 아니라 케이스의 저장된 입력을 쓴다(그게 케이스이므로).
  // 기대값 비교는 서버 RuleCaseJudge 가 해 "모두 실행" 과 배지 기준이 같다.
  const handleRunOne = useCallback(
    async (c: TestCaseView) => {
      if (!choice) return;
      const prepared = prepareRun(view, choice, tableDraft, c.inputJson, true, [c.caseId]);
      setRunningCase(c.caseId);
      setError(null);
      try {
        const result = await runValueTest(prepared.request);
        setTestRun({ ...prepared.run, result });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningCase(null);
      }
    },
    [choice, view, tableDraft, setTestRun],
  );

  // 룰 화면에 새 컬럼(변수)이 들어오면 저장된 케이스 입력 JSON 에 없는 키가 생긴다.
  // 수정 팝업을 열 때 지금 계약의 이름을 null 로 채워 넣는다 — 새 컬럼이 빈 칸으로 보이게.
  const caseInput = useCallback(
    (c: TestCaseView): CaseEditFields => {
      const base = { caseName: c.caseName, description: c.description ?? "", inputJson: c.inputJson, expectedJson: c.expectedJson ?? "" };
      const fields = input?.fields;
      return fields && fields.length > 0 ? { ...base, inputJson: mergeMissingInputKeys(base.inputJson, fields) } : base;
    },
    [input?.fields],
  );

  const handleCopy = useCallback(
    async (c: TestCaseView) => {
      // 원본 값을 그대로 복제한다. 복사본에도 지금 계약의 없는 키는 null 로 채운다.
      const filled = caseInput(c);
      await runWrite(() =>
        copyTestCase(ruleId, {
          ...c,
          caseName: filled.caseName,
          description: filled.description,
          inputJson: filled.inputJson,
          expectedJson: filled.expectedJson,
        }),
      );
    },
    [caseInput, runWrite, ruleId],
  );

  const handleDelete = useCallback(
    async (c: TestCaseView) => {
      if (confirmDelete !== c.caseId) {
        setConfirmDelete(c.caseId);
        return;
      }
      setConfirmDelete(null);
      await runWrite(() => deleteTestCase(ruleId, c.caseId, c.rowVersion));
    },
    [confirmDelete, runWrite, ruleId],
  );

  const canWrite = canDo("save") && !busy && view.rule.sourceKind === "MDM";
  // 다른 버전 대상이면 그 버전 정의를 받은 뒤에만 후보를 만든다(받는 중에 지금 버전 행으로 만들지 않게).
  const boundaryReady = choice != null && (choice.target === "BODY" || choiceDef != null);

  // [경계값 생성] — "모두 실행" 과 같은 대상의 표·변수로 후보를 만든다. 서버는 부르지 않는다.
  const handleBoundary = () => {
    if (!choice || !boundaryReady) return;
    setBoundaryError(null);
    try {
      const body = choice.target === "BODY";
      const rows = body ? bodyTable(view, choice.ver, tableDraft).rows : choiceDef!.rows;
      const vars = body ? view.vars : choiceDef!.vars;
      const baseInput = inputObject(input?.inputJson);
      const plan = planBoundaryCases({
        vars,
        rows,
        baseInput,
        existingInputs: cases.map((c) => c.inputJson),
      });
      // 입력 계약 이름은 카드 ④ 가 같은 대상으로 계산해 올린 입력 줄을 쓴다(④ 가 없으면 경고하지 않는다).
      const emptyInputs = emptyResultInputs((input?.fields ?? []).map((f) => f.name), vars, baseInput);
      const base = prepareRun(view, choice, tableDraft, "{}").request;
      boundarySeq.current += 1;
      setBoundary({
        id: boundarySeq.current,
        ruleId,
        plan,
        vars,
        defaultRowId: defaultRowIdOf(rows),
        baseRequest: base,
        targetLabel: targetLabel(choice),
        emptyInputs,
      });
    } catch (e) {
      setBoundaryError(e instanceof Error ? e.message : String(e));
    }
  };
  const resultLabel = run ? targetLabel(run) : choice ? targetLabel(choice) : "-";

  const actions = useRef<CaseActions | null>(null);
  const caseOf = (id: number) => cases.find((c) => c.caseId === id);
  actions.current = {
    load: (id) => {
      const c = caseOf(id);
      if (c) loadCase(ruleId, c.inputJson);
    },
    runOne: (id) => {
      const c = caseOf(id);
      if (c) void handleRunOne(c);
    },
    copy: (id) => {
      const c = caseOf(id);
      if (c) void handleCopy(c);
    },
    edit: (id) => {
      const c = caseOf(id);
      setEditing(c ? { c, initial: caseInput(c) } : null);
    },
    updateExpected: (id) => {
      const c = caseOf(id);
      const r = byCase.get(id);
      if (c && r) void handleUpdateExpected(c, r);
    },
    remove: (id) => {
      const c = caseOf(id);
      if (c) void handleDelete(c);
    },
  };
  const columns = useMemo(() => caseColumns(resultLabel, actions), [resultLabel]);

  const runBlocked = !canDo("execute") || busy || running || !choice || runningCase != null;
  const rows: CaseRow[] = cases.map((c) => {
    const r = byCase.get(c.caseId);
    const badge = r ? caseBadge(r) : null;
    const mismatches = r ? mismatchText(r) : "";
    const errors = r ? errorText(r) : "";
    const runLabel = runningCase === c.caseId ? "실행 중..." : "실행";
    const updateDisabled = !canWrite || !r || r.outcome !== "OK";
    const confirmingDelete = confirmDelete === c.caseId;
    return {
      caseId: c.caseId,
      name: c.description ? `${c.caseName} · ${c.description}` : c.caseName,
      caseName: c.caseName,
      description: c.description ?? "",
      inputJson: c.inputJson,
      expectedJson: c.expectedJson ?? "",
      result: badge ? [badge.text, mismatches, errors].filter(Boolean).join(" ") : "",
      badge,
      mismatches,
      errors,
      actions: [runBlocked, runLabel, canWrite, updateDisabled, confirmingDelete].join("|"),
      runDisabled: runBlocked,
      runLabel,
      writeDisabled: !canWrite,
      updateDisabled,
      confirmingDelete,
    };
  });

  return (
    <CardFrame
      title="⑥ 테스트 케이스"
      testId="rule-card-test-cases"
      right={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>TB_MDM_RULE_TEST_CASE · 버전과 무관</span>
          <Button size="sm" disabled={!canDo("execute") || busy || running || !choice || cases.length === 0} onClick={() => void handleRunAll()}>
            모두 실행
          </Button>
          <Button size="sm" data-testid="tc-boundary" disabled={!canWrite || !boundaryReady} onClick={handleBoundary}>
            경계값 생성
          </Button>
        </span>
      }
    >
      {cases.length === 0 ? (
        <p data-testid="tc-empty" style={{ margin: 0, color: "var(--color-text-muted)" }}>
          테스트 케이스가 없습니다
        </p>
      ) : (
        <AgDataGrid
          columns={columns}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="caseId"
          height="auto"
          columnSizing="fit"
          sortable={false}
          getRowHeight={() => 28}
          ariaLabel="테스트 케이스 목록"
        />
      )}
      <TestCaseEditModal
        target={editing?.c ?? null}
        initial={editing?.initial ?? null}
        currentInput={input?.inputJson ?? null}
        fields={input?.fields ?? []}
        vars={editVars}
        varMeta={editMeta}
        candidates={editCandidates}
        rows={editRows}
        busy={busy}
        runTarget={choice ? targetLabel(choice) : null}
        onRun={choice ? handleRunDraft : undefined}
        onSave={handleEdit}
        onClose={() => setEditing(null)}
      />
      {boundary && (
        <BoundaryCaseModal
          key={boundary.id}
          session={boundary}
          busy={busy}
          canExecute={canDo("execute")}
          commit={(save) => runWrite(save)}
          onClose={() => setBoundary(null)}
        />
      )}
      {boundaryError && (
        <p data-testid="tc-boundary-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          경계값 후보를 만들지 못했습니다. {boundaryError}
        </p>
      )}
      {error && (
        <p data-testid="tc-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          케이스를 실행하지 못했습니다. {error}
        </p>
      )}
      <p style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
        케이스는 값 테스트에서 고른 대상(편집본이면 저장 전 정의)으로 실행한다. 새 버전이 판정을 바꾸면 기대값도 같이 고친다.
      </p>
    </CardFrame>
  );
}
