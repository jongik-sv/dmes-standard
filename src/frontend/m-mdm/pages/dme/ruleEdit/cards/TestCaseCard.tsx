"use client";

/**
 * 카드 ⑥ 테스트 케이스(TSK-08-04 design §6.6·§6.7, 시안 H7). `TB_MDM_RULE_TEST_CASE` 는 버전과 무관하다 — view 의 `testCases` 를 그린다.
 *
 * "모두 실행" 은 값 테스트 카드(④)가 고른 대상·입력(`valueTestInput`)에 `runCases` 를 실어 한 번 돌리고, 케이스마다 서버 비교 결과로
 * 배지("실행만"/"통과"/"실패 · 불일치 키")를 보인다(I24 — 비교는 서버가 결과 변수 타입으로 한다).
 *
 * 케이스 동작은 표 맨 앞 체크 칸으로 고른 케이스에 머리글 버튼으로 한다. "불러오기"(1건)는 케이스 입력을 ④ 입력 칸에 채우고,
 * "실행" 은 고른 케이스를 `caseIds` 로 한 요청에 돌린다. "수정"(1건)은 팝업에서 이름·설명·입력·기대 JSON 을 고친다. "복사"·"기대값 갱신"
 * (마지막 결과가 OK 인 것만)·"삭제"(확인창) 는 한 건씩 차례로 보내고 실패한 건의 사유를 모아 보인다. 쓰기는 row_version 조건(MDM001)이고,
 * 묶음 하나를 쓰기 한 번(`runWrite`)으로 감싸 view 를 한 번만 다시 불러온다. 체크는 caseId 로 들고 view 에서 사라진 케이스는 빼며, 룰이 바뀌면 비운다.
 *
 * "경계값 생성" 은 "모두 실행" 과 같은 대상의 표·변수와 ④ 입력으로 경계값 후보(`planBoundaryCases` — 서버는 결과 열 그룹의 열 조건 파싱에만 부른다)를 만들어
 * `BoundaryCaseModal` 에서 골라 실행·저장하게 한다. 저장 묶음은 쓰기 한 번(`runWrite`)으로 감싸 view 를 한 번만 다시 불러온다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { copyTestCase, deleteTestCase, runValueTest, saveTestCase } from "../api";
import type { RuleEditCardProps } from "../cards";
import { useRuleWorkbench } from "../state/workbench-context";
import type { DraftCaseResult, TestCaseView, ValueTestCaseResult, ValueTestResult } from "../types";
import { caseBadge, caseBadgeCss as badgeCss, expectedFromResult, mismatchText, type CaseBadge, type CaseEditFields } from "../value-test/case-model";
import { mergeMissingInputKeys } from "../value-test/test-input";
import { serverParse } from "../expr/parse-expr";
import { planBoundaryCases, type GroupCondColumn } from "../value-test/boundary-cases";
import { emptyResultInputs, saveSequential } from "../value-test/boundary-run";
import { bodyTable, defaultRowIdOf, prepareRun, resolveTarget, targetLabel, targetOptions, useTargetView } from "../value-test/run-request";
import { BoundaryCaseModal, type BoundarySession } from "./BoundaryCaseModal";
import { TestCaseEditModal } from "./TestCaseEditModal";

/** 카드 ④ 의 입력 JSON → 객체(경계값 후보의 기본 입력). 못 읽거나 객체가 아니면 빈 객체. */
/** 표에 한 번에 보이는 최대 행 수. 넘는 행은 표 안에서 세로 스크롤로 본다. */
export const TC_GRID_MAX_ROWS = 20;
const TC_GRID_ROW_PX = 28;
// 헤더 1줄 + 최대 행 수 + 테두리 여유 2px
const TC_GRID_MAX_HEIGHT = TC_GRID_ROW_PX * (TC_GRID_MAX_ROWS + 1) + 2;

/** 최대 행 수 이하이면 행 수만큼 늘어나고("auto"), 넘으면 최대 행 높이로 고정한다. */
export function tcGridHeight(rowCount: number): "auto" | number {
  return rowCount > TC_GRID_MAX_ROWS ? TC_GRID_MAX_HEIGHT : "auto";
}

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

