"use client";

/**
 * 테스트 케이스 수정 팝업(카드 ⑥) — 이름·설명·입력·기대를 고쳐 part CASE 로 저장한다(caseId·rowVersion 조건, MDM001).
 * 입력·기대는 [폼 | JSON] 탭으로 고친다. 폼은 입력 계약 줄(값·키 보냄)과 결과 줄(기대 값·비교)·적중 행으로 JSON 을 몰라도 고치게 하고,
 * JSON 탭은 복사한 JSON 을 붙여 넣을 때 쓴다. 결과 열 그룹은 엔진 결과 이름대로 그룹 이름 한 줄이다. 폼 탭 아래에는 저장될 JSON 을 늘 보인다.
 * 탭을 바꿀 때와 저장할 때 `case-form` 으로 변환하되, 폼을 건드리지 않은 쪽은 원래 JSON 글자를
 * 그대로 둔다(06 키 순서·숫자 표기 보존). 기대를 비우면 "기대값 없음"(실행만) 케이스가 된다. "값 테스트 입력으로 바꾸기" 는 카드 ④ 의 지금
 * 입력으로 입력을 바꾼다(④ 칸이 모두 비었으면 꺼 둔다). [테스트 실행]은 저장하지 않은 지금 입력·기대로 ④ 가 고른 대상을 판정해 결과를 팝업
 * 안에만 보인다(비교는 서버, I24). 칸을 고치면 결과를 지운다 — 지금 칸의 결과가 아니므로.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Button, Checkbox, Input, MultiSelectComboBox, Textarea } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { Tabs } from "@dk-oasis/shared/tabs";
import { badgeStyle } from "@/shell";

import { typeBadge } from "../decision-table/columns";
import type { DraftCaseResult, ResolvedVar, StoredRow, TestCaseView, VarCandidate, VarMeta } from "../types";
import { caseBadge, caseBadgeCss, caseEditError, caseJsonError, mismatchText, type CaseEditFields } from "../value-test/case-model";
import {
  expectedFormOf,
  expectedJsonOf,
  hitOptionsOf,
  inputFormOf,
  inputJsonOf,
  orderHitIds,
  parseObject,
  resultSlots,
  type CaseFormRow,
  type ExpectedForm,
} from "../value-test/case-form";
import type { InputFieldInfo } from "../value-test/test-input";

export interface TestCaseEditModalProps {
  /** 고칠 케이스 — null 이면 닫혀 있다. */
  target: TestCaseView | null;
  /**
   * 팝업을 열 때 채울 값. 카드 ⑥ 가 지금 계약의 없는 키를 null 로 채운 입력을 넘긴다 —
   * 룰에 컬럼이 새로 들어온 뒤에도 그 컬럼이 빈 칸으로 보인다.
   */
  initial: CaseEditFields | null;
  /** 카드 ④ 의 지금 입력 JSON(같은 룰일 때만). */
  currentInput: string | null;
  busy: boolean;
  /** 입력 폼 줄 — 카드 ④ 입력 줄(계약 이름 순서). 비면 저장된 키를 모두 "계약에 없는 키" 줄로 보인다. */
  fields?: readonly InputFieldInfo[];
  /** 결과 변수(기대 폼 줄)와 적중 행 후보 — 값 테스트가 고른 대상 정의의 것. */
  vars?: readonly ResolvedVar[];
  /** 결과 열 그룹(`resGrp`) — 그룹에 든 결과 열은 그룹 이름 한 줄로 묶는다. */
  varMeta?: readonly Pick<VarMeta, "varId" | "resGrp">[];
  /** 그룹 이름의 컬럼 사전 표시명(COLUMN 후보). */
  candidates?: readonly VarCandidate[];
  rows?: readonly StoredRow[];
  /** [테스트 실행] 대상 이름(④ 가 고른 것). */
  runTarget?: string | null;
  /** 저장하지 않은 입력·기대로 판정한다. 없으면(④ 대상 없음) [테스트 실행]을 끈다. */
  onRun?: (f: Pick<CaseEditFields, "inputJson" | "expectedJson">) => Promise<DraftCaseResult>;
  onSave: (c: TestCaseView, f: CaseEditFields) => Promise<boolean>;
  onClose: () => void;
}

type Mode = "form" | "json";

