"use client";

/**
 * 카드 ⑥ 테스트 케이스(TSK-08-04 design §6.6·§6.7, 시안 H7). `TB_MDM_RULE_TEST_CASE` 는 버전과 무관하다 — view 의 `testCases` 를 그린다.
 *
 * "모두 실행" 은 값 테스트 카드(④)가 고른 대상·입력(`valueTestInput`)에 `runCases` 를 실어 한 번 돌리고, 케이스마다 서버 비교 결과로
 * 배지("돌려 보기만"/"통과"/"실패 · 불일치 키")를 보인다(I24 — 비교는 서버가 결과 변수 타입으로 한다). "불러오기" 는 케이스 입력을 ④ 입력 칸에
 * 채운다. "수정" 은 팝업에서 이름·설명·입력·기대 JSON 을 고친다. "기대값 갱신" 은 마지막 결과로 기대 JSON 을 다시 쓰고, "삭제" 는 한 번 더 눌러야 보낸다. 쓰기는 row_version 조건(MDM001)이고 뒤에
 * view 를 다시 불러온다.
 */
import { useCallback, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { copyTestCase, deleteTestCase, runValueTest, saveTestCase } from "../api";
import type { RuleEditCardProps } from "../cards";
import { useRuleWorkbench } from "../state/workbench-context";
import type { TestCaseView, ValueTestCaseResult, ValueTestResult } from "../types";
import { caseBadge, expectedFromResult, type CaseBadge, type CaseEditFields } from "../value-test/case-model";
import { mergeMissingInputKeys } from "../value-test/test-input";
import { prepareRun, resolveTarget, targetLabel, targetOptions, useTargetView } from "../value-test/run-request";
import { CardFrame, MutedText } from "./CardFrame";
import { TestCaseEditModal } from "./TestCaseEditModal";

const th = { textAlign: "left", padding: "4px 6px", whiteSpace: "nowrap", borderBottom: "1px solid var(--color-border-light)" } as const;
const td = { padding: "4px 6px", verticalAlign: "top", borderBottom: "1px solid var(--color-border-light)" } as const;
const code = { whiteSpace: "pre-wrap", wordBreak: "break-all" } as const;

function badgeCss(b: CaseBadge) {
  if (b.tone === "danger") return { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };
  return badgeStyle(b.tone === "success" ? "success" : "muted");
}

function shown(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? null);
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
  const [editing, setEditing] = useState<TestCaseView | null>(null);

  // 대상은 값 테스트 카드가 고른 것, 없으면(카드 ④ 없이) 같은 기본값.
  const fallback = resolveTarget(targetOptions(view, editable), null, view)?.choice ?? null;
  const input = valueTestInput && valueTestInput.ruleId === ruleId ? valueTestInput : null;
  const choice = input ? { target: input.target, ver: input.ver } : fallback;

  const run = testRun && testRun.ruleId === ruleId ? testRun : null;
  const byCase = new Map((run?.result.cases ?? []).map((c) => [c.caseId, c] as const));
  const { def } = useTargetView(view, run ? { target: run.target, ver: run.ver } : null);

  const handleRunAll = useCallback(async () => {
    if (!choice) return;
    const prepared = prepareRun(view, choice, tableDraft, input?.inputJson ?? "{}", true);
    setRunning(true);
    setError(null);
    try {
      const result = await runValueTest(prepared.request);
      setTestRun({ ...prepared.run, result });
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
      const names = input?.fieldNames;
      return names && names.length > 0
        ? { ...base, inputJson: mergeMissingInputKeys(base.inputJson, names.map((n) => ({ name: n }))) }
        : base;
    },
    [input?.fieldNames],
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
  const resultLabel = run ? targetLabel(run) : choice ? targetLabel(choice) : "-";

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
        </span>
      }
    >
      {cases.length === 0 ? (
        <p data-testid="tc-empty" style={{ margin: 0, color: "var(--color-text-muted)" }}>
          테스트 케이스가 없습니다
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "var(--font-size-sm)" }}>
            <thead>
              <tr>
                <th style={th}>case_id</th>
                <th style={th}>이름</th>
                <th style={th}>입력</th>
                <th style={th}>기대</th>
                <th style={th}>결과({resultLabel})</th>
                <th style={th}>동작</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const r = byCase.get(c.caseId);
                const badge = r ? caseBadge(r) : null;
                return (
                  <tr key={c.caseId} data-testid={`tc-row-${c.caseId}`}>
                    <td style={td}>{c.caseId}</td>
                    <td style={td}>
                      {c.caseName}
                      {c.description && (
                        <>
                          <br />
                          <MutedText>{c.description}</MutedText>
                        </>
                      )}
                    </td>
                    <td style={td}>
                      <code style={code}>{c.inputJson}</code>
                    </td>
                    <td style={td}>{c.expectedJson ? <code style={code}>{c.expectedJson}</code> : <MutedText>(기대값 없음)</MutedText>}</td>
                    <td style={td}>
                      {!badge ? (
                        <MutedText>-</MutedText>
                      ) : (
                        <>
                          <span data-testid={`tc-badge-${c.caseId}`} style={badgeCss(badge)}>
                            {badge.text}
                          </span>
                          {r!.mismatches.length > 0 && (
                            <MutedText> {r!.mismatches.map((m) => `${m.key} ${shown(m.expected)} ≠ ${shown(m.actual)}`).join(" · ")}</MutedText>
                          )}
                          {(r!.errors ?? []).length > 0 && (
                            <span style={{ color: "var(--color-danger)" }}> {(r!.errors ?? []).map((e) => `${e.code} — ${e.message}`).join(" · ")}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
                        <Button size="sm" onClick={() => loadCase(ruleId, c.inputJson)}>
                          불러오기
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canDo("execute") || busy || running || !choice || runningCase != null}
                          data-testid={`tc-run-${c.caseId}`}
                          onClick={() => void handleRunOne(c)}
                        >
                          {runningCase === c.caseId ? "실행 중..." : "실행"}
                        </Button>
                        <Button size="sm" disabled={!canWrite} data-testid={`tc-copy-${c.caseId}`} onClick={() => void handleCopy(c)}>
                          복사
                        </Button>
                        <Button size="sm" disabled={!canWrite} data-testid={`tc-edit-${c.caseId}`} onClick={() => setEditing(c)}>
                          수정
                        </Button>
                        <Button size="sm" disabled={!canWrite || !r || r.outcome !== "OK"} onClick={() => void handleUpdateExpected(c, r!)}>
                          기대값 갱신
                        </Button>
                        <Button size="sm" variant={confirmDelete === c.caseId ? "danger" : "default"} disabled={!canWrite} onClick={() => void handleDelete(c)}>
                          {confirmDelete === c.caseId ? "삭제 확인" : "삭제"}
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <TestCaseEditModal
        target={editing}
        initial={editing ? caseInput(editing) : null}
        currentInput={input?.inputJson ?? null}
        busy={busy}
        onSave={handleEdit}
        onClose={() => setEditing(null)}
      />
      {error && (
        <p data-testid="tc-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          케이스를 돌리지 못했습니다. {error}
        </p>
      )}
      <p style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
        케이스는 값 테스트에서 고른 대상(편집본이면 저장 전 정의)으로 모두 돌린다. 새 버전이 판정을 바꾸면 기대값도 같이 고친다.
      </p>
    </CardFrame>
  );
}
