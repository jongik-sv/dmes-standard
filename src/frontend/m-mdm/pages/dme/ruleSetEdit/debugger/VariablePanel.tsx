"use client";

/**
 * 디버그 모드 오른쪽 변수 패널(3단계 계획 §4.4·§4.5) — 위에서 아래로 조사식(핀한 이름)·커서 자리 변수 표·노드 상세·식 즉석 평가.
 *
 * - 조사식(`var-watches`): 세트별 localStorage(`rsf:watch:<setId>`). 값은 `sim.valueAt`(커서 자리). 흐름 입력·결과 이름에 없으면 "없는 변수".
 * - 변수 표(`var-grid`, AG Grid): 핀·이름·값·상태. 핀 칸은 아이콘만 그리고 행 누르기의 칸(col-id `pin`)으로 켜고 끈다 — 칸 렌더러에 입력 요소를
 *   두지 않는다(Local-Rules §12). 바로 앞 노드가 바꾼 줄은 노란 배경, 새로 생긴 줄은 "새" 배지(`getRowClassExtra`).
 * - 값 고치기(4단계 E4, 스펙 §2.4): `sim.canEditValues` 일 때 값 칸을 두 번 눌러 고친다(AG Grid 기본 편집기 + `onCellValueChanged` — 칸 렌더러에 입력 요소를 두지 않는다,
 *   Local-Rules §12). 원래 타입(NULL 이면 세트 선언 타입)에 맞지 않으면 거절하고 새 행 객체로 다시 그려 칸을 되돌린다. LIST 는 [비우기]만. 줄 끝 [비우기]·[되돌리기], 아래 [변수 추가]·[고침 취소].
 *   받는 노드가 넣는 CATCH_* 줄은 고치지 않고(칸·[비우기] 없음) [변수 추가] 도 그 이름을 거절한다(컨트롤러 Ruling 3 — `catchEditText`).
 * - 노드 상세: 고른 흐름 노드가 커서 앞에서 실행됐으면 2단계 `TraceDetail`(`sim-detail*`), 아니면 "아직 실행하지 않은 노드다"(P-D13).
 * - 식 평가: Enter 로 서버 파싱 → 화면 평가(`useExprEval`). `validate` 권한이 없으면 칸이 꺼진다(P-D1).
 * 기록이 없으면 변수 표·식 평가 자리에 "실행하면 커서 시점 값이 보인다". 낡은 기록(P-D9)도 옛 기록 기준으로 보인다(툴바가 배지를 보인다).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { IconArrowBackUp, IconEraser, IconPin, IconPinFilled, IconPlus, IconX } from "@tabler/icons-react";

import type { TypedValue } from "@/contract/engine-contract.generated";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import type { EditFlow } from "../flow-edit";
import { flowIo } from "../set-model";
import { typedText } from "../trace-view";
import type { RuleIoMap } from "../types";
import { LIST_REJECT, NULL_VALUE, catchEditText, editKindOfVar, endedBranchText, parseEditText, reservedKeyText, type EditKind } from "./debug-model";
import { declaredTypes, FALLBACK_TEXT, SERVER_JUDGES_TEXT, type ExprResult } from "./expr-eval";
import { loadStrings, saveStrings, storeKeys } from "./local-store";
import { NodeDescNote, TraceDetail } from "./TraceDetail";
import { useExprEval } from "./useExprEval";
import type { Simulation } from "./useSimulation";

export interface VariablePanelProps {
  sim: Simulation;
  setId: string | null;
  flow: EditFlow;
  rules: RuleIoMap;
  selectedId: string | null;
  /** 식 파싱(validate) 권한 — 없으면 식 평가 칸이 꺼진다(P-D1). */
  canParse: boolean;
  onOpenRule(ruleId: string): void;
}

export const NO_RECORD_NOTE = "실행하면 커서 시점 값이 보인다";
export const NOT_RUN_NOTE = "아직 실행하지 않은 노드다";
export const EXPR_DENIED_TITLE = "식 평가는 편집 권한이 있어야 쓸 수 있다";
const NO_WATCHES: string[] = [];