/** 케이스 표 한 행. ag-grid 는 칸 값이 바뀐 셀만 다시 그리므로, 결과 표시는 글자 칸 값(`result`)에 담는다. */
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
}

// 열은 `columnSizing="fit"` + 작은 `minWidth` 로 카드 폭에 맞춰 줄인다(RuleListGrid 선례). 맨 앞 체크 칸은 `selectable` 이 붙인다.
// 남는 폭은 결과 열이 가져간다(불일치 키·오류 문장이 길다).
function caseColumns(resultLabel: string): GridColumn[] {
  return [
    { key: "caseId", header: "case_id", width: 70, minWidth: 60 },
    {
      key: "name", meta: false, header: "이름", width: 160, minWidth: 100,
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
    { key: "inputJson", header: "입력", width: 220, minWidth: 120, render: (v) => <code>{String(v)}</code> },
    {
      key: "expectedJson", header: "기대", width: 180, minWidth: 100,
      render: (v) => (v ? <code>{String(v)}</code> : <MutedText>(기대값 없음)</MutedText>),
    },
    {
      key: "result", meta: false, header: `결과(${resultLabel})`, width: 260, minWidth: 140,
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
  // 표 데이터(`rows`)의 재료는 메모한다 — AgDataGrid 의 제어형 선택 동기화는 `data` 가 바뀔 때마다 돌고, ag-grid 는 선택 알림을
  // setTimeout 으로 미루므로, 관련 없는 이유로 다시 그릴 때마다 새 배열을 넘기면 알림 전에 동기화가 방금 한 체크를 되돌린다.
  const cases = useMemo<TestCaseView[]>(() => view.testCases ?? [], [view.testCases]);
  const [running, setRunning] = useState(false);
  const [runningSelected, setRunningSelected] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 묶음 쓰기(복사·기대값 갱신·삭제)에서 실패한 건의 사유 — view 를 다시 불러온 뒤에 보인다.
  const [writeError, setWriteError] = useState<string | null>(null);
  const { showMessage } = useMessage();
  // 체크한 케이스 — 룰과 함께 들어 룰이 바뀌면 빈 선택으로 본다(케이스 번호는 룰마다 겹칠 수 있다).
  const [selection, setSelection] = useState<{ ruleId: string; ids: number[] }>({ ruleId, ids: [] });
  // 실제로 쓰는 선택은 지금 view 에 남은 케이스만이다 — 삭제·다른 사람의 변경으로 사라진 caseId 는 뺀다.
  const selectedIds = useMemo(() => {
    if (selection.ruleId !== ruleId) return [];
    const live = new Set((view.testCases ?? []).map((c) => c.caseId));
    return selection.ids.filter((id) => live.has(id));
  }, [selection, ruleId, view.testCases]);
  // 상태에서도 정리한다 — 사라졌던 케이스가 다시 와도 저절로 체크되지 않게. 바뀐 게 없으면 같은 객체를 돌려 다시 그리지 않는다.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.ruleId !== ruleId) return { ruleId, ids: [] };
      const live = new Set((view.testCases ?? []).map((c) => c.caseId));
      const keep = prev.ids.filter((id) => live.has(id));
      return keep.length === prev.ids.length ? prev : { ruleId, ids: keep };
    });
  }, [ruleId, view.testCases]);
  useEffect(() => setWriteError(null), [ruleId]);
  // 수정 팝업 대상과 열 때의 칸 — [수정]을 누른 순간 한 번 고정한다(열려 있는 동안 ④ 입력 줄이 늦게 바뀌어도 고치던 칸을 덮지 않게).
  const [editing, setEditing] = useState<{ c: TestCaseView; initial: CaseEditFields } | null>(null);
  // 경계값 후보 팝업 — [경계값 생성] 을 누른 순간의 후보·대상으로 고정한다. 닫으면 null(팝업 언마운트로 진행 중 실행을 멈춘다).
  const [boundary, setBoundary] = useState<BoundarySession | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const boundarySeq = useRef(0);
  // [경계값 생성] 이 열 조건을 서버 파싱으로 받는 중. 받는 사이 룰이 바뀌면 결과를 버린다(ruleRef).
  const [boundaryPreparing, setBoundaryPreparing] = useState(false);
  const ruleRef = useRef(ruleId);
  ruleRef.current = ruleId;
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
  const runResult = run?.result;
  const byCase = useMemo(() => new Map((runResult?.cases ?? []).map((c) => [c.caseId, c] as const)), [runResult]);
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

  // 묶음 쓰기 — 한 건씩 차례로 보내고(실패해도 나머지를 보낸다) 쓰기 한 번으로 감싸 view 를 한 번만 다시 불러온다.
  // 실패한 건은 사유를 모아 다시 불러온 뒤에 보인다.
  const writeEach = useCallback(
    async (label: string, list: TestCaseView[], write: (c: TestCaseView) => Promise<unknown>) => {
      if (list.length === 0) return;
      const failed: string[] = [];
      setWriteError(null);
      setWriting(true);
      try {
        await runWrite(() =>
          saveSequential(list, write, (c, err) => {
            if (err) failed.push(`${c.caseName}(case_id ${c.caseId}): ${err}`);
          }),
        );
      } finally {
        setWriting(false);
      }
      if (failed.length > 0) setWriteError(`케이스 ${failed.length}건의 ${label}에 실패했습니다.\n${failed.join("\n")}`);
    },
    [runWrite],
  );

  // 기대값 갱신에 쓸 기대 JSON — 마지막 결과가 OK 인 케이스만 만든다(판정 오류·결과 없음은 null).
  const expectedOf = (c: TestCaseView): string | null => {
    const r = byCase.get(c.caseId);
    return r && r.outcome === "OK" ? expectedFromResult(asResult(r), def?.vars ?? view.vars, null) : null;
  };

  const handleUpdateExpected = (list: TestCaseView[]) => {
    // 기대 JSON 은 누른 순간의 결과로 고정한다. 결과가 OK 가 아닌 케이스는 보내지 않는다.
    const expected = new Map(list.map((c) => [c.caseId, expectedOf(c)] as const));
    const targets = list.filter((c) => expected.get(c.caseId) != null);
    return writeEach("기대값 갱신", targets, (c) =>
      saveTestCase(ruleId, {
        caseId: c.caseId,
        rowVersion: c.rowVersion,
        caseName: c.caseName,
        inputJson: c.inputJson,
        expectedJson: expected.get(c.caseId)!,
        description: c.description ?? null,
      }),
    );
  };

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

  // "실행"(체크한 케이스) — 고른 케이스를 `caseIds` 로 실어 요청 한 번에 돌린다. 서버는 케이스마다 저장된 입력으로 판정하고,
  // 기대값 비교는 서버 RuleCaseJudge 가 해 "모두 실행" 과 배지 기준이 같다.
  // 요청의 입력은 첫 케이스의 입력이다 — 1건이면 ⑤ 에 그 케이스 입력의 판정을 보이고, 여러 건이면 "모두 실행" 처럼 케이스 요약만 보인다.
  const handleRunSelected = useCallback(
    async (list: TestCaseView[]) => {
      if (!choice || list.length === 0) return;
      const prepared = prepareRun(view, choice, tableDraft, list[0].inputJson, true, list.map((c) => c.caseId));
      setRunningSelected(true);
      setError(null);
      try {
        const result = await runValueTest(prepared.request);
        setTestRun(list.length === 1 ? { ...prepared.run, result } : { ...prepared.run, result, casesOnly: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunningSelected(false);
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

  const handleCopy = (list: TestCaseView[]) =>
    writeEach("복사", list, (c) => {
      // 원본 값을 그대로 복제한다. 복사본에도 지금 계약의 없는 키는 null 로 채운다.
      const filled = caseInput(c);
      return copyTestCase(ruleId, {
        ...c,
        caseName: filled.caseName,
        description: filled.description,
        inputJson: filled.inputJson,
        expectedJson: filled.expectedJson,
      });
    });

  // [삭제] — 확인창(VersionActionBar 와 같은 shared 확인창)을 거친다. 대상과 row_version 은 누른 순간으로 고정한다.
  const confirmDeleteSelected = (list: TestCaseView[]) => {
    if (list.length === 0) return;
    const rid = ruleId;
    showMessage({
      title: "확인",
      message: `선택한 케이스 ${list.length}건을 삭제하시겠습니까?`,
      alertType: "confirm",
      onConfirm: () => void writeEach("삭제", list, (c) => deleteTestCase(rid, c.caseId, c.rowVersion)),
    });
  };

  // 외부 원천 룰도 케이스는 쓴다(D-145) — 케이스는 버전과 무관한 검증 자료라 원천 조건을 보지 않는다.
  const canWrite = canDo("save") && !busy;
  // 다른 버전 대상이면 그 버전 정의를 받은 뒤에만 후보를 만든다(받는 중에 지금 버전 행으로 만들지 않게).
  const boundaryReady = choice != null && (choice.target === "BODY" || choiceDef != null);

  // [경계값 생성] — "모두 실행" 과 같은 대상의 표·변수로 후보를 만든다. 결과 열 그룹의 열 조건만 서버 파싱으로 AST 를 받는다(불변 9).
  const handleBoundary = async () => {
    if (!choice || !boundaryReady || boundaryPreparing) return;
    setBoundaryError(null);
    const body = choice.target === "BODY";
    const vars = body ? view.vars : choiceDef!.vars;
    // 결과 열 그룹 — resGrp 가 같은 결과 변수를 var seq 순으로 모은다. 열 조건이 하나도 없는 그룹은 뺀다.
    const metaOf = new Map(((body ? view.varMeta : choiceDef!.varMeta) ?? []).map((m) => [m.varId, m] as const));
    const grouped = new Map<string, Array<{ v: (typeof vars)[number]; text: string }>>();
    for (const v of vars.filter((x) => x.varKind === "RESULT").sort((a, b) => a.seq - b.seq || a.varId - b.varId)) {
      const m = metaOf.get(v.varId);
      const grp = m?.resGrp?.trim();
      if (!grp) continue;
      grouped.set(grp, [...(grouped.get(grp) ?? []), { v, text: (m!.grpCond ?? "").trim() }]);
    }
    const withCond = [...grouped].filter(([, cols]) => cols.some((c) => c.text !== ""));
    const texts = [...new Set(withCond.flatMap(([, cols]) => cols.map((c) => c.text)).filter((t) => t !== ""))];
    const token = ++boundarySeq.current;
    const startRule = ruleId;
    let parsed: Array<Pick<GroupCondColumn, "ast" | "supported">> = [];
    if (texts.length > 0) {
      setBoundaryPreparing(true);
      try {
        // 하나가 실패해도 나머지는 쓴다 — 실패·problems 는 화면에서 평가하지 못하는 열 조건(supported:false)이다.
        const results = await Promise.all(texts.map((t) => serverParse(t, "RULE_GRP_COND").then((r) => r, () => null)));
        parsed = results.map((r) =>
          r && r.ast && !(r.problems?.length ?? 0)
            ? { ast: r.ast as unknown as GroupCondColumn["ast"], supported: r.supported }
            : { ast: null, supported: false },
        );
      } finally {
        setBoundaryPreparing(false);
      }
      if (boundarySeq.current !== token || ruleRef.current !== startRule) return;
    }
    const astOf = new Map(texts.map((t, i) => [t, parsed[i]] as const));
    const groupConds = withCond.map(([group, cols]) => ({
      group,
      columns: cols.map(({ v, text }) => ({
        varId: v.varId,
        name: v.varName || v.label || `결과 열 ${v.seq}`,
        seq: v.seq,
        ...(text === "" ? { ast: null, supported: true } : astOf.get(text)!),
      })),
    }));
    try {
      const rows = body ? bodyTable(view, choice.ver, tableDraft).rows : choiceDef!.rows;
      const baseInput = inputObject(input?.inputJson);
      const plan = planBoundaryCases({
        vars,
        rows,
        baseInput,
        existingInputs: cases.map((c) => c.inputJson),
        groupConds,
      });
      // 입력 계약 이름은 카드 ④ 가 같은 대상으로 계산해 올린 입력 줄을 쓴다(④ 가 없으면 경고하지 않는다).
      const emptyInputs = emptyResultInputs((input?.fields ?? []).map((f) => f.name), vars, baseInput);
      const base = prepareRun(view, choice, tableDraft, "{}").request;
      setBoundary({
        id: token,
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

  const columns = useMemo(() => caseColumns(resultLabel), [resultLabel]);

  const runBlocked = !canDo("execute") || busy || running || !choice || runningSelected;
  // 머리글 버튼의 대상 — 체크한 케이스를 표 순서대로.
  const selectedSet = new Set(selectedIds);
  const selectedCases = cases.filter((c) => selectedSet.has(c.caseId));
  const single = selectedCases.length === 1 ? selectedCases[0] : null;
  const updatable = selectedCases.filter((c) => expectedOf(c) != null);
  const writeBlocked = !canWrite || writing;
  const rows = useMemo<CaseRow[]>(
    () =>
      cases.map((c) => {
        const r = byCase.get(c.caseId);
        const badge = r ? caseBadge(r) : null;
        const mismatches = r ? mismatchText(r) : "";
        const errors = r ? errorText(r) : "";
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
        };
      }),
    [cases, byCase],
  );

  return (
    <CardFrame
      title="⑥ 테스트 케이스"
      testId="rule-card-test-cases"
      right={
        <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: "var(--spacing-sm)" }}>
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>TB_MDM_RULE_TEST_CASE · 버전과 무관</span>
          <span data-testid="tc-selected-count" style={{ fontWeight: 400 }}>
            선택 {selectedCases.length}건
          </span>
          {/* 체크한 케이스 대상 버튼 */}
          <Button size="sm" data-testid="tc-load" disabled={!single} onClick={() => single && loadCase(ruleId, single.inputJson)}>
            불러오기
          </Button>
          <Button size="sm" data-testid="tc-run" disabled={runBlocked || selectedCases.length === 0} onClick={() => void handleRunSelected(selectedCases)}>
            {runningSelected ? "실행 중..." : "실행"}
          </Button>
          <Button size="sm" data-testid="tc-copy" disabled={writeBlocked || selectedCases.length === 0} onClick={() => void handleCopy(selectedCases)}>
            복사
          </Button>
          <Button size="sm" data-testid="tc-edit" disabled={writeBlocked || !single} onClick={() => single && setEditing({ c: single, initial: caseInput(single) })}>
            수정
          </Button>
          <Button size="sm" data-testid="tc-update-expected" disabled={writeBlocked || updatable.length === 0} onClick={() => void handleUpdateExpected(updatable)}>
            기대값 갱신
          </Button>
          <Button size="sm" data-testid="tc-delete" disabled={writeBlocked || selectedCases.length === 0} onClick={() => confirmDeleteSelected(selectedCases)}>
            삭제
          </Button>
          <span aria-hidden style={{ alignSelf: "stretch", width: 1, background: "var(--color-border)" }} />
          <Button size="sm" disabled={!canDo("execute") || busy || running || !choice || cases.length === 0} onClick={() => void handleRunAll()}>
            모두 실행
          </Button>
          <Button size="sm" data-testid="tc-boundary" disabled={!canWrite || !boundaryReady || boundaryPreparing} onClick={() => void handleBoundary()}>
            {boundaryPreparing ? "준비 중…" : "경계값 생성"}
          </Button>
        </span>
      }
    >
      <AgDataGrid
        columns={columns}
        data={rows as unknown as Record<string, unknown>[]}
        rowKey="caseId"
        height={tcGridHeight(rows.length)}
        columnSizing="fit"
        selectable
        multiSelect
        selectedRows={selectedIds}
        onRowSelect={(ids) => setSelection({ ruleId, ids: ids.map(Number) })}
        rowClickCheck
        sortable={false}
        getRowHeight={() => 28}
        emptyMessage="테스트 케이스가 없습니다"
        emptyTestId="tc-empty"
        ariaLabel="테스트 케이스 목록"
      />
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
      {writeError && (
        <p data-testid="tc-write-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          {writeError}
        </p>
      )}
      <p style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
        케이스는 값 테스트에서 고른 대상(편집본이면 저장 전 정의)으로 실행한다. 새 버전이 판정을 바꾸면 기대값도 같이 고친다.
      </p>
    </CardFrame>
  );
}
