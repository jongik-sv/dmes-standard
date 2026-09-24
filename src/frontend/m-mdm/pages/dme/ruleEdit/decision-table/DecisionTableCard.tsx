"use client";

/**
 * 카드 ③ 의사결정표(TSK-08-02 design §6.7.4). 적중 정책, 3줄 머리 그리드(shared `AgDataGrid` 열 그룹·행 드래그, D8),
 * 행 추가·기본 행 추가·표 저장·되돌리기, 검사 요약, 행 선택 강조.
 *
 * 편집은 서버 판정 `editable`(DECISION 만)일 때만 켠다(I7). 편집할 때마다 evalex `analyzeRule` 로 즉시 검사하고(I13),
 * 저장 응답의 서버 검사와 저장 전 화면 검사가 같은지(`sameIssues`) 알린다(수용 7, 06:731). 저장 안 한 변경이 없으면
 * view 가 실은 서버 검사를 보인다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { AgDataGrid } from "@dk-oasis/shared/grid";
import { Button, Select } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { saveTable } from "../api";
import type { RuleEditCardProps, RuleTableSection } from "../cards";
import { CardFrame, MutedText } from "../cards/CardFrame";
import type { HitPolicyCode, RuleIssueView } from "../types";
import { mapRowIds, sameIssues, splitIssues } from "./analysis";
import { ROW_LABEL_FIELD, buildTableColumns, displayRows, parseField } from "./columns";
import { diffTable } from "./diff";
import {
  initTableState,
  isDirty,
  isRowDraggable,
  saveRowsOf,
  tableAnalysis,
  tableReducer,
  type TableAction,
} from "./table-state";

const HIT_POLICIES: Array<{ value: HitPolicyCode; label: string; desc: string }> = [
  { value: "FIRST", label: "FIRST", desc: "위에서부터 처음 맞는 행 하나를 쓴다. 겹침은 경고, 가려진 행은 도달 불가로 알린다." },
  { value: "UNIQUE", label: "UNIQUE", desc: "맞는 행이 하나뿐이어야 한다. 겹침은 오류다." },
  { value: "PRIORITY", label: "PRIORITY", desc: "맞는 행 가운데 결과 값 우선순위가 가장 높은 것을 쓴다." },
  { value: "COLLECT", label: "COLLECT", desc: "맞는 행을 모두 모아 집계한다." },
  { value: "ANY", label: "ANY", desc: "맞는 행이 여럿이어도 결과가 모두 같아야 한다." },
];

interface ServerCheck {
  same: boolean;
  issues: RuleIssueView[];
}

function issueLine(i: RuleIssueView): string {
  const rows = i.rowIds.length > 0 ? ` 행 ${i.rowIds.join(", ")}` : "";
  return `[${i.code}]${rows}${i.message ? ` — ${i.message}` : ""}`;
}

export interface DecisionTableCardProps extends RuleEditCardProps {
  /** 표 아래 섹션(08-03 확장 자리, 기본 빈 목록). */
  extraSections?: RuleTableSection[];
}