/** 식 평가 결과 글자. */
export function exprResultText(r: ExprResult): string {
  switch (r.kind) {
    case "true":
      return "참";
    case "false":
      return "거짓";
    case "null":
      return "NULL";
    case "value":
      return r.text;
    case "error":
      return `오류 — ${r.text}`;
    default:
      return FALLBACK_TEXT;
  }
}

export const EDIT_HINT = "값 칸을 두 번 눌러 고친다. [한 단계]·[계속]·[여기까지]가 고친 값으로 처음부터 다시 실행한다";
export const EDIT_OFF_TITLE = "기록이 최신이고 커서가 노드 실행 전일 때만 고친다";
export const ADD_NAME_TEXT = "변수 이름을 적는다";
export const ADD_EXISTS_TEXT = "이 자리에 이미 있는 이름이다. 표에서 값을 고친다";
const ADD_KINDS = [
  { value: "STRING", label: "글자" },
  { value: "NUMBER", label: "숫자" },
  { value: "BOOLEAN", label: "참거짓" },
];

/** 줄 끝 동작 칸이 부르는 손잡이 — 열은 한 번만 만들고 손잡이는 ref 로 넘긴다(ValueTestCard 와 같은 방식). */
interface VarActions {
  clear(name: string): void;
  undo(name: string): void;
}

const STATE_BADGE: Record<string, Parameters<typeof badgeStyle>[0]> = { "고침 대기": "warning", 고침: "success", 새: "info", 바뀜: "warning" };

function varColumns(actions: { current: VarActions }): GridColumn[] {
  return [
    {
      key: "pin",
      meta: false,
      header: "",
      width: 40,
      align: "center",
      tooltip: false,
      render: (v, row) =>
        v ? (
          <IconPinFilled size={14} aria-label={`${String(row.name)} 조사식 풀기`} />
        ) : (
          <IconPin size={14} aria-label={`${String(row.name)} 조사식에 고정`} style={{ color: "var(--color-text-muted)" }} />
        ),
    },
    { key: "name", header: "이름", width: 110 },
    // 값 칸 — 고칠 수 있는 줄만 AG Grid 기본 글자 편집기로 연다(두 번 누르기). 표시는 typedText 글자 그대로다.
    { key: "value", header: "값", width: 100, editable: (row) => row.canEdit === true && row.editKind != null },
    {
      key: "state",
      header: "상태",
      width: 72,
      tooltip: false,
      render: (v) => (typeof v === "string" && STATE_BADGE[v] ? <span style={badgeStyle(STATE_BADGE[v])}>{v}</span> : null),
    },
    // 동작 칸 — 칸 값(act = "clear"·"undo"·"")이 상태와 함께 바뀌어야 AG Grid 가 이 칸을 다시 그린다(값이 같으면 렌더러를 다시 부르지 않는다).
    {
      key: "act",
      meta: false,
      header: "",
      width: 40,
      align: "center",
      tooltip: false,
      render: (v, row) => {
        if (v !== "clear" && v !== "undo") return null;
        const name = String(row.name);
        return v === "undo" ? (
          <Button size="mini" data-testid={`var-edit-undo-${name}`} ariaLabel={`${name} 고침 되돌리기`} title="이 줄의 고침 대기를 되돌린다" onClick={() => actions.current.undo(name)}>
            <IconArrowBackUp size={12} aria-hidden="true" />
          </Button>
        ) : (
          <Button size="mini" data-testid={`var-clear-${name}`} ariaLabel={`${name} 비우기`} title="값을 NULL 로 비운다" onClick={() => actions.current.clear(name)}>
            <IconEraser size={12} aria-hidden="true" />
          </Button>
        );
      },
    },
  ];
}

const rowClass = (row: Record<string, unknown>) =>
  row.pending ? "rsf-var-pending" : row.state === "새" ? "rsf-var-new" : row.state === "바뀜" ? "rsf-var-changed" : undefined;

