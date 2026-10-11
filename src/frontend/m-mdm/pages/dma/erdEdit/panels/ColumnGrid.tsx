"use client";

/**
 * 오른쪽 컬럼 그리드(단계 2 편집, 스펙 2.2·4.4·8절) — 고른 표의 컬럼: 키|논리명|사전 재구성|물리명|도메인|타입|NN|표준.
 * - 논리명 칸은 `***` 자리에 물리 토막을 넣어 보이고(placeholder-name, §7.3), 행의 logical 값과 편집·저장은 저장 값이다. 사전 재구성 칸은 저장 값을 읽기 전용으로 보인다.
 * - 칸 편집은 ag-grid 기본(F2·더블클릭)이다. 칸을 떠날 때 updateColumn 한 건을 보내고, 같은 값이면 보내지 않는다.
 * - 행 끌기(키 칸 손잡이)는 moveColumn 한 건이다.
 * - 그리드 키는 그리드와 입력 칸을 감싼 div 의 onKeyDownCapture 로 받는다(S2-6·S2-27). shared AgDataGrid 의 props 는 바꾸지 않는다.
 *   Ctrl/⌘+Enter 컬럼 추가, Ctrl/⌘+Shift+Enter PK 컬럼 추가. 한글 조합 중·칸 편집 중이면 넘긴다.
 *   Ctrl/⌘+C·V 는 고른 컬럼을 공용 클립보드(canvas/erd-clipboard)에 복사·붙인다(p7, state/column-clip). 칸·입력 칸 안이면 브라우저 몫이다.
 * - 논리명 입력·미리보기·도메인은 그리드 아래 입력 칸(GridInputBar)에서 한다. 입력 칸은 GridPanel 밖에 둔다(Local-Rules §45).
 * - 응답 전인 대기 행은 흐리게 그리고 고치지 못하게 한다(S2-18). 화면에서 틀린 값이거나 거절되면 행을 새로 만들어 원래 값으로 돌린다.
 * - 마지막 거절 칸(ctx.highlight)이 이 표의 컬럼이면 그 칸에 서버 문구를 단다(fieldErrors).
 * - ctx 는 렌더마다 새 객체일 수 있다. 열 정의는 모듈 상수, 행은 그리는 값만 deps 로, 콜백은 ref 로 최신 ctx 를 읽는다(§16·§20·§31).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Badge, type BadgeTone } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type AgDataGridFieldError, type GridColumn } from "@dk-oasis/shared/grid";

import { hiddenAuditCount, isAuditColumn, landingIndex, toRealPosition, visibleColumnIds } from "../audit-columns";
import { readClip, writeClip } from "../canvas/erd-clipboard";
import { newElementId } from "../canvas/erd-commands";
import { keyMarks } from "../canvas/erd-flow";
import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext, ErdHighlight } from "../edit-context";
import { placeholderName, type PlaceholderName } from "../placeholder-name";
import { copyColumns, pasteColumnsPlan } from "../state/column-clip";
import type { ErdColumnStatus, ErdCommandJson, ErdModelJson, ErdStatusView } from "../types";
import { GridInputBar, type AddKind, type BarHandle } from "./GridInputBar";
import { ORACLE_ID_RE } from "./TokenChoiceModal";

export const STATUS_LABEL: Record<ErdColumnStatus, string> = {
  OK: "표준", ALIAS: "별칭", NEW: "새 이름", TYPE: "타입 불일치", DOMAIN: "도메인 다름", MISS: "사전 없음",
};
const STATUS_TONE: Record<ErdColumnStatus, BadgeTone> = {
  OK: "success", ALIAS: "success", NEW: "primary", TYPE: "warning", DOMAIN: "warning", MISS: "danger",
};

export function statusBadge(value: unknown) {
  const s = value as ErdColumnStatus | null;
  return s && STATUS_LABEL[s] ? <Badge label={STATUS_LABEL[s]} tone={STATUS_TONE[s]} /> : null;
}

// ── 행 ──

/** 단계 1 행 모양 그대로(panel-rows.test 가 toEqual 로 본다). showAudit=false 면 감사 컬럼 행을 뺀다(화면은 ctx.audit.show 를 넘긴다). */
export function columnRows(model: ErdModelJson, tableId: string | null, status: ErdStatusView | null, showAudit = true): Record<string, unknown>[] {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t || !tableId) return [];
  const marks = keyMarks(model);
  return visibleColumnIds(model, tableId, showAudit)
    .map((cid) => {
      const c = model.columns[cid];
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        logical: c.logical,
        phys: c.phys,
        domain: c.domainId != null ? status?.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
        type: typeText(c),
        nn: c.notNull ? "Y" : "",
        status: status?.statuses[cid] ?? null,
      };
    });
}

