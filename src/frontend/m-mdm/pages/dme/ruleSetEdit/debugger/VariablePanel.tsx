"use client";

/**
 * 디버그 모드 오른쪽 변수 패널(3단계 계획 §4.4·§4.5) — 위에서 아래로 조사식(핀한 이름)·커서 자리 변수 표·노드 상세·식 즉석 평가.
 *
 * - 조사식(`var-watches`): 세트별 localStorage(`rsf:watch:<setId>`). 값은 `sim.valueAt`(커서 자리). 흐름 입력·결과 이름에 없으면 "없는 변수".
 * - 변수 표(`var-grid`, AG Grid): 핀·이름·값·상태. 핀 칸은 아이콘만 그리고 행 누르기의 칸(col-id `pin`)으로 켜고 끈다 — 칸 렌더러에 입력 요소를
 *   두지 않는다(Local-Rules §12). 바로 앞 노드가 바꾼 줄은 노란 배경, 새로 생긴 줄은 "새" 배지(`getRowClassExtra`).
 * - 노드 상세: 고른 흐름 노드가 커서 앞에서 실행됐으면 2단계 `TraceDetail`(`sim-detail*`), 아니면 "아직 실행하지 않은 노드다"(P-D13).
 * - 식 평가: Enter 로 서버 파싱 → 화면 평가(`useExprEval`). `validate` 권한이 없으면 칸이 꺼진다(P-D1).
 * 기록이 없으면 변수 표·식 평가 자리에 "실행하면 커서 시점 값이 보인다". 낡은 기록(P-D9)도 옛 기록 기준으로 보인다(툴바가 배지를 보인다).
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { IconPin, IconPinFilled, IconX } from "@tabler/icons-react";

import type { TypedValue } from "@/contract/engine-contract.generated";
import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import type { EditFlow } from "../flow-edit";
import { flowIo } from "../set-model";
import { typedText } from "../trace-view";
import type { RuleIoMap } from "../types";
import { declaredTypes, FALLBACK_TEXT, SERVER_JUDGES_TEXT, type ExprResult } from "./expr-eval";
import { loadStrings, saveStrings, storeKeys } from "./local-store";
import { TraceDetail } from "./TraceDetail";
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

const VAR_COLUMNS: GridColumn[] = [
  {
    key: "pin",
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
  { key: "value", header: "값", width: 100 },
  {
    key: "state",
    header: "상태",
    width: 60,
    tooltip: false,
    render: (v) => (v === "새" ? <span style={badgeStyle("info")}>새</span> : v === "바뀜" ? <span style={badgeStyle("warning")}>바뀜</span> : null),
  },
];

const rowClass = (row: Record<string, unknown>) => (row.state === "새" ? "rsf-var-new" : row.state === "바뀜" ? "rsf-var-changed" : undefined);

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

  // ── 변수 표 ──
  const rows = useMemo(
    () =>
      sim.variables.map((v) => ({
        name: v.name,
        value: typedText(v.value),
        state: v.created ? "새" : v.changed ? "바뀜" : "",
        pin: pinned.has(v.name.toLowerCase()),
      })),
    [sim.variables, pinned],
  );
  const onVarClick = (row: Record<string, unknown>, ev: Event) => {
    if (clickedColumn(ev) === "pin") togglePin(String(row.name));
  };

  // ── 식 평가 ──
  const ctx = useMemo<Record<string, TypedValue> | null>(
    () => (last ? Object.fromEntries(sim.variables.map((v) => [v.name, v.value] as const)) : null),
    [last, sim.variables],
  );
  const types = useMemo(() => declaredTypes(flow, rules), [flow, rules]);
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
        {watches.length === 0 ? (
          <p className="rsf-panel-note">변수 표의 핀을 누르면 여기에 고정된다</p>
        ) : (
          <ul className="rsf-var-watches" data-testid="var-watches">
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
        )}
      </section>

      <section className="rsf-var-section" aria-label="변수">
        <p className="rsf-dbg-title">변수 — 커서 자리</p>
        {last ? (
          <div data-testid="var-grid" className="rsf-var-grid">
            <AgDataGrid
              columns={VAR_COLUMNS}
              data={rows}
              rowKey="name"
              height="auto"
              sortable={false}
              getRowClassExtra={rowClass}
              onRowClick={onVarClick}
              emptyMessage="이 자리에는 변수가 없다"
              ariaLabel="커서 자리 변수"
            />
          </div>
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
              onOpenRule={onOpenRule}
            />
          ) : (
            <div className="rsf-panel" data-testid="sim-detail">
              <p className="rsf-panel-title">
                {flow.nodes.find((n) => n.id === selectedId)?.label ?? selectedId} <code>{selectedId}</code>
              </p>
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