const label = { display: "block", margin: "var(--spacing-sm) 0 2px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" } as const;
const mono = { fontFamily: "var(--font-family-mono)" } as const;
const muted = { color: "var(--color-text-muted)" } as const;
/** 폼 줄 배치 — 변수 | 타입 | 계약 | 값 | 키 보냄·비교. 데이터 목록이 아니라 입력 폼이라 그리드 대신 CSS grid 로 줄을 세운다. */
const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1.4fr) 96px 110px minmax(140px, 1.6fr) 64px",
  alignItems: "center",
  columnGap: "var(--spacing-sm)",
  rowGap: "var(--spacing-xs)",
};
const headCell: CSSProperties = { fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)" };

function VarCell({ title, name, extra }: { title?: string | null; name: string; extra?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, overflow: "hidden", whiteSpace: "nowrap" }}>
      {title && title !== name ? <strong>{title}</strong> : null}
      <span style={title && title !== name ? muted : { fontWeight: 600 }}>{name}</span>
      {extra ? <span style={badgeStyle("warning")}>계약에 없음</span> : null}
    </span>
  );
}

function Badge({ text, tone = "neutral" }: { text?: string; tone?: "neutral" | "info" | "muted" }) {
  return text ? <span style={badgeStyle(tone)}>{text}</span> : <span style={muted}>-</span>;
}

