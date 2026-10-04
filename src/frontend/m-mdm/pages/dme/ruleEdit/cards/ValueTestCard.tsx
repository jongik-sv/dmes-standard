"use client";

/**
 * 카드 ④ 값 테스트(TSK-08-04 design §6.7, 시안 H7). 대상(편집본 또는 저장된 버전)을 고르고 입력 레코드를 넣어 서버 값 테스트(action execute)를
 * 돌린다. 판정은 서버만 한다(06:731) — 결과는 카드 공유 상태(`setTestRun`)에 올려 테스트 결과 카드(⑤)가 그리고 표 카드(③)가 칠한다.
 *
 * 입력 줄은 대상 정의의 입력 계약 이름이다(`inputFields`). 편집본은 표 카드가 올린 편집 중인 표, 다른 버전은 `viewRule` 로 받은 그 버전 정의로
 * 계산한다. 식 변수·열 조건과 편집해 `ast` 가 없는 식 칸의 AST 는 서버 `parseExpr` 로 받는다(못 받으면 그 식이 읽는 변수는 빠진다). 키 보냄을 끄면 레코드에서 키를 빼고,
 * 빈 칸은 null 로 싣는다(I21). 값 테스트는 원장에 쓰지 않으므로 `runWrite`(쓰기 뒤 다시 불러오기)를 쓰지 않고, 서버 오류는 이 카드에 보인다.
 * "케이스로 저장" 은 방금 같은 대상·입력으로 돌린 결과가 있으면 그것을 기대값으로 싣는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Button, Checkbox, Input, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle, fmtVer } from "@/shell";

import { runValueTest, saveTestCase } from "../api";
import type { RuleEditCardProps } from "../cards";
import { canParseOnServer } from "../expr/parse-expr";
import { useServerAsts } from "../expr/useServerAsts";
import { contractSourceOfView, exprSlotsOf, type AstByText, type ContractSource } from "../sections/contract/contract-view";
import { useRuleWorkbench } from "../state/workbench-context";
import { expectedFromResult } from "../value-test/case-model";
import { bodyTable, defaultRowIdOf, prepareRun, resolveTarget, targetKey, targetOptions, useTargetView } from "../value-test/run-request";
import { buildInputJson, inputFields, inputFromCase } from "../value-test/test-input";

interface FieldRow {
  name: string;
  label: string | null;
  typeBadge: string;
  contractBadge: string;
  always: boolean;
  note: string;
  value: string;
  sent: boolean;
}

interface FieldActions {
  setSent: (name: string, on: boolean) => void;
}

// 입력 표 — 값 칸은 그리드 편집(누르면 편집, Enter·다른 곳 클릭으로 확정)이고, 확정한 값은 onCellValueChanged 로 받는다.
// 칸 안에 입력 요소를 직접 두면 그리드가 행 클릭 때 포커스를 가져가 글자가 들어가지 않는다. 열은 한 번만 만들고
// 키 보냄 손잡이는 ref 로 넘긴다(TestCaseCard 의 동작 열과 같은 방식).
function fieldColumns(actions: { current: FieldActions | null }): GridColumn[] {
  return [
    {
      key: "name", header: "변수", width: 200, minWidth: 140,
      render: (_v, row) => {
        const r = row as unknown as FieldRow;
        return (
          <span data-testid={`vt-field-${r.name}`}>
            {r.label && <span style={{ fontWeight: 600 }}>{r.label} </span>}
            <code>{r.name}</code>
          </span>
        );
      },
    },
    { key: "typeBadge", header: "타입", width: 90, minWidth: 80, align: "center", render: (v) => <span style={badgeStyle("neutral")}>{String(v)}</span> },
    {
      key: "contractBadge", header: "계약", width: 110, minWidth: 100, align: "center",
      render: (_v, row) => {
        const r = row as unknown as FieldRow;
        return r.contractBadge ? <span style={badgeStyle(r.always ? "info" : "muted")}>{r.contractBadge}</span> : null;
      },
    },
    {
      key: "sent", header: "키 보냄", width: 70, minWidth: 64, align: "center", tooltip: false,
      render: (_v, row) => {
        const r = row as unknown as FieldRow;
        return (
          <span data-testid={`vt-key-${r.name}`} style={{ display: "inline-flex" }}>
            <Checkbox aria-label={`${r.name} 키 보냄`} checked={r.sent} onChange={(on) => actions.current?.setSent(r.name, on)} />
          </span>
        );
      },
    },
    {
      key: "value", header: "값", width: 220, minWidth: 140,
      editable: (row) => (row as unknown as FieldRow).sent,
      cellClassRules: { "cell-input": (row) => (row as unknown as FieldRow).sent },
      render: (_v, row) => {
        const r = row as unknown as FieldRow;
        if (!r.sent) return <MutedText>(키 없음)</MutedText>;
        return r.value === "" ? <MutedText>NULL</MutedText> : r.value;
      },
    },
    { key: "note", header: "설명", width: 260, minWidth: 100, render: (v) => (v ? <MutedText>{String(v)}</MutedText> : null) },
  ];
}

const MODE_DESC = {
  BODY: "편집 중인 행을 요청에 실어 보낸다(변수는 이 DRAFT 의 저장된 열). 서버는 저장 때와 같은 파싱·화이트리스트·생성기를 돌려 메모리에서만 판정하고 버린다. 저장하지 않아도, 저장 시 검사에 걸리는 표도 실행할 수 있다.",
  VERSION: "저장된 버전을 서버가 원장에서 읽어 판정한다. 편집본과 결과를 견줄 때 쓴다.",
} as const;

export function ValueTestCard({ view, editable, canDo, busy, runWrite }: RuleEditCardProps) {
  const workbench = useRuleWorkbench();
  const { tableDraft, setTestRun, publishValueTestInput, caseLoad, colDirty } = workbench;
  const ruleId = view.rule.maruRuleId;

  const options = useMemo(() => targetOptions(view, editable), [view, editable]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const option = resolveTarget(options, pickedKey, view);
  const choice = option?.choice ?? null;
  const { def, error: defError } = useTargetView(view, choice);

  // 입력 칸 — 룰이 바뀌면 비운다(대상만 바꾸면 같은 이름의 값은 남긴다).
  const [values, setValues] = useState<Record<string, string>>({});
  const [keySent, setKeySent] = useState<Record<string, boolean>>({});
  const [caseName, setCaseName] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ key: string; inputJson: string } | null>(null);
  const ruleRef = useRef(ruleId);
  useEffect(() => {
    if (ruleRef.current === ruleId) return;
    ruleRef.current = ruleId;
    setValues({});
    setKeySent({});
    setPickedKey(null);
    setError(null);
    setLastRun(null);
  }, [ruleId]);

  // 계약 원본은 편집본(BODY) 대상일 때만 표 카드가 올린 표(행·적중 정책)에 기댄다. tableDraft 객체 자체에 기대면 저장된 버전 대상이거나
  // 다른 룰·버전의 표가 올라와도, dirty 만 바뀌어도 계약(행 수 × 변수)을 다시 계산한다 — 실제로 읽는 행 배열·적중 정책만 기준으로 삼는다.
  const body = choice?.target === "BODY" ? bodyTable(view, choice.ver, tableDraft) : null;
  const bodyRows = body?.rows ?? null;
  const bodyHit = body?.hitPolicy ?? null;
  const src = useMemo<ContractSource | null>(() => {
    if (!choice || !def) return null;
    const base = contractSourceOfView(def, "current");
    if (!base || choice.target !== "BODY" || !bodyRows) return base;
    return { ...base, hitPolicy: bodyHit, rows: bodyRows };
  }, [choice, def, bodyRows, bodyHit]);

  // 식 AST 는 서버 파싱으로 받는다(ContractChangeNotice 와 같은 조건 — 편집 가능하고 validate 권한이 있을 때만).
  const parseEnabled = canParseOnServer({ editable, canValidate: canDo("validate") });
  const wanted = useMemo(() => exprSlotsOf(src), [src]);
  const asts: AstByText = useServerAsts(wanted, parseEnabled);

  const fieldsResult = useMemo(() => (src ? inputFields(src, asts, view.varCandidates ?? []) : null), [src, asts, view.varCandidates]);
  const fields = fieldsResult?.fields ?? [];
  const inputJson = useMemo(() => buildInputJson(fields, values, keySent), [fields, values, keySent]);

  const actions = useRef<FieldActions | null>(null);
  actions.current = { setSent: (name, on) => setKeySent((prev) => ({ ...prev, [name]: on })) };
  const columns = useMemo(() => fieldColumns(actions), []);
  const rows = useMemo<FieldRow[]>(
    () =>
      fields.map((f) => ({
        name: f.name,
        label: f.label,
        typeBadge: f.typeBadge,
        contractBadge: f.contractBadge,
        always: f.always,
        note: [f.description, f.domain ? `도메인 ${f.domain}` : null].filter(Boolean).join(" · "),
        value: values[f.name] ?? "",
        sent: keySent[f.name] !== false,
      })),
    [fields, values, keySent],
  );
  const handleValueChange = useCallback(({ rowKey, field, newValue }: { rowKey: string | number; field: string; newValue: unknown }) => {
    if (field !== "value") return;
    setValues((prev) => ({ ...prev, [String(rowKey)]: newValue == null ? "" : String(newValue) }));
  }, []);
  // 키 보냄을 바꾸면 같은 행의 값 칸(편집 가능·표시)도 다시 그려야 한다 — 그리드는 값이 바뀐 칸만 다시 그린다.
  const sentToken = useMemo(() => rows.map((r) => (r.sent ? 1 : 0)).join(""), [rows]);

  // 테스트 케이스 카드(⑥)의 "모두 실행" 이 같은 대상·입력을 쓴다.
  // 입력 줄 요약도 같이 실어 ⑥ 가 저장된 케이스 입력에 없는 키를 null 로 채우고(룰에 컬럼이 새로 들어온 경우)
  // 케이스 수정 팝업의 입력 폼 줄을 만들 수 있게 한다.
  const fieldInfos = useMemo(
    () => fields.map((f) => ({ name: f.name, label: f.label, typeBadge: f.typeBadge, contractBadge: f.contractBadge })),
    [fields],
  );
  useEffect(() => {
    publishValueTestInput(choice ? { ruleId, target: choice.target, ver: choice.ver, inputJson, fields: fieldInfos } : null);
  }, [publishValueTestInput, ruleId, choice, inputJson, fieldInfos]);

  // 케이스 "불러오기" — 요청이 올 때마다 한 번 입력 칸을 채운다.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const loadedSeq = useRef(caseLoad?.seq ?? 0);
  useEffect(() => {
    if (!caseLoad || caseLoad.seq === loadedSeq.current) return;
    loadedSeq.current = caseLoad.seq;
    if (caseLoad.ruleId !== ruleId) return;
    try {
      const filled = inputFromCase(fieldsRef.current, caseLoad.inputJson);
      setValues(filled.values);
      setKeySent(filled.keySent);
      setError(null);
    } catch (e) {
      setError(`케이스 입력을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [caseLoad, ruleId]);

  const handleRun = useCallback(async () => {
    if (!choice) return;
    const prepared = prepareRun(view, choice, tableDraft, inputJson);
    setRunning(true);
    setError(null);
    try {
      const result = await runValueTest(prepared.request);
      setTestRun({ ...prepared.run, result });
      setLastRun({ key: targetKey(choice), inputJson });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [choice, view, tableDraft, inputJson, setTestRun]);

  const handleSaveCase = useCallback(async () => {
    if (!choice) return;
    const run = workbench.testRun;
    const same =
      run != null &&
      run.ruleId === ruleId &&
      lastRun != null &&
      lastRun.key === targetKey(choice) &&
      lastRun.inputJson === inputJson &&
      targetKey({ target: run.target, ver: run.ver ?? "" }) === lastRun.key;
    const rows = choice.target === "BODY" ? bodyTable(view, choice.ver, tableDraft).rows : (def?.rows ?? []);
    const expected = same && def ? expectedFromResult(run.result, def.vars, defaultRowIdOf(rows)) : null;
    const saved = await runWrite(() => saveTestCase(ruleId, { caseName: caseName.trim(), inputJson, expectedJson: expected }));
    if (saved) setCaseName("");
  }, [choice, workbench.testRun, ruleId, lastRun, inputJson, view, tableDraft, def, runWrite, caseName]);

  const canRun = canDo("execute") && !running && !busy && !!choice && !!def && !fieldsResult?.failure;
  const canSaveCase = canDo("save") && !busy && !running && !!choice && !!def && caseName.trim() !== "" && view.rule.sourceKind === "MDM";

  return (
    <CardFrame title="④ 값 테스트" testId="rule-card-value-test" right={<span style={badgeStyle("info")}>값 테스트 API</span>}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-sm)" }}>
        <span>대상</span>
        <Select
          data-testid="vt-target"
          value={option?.key ?? ""}
          options={options.map((o) => ({ value: o.key, label: o.label }))}
          onChange={setPickedKey}
          disabled={options.length === 0}
          style={{ width: 220 }}
        />
        {choice?.target === "BODY" && colDirty && (
          <span data-testid="vt-col-draft" style={{ color: "var(--color-warning)" }}>
            열 설정 초안은 반영하지 않습니다(적용 뒤 다시 실행하세요).
          </span>
        )}
      </div>
      {choice && (
        <p data-testid="vt-mode" style={{ margin: "var(--spacing-xs) 0", color: "var(--color-text-secondary)" }}>
          <span style={badgeStyle("neutral")}>{choice.target === "BODY" ? "본문 정의" : "저장된 버전"}</span> {MODE_DESC[choice.target]}
        </p>
      )}

      {defError && (
        <p role="alert" style={{ color: "var(--color-danger)", whiteSpace: "pre-line" }}>
          버전 {fmtVer(choice?.ver)} 정의를 불러오지 못했습니다: {defError}
        </p>
      )}
      {choice && !def && !defError && <MutedText>버전 {fmtVer(choice.ver)} 정의를 불러오는 중입니다.</MutedText>}
      {fieldsResult?.failure && (
        <p data-testid="vt-fields-failed" style={{ color: "var(--color-danger)" }}>
          입력 계약을 계산할 수 없어 입력 칸을 만들지 못했습니다(표의 칸을 고치세요): {fieldsResult.failure}
        </p>
      )}
      {fieldsResult && fieldsResult.pending.length > 0 && (
        <p data-testid="vt-pending" style={{ color: "var(--color-text-secondary)" }}>
          아직 파싱하지 못한 식이 읽는 변수는 입력 칸에 없을 수 있습니다: {fieldsResult.pending.join(" / ")}
        </p>
      )}
      {fieldsResult && !fieldsResult.failure && fields.length === 0 && (
        <p data-testid="vt-no-input" style={{ color: "var(--color-text-muted)" }}>
          입력 변수가 없습니다.
        </p>
      )}

      {fields.length > 0 && (
        <div style={{ paddingTop: "var(--spacing-xs)" }}>
          <AgDataGrid
            columns={columns}
            data={rows as unknown as Record<string, unknown>[]}
            rowKey="name"
            height="auto"
            columnSizing="fit"
            sortable={false}
            singleClickEdit
            onCellValueChanged={handleValueChange}
            rowClassRefreshToken={sentToken}
            ariaLabel="값 테스트 입력"
          />
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
        <Button variant="primary" disabled={!canRun} data-testid="vt-run" onClick={() => void handleRun()}>
          실행
        </Button>
        <Input data-testid="vt-case-name" value={caseName} placeholder="케이스 이름" onChange={setCaseName} style={{ width: 160 }} />
        <Button disabled={!canSaveCase} onClick={() => void handleSaveCase()}>
          케이스로 저장
        </Button>
      </div>
      {error && (
        <p data-testid="vt-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          값 테스트를 실행하지 못했습니다. {error}
        </p>
      )}
      <p style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
        키 보냄을 끄면 그 키를 레코드에서 뺀다. 칸을 비우면 키는 있고 값이 NULL 이다. 결과는 저장하지 않는다.
      </p>
    </CardFrame>
  );
}
