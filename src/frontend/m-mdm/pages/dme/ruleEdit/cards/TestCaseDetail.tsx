"use client";

/**
 * 테스트 케이스 상세(2026-11-04) — 목록에서 누른 케이스를 오른쪽에서 바로 보고 고친다. 별도 수정 팝업은 없앴다.
 *
 * 입력·기대는 [표 | JSON] 탭으로 고친다. 표 탭은 변수마다 한 줄인 그리드라 폼보다 높이를 적게 쓰고, 값 칸을 눌러 고친다(Enter·다른 곳 클릭으로 확정).
 * JSON 탭은 복사한 JSON 을 붙여 넣을 때 쓴다. 결과 열 그룹은 엔진 결과 이름대로 그룹 이름 한 줄이다. 적중 행은 표 아래 한 줄에서 고른다.
 * 탭을 바꿀 때와 저장할 때 `case-form` 으로 변환하되, 표를 건드리지 않은 쪽은 원래 JSON 글자를 그대로 둔다(06 키 순서·숫자 표기 보존).
 * 기대를 비우면 "기대값 없음"(실행만) 케이스가 된다.
 *
 * 고치던 내용은 `useKeptState` 에 두어 팝업을 닫았다 열어도 남긴다. 저장으로 row_version 이 바뀌거나 다른 케이스·룰로 가면 새로 읽는다.
 * [테스트 실행]은 저장하지 않은 지금 입력·기대로 값 테스트가 고른 대상을 판정해 결과를 여기에만 보인다(비교는 서버, I24). 칸을 고치면 결과를 지운다.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button, Checkbox, Input, MultiSelectComboBox, Textarea } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Tabs } from "@dk-oasis/shared/tabs";
import { MutedText } from "@dk-oasis/shared/card";
import { badgeStyle } from "@/shell";

import { typeBadge } from "../decision-table/columns";
import { useKeptState } from "../state/workbench-context";
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
import { mergeMissingInputKeys, type InputFieldInfo } from "../value-test/test-input";

export interface TestCaseDetailProps {
  ruleId: string;
  /** 목록에서 누른 케이스. 없으면 고르라는 안내를 보인다. */
  target: TestCaseView | null;
  /** 값 테스트의 지금 입력 JSON(같은 룰일 때만). */
  currentInput: string | null;
  /** 저장 권한이 없거나 다시 불러오는 중이면 끈다. 값은 그대로 보인다. */
  canEdit: boolean;
  busy: boolean;
  /** 입력 줄 — 값 테스트 입력 줄(계약 이름 순서). 비면 저장된 키를 모두 "계약에 없는 키" 줄로 보인다. */
  fields: readonly InputFieldInfo[];
  /** 결과 변수(기대 줄)와 적중 행 후보 — 값 테스트가 고른 대상 정의의 것. */
  vars: readonly ResolvedVar[];
  /** 결과 열 그룹(`resGrp`) — 그룹에 든 결과 열은 그룹 이름 한 줄로 묶는다. */
  varMeta?: readonly Pick<VarMeta, "varId" | "resGrp">[];
  /** 그룹 이름의 컬럼 사전 표시명(COLUMN 후보). */
  candidates?: readonly VarCandidate[];
  rows: readonly StoredRow[];
  /** [테스트 실행] 대상 이름(값 테스트가 고른 것). */
  runTarget?: string | null;
  /** 저장하지 않은 입력·기대로 판정한다. 없으면(대상 없음) [테스트 실행]을 끈다. */
  onRun?: (f: Pick<CaseEditFields, "inputJson" | "expectedJson">) => Promise<DraftCaseResult>;
  onSave: (c: TestCaseView, f: CaseEditFields) => Promise<boolean>;
  /** 지금 보이는 입력(저장 안 한 고침 포함)을 값 테스트 입력 칸에 채운다. 없으면 버튼을 그리지 않는다. */
  onSendToValueTest?: (inputJson: string) => void;
  /** 저장 안 한 변경이 있는지 알린다 — 목록이 다른 행으로 옮길 때 확인을 받는다. */
  onDirtyChange?: (dirty: boolean) => void;
}

type Mode = "form" | "json";

interface CaseDraft {
  /** 룰·케이스·row_version — 달라지면 새로 읽는다. */
  key: string;
  initial: CaseEditFields;
  f: CaseEditFields;
  mode: Mode;
  inRows: CaseFormRow[];
  exp: ExpectedForm | null;
  // 표에서 한 번이라도 고친 쪽만 JSON 을 다시 만든다 — 안 고친 쪽은 원래 글자를 그대로 저장한다.
  inDirty: boolean;
  expDirty: boolean;
  /** 저장된 JSON 을 표로 풀지 못한 사유. */
  loadError: string | null;
}