export interface GridRow extends Record<string, unknown> {
  id: string; pending: boolean; editable: boolean;
  /** 사전 재구성 칸 = 저장된 논리명 그대로(`***` 포함). logical 은 저장 값이라 편집기가 저장 값으로 시작한다(§7.3). */
  reconstructed: string;
  /** 논리명 칸 표시용 — `***` 자리에 물리 토막을 넣은 이름. 저장하지 않는다. */
  logicalShown: PlaceholderName;
}

/** 편집 그리드 행 — 단계 1 행에 대기 여부와 고칠 수 있는지, 표시용 논리명을 더한다. */
export function gridRows(
  model: ErdModelJson, tableId: string | null, status: ErdStatusView | null, pending: ReadonlySet<string>, canEdit: boolean, showAudit = true,
): GridRow[] {
  return columnRows(model, tableId, status, showAudit).map((r) => {
    const id = String(r.id);
    const isPending = pending.has(id);
    const shown = placeholderName(String(r.logical ?? ""), String(r.phys ?? ""));
    return { ...r, id, pending: isPending, editable: canEdit && !isPending, reconstructed: shown.reconstructed, logicalShown: shown };
  });
}

const UNKNOWN_WORD_STYLE: CSSProperties = { fontStyle: "italic", color: "var(--color-text-muted)" };

/** 논리명 칸 — display 를 보이고, 사전에 없는 단어는 기울임·회색 + 툴팁. 수가 맞지 않으면 툴팁에 물리명 전체. 셀 값(logical)은 저장 값이다. */
export function logicalCell(_value: unknown, row: Record<string, unknown>) {
  const s = row.logicalShown as PlaceholderName | undefined;
  if (!s) return String(_value ?? "");
  if (s.unknownWords.length === 0) return <span title={s.mismatch ? String(row.phys ?? "") : undefined}>{s.display}</span>;
  const words = s.display.split(/\s+/).filter((w) => w !== "");
  return (
    <span>
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 ? " " : ""}
          {s.unknownWords.includes(i) ? <span style={UNKNOWN_WORD_STYLE} title="사전에 없는 단어">{w}</span> : w}
        </span>
      ))}
    </span>
  );
}

/** 이 표의 대기 컬럼 id 를 정렬해 이은 글. ctx.pendingIds 가 새 Set 이어도 같은 글이면 행을 다시 만들지 않는다. */
export function pendingKeyOf(model: ErdModelJson, tableId: string | null, pending: ReadonlySet<string>): string {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t || pending.size === 0) return "";
  return t.columnOrder.filter((id) => pending.has(id)).sort().join(",");
}

// ── 칸 정의(모듈 상수, §20·§31). 최소 폭 합 380px ≤ 400px − 세로 스크롤바 17px(§30) ──

const isEditableRow = (row: Record<string, unknown>) => row.editable === true;

export const GRID_COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 40, minWidth: 28, align: "center", meta: false },
  { key: "logical", header: "논리명", width: 100, minWidth: 60, meta: false, editable: isEditableRow, tooltip: false, render: logicalCell },
  { key: "reconstructed", header: "사전 재구성", width: 100, minWidth: 60, meta: false },
  { key: "phys", header: "물리명", width: 110, minWidth: 70, meta: false, editable: isEditableRow },
  { key: "domain", header: "도메인", width: 70, minWidth: 40, meta: false },
  { key: "type", header: "타입", width: 90, minWidth: 50, meta: false, editable: isEditableRow },
  { key: "nn", header: "NN", width: 40, minWidth: 28, align: "center", meta: false, editable: isEditableRow, cellEditor: "select", cellEditorValues: ["Y", "N"] },
  { key: "status", header: "표준", width: 80, minWidth: 44, align: "center", meta: false, tooltip: false, render: statusBadge },
];

// ── 칸 편집 → 명령 ──

export interface TypeSpec { dataType: string | null; length: number | null; scale: number | null }