export function TestCaseEditModal({
  target,
  initial,
  currentInput,
  busy,
  fields = [],
  vars = [],
  varMeta,
  candidates,
  rows = [],
  runTarget,
  onRun,
  onSave,
  onClose,
}: TestCaseEditModalProps) {
  const [f, setF] = useState<CaseEditFields | null>(null);
  const [mode, setMode] = useState<Mode>("form");
  const [inRows, setInRows] = useState<CaseFormRow[]>([]);
  const [exp, setExp] = useState<ExpectedForm | null>(null);
  // 폼에서 한 번이라도 고친 쪽만 JSON 을 다시 만든다 — 안 고친 쪽은 원래 글자를 그대로 저장한다.
  const [inDirty, setInDirty] = useState(false);
  const [expDirty, setExpDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [테스트 실행] 결과 — 칸을 고치면 지운다. 순번은 고친 뒤 늦게 온 응답을 버리려고 둔다.
  const [run, setRun] = useState<{ result: DraftCaseResult } | { error: string } | null>(null);
  const [running, setRunning] = useState(false);
  const runSeq = useRef(0);

  const names = useMemo(() => fields.map((x) => x.name), [fields]);
  const info = useMemo(() => new Map(fields.map((x) => [x.name.toUpperCase(), x] as const)), [fields]);
  const slots = useMemo(() => resultSlots(vars, varMeta), [vars, varMeta]);
  const slotOf = useMemo(() => new Map(slots.map((x) => [x.name.toUpperCase(), x] as const)), [slots]);
  const columnLabel = useMemo(
    () => new Map((candidates ?? []).filter((c) => c.kind === "COLUMN" && c.label).map((c) => [c.name.toUpperCase(), c.label!] as const)),
    [candidates],
  );

  /** JSON 글자 → 폼. 못 풀면 사유를 돌려주고 폼을 바꾸지 않는다. */
  const loadForms = (inputJson: string, expectedJson: string): string | null => {
    try {
      const nextIn = inputFormOf(names, inputJson);
      const nextExp = expectedFormOf(slots, expectedJson);
      setInRows(nextIn);
      setExp(nextExp);
      setInDirty(false);
      setExpDirty(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  useEffect(() => {
    setF(target && initial ? { ...initial } : null);
    setError(null);
    if (!target || !initial) return;
    // 저장된 JSON 이 폼으로 풀리지 않으면(깨진 JSON 등) JSON 탭으로 연다.
    const err = loadForms(initial.inputJson, initial.expectedJson);
    setMode(err ? "json" : "form");
    if (err) setError(`${err}\nJSON 탭에서 고치세요.`);
    // 팝업을 열 때(대상·초기값이 바뀔 때)만 채운다 — 폼 줄 계산에 쓰는 names·vars 가 바뀌어도 고치던 칸을 덮지 않는다.
  }, [target, initial]);

  useEffect(() => {
    runSeq.current += 1;
    setRun(null);
  }, [f, inRows, exp, mode]);

  /** 지금 칸들로 저장할 JSON — 폼 탭에서 고친 쪽만 폼으로 다시 만든다. */
  const currentFields = (): CaseEditFields | null => {
    if (!f) return null;
    if (mode === "json") return f;
    return {
      ...f,
      inputJson: inDirty ? inputJsonOf(inRows) : f.inputJson,
      expectedJson: expDirty && exp ? expectedJsonOf(slots, exp) : f.expectedJson,
    };
  };

  const switchMode = (next: string) => {
    if (next === mode || !f) return;
    if (next === "json") {
      setF(currentFields());
      setInDirty(false);
      setExpDirty(false);
      setError(null);
      setMode("json");
      return;
    }
    const err = loadForms(f.inputJson, f.expectedJson);
    setError(err);
    if (!err) setMode("form");
  };

  const set = (k: keyof CaseEditFields) => (v: string) => setF((prev) => (prev ? { ...prev, [k]: v } : prev));
  const setIn = (i: number, patch: Partial<CaseFormRow>) => {
    setInRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setInDirty(true);
  };
  const removeIn = (i: number) => {
    setInRows((prev) => prev.filter((_, j) => j !== i));
    setInDirty(true);
  };
  const setExpForm = (update: (prev: ExpectedForm) => ExpectedForm) => {
    setExp((prev) => (prev ? update(prev) : prev));
    setExpDirty(true);
  };
  const setExpRow = (i: number, patch: Partial<CaseFormRow>) => setExpForm((p) => ({ ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const removeExp = (i: number) => setExpForm((p) => ({ ...p, rows: p.rows.filter((_, j) => j !== i) }));

  // 카드 ④ 의 칸이 모두 비었으면(모든 키 null) 넣지 않는다 — 넣으면 케이스 값이 전부 NULL 로 덮인다.
  const currentHasValue = useMemo(() => {
    if (!currentInput) return false;
    try {
      return Object.values(parseObject(currentInput, "입력")).some((v) => v !== null && v !== "");
    } catch {
      return false;
    }
  }, [currentInput]);

  const useCurrentInput = () => {
    if (!currentInput || !currentHasValue) return;
    if (mode === "json") {
      set("inputJson")(currentInput);
      return;
    }
    try {
      setInRows(inputFormOf(names, currentInput));
      setInDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runTest = async () => {
    const final = currentFields();
    if (!final || !onRun) return;
    const err = caseJsonError(final);
    if (err) {
      setRun({ error: err });
      return;
    }
    const seq = ++runSeq.current;
    setRunning(true);
    try {
      const result = await onRun(final);
      if (seq === runSeq.current) setRun({ result });
    } catch (e) {
      if (seq === runSeq.current) setRun({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const save = async () => {
    const final = currentFields();
    if (!target || !final) return;
    const err = caseEditError(final);
    setError(err);
    if (!err && (await onSave(target, final))) onClose();
  };

  // 적중 행 선택은 표시 순서(엔진 hits 순서)로 정렬해 싣는다.
  const hitData = useMemo(() => hitOptionsOf(rows, exp?.hit.rowIds ?? []), [rows, exp?.hit.rowIds]);
  const setHitIds = (values: string[]) => setExpForm((p) => ({ ...p, hit: { ...p.hit, rowIds: orderHitIds(values, hitData) } }));

  const head = (last: string): ReactNode => (
    <>
      <span style={headCell}>변수</span>
      <span style={headCell}>타입</span>
      <span style={headCell}>계약</span>
      <span style={headCell}>값</span>
      <span style={{ ...headCell, textAlign: "center" }}>{last}</span>
    </>
  );

  const inputForm = (
    <>
      <div style={formGrid} data-testid="tc-form-input">
        {head("키 보냄")}
        {inRows.map((r, i) => {
          const x = info.get(r.key.toUpperCase());
          return (
            <div key={`${r.key}-${i}`} style={{ display: "contents" }}>
              <VarCell title={x?.label} name={r.key} extra={r.extra && names.length > 0} />
              <Badge text={x?.typeBadge} />
              <Badge text={x?.contractBadge} tone="info" />
              <Input data-testid={`tc-form-in-${r.key}`} value={r.value} disabled={!r.on} placeholder={r.on ? "(NULL)" : "(키 없음)"} onChange={(v) => setIn(i, { value: v })} />
              <span style={{ display: "flex", justifyContent: "center" }}>
                {r.extra ? (
                  <Button size="mini" data-testid={`tc-form-in-remove-${r.key}`} onClick={() => removeIn(i)}>
                    빼기
                  </Button>
                ) : (
                  <Checkbox aria-label={`${r.key} 키 보냄`} checked={r.on} onChange={(on) => setIn(i, { on })} />
                )}
              </span>
            </div>
          );
        })}
      </div>
      {inRows.length === 0 && <p style={{ ...muted, margin: "var(--spacing-xs) 0 0" }}>입력 줄이 없습니다. 값 테스트(④)에서 대상을 고르거나 JSON 탭에서 넣으세요.</p>}
      {names.length === 0 && inRows.length > 0 && (
        <p style={{ ...muted, margin: "var(--spacing-xs) 0 0" }}>입력 계약을 계산하지 못해 저장된 키를 그대로 보입니다.</p>
      )}
    </>
  );

  const expectedForm = exp && (
    <>
      <div style={{ ...formGrid, opacity: exp.none ? 0.5 : 1 }} data-testid="tc-form-expected">
        {head("비교")}
        {exp.rows.map((r, i) => {
          const x = slotOf.get(r.key.toUpperCase());
          const group = x != null && x.members.length > 0;
          const off = exp.none || !r.on;
          return (
            <div key={`${r.key}-${i}`} style={{ display: "contents" }}>
              <span title={group ? `결과 열 그룹 — ${x.members.join(", ")} 중 열 조건으로 고른 한 열의 값` : undefined}>
                <VarCell title={group ? columnLabel.get(r.key.toUpperCase()) : x?.v.label} name={r.key} extra={r.extra} />
              </span>
              <Badge text={x ? typeBadge(x.v) : undefined} />
              <Badge text={x ? (group ? "결과 그룹" : "결과 변수") : undefined} tone="muted" />
              <Input data-testid={`tc-form-exp-${r.key}`} value={r.value} disabled={off} placeholder={off ? "(비교 안 함)" : "(NULL)"} onChange={(val) => setExpRow(i, { value: val })} />
              <span style={{ display: "flex", justifyContent: "center" }}>
                {r.extra ? (
                  <Button size="mini" disabled={exp.none} data-testid={`tc-form-exp-remove-${r.key}`} onClick={() => removeExp(i)}>
                    빼기
                  </Button>
                ) : (
                  <Checkbox aria-label={`${r.key} 비교`} disabled={exp.none} checked={r.on} onChange={(on) => setExpRow(i, { on })} />
                )}
              </span>
            </div>
          );
        })}
        <VarCell title="적중 행" name="hit" />
        <span style={muted}>row_id</span>
        <Badge text="적중 행" tone="muted" />
        <span data-testid="tc-form-hit">
          <MultiSelectComboBox
            data={hitData}
            value={exp.hit.rowIds.map(String)}
            disabled={exp.none || !exp.hit.on}
            placeholder={exp.hit.on ? "적중 없음(null)" : "(비교 안 함)"}
            onChange={setHitIds}
          />
        </span>
        <span style={{ display: "flex", justifyContent: "center" }}>
          <Checkbox aria-label="hit 비교" disabled={exp.none} checked={exp.hit.on} onChange={(on) => setExpForm((p) => ({ ...p, hit: { ...p.hit, on } }))} />
        </span>
      </div>
      <p style={{ ...muted, margin: "var(--spacing-xs) 0 0", fontSize: "var(--font-size-sm)" }}>
        비교를 끈 키는 기대 JSON 에서 빠져 견주지 않습니다. 적중 행은 표의 행을 고르며 row_id 로 저장합니다(저장 전 행은 고를 수 없습니다).
      </p>
    </>
  );

  const preview = currentFields();

  const hitText = (hit: DraftCaseResult["hit"]): string => {
    if (hit === null || hit === undefined) return "없음";
    const name = (id: number) => hitData.find((o) => o.value === String(id))?.label ?? `row ${id}`;
    return Array.isArray(hit) ? hit.map(name).join(", ") : name(hit);
  };

  const runView = run && (
    <div
      data-testid="tc-edit-run-result"
      style={{
        marginTop: "var(--spacing-sm)",
        padding: "var(--spacing-xs) var(--spacing-sm)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--font-size-sm)",
      }}
    >
      {"error" in run ? (
        <span style={{ color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>테스트를 실행하지 못했습니다. {run.error}</span>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
            <strong>테스트 실행</strong>
            <span data-testid="tc-edit-run-badge" style={caseBadgeCss(caseBadge(run.result))}>
              {caseBadge(run.result).text}
            </span>
            {runTarget && <span style={muted}>대상 {runTarget} · 저장 전 값</span>}
          </div>
          {run.result.mismatches.length > 0 && <div style={{ marginTop: 2 }}>다른 값: {mismatchText(run.result)}</div>}
          {run.result.outcome === "OK" && (
            <div style={{ ...mono, marginTop: 2, wordBreak: "break-all" }}>
              결과 {JSON.stringify(run.result.results ?? {})} · 적중 행 {hitText(run.result.hit)}
            </div>
          )}
          {(run.result.errors ?? []).map((e, i) => (
            <div key={`${e.code}-${i}`} style={{ marginTop: 2, color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
              {e.message}
            </div>
          ))}
        </>
      )}
    </div>
  );

  return (
    <Modal
      open={target != null}
      title={target ? `테스트 케이스 수정 · #${target.caseId}` : "테스트 케이스 수정"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button
            disabled={!f || !onRun || running}
            title={onRun ? "저장하지 않은 지금 입력·기대로 값 테스트(④)가 고른 대상을 판정합니다." : "값 테스트(④)에서 대상을 고르세요."}
            data-testid="tc-edit-run"
            onClick={() => void runTest()}
          >
            {running ? "실행 중…" : "테스트 실행"}
          </Button>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={busy || !f} data-testid="tc-edit-save" onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      {f && (
        <div data-testid="tc-edit-modal">
          <label style={label}>이름</label>
          <Input data-testid="tc-edit-name" data-autofocus value={f.caseName} onChange={set("caseName")} />
          <label style={label}>설명</label>
          <Input data-testid="tc-edit-desc" value={f.description} placeholder="(없음)" onChange={set("description")} />
          <Tabs
            style={{ marginTop: "var(--spacing-md)" }}
            activeKey={mode}
            onChange={switchMode}
            items={[
              { key: "form", label: <span data-testid="tc-edit-tab-form">폼</span> },
              { key: "json", label: <span data-testid="tc-edit-tab-json">JSON</span> },
            ]}
          />
          <span style={{ ...label, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {mode === "form" ? "입력 값" : "입력 JSON"}
            <Button
              size="sm"
              disabled={!currentHasValue}
              title={currentHasValue ? "값 테스트(④)의 지금 입력으로 이 케이스의 입력을 바꿉니다." : "값 테스트(④)의 입력 칸이 비어 있어 넣을 값이 없습니다."}
              data-testid="tc-edit-use-input"
              onClick={useCurrentInput}
            >
              값 테스트 입력으로 바꾸기
            </Button>
          </span>
          {mode === "form" ? (
            inputForm
          ) : (
            <Textarea data-testid="tc-edit-input" rows={4} style={mono} value={f.inputJson} onChange={set("inputJson")} />
          )}
          {mode === "form" && exp ? (
            <>
              <span style={{ ...label, display: "flex", alignItems: "center", gap: "var(--spacing-md)", marginTop: "var(--spacing-md)" }}>
                기대 값
                <Checkbox
                  label="기대값 없이 실행만"
                  checked={exp.none}
                  onChange={(none) => setExpForm((p) => ({ ...p, none }))}
                />
              </span>
              {expectedForm}
              <label style={{ ...label, marginTop: "var(--spacing-md)" }}>저장될 JSON</label>
              <pre
                data-testid="tc-edit-preview"
                style={{
                  ...mono,
                  margin: 0,
                  padding: "var(--spacing-xs) var(--spacing-sm)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontSize: "var(--font-size-sm)",
                  background: "var(--color-bg-light)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {`입력 ${preview?.inputJson ?? ""}\n기대 ${preview?.expectedJson || "(기대값 없음)"}`}
              </pre>
            </>
          ) : (
            <>
              <label style={label}>기대 JSON (비우면 기대값 없이 실행만 한다)</label>
              <Textarea data-testid="tc-edit-expected" rows={3} style={mono} value={f.expectedJson} onChange={set("expectedJson")} />
            </>
          )}
          {error && (
            <p data-testid="tc-edit-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
              {error}
            </p>
          )}
          {runView}
        </div>
      )}
    </Modal>
  );
}
