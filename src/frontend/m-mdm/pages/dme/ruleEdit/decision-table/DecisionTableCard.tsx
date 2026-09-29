"use client";

/**
 * 카드 ③ 의사결정표(TSK-08-02 design §6.7.4). 적중 정책, 3줄 머리 그리드(shared `AgDataGrid` 열 그룹·행 드래그, D8),
 * 행 추가·기본 행 추가·행 복사·표 저장·되돌리기, 검사 요약, 행 선택 강조.
 *
 * 편집은 서버 판정 `editable`(DECISION 만)일 때만 켠다(I7). 편집할 때마다 evalex `analyzeRule` 로 즉시 검사하고(I13),
 * 저장 응답의 서버 검사와 저장 전 화면 검사가 같은지(`sameIssues`) 알린다(수용 7, 06:731). 저장 안 한 변경이 없으면
 * view 가 실은 서버 검사를 보인다.
 *
 * TSK-08-04: 편집 중인 표를 카드 공유 상태(`RuleWorkbenchContext`)에 올려 값 테스트(편집본)가 쓰게 하고, 이 표가 보이는 정의의 값 테스트
 * 결과만 칠한다(I33). 저장 거부(서버 저장 시 검사 ERROR)면 메시지를 보이고 편집 상태를 그대로 둔다. 서버 저장 검사만 낸 이슈는 동치
 * 배지(분석기 코드만, I26)와 따로 "서버 저장 검사" 로 보인다. view 를 다시 불러와도 표 정의(버전·row_version·열·행)가 같으면 편집을 지우지 않는다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { AgDataGrid } from "@dk-oasis/shared/grid";
import { Button, Select } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";
import { isRowVersionConflict } from "@/dme/oasis-call";

import { ColumnDraftSharedContext } from "../sections/column-draft-context";
import { tableSaveBlocked } from "../sections/columns/column-draft";

import { saveTable } from "../api";
import type { RuleEditCardProps, RuleTableSection } from "../cards";
import { CardFrame, MutedText } from "../cards/CardFrame";
import { useRuleWorkbench } from "../state/workbench-context";
import type { HitPolicyCode, RuleEditView, RuleIssueView } from "../types";
import { runShownOnTable, testMarksOf } from "../value-test/test-marks";
import { mapRowIds, sameIssues, serverOnlyIssues, splitIssues } from "./analysis";
import { ROW_LABEL_FIELD, TEST_HIT_ROW_CLASS, buildTableColumns, displayRows, parseField } from "./columns";
import { diffTable } from "./diff";
import {
  initTableState,
  isDirty,
  isRowDraggable,
  saveRowsOf,
  tableAnalysis,
  tableReducer,
  tableStoredRows,
  type TableAction,
} from "./table-state";

const HIT_POLICIES: Array<{ value: HitPolicyCode; label: string; desc: string }> = [
  { value: "FIRST", label: "FIRST", desc: "위에서부터 처음 맞는 행 하나를 쓴다. 겹침은 경고, 가려진 행은 도달 불가로 알린다." },
  { value: "UNIQUE", label: "UNIQUE", desc: "맞는 행이 하나뿐이어야 한다. 겹침은 오류다." },
  { value: "PRIORITY", label: "PRIORITY", desc: "맞는 행 가운데 결과 값 우선순위가 가장 높은 것을 쓴다." },
  { value: "COLLECT", label: "COLLECT", desc: "맞는 행을 모두 모아 집계한다." },
  { value: "ANY", label: "ANY", desc: "맞는 행이 여럿이어도 결과가 모두 같아야 한다." },
];

/** 그리드 표시 행의 드래그 가능 여부 — 모듈 수준 함수라 렌더마다 바뀌지 않는다. */
function isDraggableDisplayRow(row: Record<string, unknown>): boolean {
  return isRowDraggable({ rowKind: row.rowKind as "NORMAL" | "DEFAULT" });
}

interface ServerCheck {
  same: boolean;
  issues: RuleIssueView[];
}

/** 그리드 행 클래스 — 새 행(초록), 값 테스트 적중 행. */
function rowClassOf(row: Record<string, unknown>): string[] | undefined {
  const out: string[] = [];
  if (row.__added === true) out.push("ag-row-inserted");
  if (row.__hit === true) out.push(TEST_HIT_ROW_CLASS);
  return out.length > 0 ? out : undefined;
}