const TYPE_RE = /^([A-Z][A-Z0-9_]*)(?:\((\d+)(?:,(\d+))?\))?$/;
const TIMESTAMP_RE = /^TIMESTAMP(?:\(\d\))?$/;
const TYPE_HINT = "타입은 VARCHAR2(50)·NUMBER(10,2)·DATE·TIMESTAMP(6) 처럼 씁니다.";

/** typeText 의 거꿀. TIMESTAMP(n) 은 가져오기 표현대로 dataType 한 글이다(README S2-3 표). 빈 글은 타입 없음. */
export function parseTypeText(text: string): TypeSpec | null {
  const t = text.replace(/\s+/g, "").toUpperCase();
  if (t === "") return { dataType: null, length: null, scale: null };
  if (TIMESTAMP_RE.test(t)) return { dataType: t, length: null, scale: null };
  const m = TYPE_RE.exec(t);
  if (!m) return null;
  return { dataType: m[1], length: m[2] === undefined ? null : Number(m[2]), scale: m[3] === undefined ? null : Number(m[3]) };
}

export type CellEdit = { command: ErdCommandJson } | { error: string } | null;

const update = (id: string, set: Record<string, unknown>): CellEdit => ({ command: { op: "updateColumn", id, set } });

export function cellEditCommand(model: ErdModelJson, columnId: string, field: string, value: unknown): CellEdit {
  const col = model.columns[columnId];
  if (!col) return { error: "컬럼이 없습니다. 다른 세션이 지웠을 수 있습니다." };
  const text = value == null ? "" : String(value).trim();
  switch (field) {
    case "logical":
      if (text === "") return { error: "논리명을 비울 수 없습니다." };
      return text === col.logical ? null : update(columnId, { logical: text });
    case "phys": {
      const phys = text.toUpperCase();
      if (!ORACLE_ID_RE.test(phys)) return { error: "물리명은 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 씁니다(128자까지)." };
      if (phys === col.phys) return null;
      const dup = model.tables[col.table]?.columnOrder.some((id) => id !== columnId && model.columns[id]?.phys === phys);
      return dup ? { error: `같은 표에 ${phys} 컬럼이 있습니다.` } : update(columnId, { phys });
    }
    case "type": {
      const t = parseTypeText(text);
      if (!t) return { error: TYPE_HINT };
      if (t.dataType === col.dataType && t.length === col.length && t.scale === col.scale) return null;
      return update(columnId, { dataType: t.dataType, length: t.length, scale: t.scale });
    }
    case "nn": {
      const notNull = text === "Y";
      return notNull === col.notNull ? null : update(columnId, { notNull });
    }
    default:
      return null;
  }
}

/**
 * 행 끌기 결과 순서 → 옮긴 한 컬럼의 moveColumn. 서버는 빼고 position 자리에 넣는다. 한 번 옮긴 것으로 설명되지 않으면 null.
 * before·after 는 그리드에 보이는 행의 순서다. 감사 컬럼이 가려져 있으면 position 이 columnOrder 의 인덱스가 아니므로
 * orderChangeCommandIn 으로 실제 인덱스를 구한다.
 */
export function orderChangeCommand(before: readonly string[], after: readonly string[]): ErdCommandJson | null {
  if (before.length !== after.length) return null;
  let i = 0;
  while (i < before.length && before[i] === after[i]) i++;
  if (i === before.length) return null;
  let j = before.length - 1;
  while (j > i && before[j] === after[j]) j--;
  const cand = after[j] === before[i] ? { id: before[i], position: j } : after[i] === before[j] ? { id: before[j], position: i } : null;
  if (!cand) return null;
  const sim = before.filter((x) => x !== cand.id);
  sim.splice(cand.position, 0, cand.id);
  return sim.every((x, k) => x === after[k]) ? { op: "moveColumn", id: cand.id, position: cand.position } : null;
}

/**
 * 보이는 행(visibleBefore → visibleAfter)의 끌기를 columnOrder(full) 기준 moveColumn 으로 바꾼다.
 * 감사 컬럼 등으로 걸러져 있으면 보이는 행의 인덱스를 full 의 실제 인덱스로 옮긴다(toRealPosition).
 * 끝으로 옮기면 서버가 끝 감사 덩어리 앞에 넣는다(결정 23) — 그래서 끝 자리는 감사 덩어리 시작으로 맞춰 둔다(미리보기와 서버가 같다).
 */
