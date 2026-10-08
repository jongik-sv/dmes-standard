"use client";

/**
 * 카드 ③ 의사결정표(TSK-08-02 design §6.7.4). 적중 정책(D-133 — 여기서 고르고 표 저장과 함께 저장), 3줄 머리 그리드(shared `AgDataGrid` 열 그룹·행 드래그, D8),
 * 행 추가·기본 행 추가·행 복사·표 저장·되돌리기, 검사 요약, 행 선택 강조.
 *
 * 편집은 서버 판정 `editable`(DECISION 만)일 때만 켠다(I7). 편집할 때마다 evalex `analyzeRule` 로 즉시 검사하고(I13 — Worker 에서
 * 돌려 큰 표에서도 입력이 멈추지 않는다, use-rule-analysis),
 * 저장 응답의 서버 검사와 저장 전 화면 검사가 같은지(`sameIssues`) 알린다(수용 7, 06:731). 저장 안 한 변경이 없으면
 * view 가 실은 서버 검사를 보인다.
 *
 * TSK-08-04: 편집 중인 표를 카드 공유 상태(`RuleWorkbenchContext`)에 올려 값 테스트(편집본)가 쓰게 하고, 이 표가 보이는 정의의 값 테스트
 * 결과만 칠한다(I33). 저장 거부(서버 저장 시 검사 ERROR)면 메시지를 보이고 편집 상태를 그대로 둔다. 서버 저장 검사만 낸 이슈는 동치
 * 배지(분석기 코드만, I26)와 따로 "서버 저장 검사" 로 보인다. view 를 다시 불러와도 표 정의(버전·row_version·열·행)가 같으면 편집을 지우지 않는다.
 *
 * [크게 보기]: 표 높이를 본문 스크롤 영역에서 보이는 높이까지 늘리고(표 위 줄과 아래 버튼 줄은 함께 보이게) 카드를 맨 위로 굴린다.
 * 높이만 바꾸므로 그리드를 다시 만들지 않아 편집 중인 셀·선택이 그대로 남는다. 창 크기가 바뀌면 다시 맞춘다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";

import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { Button, Select } from "@dk-oasis/shared/form";
import { badgeStyle, fmtVer, sameVer } from "@/shell";
import { isRowVersionConflict } from "@/dme/oasis-call";

import { ColumnDraftSharedContext } from "../sections/column-draft-context";
import { hitPolicyColumnConflicts, tableSaveBlocked } from "../sections/columns/column-draft";
import { SectionFrame } from "../sections/SectionFrame";

import { saveTable } from "../api";
import type { RuleEditCardProps, RuleTableSection } from "../cards";
import { useRuleWorkbench } from "../state/workbench-context";
import type { HitPolicy } from "@/evalex";

import type { HitPolicyCode, RuleEditView, RuleIssueView } from "../types";
import { runShownOnTable, testMarksOf } from "../value-test/test-marks";
import { mapRowIds, sameIssues, serverOnlyIssues, splitIssues } from "./analysis";
import { ROW_LABEL_FIELD, TEST_HIT_ROW_CLASS, buildTableColumns, createDisplayRowCache, displayRows, forgetDisplayRow, markTokenOf, parseField } from "./columns";
import { diffTable } from "./diff";
import {
  initTableState,
  isDirty,
  isRowDraggable,
  saveRowsOf,
  tableReducer,
  tableStoredRows,
  type TableAction,
} from "./table-state";
import { analyzeNow, useRuleAnalysis } from "./use-rule-analysis";

const HIT_POLICIES: Array<{ value: HitPolicyCode; label: string; desc: string }> = [
  { value: "FIRST", label: "FIRST", desc: "위에서부터 처음 맞는 행 하나를 쓴다. 겹침은 경고, 가려진 행은 도달 불가로 알린다." },
  { value: "UNIQUE", label: "UNIQUE", desc: "맞는 행이 하나뿐이어야 한다. 겹침은 오류다." },
  { value: "PRIORITY", label: "PRIORITY", desc: "맞는 행 가운데 결과 값 우선순위가 가장 높은 것을 쓴다." },
  { value: "COLLECT", label: "COLLECT", desc: "맞는 행을 모두 모아 집계한다." },
  { value: "ANY", label: "ANY", desc: "맞는 행이 여럿이어도 결과가 모두 같아야 한다." },
];
const HIT_POLICY_OPTIONS = HIT_POLICIES.map((p) => ({ value: p.value, label: p.label }));

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
  const selected = view.versions.find((v) => sameVer(v.ver, view.selectedVer));
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

/** 표를 크게 볼 때 가장 작은 높이(px) — 본문이 아주 좁아도 이보다 줄이지 않는다. */
const EXPANDED_MIN_HEIGHT = 320;
const EXPANDED_GAP = 8;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === "auto" || y === "scroll") return p;
  }
  return null;
}

