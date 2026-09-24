"use client";

/**
 * 피벗 섹션(TSK-08-03 design §2.1) — 조건 열의 axis(ROW/COL)로 의사결정표 행을 펼쳐 보이는 화면 표현이다(불변 3).
 * 보이는 조건과 편집 조건은 `pivot-model.ts` 의 `pvSpec` 이 정한다(시안 pvSpec 그대로). 저장은 평탄화된 행 그대로 기존 TABLE 파트(`saveTable`)로 보내며
 * 새 저장 경로·피벗 전용 JSON 은 없다. 열 설정 초안이 dirty 이면 표 저장과 같이 막는다(불변 13, `tableSaveBlocked`).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { saveTable } from "../../api";
import type { RuleEditCardProps } from "../../cards";
import { gridRowsFromStored, storedRowsFromGrid, type GridRow } from "../../decision-table/grid-model";
import { useColumnDraftShared } from "../column-draft-context";
import { tableSaveBlocked } from "../columns/column-draft";
import { applyPivotEdit, buildPivot, pvSpec, type PivotBand, type PivotEdit, type PivotSpec } from "./pivot-model";

const th: CSSProperties = { textAlign: "left", padding: "2px 6px", whiteSpace: "nowrap", borderBottom: "1px solid var(--color-border-light)" };
const td: CSSProperties = { padding: "2px 6px", verticalAlign: "top", borderBottom: "1px solid var(--color-border-light)" };
const LOWER_OPS = [
  { value: "<=", label: "이상" },
  { value: "<", label: "초과" },
];
const UPPER_OPS = [
  { value: "<", label: "미만" },
  { value: "<=", label: "이하" },
];

interface PivotState {
  rows: GridRow[];
  lastTempId: number;
}

/** 칸 하나 — 입력 중에는 부모 상태를 바꾸지 않고 포커스를 잃거나 Enter 를 누를 때 한 번 커밋한다(값 삭제=행 삭제라 글자마다 반영하면 안 된다). */
function CommitInput({ value, disabled, onCommit, ...rest }: { value: string; disabled?: boolean; onCommit: (v: string) => void; [k: string]: unknown }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <Input
      {...rest}
      value={text}
      disabled={disabled}
      onChange={setText}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function cellText(row: GridRow, varId: number): string {
  return row.cells[varId]?.val ?? "";
}

export function PivotSection({ view, editable, runWrite, notify, setDirty, canDo, busy }: RuleEditCardProps) {
  const shared = useColumnDraftShared();
  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const spec: PivotSpec | null = useMemo(() => pvSpec(view.rule.ruleKind, view.vars, view.varMeta ?? []), [view.rule.ruleKind, view.vars, view.varMeta]);
  const baseline = useMemo(() => gridRowsFromStored(view.vars, view.rows), [view.vars, view.rows]);
  const [state, setState] = useState<PivotState>({ rows: baseline, lastTempId: baseline.reduce((m, r) => Math.min(m, r.rowId), 0) });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setState({ rows: baseline, lastTempId: baseline.reduce((m, r) => Math.min(m, r.rowId), 0) });
    setMessage(null);
  }, [baseline]);

  const canEdit = editable && spec?.editable === true && view.rule.sourceKind === "MDM" && selected != null;
  const dirty = canEdit && JSON.stringify(state.rows) !== JSON.stringify(baseline);
  useEffect(() => {
    setDirty("pivot", dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty("pivot", false), [setDirty]);
  const { setPivotDirty } = shared;
  useEffect(() => {
    setPivotDirty(dirty);
  }, [dirty, setPivotDirty]);
  useEffect(() => () => setPivotDirty(false), [setPivotDirty]);

  const pv = useMemo(() => (spec ? buildPivot(spec, state.rows) : null), [spec, state.rows]);
  const edit = useCallback(
    (e: PivotEdit) => {
      if (!spec) return;
      setState((prev) => {
        const r = applyPivotEdit(spec, prev.rows, e, prev.lastTempId);
        if (!r) return prev;
        setMessage(r.message);
        return { rows: r.rows, lastTempId: r.lastTempId };
      });
    },
    [spec],
  );

  if (!spec || !pv) return null;
  const { rv, cv, res } = spec;
  const colBlocked = tableSaveBlocked(shared.colDirty);
  const tableBlocked = shared.tableDirty;
  const canSave = canEdit && dirty && canDo("save") && !busy && !colBlocked && !tableBlocked;

  const save = async () => {
    if (!selected) return;
    const rows = storedRowsFromGrid(view.vars, state.rows).map((r) => ({ rowId: r.rowId, rowKind: r.rowKind, cells: r.cells, note: r.note ?? null }));
    const saved = await runWrite(() => saveTable(view.rule.maruRuleId, selected.ver, selected.rowVersion, selected.hitPolicy ?? null, rows));
    if (saved) notify({ kind: "info", text: "피벗 편집을 의사결정표 행으로 저장했습니다." });
  };
  const discard = () => {
    setState({ rows: baseline, lastTempId: baseline.reduce((m, r) => Math.min(m, r.rowId), 0) });
    setMessage(null);
  };

  const axisName = (v: (typeof rv)[number]) => v.label || v.varName || `_V${v.varId}`;
  const bandHead = (b: PivotBand) => {
    if (!spec.two) return <th style={th} colSpan={rv.length}>{b.key}</th>;
    const ax = b.ax;
    if (canEdit) {
      const id = b.first.rowId;
      const commit = (patch: Partial<{ lo: string; lop: string; hi: string; hop: string }>) =>
        edit({ type: "band", bandRowId: id, ...{ lo: ax.left ?? "", lop: b.lo, hi: ax.right ?? "", hop: b.hi }, ...patch });
      return (
        <>
          <th style={th}>
            <CommitInput data-pvb="lo" data-band={id} value={ax.left ?? ""} disabled={busy} onCommit={(v: string) => commit({ lo: v })} style={{ width: 70 }} />
            <Select data-pvb="lop" data-band={id} value={b.lo} options={LOWER_OPS} disabled={busy} onChange={(v) => commit({ lop: v })} />
          </th>
          <th style={th}>
            <CommitInput data-pvb="hi" data-band={id} value={ax.right ?? ""} disabled={busy} onCommit={(v: string) => commit({ hi: v })} style={{ width: 70 }} />
            <Select data-pvb="hop" data-band={id} value={b.hi} options={UPPER_OPS} disabled={busy} onChange={(v) => commit({ hop: v })} />
          </th>
        </>
      );
    }
    return (
      <>
        <th style={th}>
          {ax.left ?? "-"} <small>{b.lo === "<=" ? "이상" : "초과"}</small>
        </th>
        <th style={th}>
          {ax.right ?? "-"} <small>{b.hi === "<=" ? "이하" : "미만"}</small>
        </th>
      </>
    );
  };

  return (
    <div data-testid="pivot-section" style={{ paddingTop: "var(--spacing-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
        <strong>피벗 보기</strong>
        <span data-testid="pivot-badge" style={badgeStyle(canEdit ? "success" : "muted")}>
          {canEdit ? "편집" : "화면 표현"}
        </span>
        <span style={{ color: "var(--color-text-secondary)" }}>
          행 축 {rv.map((v) => v.varName).join(", ")} · 열 축 {cv.map((v) => v.varName).join(", ")} · 셀 = {res.label || res.varName}
        </span>
        {dirty && (
          <span data-testid="pivot-dirty" style={badgeStyle("warning")}>
            피벗 편집(저장 안 함)
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto", paddingTop: "var(--spacing-xs)" }}>
        <table data-testid="pivot-table" style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr>
              {spec.two ? (
                <>
                  <th style={th}>{axisName(rv[0])} 하한</th>
                  <th style={th}>{axisName(rv[0])} 상한</th>
                </>
              ) : (
                <th style={th} colSpan={rv.length}>
                  {rv.map(axisName).join(" · ")}
                </th>
              )}
              {pv.cols.map((c) => (
                <th key={c} style={th} data-testid={`pivot-col-${c}`}>
                  {c}
                </th>
              ))}
              {canEdit && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {pv.bands.map((b) => (
              <tr key={b.first.rowId} data-testid={`pivot-band-${b.first.rowId}`}>
                {bandHead(b)}
                {pv.cols.map((c) => {
                  const xs = b.cells[c] ?? [];
                  const val = xs.length === 1 ? cellText(xs[0], res.varId) : "";
                  return (
                    <td key={c} style={td} data-testid={`pivot-cell-${b.first.rowId}-${c}`} title={xs.map((x) => `row_id ${x.rowId}`).join(", ") || "행 없음"}>
                      {xs.length > 1 ? (
                        <span style={badgeStyle("warning")}>겹침 {xs.length}</span>
                      ) : canEdit ? (
                        <CommitInput
                          key={`${b.first.rowId}:${c}:${val}`}
                          data-pvc={b.first.rowId}
                          data-col={c}
                          value={val}
                          placeholder="빈칸"
                          disabled={busy}
                          onCommit={(v: string) => edit({ type: "cell", bandRowId: b.first.rowId, col: c, value: v })}
                          style={{ width: 90 }}
                        />
                      ) : xs.length ? (
                        val
                      ) : (
                        <span style={{ color: "var(--color-text-muted)" }}>빈칸</span>
                      )}
                    </td>
                  );
                })}
                {canEdit && (
                  <td style={td}>
                    <Button data-pvadd={b.first.rowId} disabled={busy} title="아래에 구간 추가. 이 구간 값을 복사한다" onClick={() => edit({ type: "addBand", bandRowId: b.first.rowId })}>
                      ＋
                    </Button>
                    <Button data-pvdel={b.first.rowId} disabled={busy} title={`이 구간의 행 ${pv.cols.length}개를 지운다`} onClick={() => edit({ type: "delBand", bandRowId: b.first.rowId })}>
                      −
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "var(--spacing-xs) 0", color: "var(--color-text-secondary)" }}>
        저장은 아래 의사결정표 {state.rows.filter((r) => r.rowKind === "NORMAL").length}행 그대로이고, 축 배정은 조건 열의 축 칸이 정한다. 엔진은 축을 읽지 않는다.
      </p>
      {canEdit && (
        <>
          <p style={{ margin: "var(--spacing-xs) 0", color: "var(--color-text-secondary)" }}>
            셀을 고치면 그 행 하나의 결과 셀이, 하한·상한을 고치면 그 구간 행 {pv.cols.length}개의 구간 셀이 함께 바뀝니다. 빈칸에 값을 넣으면 행을 만들고 값을 지우면 행을 지웁니다.
            열 축 값은 조건 열의 값이라 의사결정표에서 행을 추가합니다.
          </p>
          {message && (
            <p data-testid="pivot-msg" style={{ margin: "var(--spacing-xs) 0" }}>
              {message}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", alignItems: "center" }}>
            <Button variant="primary" data-testid="pivot-save" disabled={!canSave} onClick={() => void save()}>
              피벗 저장
            </Button>
            <Button data-testid="pivot-revert" disabled={!dirty || busy} onClick={discard}>
              피벗 되돌리기
            </Button>
            {colBlocked && (
              <span data-testid="pivot-col-block" style={{ color: "var(--color-danger)" }}>
                열 설정 초안이 있어 피벗을 저장할 수 없습니다. 열 설정을 적용하거나 초안을 버리세요.
              </span>
            )}
            {tableBlocked && (
              <span data-testid="pivot-table-block" style={{ color: "var(--color-danger)" }}>
                표 카드에 저장 안 한 변경이 있어 피벗을 저장할 수 없습니다. 표를 저장하거나 되돌리세요.
              </span>
            )}
          </div>
        </>
      )}
      {!canEdit && (
        <p data-testid="pivot-readonly-note" style={{ margin: "var(--spacing-xs) 0", color: "var(--color-text-secondary)" }}>
          {editable && !spec.editable
            ? "이 표는 피벗에서 편집하지 않는다. 행 축이 2 타입 하나, 열 축이 Equal 하나, 결과가 Value 하나일 때만 연다. 아래 의사결정표에서 고친다."
            : "피벗은 화면 표현이다. 의사결정표 행이 그대로 저장되어 있다."}
        </p>
      )}
    </div>
  );
}