export function orderChangeCommandIn(
  full: readonly string[], visibleBefore: readonly string[], visibleAfter: readonly string[], physOf: (id: string) => string | undefined,
): ErdCommandJson | null {
  const cmd = orderChangeCommand(visibleBefore, visibleAfter);
  if (!cmd || typeof cmd.id !== "string") return cmd;
  const real = toRealPosition(full, cmd.id, visibleAfter);
  if (real === null) return cmd;
  const rest = full.filter((c) => c !== cmd.id);
  // 서버의 "끝" 규칙(결정 23)은 landingIndex 하나가 정한다 — 미리보기(pending.ts)와 같은 함수다.
  return { ...cmd, position: landingIndex(rest, real, physOf(cmd.id), physOf) };
}

// ── 그리드 키 ──

export interface GridKey { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean; keyCode: number; inEditor: boolean }

export function gridKeyAction(k: GridKey): AddKind | null {
  if (k.key !== "Enter" || !(k.ctrlKey || k.metaKey) || k.altKey) return null;
  // 한글 조합 중 Enter 는 마지막 글자를 확정하는 키다. 칸 편집기가 열려 있으면 편집을 먼저 마칠 길이 없어 넘긴다.
  if (k.isComposing || k.keyCode === 229 || k.inEditor) return null;
  return k.shiftKey ? "addPk" : "add";
}

// ── 거절 칸 강조 ──

const NO_ERRORS: AgDataGridFieldError[] = [];
const PROP_FIELD: Record<string, string> = {
  logical: "logical", phys: "phys", domainId: "domain", dataType: "type", length: "type", scale: "type", notNull: "nn",
};

export function highlightErrors(h: ErdHighlight | null, rows: readonly { id: string }[]): AgDataGridFieldError[] {
  if (!h || !rows.some((r) => r.id === h.elementId)) return NO_ERRORS;
  return [{ rowKey: h.elementId, field: PROP_FIELD[h.property ?? ""] ?? "logical", message: h.message }];
}

// ── 컬럼 점프 → 그리드 알림. 표가 바뀐 뒤 그 행에 초점을 주려고 FE3 파일 안에서 잇는다(조정자 판정). ctx.selectedColumnId 도 따라간다. ──

type FocusListener = (columnId: string) => void;
const focusListeners = new Set<FocusListener>();

export function requestColumnFocus(columnId: string): void {
  for (const l of [...focusListeners]) l(columnId);
}

export function subscribeColumnFocus(l: FocusListener): () => void {
  focusListeners.add(l);
  return () => {
    focusListeners.delete(l);
  };
}

// ── 화면 ──