/** 누른 칸의 col-id — 행 누르기 이벤트의 대상에서 찾는다. */
function clickedColumn(ev: Event): string | null {
  const t = ev.target as Element | null;
  return t?.closest?.("[col-id]")?.getAttribute("col-id") ?? null;
}

export function VariablePanel({ sim, setId, flow, rules, selectedId, canParse, onOpenRule }: VariablePanelProps) {
  const last = sim.last;

  // ── 조사식 ──
  const [watches, setWatches] = useState<string[]>(NO_WATCHES);
  useEffect(() => {
    setWatches(setId == null ? NO_WATCHES : loadStrings(storeKeys.watches(setId)));
  }, [setId]);
  const writeWatches = (list: string[]) => {
    setWatches(list);
    if (setId != null) saveStrings(storeKeys.watches(setId), list);
  };
  const pinned = useMemo(() => new Set(watches.map((w) => w.toLowerCase())), [watches]);
  const togglePin = (name: string) => {
    const lower = name.toLowerCase();
    writeWatches(pinned.has(lower) ? watches.filter((w) => w.toLowerCase() !== lower) : [...watches, name]);
  };
  /** 흐름 입력·결과 이름(소문자) — 조사식 "없는 변수" 판정. 구조가 같으면 다시 풀지 않도록 흐름·룰이 바뀔 때만. */
  const known = useMemo(() => {
    const io = flowIo(flow, rules);
    return new Set([...io.inputs.map((r) => r.name), ...io.results.map((r) => r.name)].map((x) => x.toLowerCase()));
  }, [flow, rules]);

  const types = useMemo(() => declaredTypes(flow, rules), [flow, rules]);

  // ── 변수 표·값 고치기(4단계 E4) ──
  const canEdit = sim.canEditValues;
  const [editError, setEditError] = useState<string | null>(null);
  /** 거절한 칸 편집을 되돌리는 표지 — AG Grid 는 onCellValueChanged 전에 행 객체를 이미 바꾸므로 새 행 객체로 다시 그린다. */
  const [rev, setRev] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKind, setAddKind] = useState<EditKind>("STRING");
  const [addValue, setAddValue] = useState("");
  // 자리를 옮기거나 고칠 수 없게 되면 거절 문구와 추가 칸을 닫는다.
  useEffect(() => {
    setEditError(null);
    setAdding(false);
  }, [sim.cursor, canEdit]);

  const rows = useMemo(
    () =>
      sim.variables.map((v) => {
        const rowEdit = canEdit && catchEditText(v.name) == null;
        return {
          name: v.name,
          value: typedText(v.value),
          state: v.pending ? "고침 대기" : v.edited ? "고침" : v.created ? "새" : v.changed ? "바뀜" : "",
          pin: pinned.has(v.name.toLowerCase()),
          pending: !!v.pending,
          canEdit: rowEdit,
          editKind: editKindOfVar(v, types[v.name.toUpperCase()]),
          act: !rowEdit ? "" : v.pending ? "undo" : "clear",
        };
      }),
    // rev: 거절한 편집을 되돌릴 때만 올려 새 행 객체를 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.variables, pinned, canEdit, types, rev],
  );
  const rowToken = `${canEdit ? 1 : 0}|${rows.map((r) => r.state).join(",")}`;
  const onVarClick = (row: Record<string, unknown>, ev: Event) => {
    if (clickedColumn(ev) === "pin") togglePin(String(row.name));
  };
  const onValueEdit = (p: { field: string; newValue: unknown; row: Record<string, unknown> }) => {
    if (p.field !== "value") return;
    const kind = p.row.editKind as EditKind | null;
    const parsed = kind ? parseEditText(kind, p.newValue == null ? "" : String(p.newValue)) : { error: LIST_REJECT };
    if ("error" in parsed) {
      setEditError(parsed.error);
      setRev((x) => x + 1);
      return;
    }
    setEditError(null);
    sim.editValue(String(p.row.name), parsed.value);
  };
  const actions = useRef<VarActions>({ clear: () => {}, undo: () => {} });
  actions.current = { clear: (name) => sim.editValue(name, NULL_VALUE), undo: (name) => sim.cancelEdit(name) };
  const columns = useMemo(() => varColumns(actions), []);

  const submitAdd = () => {
    const name = addName.trim();
    if (name === "") {
      setEditError(ADD_NAME_TEXT);
      return;
    }
    const reserved = reservedKeyText(name) ?? catchEditText(name);
    if (reserved) {
      setEditError(reserved);
      return;
    }
    if (sim.variables.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      setEditError(ADD_EXISTS_TEXT);
      return;
    }
    const parsed: { value: TypedValue } | { error: string } = addValue.trim() === "" ? { value: NULL_VALUE } : parseEditText(addKind, addValue);
    if ("error" in parsed) {
      setEditError(parsed.error);
      return;
    }
    setEditError(null);
    sim.editValue(name, parsed.value);
    setAddName("");
    setAddValue("");
    setAdding(false);
  };

  // ── 식 평가 ──
  /** 끝내는 IF 갈래로 끝난 실행이면 END 상세에 보일 문장(R18) — 기록의 IF 마다 흐름을 풀어 보므로 기록이 바뀔 때만 계산한다(Local-Rules §16). */
  const endedBranch = useMemo(() => (last ? endedBranchText(last.trace, last.flow) : null), [last]);
  const ctx = useMemo<Record<string, TypedValue> | null>(
    () => (last ? Object.fromEntries(sim.variables.map((v) => [v.name, v.value] as const)) : null),
    [last, sim.variables],
  );
  const expr = useExprEval(setId, ctx, types);
  const exprOff = !canParse || !last;
  const onExprKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void expr.run(expr.text);
  };

  // ── 노드 상세 ──
  const isFlowNode = !!selectedId && flow.nodes.some((n) => n.id === selectedId);
  const ranIndex = last && selectedId ? last.trace.nodes.findIndex((n) => n.nodeId === selectedId) : -1;
  const ranBeforeCursor = ranIndex >= 0 && ranIndex < sim.cursor;

  return (
    <div className="rsf-var-panel" data-testid="var-panel">
      <section className="rsf-var-section" aria-label="조사식">
        <p className="rsf-dbg-title">조사식</p>
        <ul className="rsf-var-watches" data-testid="var-watches">
          {watches.length === 0 && <li className="rsf-panel-note">변수 표의 핀을 누르면 여기에 고정된다</li>}
          {watches.map((name) => {
            const missing = !known.has(name.toLowerCase());
            const v = last ? sim.valueAt(name) : undefined;
            return (
              <li key={name} className="rsf-var-watch" data-testid={`var-watch-${name}`} data-missing={missing ? "true" : "false"}>
                <code>{name}</code>
                {missing && <span style={badgeStyle("warning")}>없는 변수</span>}
                <span className="rsf-var-watch-value">{v === undefined ? "아직 없음" : typedText(v)}</span>
                <Button size="mini" data-testid={`var-watch-remove-${name}`} ariaLabel={`${name} 조사식 빼기`} title="조사식에서 뺀다" onClick={() => writeWatches(watches.filter((w) => w !== name))}>
                  <IconX size={12} aria-hidden="true" />
                </Button>
              </li>
            );
            })}
        </ul>
      </section>

      <section className="rsf-var-section" aria-label="변수">
        <p className="rsf-dbg-title">변수 — 커서 자리</p>
        {last ? (
          <>
            <div data-testid="var-grid" className="rsf-var-grid">
              <AgDataGrid
                columns={columns}
                data={rows}
                rowKey="name"
                height="auto"
                sortable={false}
                getRowClassExtra={rowClass}
                rowClassRefreshToken={rowToken}
                onRowClick={onVarClick}
                onCellValueChanged={onValueEdit}
                emptyMessage="이 자리에는 변수가 없다"
                ariaLabel="커서 자리 변수"
              />
            </div>
            {editError && (
              <p className="rsf-var-edit-error" data-testid="var-edit-error" role="alert">
                {editError}
              </p>
            )}
            <div className="rsf-var-add">
              <Button size="mini" data-testid="var-add" disabled={!canEdit} title={canEdit ? "이 자리에 변수를 더한다" : EDIT_OFF_TITLE} onClick={() => setAdding((x) => !x)}>
                <IconPlus size={12} aria-hidden="true" />
                변수 추가
              </Button>
              {sim.pendingEdit && (
                <Button size="mini" data-testid="var-edit-cancel" disabled={sim.running} title="고침 대기를 모두 버린다" onClick={() => sim.cancelEdit()}>
                  고침 취소
                </Button>
              )}
            </div>
            {canEdit && (
              <p className="rsf-panel-note" data-testid="var-edit-note">
                {EDIT_HINT}
              </p>
            )}
            {adding && canEdit && (
              <div className="rsf-var-add" data-testid="var-add-form">
                <Input data-testid="var-add-name" aria-label="새 변수 이름" value={addName} placeholder="이름" onChange={setAddName} />
                <Select data-testid="var-add-type" aria-label="새 변수 타입" value={addKind} options={ADD_KINDS} onChange={(v) => setAddKind(v as EditKind)} />
                <Input data-testid="var-add-value" aria-label="새 변수 값" value={addValue} placeholder="비우면 NULL" onChange={setAddValue} />
                <Button size="mini" data-testid="var-add-ok" onClick={submitAdd}>
                  넣기
                </Button>
                <Button size="mini" data-testid="var-add-close" onClick={() => setAdding(false)}>
                  닫기
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="rsf-panel-note">{NO_RECORD_NOTE}</p>
        )}
      </section>

      {isFlowNode && selectedId && (
        <section className="rsf-var-section" aria-label="노드 상세">
          {last && ranBeforeCursor ? (
            <TraceDetail
              nodeId={selectedId}
              node={last.trace.nodes[ranIndex]}
              flow={last.flow}
              traceViolations={last.trace.violations ?? []}
              desc={flow.view.descs?.[selectedId]}
              onOpenRule={onOpenRule}
              endedBranch={endedBranch}
            />
          ) : (
            <div className="rsf-panel" data-testid="sim-detail">
              <p className="rsf-panel-title">
                {flow.nodes.find((n) => n.id === selectedId)?.label ?? selectedId} <code>{selectedId}</code>
              </p>
              <NodeDescNote desc={flow.view.descs?.[selectedId]} />
              <p className="rsf-panel-note">{last ? NOT_RUN_NOTE : NO_RECORD_NOTE}</p>
            </div>
          )}
        </section>
      )}

      <section className="rsf-var-section" aria-label="식 평가">
        <p className="rsf-dbg-title">식 평가</p>
        <Input
          data-testid="expr-input"
          aria-label="식"
          value={expr.text}
          disabled={exprOff}
          title={!canParse ? EXPR_DENIED_TITLE : !last ? NO_RECORD_NOTE : "식을 적고 Enter — 커서 자리 값으로 계산한다"}
          placeholder='예) GT_THK > 10 · Enter'
          onChange={expr.setText}
          onKeyDown={onExprKey}
        />
        {!last && <p className="rsf-panel-note">{NO_RECORD_NOTE}</p>}
        {expr.result && (
          <p className="rsf-expr-result" data-testid="expr-result" data-kind={expr.result.kind} title={expr.evaluated ?? undefined}>
            {exprResultText(expr.result)}
          </p>
        )}
        {expr.running && <p className="rsf-panel-note">식을 읽는 중이다</p>}
        <p className="rsf-panel-note rsf-muted">{SERVER_JUDGES_TEXT}</p>
        {expr.recent.length > 0 && (
          <ul className="rsf-expr-recent">
            {expr.recent.map((t, i) => (
              <li key={t}>
                <Button size="mini" data-testid={`expr-recent-${i}`} disabled={exprOff} title="이 식을 칸에 채운다" onClick={() => expr.setText(t)}>
                  {t}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