/**
 * 크게 보기 높이 — `gridBox` 가 든 카드(section)의 머리부터 표 바로 아래 버튼 줄(`data-dt-actions`)까지가 본문 스크롤 영역에 꼭 들어가도록 표 높이를 구한다.
 * 켜는 순간 카드를 스크롤 영역 맨 위로 굴린다. 꺼져 있거나 잴 수 없으면 null.
 */
function useExpandedHeight(gridBox: RefObject<HTMLDivElement | null>, expanded: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const box = gridBox.current;
    const scroller = box && scrollParentOf(box);
    const card = box?.closest("section");
    if (!expanded || !box || !scroller || !card) {
      setHeight(null);
      return;
    }
    const measure = () => {
      const above = box.getBoundingClientRect().top - card.getBoundingClientRect().top;
      const actions = box.nextElementSibling as HTMLElement | null;
      const below = actions?.dataset.dtActions != null ? actions.offsetHeight : 0;
      setHeight(Math.max(EXPANDED_MIN_HEIGHT, Math.floor(scroller.clientHeight - above - below - EXPANDED_GAP * 3)));
    };
    measure();
    scroller.scrollTop += card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - EXPANDED_GAP;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(scroller);
    return () => ro?.disconnect();
  }, [expanded, gridBox]);
  return height;
}