export const GRID_STYLE_HREF = "dmes-erd-grid";
const GRID_CSS = `.erd-grid-row--pending { opacity: 0.55; font-style: italic; }`;
const CELL_LABEL: Record<string, string> = { logical: "논리명 편집", phys: "물리명 편집", type: "타입 편집", nn: "NN 편집" };
const pendingRowClass = (row: Record<string, unknown>) => (row.pending === true ? "erd-grid-row--pending" : undefined);
const WRAP: CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 };
const GRID_BOX: CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" };
const AUDIT_HINT: CSSProperties = { marginLeft: "var(--spacing-xs)", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
const FILL: CSSProperties = { position: "absolute", inset: 0 };

export interface ColumnGridProps {
  ctx: ErdEditContext;
  tableId: string | null;
  /** seq 가 바뀌고 tableId 가 같으면 입력 칸 trigger(pk ? "addPk" : "add") — nav.startColumnAdd(UX 1차). */
  addRequest?: { seq: number; tableId: string; pk: boolean } | null;
}

export function ColumnGrid({ ctx, tableId, addRequest }: ColumnGridProps) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const tableRef = useRef(tableId);
  tableRef.current = tableId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const barHandle = useRef<BarHandle | null>(null);

  const model = ctx.state.model;
  const status = ctx.status;
  const canEdit = ctx.rights.model.ok;
  const pendingKey = pendingKeyOf(model, tableId, ctx.pendingIds);
  const showAudit = ctx.audit.show;
  // 거절·틀린 값 뒤 값이 같아도 새 행 객체를 만든다(ag-grid 가 받은 행 객체에 편집 값·끌기 순서를 먼저 써 둔다).
  const [epoch, setEpoch] = useState(0);
  const rows = useMemo(
    () => (epoch >= 0 ? gridRows(model, tableId, status, new Set(pendingKey ? pendingKey.split(",") : []), canEdit, showAudit) : []),
    [model, tableId, status, pendingKey, canEdit, showAudit, epoch],
  );
  const fieldErrors = useMemo(() => highlightErrors(ctx.highlight, rows), [ctx.highlight, rows]);
  const table = tableId ? model.tables[tableId] : undefined;
  const reject = useCallback(() => setEpoch((n) => n + 1), []);
  const hiddenAudit = hiddenAuditCount(model, tableId, showAudit);

  // ── 고른 행(커서). 컬럼 점프·새 컬럼은 그 행이 나타날 때 고른다. ──
  const [focusId, setFocusId] = useState<string | null>(null);
  const wantFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const focusColumn = useCallback((columnId: string) => {
    wantFocus.current = columnId;
    setFocusTick((n) => n + 1);
  }, []);
  useEffect(() => subscribeColumnFocus(focusColumn), [focusColumn]);
  // 컬럼 추가 요청(도구 막대·메뉴) — seq 만 의존해 같은 요청을 두 번 돌지 않는다. 글자가 비면 모드를 바꾸고 입력 칸에 초점.
  useEffect(() => {
    if (addRequest && addRequest.tableId === tableRef.current) barHandle.current?.trigger(addRequest.pk ? "addPk" : "add");
  }, [addRequest?.seq]);
  useEffect(() => {
    setFocusId(null);
  }, [tableId]);
  // nav.selectColumn(FE1)이 둔 고른 컬럼도 따라간다. 표 바뀜(위 effect) 뒤에 두어 새 표의 행을 고른다.
  const selectedColumnId = ctx.selectedColumnId;
  useEffect(() => {
    if (selectedColumnId) focusColumn(selectedColumnId);
  }, [selectedColumnId, focusColumn]);
  useEffect(() => {
    const want = wantFocus.current;
    if (!want) return;
    if (rows.some((r) => r.id === want)) {
      wantFocus.current = null;
      setFocusId(want);
      return;
    }
    // 이 표의 감사 컬럼인데 보기가 꺼져 행이 없다 — 보기를 켜서 나타나게 한다(점프·새 컬럼·감사 이름으로 바꾼 칸). 켜지면 위 갈래가 초점을 준다.
    const c = model.columns[want];
    if (c && c.table === tableId && isAuditColumn(c.phys) && !showAudit) ctxRef.current.audit.setShow(true);
  }, [rows, focusTick, model, tableId, showAudit]);
  // 고른 행이 사라지면(감사 컬럼 보기를 끔·삭제) 초점을 푼다 — 입력 칸이 안 보이는 컬럼을 고치지 않게.
  useEffect(() => {
    if (focusId !== null && !rows.some((r) => r.id === focusId)) setFocusId(null);
  }, [rows, focusId]);
  const onRow = useCallback((row: Record<string, unknown>) => setFocusId(String(row.id)), []);

  const onCellValueChanged = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      const c = ctxRef.current;
      const edit = cellEditCommand(c.state.model, String(p.rowKey), p.field, p.newValue);
      if (edit === null) {
        // 다듬으면 같은 값(대소문자·앞뒤 빈칸 등)이다. ag-grid 가 행에 써 둔 날 글을 모델 값으로 돌린다.
        reject();
        return;
      }
      if ("error" in edit) {
        c.notify(edit.error, "warn");
        reject();
        return;
      }
      c.clearHighlight();
      const revealAudit = p.field === "phys" && isAuditColumn(String(p.newValue ?? "").trim());
      void c.apply([edit.command], CELL_LABEL[p.field] ?? "컬럼 편집").then((out) => {
        if (!out.ok) reject();
        else if (revealAudit) focusColumn(String(p.rowKey)); // 감사 이름으로 바꾼 행이 숨겨지지 않게 보기를 켜고 초점을 준다
      });
    },
    [reject, focusColumn],
  );

  const onRowOrderChange = useCallback(
    (keys: (string | number)[]) => {
      const c = ctxRef.current;
      const t = tableRef.current;
      const m = c.state.model;
      const full = t ? (m.tables[t]?.columnOrder ?? []).filter((id) => m.columns[id]) : [];
      const shown = t ? visibleColumnIds(m, t, c.audit.show) : [];
      const cmd = orderChangeCommandIn(full, shown, keys.map(String), (id) => m.columns[id]?.phys);
      if (!cmd) {
        reject();
        return;
      }
      void c.apply([cmd], "컬럼 순서").then((out) => {
        if (!out.ok) reject();
      });
    },
    [reject],
  );

  const focusIdRef = useRef(focusId);
  focusIdRef.current = focusId;
  const copyFocused = useCallback(() => {
    const c = ctxRef.current;
    const t = tableRef.current;
    const id = focusIdRef.current;
    const clip = t && id ? copyColumns(c.state.model, c.modelId, t, [id]) : null;
    if (!clip) {
      c.notify("복사할 컬럼을 먼저 고르세요.", "warn");
      return;
    }
    writeClip(clip);
    c.notify(`컬럼 ${clip.columns.length}개를 복사했습니다. 붙일 표에서 ⌘/Ctrl+V.`);
  }, []);
  const pasteIntoTable = useCallback(async () => {
    const c = ctxRef.current;
    const t = tableRef.current;
    if (!t) {
      c.notify("붙일 표를 먼저 고르세요.", "warn");
      return;
    }
    if (!c.rights.model.ok) {
      c.notify(c.rights.model.reason ?? "지금은 고칠 수 없습니다.", "warn");
      return;
    }
    const plan = pasteColumnsPlan({
      model: c.state.model, modelId: c.modelId, tableId: t, clip: readClip(), afterColumnId: focusIdRef.current, newId: () => newElementId("c"),
    });
    if (plan.error) {
      c.notify(plan.error, "warn");
      return;
    }
    const start = c.modelId;
    const out = await c.apply(plan.commands, "컬럼 붙여넣기");
    if (out.ok && ctxRef.current.modelId === start && plan.columnIds.length > 0) focusColumn(plan.columnIds[plan.columnIds.length - 1]);
  }, [focusColumn]);

  const onKeyDownCapture = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // 포털로 뜬 창(토막 고르기·도메인 찾기)의 키도 React 트리로는 여기를 지난다 — DOM 으로 이 칸 안일 때만 받는다.
    if (!wrapRef.current?.contains(target)) return;
    // 컬럼 복사·붙여넣기(p7) — 칸·입력 칸을 고치는 중이거나 글을 고른 채면 브라우저 몫이다.
    const copyPaste = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "v");
    if (copyPaste) {
      if (e.nativeEvent.isComposing || target.closest("input, textarea, select, [contenteditable='true'], .ag-cell-inline-editing") !== null) return;
      if (e.key === "c" && (window.getSelection()?.toString() ?? "") !== "") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "c") copyFocused();
      else void pasteIntoTable();
      return;
    }
    const kind = gridKeyAction({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode, inEditor: target.closest(".ag-cell-inline-editing") !== null,
    });
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation();
    barHandle.current?.trigger(kind);
  }, [copyFocused, pasteIntoTable]);

  return (
    <div ref={wrapRef} data-testid="erd-colgrid" style={WRAP} onKeyDownCapture={onKeyDownCapture}>
      {/* 대기 행 흐림 — 포털이 page.css 를 싣지 않으므로 href 로 한 번만 넣는다(Local-Rules §17). */}
      <style href={GRID_STYLE_HREF} precedence="default">
        {GRID_CSS}
      </style>
      <div style={GRID_BOX}>
        <GridPanel title={table ? table.logical || table.phys : "컬럼"} count={rows.length}
          titleExtra={table ? (
            <>
              <span className="erd-mono">{table.phys}</span>
              {hiddenAudit > 0 && <span data-testid="erd-audit-hint" style={AUDIT_HINT} title="도구 막대의 「감사 컬럼 보기」로 볼 수 있습니다">감사 {hiddenAudit} 숨김</span>}
            </>
          ) : undefined}>
          <div data-testid="erd-columns" style={FILL}>
            <AgDataGrid gridId="erdColumns" columnSizing="fit" columns={GRID_COLUMNS} data={rows} rowKey="id"
              emptyMessage="캔버스나 검토 목록에서 표를 고르세요." emptyTestId="erd-columns-empty"
              onCellValueChanged={onCellValueChanged}
              rowDragField="key" isRowDraggable={isEditableRow} onRowOrderChange={onRowOrderChange}
              highlightedRowKey={focusId} scrollToRow={focusId} onRowClick={onRow} onFocusedRowChange={onRow}
              getRowClassExtra={pendingRowClass} rowClassRefreshToken={pendingKey} fieldErrors={fieldErrors} />
          </div>
        </GridPanel>
      </div>
      <GridInputBar ctx={ctx} tableId={tableId} focusColumnId={focusId} handle={barHandle} onAdded={focusColumn} renderStatus={statusBadge} />
    </div>
  );
}