export function DecisionTableCard(props: DecisionTableCardProps) {
  const { view, runWrite, setDirty, canDo, busy, extraSections = [] } = props;
  const [state, dispatch] = useReducer(tableReducer, view, initTableState);
  const [serverCheck, setServerCheck] = useState<ServerCheck | null>(null);

  useEffect(() => {
    dispatch({ type: "load", view });
  }, [view]);

  const edit = useCallback((action: TableAction) => {
    setServerCheck(null);
    dispatch(action);
  }, []);

  const dirty = isDirty(state);
  useEffect(() => {
    setDirty("table", dirty);
  }, [dirty, setDirty]);

  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const decision = view.rule.ruleKind === "DECISION";
  const editable = state.editable && decision;

  // 즉시 검사(I13) — 편집 한 번(칸·행 추가·삭제·드래그·적중 정책)마다 상태가 바뀌어 다시 돈다.
  const js = useMemo(() => tableAnalysis(state), [state]);
  const shown = dirty ? js.issues : (view.issues ?? []);
  const split = useMemo(() => splitIssues(shown), [shown]);
  const diff = useMemo(() => diffTable(selected?.baseVer != null ? view.baseRows : null, state.rows), [selected?.baseVer, view.baseRows, state.rows]);

  const ctxRef = useRef({ edit });
  ctxRef.current = { edit };
  const columns = useMemo(
    () =>
      buildTableColumns({
        vars: state.vars,
        editable,
        onEdit: (rowId, varId, key, value) => ctxRef.current.edit({ type: "editCell", rowId, varId, key, value }),
        onSelectRow: (rowId) => dispatch({ type: "selectRow", rowId }),
        onDeleteRow: (rowId) => ctxRef.current.edit({ type: "deleteRow", rowId }),
      }),
    [state.vars, editable],
  );
  const data = useMemo(
    () => displayRows(state.rows, state.vars, { diff, split, selectedRowId: state.selectedRowId, serverShown: !dirty }),
    [state.rows, state.vars, diff, split, state.selectedRowId, dirty],
  );
  const markToken = useMemo(() => JSON.stringify(data.map((r) => [r.rowKey, r.__mk, r.__added])), [data]);

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      const rowId = Number(p.rowKey);
      if (p.field === "note") {
        edit({ type: "editNote", rowId, value: String(p.newValue ?? "") });
        return;
      }
      const f = parseField(p.field);
      if (f) edit({ type: "editCell", rowId, varId: f.varId, key: f.key, value: String(p.newValue ?? "") });
    },
    [edit],
  );

  const handleSave = useCallback(async () => {
    if (!selected) return;
    const before = js;
    const res = await runWrite(() =>
      saveTable(view.rule.maruRuleId, selected.ver, selected.rowVersion, decision ? state.hitPolicy : null, saveRowsOf(state)),
    );
    if (res) {
      const server = res.issues ?? [];
      setServerCheck({ same: !before.failed && sameIssues(mapRowIds(before.issues, res.rowIdMap), server), issues: server });
    }
  }, [selected, js, runWrite, view.rule.maruRuleId, decision, state]);

  const errors = shown.filter((i) => i.severity === "ERROR").length;
  const warnings = shown.length - errors;
  const hasDefault = state.rows.some((r) => r.rowKind === "DEFAULT");
  const policy = HIT_POLICIES.find((p) => p.value === state.hitPolicy);
  const canSave = editable && dirty && canDo("save") && !busy;
  const gridHeight = Math.min(560, 3 * 28 + Math.max(state.rows.length, 3) * 26 + 24);

  return (
    <CardFrame
      title="③ 의사결정표"
      testId="rule-card-table"
      right={dirty ? <span data-testid="dt-dirty" style={badgeStyle("warning")}>저장 안 한 변경</span> : null}
    >
      {decision ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", paddingBottom: "var(--spacing-xs)" }}>
          <span>적중 정책</span>
          <Select
            data-testid="dt-hit-policy"
            value={state.hitPolicy ?? ""}
            options={HIT_POLICIES.map((p) => ({ value: p.value, label: p.label }))}
            disabled={!editable || busy}
            onChange={(v) => edit({ type: "setHitPolicy", value: v as HitPolicyCode })}
            style={{ width: 130 }}
          />
          <MutedText>{policy?.desc ?? ""}</MutedText>
        </div>
      ) : (
        <p data-testid="dt-derive-notice" style={{ margin: "0 0 var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
          산출 룰은 열 설정(TSK-08-03)에서 편집한다. 이 표는 읽기 전용이다.
        </p>
      )}

      <div data-testid="dt-grid" style={{ height: gridHeight }}>
        <AgDataGrid
          columns={columns}
          data={data}
          rowKey="rowKey"
          height={gridHeight}
          columnSizing="fixed"
          sortable={false}
          singleClickEdit
          rowDragField={editable ? ROW_LABEL_FIELD : undefined}
          isRowDraggable={(row) => isRowDraggable({ rowKind: row.rowKind as "NORMAL" | "DEFAULT" })}
          onRowOrderChange={(keys) => edit({ type: "reorder", keys })}
          onCellValueChanged={handleCellChange}
          highlightedRowKey={state.selectedRowId == null ? null : String(state.selectedRowId)}
          getRowClassExtra={(row) => (row.__added === true ? "ag-row-inserted" : undefined)}
          rowClassRefreshToken={markToken}
          emptyMessage="행이 없습니다."
          ariaLabel="의사결정표"
        />
      </div>

      {decision && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
          <Button disabled={!editable || busy} onClick={() => edit({ type: "addRow" })}>
            행 추가
          </Button>
          <Button disabled={!editable || busy || hasDefault} onClick={() => edit({ type: "addDefaultRow" })}>
            기본 행 추가
          </Button>
          <Button disabled={!dirty || busy} onClick={() => edit({ type: "revert" })}>
            되돌리기
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void handleSave()}>
            표 저장
          </Button>
        </div>
      )}

      <div data-testid="dt-check" style={{ paddingTop: "var(--spacing-sm)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-sm)", alignItems: "center" }}>
          <strong>검사({dirty ? "화면" : "서버"})</strong>
          <span data-testid="dt-check-count">
            오류 {errors} · 경고 {warnings}
          </span>
          {serverCheck &&
            (serverCheck.same ? (
              <span data-testid="dt-check-same" style={badgeStyle("success")}>
                화면·서버 검사 일치
              </span>
            ) : (
              <span data-testid="dt-check-differ" style={badgeStyle("warning")}>
                서버 결과가 기준(화면 검사와 다름)
              </span>
            ))}
        </div>
        {dirty && js.failed && (
          <p data-testid="dt-check-failed" style={{ margin: "var(--spacing-xs) 0", color: "var(--color-danger)" }}>
            화면 검사를 할 수 없는 칸이 있습니다(저장하면 서버가 검사한다): {js.failure}
          </p>
        )}
        <ul data-testid="dt-check-rows" style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)" }}>
          {shown
            .filter((i) => i.code !== "VALUE_GAP" && i.code !== "NULL_GAP")
            .map((i, idx) => (
              <li key={`${i.code}-${idx}`} style={{ color: i.severity === "ERROR" ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                {i.severity === "ERROR" ? "오류" : "경고"} {issueLine(i)}
              </li>
            ))}
        </ul>
        {split.table.length > 0 && (
          <div data-testid="dt-check-table">
            <span style={{ fontWeight: 600 }}>표 단위 검사</span>
            <ul style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)" }}>
              {split.table.map((i, idx) => (
                <li key={`${i.code}-${idx}`} style={{ color: "var(--color-text-secondary)" }}>
                  {issueLine(i)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {diff.deleted.length > 0 && (
          <p data-testid="dt-deleted-rows" style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            base 대비 지운 행: {diff.deleted.map((r) => `row ${r.rowId}`).join(", ")}
          </p>
        )}
      </div>

      {extraSections.map((s) => (
        <s.Component key={s.id} {...props} />
      ))}
    </CardFrame>
  );
}