export function DecisionTableCard(props: DecisionTableCardProps) {
  const { view, runWrite, setDirty, canDo, busy, extraSections = [] } = props;
  const [state, dispatch] = useReducer(tableReducer, view, initTableState);
  const [serverCheck, setServerCheck] = useState<ServerCheck | null>(null);
  // 열 설정 섹션과 나누는 상태 — 초안이 dirty 면 표 저장을 막고(불변 13), 열 머리를 누르면 열 설정 표의 그 줄을 하이라이트한다(design §6).
  const [colDirty, setColDirty] = useState(false);
  const [highlightVarId, setHighlightVarId] = useState<number | null>(null);
  const [revealSeq, setRevealSeq] = useState(0);
  const [saveRejected, setSaveRejected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // 검사 영역과 그 안의 표 단위 검사는 접을 수 있다. 접혀도 제목 줄의 오류·경고 개수와 일치 배지는 보인다.
  const [checkOpen, setCheckOpen] = useState(true);
  const [tableCheckOpen, setTableCheckOpen] = useState(true);
  const gridBoxRef = useRef<HTMLDivElement>(null);
  const expandedHeight = useExpandedHeight(gridBoxRef, expanded);
  const workbench = useRuleWorkbench();
  const { publishTableDraft, setColDirty: publishColDirty } = workbench;

  const viewRef = useRef(view);
  viewRef.current = view;
  const loadSig = useMemo(() => tableLoadSig(view), [view]);
  useEffect(() => {
    dispatch({ type: "load", view: viewRef.current });
  }, [loadSig]);

  const edit = useCallback((action: TableAction) => {
    setServerCheck(null);
    setSaveRejected(null);
    dispatch(action);
  }, []);

  // 행 고르기(selectedRowId)는 표 내용이 아니다 — 아래 계산은 행·변수·적중 정책이 바뀔 때만 다시 한다(2,600행 표에서 고를 때마다 검사가 돌면 느리다).
  const { ruleId, ruleKind, vars: tableVars, rows: tableRows, loadedRows, hitPolicy, loadedHit } = state;
  // 저장 행은 행별로 재사용된다(storedRowsFromGrid) — 편집 1회에 바뀐 행만 직렬화하고, dirty 는 불러온 표의 저장 행과 행마다 견준다.
  const storedRows = useMemo(() => tableStoredRows({ vars: tableVars, rows: tableRows }), [tableVars, tableRows]);
  const loadedStored = useMemo(() => tableStoredRows({ vars: tableVars, rows: loadedRows }), [tableVars, loadedRows]);
  const dirty = useMemo(
    () => isDirty({ vars: tableVars, rows: tableRows, loadedRows, hitPolicy, loadedHit }, { stored: storedRows, loaded: loadedStored }),
    [tableVars, tableRows, loadedRows, hitPolicy, loadedHit, storedRows, loadedStored],
  );
  const columnShared = useMemo(
    () => ({ colDirty, setColDirty, highlightVarId, setHighlightVarId, tableDirty: dirty, revealSeq }),
    [colDirty, highlightVarId, dirty, revealSeq],
  );
  const saveBlocked = tableSaveBlocked(colDirty);
  // view 를 다시 불러오면 useRuleEdit 가 dirty 목록을 비우므로, 편집이 남아 있으면 다시 알린다.
  useEffect(() => {
    setDirty("table", dirty);
  }, [dirty, setDirty, view]);

  // 편집 중인 표를 값 테스트(편집본)에 올린다 — 내용이 같으면 reducer 가 상태를 그대로 둔다.
  useEffect(() => {
    publishTableDraft({ ruleId: state.ruleId, ver: view.selectedVer, hitPolicy: state.hitPolicy, rows: storedRows, dirty });
  }, [publishTableDraft, state.ruleId, view.selectedVer, state.hitPolicy, storedRows, dirty]);
  useEffect(() => {
    publishColDirty(colDirty);
  }, [colDirty, publishColDirty]);

  const selected = view.versions.find((v) => sameVer(v.ver, view.selectedVer)) ?? null;
  const decision = view.rule.ruleKind === "DECISION";
  const editable = state.editable && decision;

  // 즉시 검사(I13) — 편집 한 번(칸·행 추가·삭제·드래그·적중 정책)마다 상태가 바뀌어 다시 돈다(Worker, 편집이 멈추면).
  // 변경이 없으면 서버 검사(view.issues)를 보이므로 화면 검사를 돌리지 않는다. 검사 중에는 앞 결과(처음이면 서버 검사)를 그대로 보인다.
  const analysisInput = useMemo(
    () => (dirty ? { ruleId, ruleKind, hitPolicy: hitPolicy as HitPolicy | null, vars: tableVars, rows: storedRows } : null),
    [dirty, ruleId, ruleKind, hitPolicy, tableVars, storedRows],
  );
  const analysis = useRuleAnalysis(analysisInput);
  const js = analysis.result;
  const shown = dirty && js ? js.issues : (view.issues ?? []);
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
  // 고른 행은 열 정의·표시 행에 싣지 않고 ref 로만 읽는다(칸 강조 cell-emphasis). 렌더 중에 고쳐 둬야 한다 — 고른 행이 바뀌면 자식
  // 그리드의 effect 가 이전·새 행을 다시 그리는데, 부모 effect 는 그보다 늦게 돌아 옛 값을 읽힌다.
  const selectedRowRef = useRef(state.selectedRowId);
  selectedRowRef.current = state.selectedRowId;
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
        isSelectedRow: (rowId) => selectedRowRef.current === rowId,
      }),
    [varsSig, editable],
  );
  const gridKey = `${view.rule.maruRuleId}:${view.selectedVer ?? "-"}:${editable ? "edit" : "read"}:${varsSig}`;
  // 표시 행 캐시는 그리드(gridKey)마다 하나 — 바뀌지 않은 행은 앞 객체를 그대로 넘겨 그리드가 그 행을 건드리지 않는다.
  const displayCache = useMemo(() => createDisplayRowCache(), [gridKey]);
  const data = useMemo(
    () => displayRows(state.rows, state.vars, { diff, split, serverShown: !dirty, test: testMarks }, displayCache),
    [state.rows, state.vars, diff, split, dirty, testMarks, displayCache],
  );
  // 행 고르기는 표시 행(data)에 싣지 않는다 — 고른 행은 highlightedRowKey 가 이전·새 행만 다시 그린다(고를 때마다 표 전체를 그리면 느리다).
  // 그 두 행을 다시 그릴 때 조건 칸 강조(cell-emphasis)도 selectedRowRef 로 다시 판정된다.
  // 토큰은 행별 조각을 표시 행 객체마다 기억해 이어 붙인다(바뀐 행만 직렬화, 글자는 표 전체 직렬화와 같다).
  const markToken = useMemo(() => markTokenOf(data), [data]);
  // 어느 칸을 눌러도, ↑/↓ 로 포커스 칸을 옮겨도 그 행을 고른다(읽기 전용 표는 그리드 컨테이너 ↑/↓ 가 onRowClick 을 부른다).
  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const rowId = Number(row.rowId);
    if (Number.isFinite(rowId)) dispatch({ type: "selectRow", rowId });
  }, []);

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      const rowId = Number(p.rowKey);
      // 그리드는 확정한 값을 표시 행 객체에 직접 썼다 — 그 행은 다음 표시 때 새로 만든다(편집이 거부돼도 고친 글자가 남지 않게).
      forgetDisplayRow(displayCache, rowId);
      if (p.field === "note") {
        edit({ type: "editNote", rowId, value: String(p.newValue ?? "") });
        return;
      }
      const f = parseField(p.field);
      if (f) edit({ type: "editCell", rowId, varId: f.varId, key: f.key, value: String(p.newValue ?? "") });
    },
    [edit, displayCache],
  );

  const handleSave = useCallback(async () => {
    if (!selected) return;
    // 저장 전 화면 검사 — 검사 중이면 지금 표로 바로 검사한다(서버 검사와 견줄 기준이라 옛 결과를 쓰면 안 된다).
    const before = analysisInput && (analysis.pending || !js) ? analyzeNow(analysisInput) : (js ?? { issues: [], failed: false });
    setSaveRejected(null);
    const res = await runWrite(async () => {
      try {
        // 적중 정책은 판정 룰만 싣는다 — 행과 한 요청·한 트랜잭션으로 저장한다(D-133).
        return await saveTable(view.rule.maruRuleId, selected.ver, selected.rowVersion, saveRowsOf(state), decision ? state.hitPolicy : null);
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
  }, [selected, js, analysis.pending, analysisInput, runWrite, view.rule.maruRuleId, decision, state]);

  const errors = shown.filter((i) => i.severity === "ERROR").length;
  const warnings = shown.length - errors;
  const hasDefault = state.rows.some((r) => r.rowKind === "DEFAULT");
  // 행 복사 대상 = 고른 NORMAL 행(기본 행은 하나뿐이라 복사하지 않는다).
  const canCopy = state.rows.some((r) => r.rowId === state.selectedRowId && r.rowKind === "NORMAL");
  const policy = HIT_POLICIES.find((p) => p.value === state.hitPolicy);
  // 적중 정책 편집(D-133) — 표 편집과 같은 조건(DRAFT·내가 선점·원천 MDM = 서버 editable, DECISION)에 저장 권한까지.
  const canEditHit = editable && canDo("save");
  // 정책을 바꿨는데 저장된 열 설정(집계·순위·결과 열 그룹)이 새 정책과 어긋나면 표 저장을 막는다 — 서버도 같은 규칙으로 거부한다.
  const hitConflicts = useMemo(
    () => (decision ? hitPolicyColumnConflicts(view, hitPolicy, loadedHit) : []),
    [decision, view, hitPolicy, loadedHit],
  );
  const canSave = editable && dirty && canDo("save") && !busy && !saveBlocked && hitConflicts.length === 0;
  const fitHeight = Math.min(560, 3 * 28 + Math.max(state.rows.length, 3) * 26 + 24);
  const gridHeight = expandedHeight == null ? fitHeight : Math.max(fitHeight, expandedHeight);

  return (
    <CardFrame
      title="③ 의사결정표"
      testId="rule-card-table"
      right={
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)", fontWeight: 400 }}>
          {dirty && (
            <span data-testid="dt-dirty" style={badgeStyle("warning")}>
              저장 안 한 변경
            </span>
          )}
          <Button
            size="sm"
            data-testid="dt-expand"
            aria-pressed={expanded}
            title={expanded ? "표 높이를 행 수에 맞게 되돌립니다" : "표를 본문 높이만큼 크게 봅니다"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "원래 크기" : "크게 보기"}
          </Button>
        </span>
      }
    >
      {decision ? (
        // 적중 정책은 여기서 고른다(D-133, D-105 (4) 번복). 판정표의 해석 규칙(겹침이 경고인지 오류인지 등)이라 표 편집과 한 묶음이다 —
        // 바꾸면 즉시 검사가 새 정책으로 다시 돌고, 되돌리기·저장 안 한 변경 표시에 들며, [표 저장] 한 번으로 행과 함께 저장된다.
        <div style={{ paddingBottom: "var(--spacing-xs)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
            <span>적중 정책</span>
            <span style={{ width: 140 }}>
              <Select
                data-testid="dt-hit-policy"
                aria-label="적중 정책"
                value={state.hitPolicy ?? ""}
                options={HIT_POLICY_OPTIONS}
                placeholder={state.hitPolicy == null ? "미지정" : undefined}
                disabled={!canEditHit || busy}
                onChange={(v) => {
                  if (v) edit({ type: "setHitPolicy", value: v as HitPolicyCode });
                }}
              />
            </span>
            {state.hitPolicy !== state.loadedHit && (
              <span data-testid="dt-hit-policy-changed" style={badgeStyle("warning")}>
                {state.loadedHit ?? "미지정"} → {state.hitPolicy ?? "미지정"} (표 저장 때 함께 저장)
              </span>
            )}
            <MutedText>{policy?.desc ?? ""}</MutedText>
          </div>
          {hitConflicts.length > 0 && (
            <div data-testid="dt-hit-policy-conflicts" role="alert" style={{ color: "var(--color-danger)", paddingTop: "var(--spacing-xs)" }}>
              이 적중 정책으로는 표를 저장할 수 없습니다. 열 설정을 지금 정책에서 먼저 고치세요(집계·순위·결과 열 그룹):
              <ul style={{ margin: 0, paddingLeft: "var(--spacing-lg)" }}>
                {hitConflicts.map((c, i) => (
                  <li key={`${c.code}-${i}`}>
                    [{c.code}] {c.message}
                  </li>
                ))}
              </ul>
              <Button
                data-testid="dt-hit-policy-show-columns"
                onClick={() => {
                  setRevealSeq((n) => n + 1);
                  setHighlightVarId(Number(hitConflicts[0].key.slice(1)));
                }}
              >
                열 설정 보기
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p data-testid="dt-derive-notice" style={{ margin: "0 0 var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
          산출 룰은 열 설정(TSK-08-03)에서 편집한다. 이 표는 읽기 전용이다.
        </p>
      )}

      <div ref={gridBoxRef} data-testid="dt-grid" style={{ height: gridHeight }}>
        <AgDataGrid gridId="decisionTable"
          key={gridKey}
          columns={columns}
          data={data}
          rowKey="rowKey"
          height={gridHeight - 34}
          columnSizing="fixed"
          sortable={false}
          singleClickEdit
          rowDragField={editable ? ROW_LABEL_FIELD : undefined}
          isRowDraggable={isDraggableDisplayRow}
          onRowOrderChange={(keys) => edit({ type: "reorder", keys })}
          onCellValueChanged={handleCellChange}
          highlightedRowKey={state.selectedRowId == null ? null : String(state.selectedRowId)}
          onRowClick={handleRowClick}
          onFocusedRowChange={handleRowClick}
          editArrowNavigation
          getRowClassExtra={rowClassOf}
          rowClassRefreshToken={markToken}
          emptyMessage="행이 없습니다."
          ariaLabel="의사결정표"
        />
      </div>

      {decision && (
        <div data-dt-actions="" style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)" }}>
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
          표가 바뀌어 값 테스트 결과를 지웠습니다. 다시 실행하세요.
        </p>
      )}
      {shownRun && (
        <p data-testid="dt-test-shown" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)" }}>
          값 테스트 결과({shownRun.target === "BODY" ? "편집본" : `버전 ${fmtVer(shownRun.ver)}`})를 표에 칠했습니다 — 초록 행은 적중 행, 붉은 칸은 그 행의 첫
          거짓 조건입니다.
        </p>
      )}

      <SectionFrame
        testId="dt-check"
        title={`검사(${dirty ? "화면" : "서버"})`}
        open={checkOpen}
        onOpenChange={setCheckOpen}
        headerExtra={
          <>
            <span data-testid="dt-check-count">
              오류 {errors} · 경고 {warnings}
            </span>
            {dirty && analysis.pending && (
              <span data-testid="dt-check-pending" style={{ color: "var(--color-text-secondary)" }}>
                검사 중…
              </span>
            )}
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
          </>
        }
      >
        {dirty && js?.failed && (
          <p data-testid="dt-check-failed" style={{ margin: "var(--spacing-xs) 0", color: "var(--color-danger)" }}>
            화면 검사를 할 수 없는 칸이 있습니다(저장하면 서버가 검사한다): {js?.failure}
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
          <SectionFrame testId="dt-check-table" title={`표 단위 검사 (${split.table.length})`} open={tableCheckOpen} onOpenChange={setTableCheckOpen}>
            <ul style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)" }}>
              {split.table.map((i, idx) => (
                <li key={`${i.code}-${idx}`} style={{ color: "var(--color-text-secondary)" }}>
                  {issueLine(i)}
                </li>
              ))}
            </ul>
          </SectionFrame>
        )}
        {diff.deleted.length > 0 && (
          <p data-testid="dt-deleted-rows" style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            base 대비 지운 행: {diff.deleted.map((r) => `row ${r.rowId}`).join(", ")}
          </p>
        )}
      </SectionFrame>

      <ColumnDraftSharedContext.Provider value={columnShared}>
        {extraSections.map((s) => (
          <s.Component key={s.id} {...props} />
        ))}
      </ColumnDraftSharedContext.Provider>
    </CardFrame>
  );
}