interface InLine {
  key: string;
  title: string;
  name: string;
  type: string;
  contract: string;
  value: string;
  on: boolean;
  extra: boolean;
}

interface ExpLine {
  key: string;
  title: string;
  name: string;
  type: string;
  group: string;
  value: string;
  on: boolean;
  extra: boolean;
}

interface LineActions {
  canEdit: boolean;
  none: boolean;
  setInOn: (key: string, on: boolean) => void;
  removeIn: (key: string) => void;
  setExpOn: (key: string, on: boolean) => void;
  removeExp: (key: string) => void;
}

const label: CSSProperties = { display: "block", margin: "var(--spacing-sm) 0 2px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const mono: CSSProperties = { fontFamily: "var(--font-family-mono)" };
const muted: CSSProperties = { color: "var(--color-text-muted)" };
const LINE_PX = 28;

function VarCell({ title, name, extra }: { title: string; name: string; extra: boolean }) {
  return (
    <span>
      {title && title !== name ? <strong>{title} </strong> : null}
      {title && title !== name ? <MutedText>{name}</MutedText> : <strong>{name}</strong>}
      {extra ? <span style={{ ...badgeStyle("warning"), marginLeft: 4 }}>계약에 없음</span> : null}
    </span>
  );
}

function ValueCell({ value, off, offText }: { value: string; off: boolean; offText: string }) {
  if (off) return <MutedText>{offText}</MutedText>;
  return value === "" ? <MutedText>(NULL)</MutedText> : <>{value}</>;
}

// 그리드 열은 한 번만 만들고 손잡이는 ref 로 넘긴다(값 테스트 입력 표와 같은 방식). 칸 안에 글자 입력을 직접 두면 그리드가 포커스를 가져가므로 값 칸은 그리드 편집이다.
function inColumns(actions: { current: LineActions | null }): GridColumn[] {
  return [
    { key: "name", meta: false, header: "변수", width: 190, minWidth: 120, render: (_v, row) => { const r = row as unknown as InLine; return <VarCell title={r.title} name={r.name} extra={r.extra} />; } },
    { key: "type", meta: false, header: "타입", width: 76, minWidth: 64, align: "center", render: (v) => (v ? <span style={badgeStyle("neutral")}>{String(v)}</span> : null) },
    { key: "contract", meta: false, header: "계약", width: 92, minWidth: 72, align: "center", render: (v) => (v ? <span style={badgeStyle("info")}>{String(v)}</span> : null) },
    {
      key: "value", meta: false, header: "값", width: 150, minWidth: 90,
      editable: (row) => (row as unknown as InLine).on && actions.current?.canEdit === true,
      cellClassRules: { "cell-input": (row) => (row as unknown as InLine).on && actions.current?.canEdit === true },
      render: (_v, row) => { const r = row as unknown as InLine; return <ValueCell value={r.value} off={!r.on} offText="(키 없음)" />; },
    },
    {
      key: "on", meta: false, header: "키 보냄", width: 64, minWidth: 60, align: "center", tooltip: false,
      render: (_v, row) => {
        const r = row as unknown as InLine;
        const a = actions.current;
        return r.extra ? (
          <Button size="mini" disabled={!a?.canEdit} data-testid={`tc-form-in-remove-${r.key}`} onClick={() => a?.removeIn(r.key)}>
            빼기
          </Button>
        ) : (
          <Checkbox aria-label={`${r.key} 키 보냄`} disabled={!a?.canEdit} checked={r.on} onChange={(on) => a?.setInOn(r.key, on)} />
        );
      },
    },
  ];
}

function expColumns(actions: { current: LineActions | null }): GridColumn[] {
  const usable = (r: ExpLine) => r.on && actions.current?.canEdit === true && !actions.current.none;
  return [
    {
      key: "name", meta: false, header: "변수", width: 190, minWidth: 120,
      render: (_v, row) => {
        const r = row as unknown as ExpLine;
        return (
          <span title={r.group ? `결과 열 그룹 — ${r.group} 중 열 조건으로 고른 한 열의 값` : undefined}>
            <VarCell title={r.title} name={r.name} extra={r.extra} />
          </span>
        );
      },
    },
    { key: "type", meta: false, header: "타입", width: 76, minWidth: 64, align: "center", render: (v) => (v ? <span style={badgeStyle("neutral")}>{String(v)}</span> : null) },
    {
      key: "value", meta: false, header: "값", width: 150, minWidth: 90,
      editable: (row) => usable(row as unknown as ExpLine),
      cellClassRules: { "cell-input": (row) => usable(row as unknown as ExpLine) },
      render: (_v, row) => { const r = row as unknown as ExpLine; return <ValueCell value={r.value} off={!r.on || actions.current?.none === true} offText="(비교 안 함)" />; },
    },
    {
      key: "on", meta: false, header: "비교", width: 64, minWidth: 60, align: "center", tooltip: false,
      render: (_v, row) => {
        const r = row as unknown as ExpLine;
        const a = actions.current;
        const off = !a?.canEdit || a.none;
        return r.extra ? (
          <Button size="mini" disabled={off} data-testid={`tc-form-exp-remove-${r.key}`} onClick={() => a?.removeExp(r.key)}>
            빼기
          </Button>
        ) : (
          <Checkbox aria-label={`${r.key} 비교`} disabled={off} checked={r.on} onChange={(on) => a?.setExpOn(r.key, on)} />
        );
      },
    },
  ];
}

/** 표에서 고친 쪽만 다시 만든 지금 값. JSON 탭이면 글자 그대로다. */
function fieldsOf(d: CaseDraft, slots: ReturnType<typeof resultSlots>): CaseEditFields {
  if (d.mode === "json") return d.f;
  return {
    ...d.f,
    inputJson: d.inDirty ? inputJsonOf(d.inRows) : d.f.inputJson,
    expectedJson: d.expDirty && d.exp ? expectedJsonOf(slots, d.exp) : d.f.expectedJson,
  };
}

function isDirty(d: CaseDraft): boolean {
  return (
    d.inDirty ||
    d.expDirty ||
    d.f.caseName !== d.initial.caseName ||
    d.f.description !== d.initial.description ||
    d.f.inputJson !== d.initial.inputJson ||
    d.f.expectedJson !== d.initial.expectedJson
  );
}

export function TestCaseDetail({
  ruleId,
  target,
  currentInput,
  canEdit,
  busy,
  fields,
  vars,
  varMeta,
  candidates,
  rows,
  runTarget,
  onRun,
  onSave,
  onSendToValueTest,
  onDirtyChange,
}: TestCaseDetailProps) {
  const [kept, setDraft] = useKeptState<CaseDraft | null>("testCases:draft", null);
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

  const key = target ? `${ruleId}:${target.caseId}:${target.rowVersion}` : null;
  const draft = kept && kept.key === key ? kept : null;
  const namesKey = names.join("\0");
  const slotsKey = slots.map((s) => s.name).join("\0");

  // 케이스가 바뀌면 새로 읽는다. 같은 케이스여도 입력 계약·결과 변수가 늦게 오면, 아직 안 고쳤을 때만 줄을 다시 만든다.
  useEffect(() => {
    if (!target || !key) {
      setDraft((prev) => (prev === null ? prev : null));
      return;
    }
    setDraft((prev) => {
      if (prev?.key === key && (isDirty(prev) || (prev.mode === "json" && !prev.loadError))) return prev;
      const inputJson = names.length > 0 ? mergeMissingInputKeys(target.inputJson, fields) : target.inputJson;
      const initial: CaseEditFields = { caseName: target.caseName, description: target.description ?? "", inputJson, expectedJson: target.expectedJson ?? "" };
      const base = { key, initial, f: initial, inDirty: false, expDirty: false };
      try {
        return { ...base, mode: "form" as const, inRows: inputFormOf(names, inputJson), exp: expectedFormOf(slots, initial.expectedJson), loadError: null };
      } catch (e) {
        // 저장된 JSON 이 표로 풀리지 않으면(깨진 JSON 등) JSON 탭으로 연다.
        return { ...base, mode: "json" as const, inRows: [], exp: null, loadError: `${e instanceof Error ? e.message : String(e)}\nJSON 탭에서 고치세요.` };
      }
    });
    // 내용이 같으면 다시 읽지 않도록 이름 목록을 글자로 견준다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, namesKey, slotsKey]);

  useEffect(() => setError(null), [key]);
  useEffect(() => {
    runSeq.current += 1;
    setRun(null);
  }, [draft]);

  const dirty = draft ? isDirty(draft) : false;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const patch = (update: (d: CaseDraft) => CaseDraft) => setDraft((prev) => (prev && prev.key === key ? update(prev) : prev));
  const setField = (k: keyof CaseEditFields) => (v: string) => patch((d) => ({ ...d, f: { ...d.f, [k]: v } }));
  const setInRow = (rowKey: string, change: Partial<CaseFormRow>) =>
    patch((d) => ({ ...d, inDirty: true, inRows: d.inRows.map((r) => (r.key === rowKey ? { ...r, ...change } : r)) }));
  const setExp = (update: (e: ExpectedForm) => ExpectedForm) => patch((d) => (d.exp ? { ...d, expDirty: true, exp: update(d.exp) } : d));
  const setExpRow = (rowKey: string, change: Partial<CaseFormRow>) =>
    setExp((e) => ({ ...e, rows: e.rows.map((r) => (r.key === rowKey ? { ...r, ...change } : r)) }));

  const actions = useRef<LineActions | null>(null);
  actions.current = {
    canEdit,
    none: draft?.exp?.none ?? false,
    setInOn: (k, on) => setInRow(k, { on }),
    removeIn: (k) => patch((d) => ({ ...d, inDirty: true, inRows: d.inRows.filter((r) => r.key !== k) })),
    setExpOn: (k, on) => setExpRow(k, { on }),
    removeExp: (k) => setExp((e) => ({ ...e, rows: e.rows.filter((r) => r.key !== k) })),
  };
  const inCols = useMemo(() => inColumns(actions), []);
  const expCols = useMemo(() => expColumns(actions), []);

  const inLines = useMemo<InLine[]>(
    () =>
      (draft?.inRows ?? []).map((r) => {
        const x = info.get(r.key.toUpperCase());
        return { key: r.key, title: x?.label ?? "", name: r.key, type: x?.typeBadge ?? "", contract: x?.contractBadge ?? "", value: r.value, on: r.on, extra: r.extra && names.length > 0 };
      }),
    [draft?.inRows, info, names.length],
  );
  const expLines = useMemo<ExpLine[]>(
    () =>
      (draft?.exp?.rows ?? []).map((r) => {
        const x = slotOf.get(r.key.toUpperCase());
        const group = x != null && x.members.length > 0;
        return {
          key: r.key,
          title: (group ? columnLabel.get(r.key.toUpperCase()) : x?.v.label) ?? "",
          name: r.key,
          type: x ? typeBadge(x.v) : "",
          group: group ? x.members.join(", ") : "",
          value: r.value,
          on: r.on,
          extra: r.extra,
        };
      }),
    [draft?.exp?.rows, slotOf, columnLabel],
  );

  // 값 테스트 칸이 모두 비었으면(모든 키 null) 넣지 않는다 — 넣으면 케이스 값이 전부 NULL 로 덮인다.
  const currentHasValue = useMemo(() => {
    if (!currentInput) return false;
    try {
      return Object.values(parseObject(currentInput, "입력")).some((v) => v !== null && v !== "");
    } catch {
      return false;
    }
  }, [currentInput]);

  // 적중 행 선택은 표시 순서(엔진 hits 순서)로 정렬해 싣는다.
  const hitIds = draft?.exp?.hit.rowIds;
  const hitData = useMemo(() => hitOptionsOf(rows, hitIds ?? []), [rows, hitIds]);

  if (!target) {
    return (
      <p data-testid="tc-detail-empty" style={{ margin: 0, padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
        왼쪽 목록에서 케이스를 누르면 입력값과 기대값을 여기에서 보고 고칠 수 있습니다.
      </p>
    );
  }
  if (!draft) return null;

  const switchMode = (next: string) => {
    if (next === draft.mode) return;
    if (next === "json") {
      setError(null);
      patch((d) => ({ ...d, f: fieldsOf(d, slots), inDirty: false, expDirty: false, mode: "json", loadError: null }));
      return;
    }
    try {
      const inRows = inputFormOf(names, draft.f.inputJson);
      const exp = expectedFormOf(slots, draft.f.expectedJson);
      setError(null);
      patch((d) => ({ ...d, inRows, exp, inDirty: false, expDirty: false, mode: "form", loadError: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyCurrentInput = () => {
    if (!currentInput || !currentHasValue) return;
    if (draft.mode === "json") {
      setField("inputJson")(currentInput);
      return;
    }
    try {
      const inRows = inputFormOf(names, currentInput);
      patch((d) => ({ ...d, inRows, inDirty: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const sendToValueTest = () => {
    const inputJson = fieldsOf(draft, slots).inputJson;
    try {
      parseObject(inputJson, "입력");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setError(null);
    onSendToValueTest?.(inputJson);
  };

  const runTest = async () => {
    if (!onRun) return;
    const final = fieldsOf(draft, slots);
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
    const final = fieldsOf(draft, slots);
    const err = caseEditError(final);
    setError(err);
    if (!err) await onSave(target, final);
  };

  const revert = () => {
    setError(null);
    // 지금 표를 고친 흔적을 지우면 위 읽기 효과가 돌지 않으므로 여기서 다시 푼다.
    const initial = draft.initial;
    try {
      patch((d) => ({ ...d, f: initial, mode: "form", inRows: inputFormOf(names, initial.inputJson), exp: expectedFormOf(slots, initial.expectedJson), inDirty: false, expDirty: false, loadError: null }));
    } catch {
      patch((d) => ({ ...d, f: initial, inDirty: false, expDirty: false }));
    }
  };

  const hitText = (hit: DraftCaseResult["hit"]): string => {
    if (hit === null || hit === undefined) return "없음";
    const name = (id: number) => hitData.find((o) => o.value === String(id))?.label ?? `row ${id}`;
    return Array.isArray(hit) ? hit.map(name).join(", ") : name(hit);
  };

  const preview = fieldsOf(draft, slots);
  const exp = draft.exp;
  const shownError = error ?? draft.loadError;
  // 그리드는 값이 바뀐 칸만 다시 그리므로, 켜고 끈 줄의 값 칸은 이 표시로 다시 그린다.
  const inToken = draft.inRows.map((r) => (r.on ? 1 : 0)).join("") + (canEdit ? "e" : "");
  const expToken = (exp?.rows ?? []).map((r) => (r.on ? 1 : 0)).join("") + (exp?.none ? "n" : "") + (canEdit ? "e" : "");

  return (
    <div data-testid="tc-detail" style={{ padding: "var(--spacing-sm)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--spacing-xs)" }}>
        <Input data-testid="tc-edit-name" aria-label="이름" placeholder="이름" disabled={!canEdit} value={draft.f.caseName} onChange={setField("caseName")} />
        <Input data-testid="tc-edit-desc" aria-label="설명" placeholder="설명(없음)" disabled={!canEdit} value={draft.f.description} onChange={setField("description")} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--spacing-sm)", marginTop: "var(--spacing-xs)" }}>
        <Tabs
          style={{ flex: 1, minWidth: 0 }}
          activeKey={draft.mode}
          onChange={switchMode}
          items={[
            { key: "form", label: <span data-testid="tc-edit-tab-form">표</span> },
            { key: "json", label: <span data-testid="tc-edit-tab-json">JSON</span> },
          ]}
        />
        <Button
          size="sm"
          disabled={!canEdit || !currentHasValue}
          title={currentHasValue ? "값 테스트의 지금 입력으로 이 케이스의 입력을 바꿉니다." : "값 테스트의 입력 칸이 비어 있어 넣을 값이 없습니다."}
          data-testid="tc-edit-use-input"
          onClick={applyCurrentInput}
        >
          값 테스트 입력으로 바꾸기
        </Button>
        {onSendToValueTest && (
          <Button
            size="sm"
            title="이 케이스의 지금 입력값(저장하지 않은 고침 포함)을 값 테스트 탭의 입력 칸에 채웁니다."
            data-testid="tc-edit-send-input"
            onClick={sendToValueTest}
          >
            값 테스트로 보내기
          </Button>
        )}
      </div>

      {draft.mode === "form" ? (
        <>
          <div data-testid="tc-form-input" style={{ marginTop: "var(--spacing-xs)" }}>
            <AgDataGrid
              gridId="modal-testCaseInput"
              title="입력값"
              columns={inCols}
              data={inLines as unknown as Record<string, unknown>[]}
              rowKey="key"
              height="auto"
              columnSizing="fit"
              sortable={false}
              singleClickEdit
              getRowHeight={() => LINE_PX}
              onCellValueChanged={({ rowKey, field, newValue }) => {
                if (field === "value") setInRow(String(rowKey), { value: newValue == null ? "" : String(newValue) });
              }}
              rowClassRefreshToken={inToken}
              emptyMessage="입력 줄이 없습니다. 값 테스트에서 대상을 고르거나 JSON 탭에서 넣으세요."
              ariaLabel="케이스 입력값"
            />
          </div>
          {names.length === 0 && draft.inRows.length > 0 && <p style={{ ...muted, margin: "var(--spacing-xs) 0 0" }}>입력 계약을 계산하지 못해 저장된 키를 그대로 보입니다.</p>}

          {exp && (
            <>
              <div style={{ marginTop: "var(--spacing-sm)" }}>
                <Checkbox label="기대값 없이 실행만" disabled={!canEdit} checked={exp.none} onChange={(none) => setExp((e) => ({ ...e, none }))} />
              </div>
              <div data-testid="tc-form-expected" style={{ marginTop: "var(--spacing-xs)", opacity: exp.none ? 0.5 : 1 }}>
                <AgDataGrid
                  gridId="modal-testCaseExpected"
                  title="기대값"
                  columns={expCols}
                  data={expLines as unknown as Record<string, unknown>[]}
                  rowKey="key"
                  height="auto"
                  columnSizing="fit"
                  sortable={false}
                  singleClickEdit
                  getRowHeight={() => LINE_PX}
                  onCellValueChanged={({ rowKey, field, newValue }) => {
                    if (field === "value") setExpRow(String(rowKey), { value: newValue == null ? "" : String(newValue) });
                  }}
                  rowClassRefreshToken={expToken}
                  emptyMessage="결과 변수가 없습니다."
                  ariaLabel="케이스 기대값"
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", marginTop: "var(--spacing-xs)", opacity: exp.none ? 0.5 : 1 }}>
                <strong style={{ whiteSpace: "nowrap" }}>적중 행</strong>
                <span data-testid="tc-form-hit" style={{ flex: 1, minWidth: 0 }}>
                  <MultiSelectComboBox
                    data={hitData}
                    value={exp.hit.rowIds.map(String)}
                    disabled={!canEdit || exp.none || !exp.hit.on}
                    placeholder={exp.hit.on ? "적중 없음(null)" : "(비교 안 함)"}
                    onChange={(values) => setExp((e) => ({ ...e, hit: { ...e.hit, rowIds: orderHitIds(values, hitData) } }))}
                  />
                </span>
                <Checkbox aria-label="hit 비교" disabled={!canEdit || exp.none} checked={exp.hit.on} onChange={(on) => setExp((e) => ({ ...e, hit: { ...e.hit, on } }))} />
              </div>
            </>
          )}

          <details style={{ marginTop: "var(--spacing-sm)", fontSize: "var(--font-size-sm)" }}>
            <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>저장될 JSON 보기</summary>
            <pre data-testid="tc-edit-preview" style={{ ...mono, margin: "var(--spacing-xs) 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {`입력 ${preview.inputJson}\n기대 ${preview.expectedJson || "(기대값 없음)"}`}
            </pre>
          </details>
        </>
      ) : (
        <>
          <label style={label}>입력 JSON</label>
          <Textarea data-testid="tc-edit-input" rows={4} style={mono} disabled={!canEdit} value={draft.f.inputJson} onChange={setField("inputJson")} />
          <label style={label}>기대 JSON (비우면 기대값 없이 실행만 한다)</label>
          <Textarea data-testid="tc-edit-expected" rows={3} style={mono} disabled={!canEdit} value={draft.f.expectedJson} onChange={setField("expectedJson")} />
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "var(--spacing-xs)", marginTop: "var(--spacing-sm)" }}>
        <Button
          disabled={!onRun || running}
          title={onRun ? "저장하지 않은 지금 입력·기대로 값 테스트가 고른 대상을 판정합니다." : "값 테스트에서 대상을 고르세요."}
          data-testid="tc-edit-run"
          onClick={() => void runTest()}
        >
          {running ? "실행 중…" : "테스트 실행"}
        </Button>
        <Button disabled={!dirty} data-testid="tc-edit-revert" onClick={revert}>
          되돌리기
        </Button>
        <Button variant="primary" disabled={!canEdit || busy || !dirty} data-testid="tc-edit-save" onClick={() => void save()}>
          저장
        </Button>
      </div>

      {shownError && (
        <p data-testid="tc-edit-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          {shownError}
        </p>
      )}
      {run && (
        <div
          data-testid="tc-edit-run-result"
          style={{ marginTop: "var(--spacing-sm)", padding: "var(--spacing-xs) var(--spacing-sm)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", fontSize: "var(--font-size-sm)" }}
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
      )}
    </div>
  );
}