/** 표 정의 서명 — 이것이 같으면 view 를 다시 불러와도(케이스 저장 등 다른 카드의 쓰기 뒤) 편집 중인 표를 지우지 않는다. */
function tableLoadSig(view: RuleEditView): string {
  const selected = view.versions.find((v) => v.ver === view.selectedVer);
  return JSON.stringify([
    view.rule.maruRuleId,
    view.rule.ruleKind,
    view.selectedVer,
    selected?.rowVersion ?? null,
    selected?.hitPolicy ?? null,
    view.editable,
    view.vars,
    view.rows,
  ]);
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
  // 열 설정 섹션과 나누는 상태 — 초안이 dirty 면 표 저장을 막고(불변 13), 열 머리를 누르면 열 설정 표의 그 줄을 하이라이트한다(design §6).
  const [colDirty, setColDirty] = useState(false);
  const [highlightVarId, setHighlightVarId] = useState<number | null>(null);
  const [saveRejected, setSaveRejected] = useState<string | null>(null);
  const workbench = useRuleWorkbench();
  const { publishTableDraft, setColDirty: publishColDirty } = workbench;

  const viewRef = useRef(view);
  viewRef.current = view;
  const loadSig = tableLoadSig(view);
  useEffect(() => {
    dispatch({ type: "load", view: viewRef.current });
  }, [loadSig]);

  const edit = useCallback((action: TableAction) => {
    setServerCheck(null);
    setSaveRejected(null);
    dispatch(action);
  }, []);

  const dirty = isDirty(state);
  const columnShared = useMemo(
    () => ({ colDirty, setColDirty, highlightVarId, setHighlightVarId, tableDirty: dirty }),
    [colDirty, highlightVarId, dirty],
  );
  const saveBlocked = tableSaveBlocked(colDirty);
  // view 를 다시 불러오면 useRuleEdit 가 dirty 목록을 비우므로, 편집이 남아 있으면 다시 알린다.
  useEffect(() => {
    setDirty("table", dirty);
  }, [dirty, setDirty, view]);

  // 편집 중인 표를 값 테스트(편집본)에 올린다 — 내용이 같으면 reducer 가 상태를 그대로 둔다.
  const storedRows = useMemo(() => tableStoredRows(state), [state]);
  useEffect(() => {
    publishTableDraft({ ruleId: state.ruleId, ver: view.selectedVer, hitPolicy: state.hitPolicy, rows: storedRows, dirty });
  }, [publishTableDraft, state.ruleId, view.selectedVer, state.hitPolicy, storedRows, dirty]);
  useEffect(() => {
    publishColDirty(colDirty);
  }, [colDirty, publishColDirty]);

  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const decision = view.rule.ruleKind === "DECISION";
  const editable = state.editable && decision;

  // 즉시 검사(I13) — 편집 한 번(칸·행 추가·삭제·드래그·적중 정책)마다 상태가 바뀌어 다시 돈다.
  const js = useMemo(() => tableAnalysis(state), [state]);
  const shown = dirty ? js.issues : (view.issues ?? []);
  const split = useMemo(() => splitIssues(shown), [shown]);
  const diff = useMemo(() => diffTable(selected?.baseVer != null ? view.baseRows : null, state.rows), [selected?.baseVer, view.baseRows, state.rows]);

  // 값 테스트 칠하기(I33) — 이 표가 보이는 정의(BODY 는 같은 rev, VERSION 은 같은 버전·row_version·변경 없음)의 서버 결과만.
  const shownRun = runShownOnTable(workbench.testRun, {
    ruleId: view.rule.maruRuleId,
    ver: view.selectedVer,
    rowVersion: selected?.rowVersion ?? null,
    rev: workbench.tableDraft?.rev ?? null,
    dirty,
  })
    ? workbench.testRun
    : null;
  const defaultRowId = state.rows.find((r) => r.rowKind === "DEFAULT")?.rowId ?? null;
  const testMarks = useMemo(
    () => (shownRun ? testMarksOf(shownRun.result, state.vars, view.varMeta, defaultRowId) : undefined),
    [shownRun, state.vars, view.varMeta, defaultRowId],
  );

  const ctxRef = useRef({ edit, vars: state.vars });
  ctxRef.current = { edit, vars: state.vars };
  // ag-grid 는 열 그룹 정의가 바뀌면 머리 그룹 컴포넌트를 다시 붙이다 죽는다(실측: getProvidedColumnGroup of null). 그래서 열은
  // 변수 구조가 같으면 다시 만들지 않고(저장 뒤 새로 불러와도 같은 정의), 구조·편집 여부·버전이 바뀌면 그리드를 새로 마운트한다(gridKey).
  // 결과 열 그룹 머리는 varMeta(그룹·열 조건)로 만든다 — 그룹 구조가 바뀌어도 그리드를 새로 마운트한다.
  const varsSig = JSON.stringify([state.vars, view.varMeta ?? []]);
  const columns = useMemo(
    () =>
      buildTableColumns({
        vars: ctxRef.current.vars,
        varMeta: view.varMeta,
        candidates: view.varCandidates,
        editable,
        onEdit: (rowId, varId, key, value) => ctxRef.current.edit({ type: "editCell", rowId, varId, key, value }),
        onSelectRow: (rowId) => dispatch({ type: "selectRow", rowId }),
        onDeleteRow: (rowId) => ctxRef.current.edit({ type: "deleteRow", rowId }),
        onSelectVar: setHighlightVarId,
      }),
    [varsSig, editable],
  );
  const gridKey = `${view.rule.maruRuleId}:${view.selectedVer ?? "-"}:${editable ? "edit" : "read"}:${varsSig}`;
  const data = useMemo(
    () => displayRows(state.rows, state.vars, { diff, split, selectedRowId: state.selectedRowId, serverShown: !dirty, test: testMarks }),
    [state.rows, state.vars, diff, split, state.selectedRowId, dirty, testMarks],
  );
  const markToken = useMemo(() => JSON.stringify(data.map((r) => [r.rowKey, r.__mk, r.__added, r.__hit])), [data]);

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
    setSaveRejected(null);
    const res = await runWrite(async () => {
      try {
        return await saveTable(view.rule.maruRuleId, selected.ver, selected.rowVersion, decision ? state.hitPolicy : null, saveRowsOf(state));
      } catch (e) {
        // 저장 시 검사 거부(MDM021 "룰 저장 거부: …")는 표 아래에도 남긴다 — 편집 상태는 그대로다(runWrite 는 실패 때 다시 불러오지 않는다).
        if (!isRowVersionConflict(e)) setSaveRejected(e instanceof Error ? e.message : String(e));
        throw e;
      }
    });
    if (res) {
      const server = res.issues ?? [];
      setServerCheck({ same: !before.failed && sameIssues(mapRowIds(before.issues, res.rowIdMap), server), issues: server });
    }
  }, [selected, js, runWrite, view.rule.maruRuleId, decision, state]);

  const errors = shown.filter((i) => i.severity === "ERROR").length;
  const warnings = shown.length - errors;
  const hasDefault = state.rows.some((r) => r.rowKind === "DEFAULT");
  // 행 복사 대상 = 고른 NORMAL 행(기본 행은 하나뿐이라 복사하지 않는다).
  const canCopy = state.rows.some((r) => r.rowId === state.selectedRowId && r.rowKind === "NORMAL");
  const policy = HIT_POLICIES.find((p) => p.value === state.hitPolicy);
  const canSave = editable && dirty && canDo("save") && !busy && !saveBlocked;
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
          key={gridKey}
          columns={columns}
          data={data}
          rowKey="rowKey"
          height={gridHeight}
          columnSizing="fixed"
          sortable={false}
          singleClickEdit
          rowDragField={editable ? ROW_LABEL_FIELD : undefined}
          isRowDraggable={isDraggableDisplayRow}
          onRowOrderChange={(keys) => edit({ type: "reorder", keys })}
          onCellValueChanged={handleCellChange}
          highlightedRowKey={state.selectedRowId == null ? null : String(state.selectedRowId)}
          getRowClassExtra={rowClassOf}
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
          <Button
            data-testid="dt-copy-row"
            title="행 번호를 눌러 고른 행을 복사해 바로 아래에 넣습니다"
            disabled={!editable || busy || !canCopy}
            onClick={() => state.selectedRowId != null && edit({ type: "copyRow", rowId: state.selectedRowId })}
          >
            행 복사
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
          {tableSaveBlocked(colDirty) && (
            <span data-testid="dt-col-block" style={{ color: "var(--color-danger)", alignSelf: "center" }}>
              열 설정 초안이 있어 표를 저장할 수 없습니다. 열 설정을 적용하거나 초안을 버리세요.
            </span>
          )}
        </div>
      )}

      {saveRejected && (
        <p data-testid="dt-save-rejected" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
          표를 저장하지 못했습니다. 편집 내용은 그대로 있습니다. {saveRejected}
        </p>
      )}
      {workbench.testRunCleared && (
        <p data-testid="dt-test-stale" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)" }}>
          표가 바뀌어 값 테스트 결과를 지웠습니다. 다시 돌리세요.
        </p>
      )}
      {shownRun && (
        <p data-testid="dt-test-shown" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)" }}>
          값 테스트 결과({shownRun.target === "BODY" ? "편집본" : `버전 ${shownRun.ver}`})를 표에 칠했습니다 — 초록 행은 적중 행, 붉은 칸은 그 행의 첫
          거짓 조건입니다.
        </p>
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
        {serverCheck && serverOnlyIssues(serverCheck.issues).length > 0 && (
          <div data-testid="dt-server-checks">
            <span style={{ fontWeight: 600 }}>서버 저장 검사</span>
            <ul style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)" }}>
              {serverOnlyIssues(serverCheck.issues).map((i, idx) => (
                <li key={`${i.code}-${idx}`} style={{ color: i.severity === "ERROR" ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                  {i.severity === "ERROR" ? "오류" : "경고"} {issueLine(i)}
                </li>
              ))}
            </ul>
          </div>
        )}
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

      <ColumnDraftSharedContext.Provider value={columnShared}>
        {extraSections.map((s) => (
          <s.Component key={s.id} {...props} />
        ))}
      </ColumnDraftSharedContext.Provider>
    </CardFrame>
  );
}
