/**
 * 열 설정 그리드(의사결정표와 같은 shared `AgDataGrid`) — 열 정의·표시 행·칸 편집 → 초안 변경 변환.
 *
 * 칸은 글자로 보이고 누르면 편집한다(singleClickEdit). 편집 결과는 `cellPatch` 가 초안 줄 변경으로 바꾼다(순수 함수).
 * 버튼(순서·도메인 찾기·도메인 해제·삭제)은 의사결정표 삭제 칸처럼 테두리 없는 작은 버튼이다. 도메인 버튼은 편집되는 도메인 칸 **안에** 있어
 * `IconBtn` 의 `swallow` 로 전파를 끊는다 — 안 그러면 한 번 클릭 편집이 같이 열린다. 칸이 그리는 값(검사·식 결과·잠금)은 표시 행에 싣는다 —
 * 열 정의는 구조(산출 여부·적중 정책)가 바뀔 때만 다시 만들고 동작은 `ColumnGridHandlers`(부모의 ref)로 부른다.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { IconArrowBackUp, IconArrowDown, IconArrowUp, IconSearch, IconTrash, IconX } from "@tabler/icons-react";

import type { GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";
import { uiCols } from "@/ui-meta";

import type { PreviewOutcome, ParseStatus } from "../../expr/parse-expr";
import type { HitPolicyCode, ResolvedVar } from "../../types";
import type { ColumnCheck, ColumnDraftRow } from "./column-draft";

export const COND_DISPS = ["Equal", "1", "2", "Expression"];
export const RESULT_DISPS = ["Value", "Expression"];
export const DATA_TYPES = ["", "BOOLEAN", "NUMBER", "STRING", "DATE"];
export const AGGS = ["LIST", "SUM", "MIN", "MAX", "COUNT"];

/** 식 칸 하나의 서버 파싱 표시(참조 변수·오류·미리보기). */
export interface ExprInfo {
  /** 칸 testid(`col-name-n1`·`col-grpcond-v4`·`col-expr-v1`) — 표시는 `${testId}-status`·`${testId}-preview`. */
  testId: string;
  label: string;
  status: ParseStatus;
  preview: PreviewOutcome | null;
}

/** 그리드 한 줄 = 초안 한 줄 + 칸이 그리는 값. */
export interface ColumnGridRow extends Record<string, unknown> {
  rowKey: string;
  varId: number | null;
  varKind: "COND" | "RESULT";
  dispType: string;
  varName: string;
  expr: string;
  label: string;
  dataType: string;
  resGrp: string;
  /** 결과 그룹이 없으면(칸을 `-` 로 그린다) null — 그룹을 넣으면 값이 바뀌어 칸을 다시 그린다. */
  grpCond: string | null;
  collectAgg: string;
  prio: string;
  description: string;
  /** 도메인 이름 칸(직접 입력) — 편집기는 이 값을 처음 글자로 쓴다. 도메인이 없으면 빈 글자. */
  domain: string;
  /*
   * 버튼·표시 전용 칸의 값 = 그 칸이 그리는 내용의 서명. ag-grid 는 행 데이터가 바뀌어도 값이 달라진 칸만 다시 그리므로,
   * 칸이 `__row`·`__checks` 같은 다른 필드를 읽어 그리면 값에 그 내용을 담아야 갱신된다.
   * (도메인 칸은 예외 — 도메인이 붙거나 떨어질 때 `rowClassRefreshToken` 이 domainId 를 담아 `redrawRows` 를 걸어
   *  칸이 통째로 다시 그려진다. 그래서 `domain` 값은 편집기가 쓸 도메인명 그대로 둔다.)
   */
  order: string;
  exprInfo: string;
  check: string;
  del: string;
  __row: ColumnDraftRow;
  __editable: boolean;
  /** 편집 가능한 버전인지(삭제 표시한 줄도 되살릴 수 있게 삭제 버튼은 이 값을 본다). */
  __canEdit: boolean;
  __checks: ColumnCheck[];
  __exprs: ExprInfo[];
  __typeHint: string;
  __changed: string[];
}

export interface ColumnGridHandlers {
  move: (key: string, dir: -1 | 1) => void;
  remove: (row: ColumnDraftRow) => void;
  openDomain: (key: string) => void;
  clearDomain: (key: string) => void;
}

/** 초안 줄의 칸 값(편집 칸 field 이름 = 이 객체의 키). */
function fieldValues(r: ColumnDraftRow) {
  return {
    dispType: r.dispType,
    varName: r.varName,
    expr: r.expr,
    label: r.label,
    dataType: r.dataType ?? "",
    resGrp: r.resGrp,
    grpCond: r.grpCond,
    collectAgg: r.collectAgg,
    prio: r.prioList.join(", "),
    description: r.description,
    domain: r.domainId == null ? "" : String(r.domainId),
  };
}

/** 기준(서버에서 불러온 그대로)과 달라진 칸 field 목록 — `cell-edited` 표시용. 새 열은 비운다(행 전체가 새 행 표시). */
export function changedFields(row: ColumnDraftRow, base: ColumnDraftRow | undefined): string[] {
  if (!base) return [];
  const a = fieldValues(row);
  const b = fieldValues(base);
  const out = (Object.keys(a) as Array<keyof typeof a>).filter((k) => a[k] !== b[k]);
  if (out.includes("domain") && !out.includes("dataType")) out.push("dataType");
  return out;
}

/** 칸 편집 결과를 초안 줄 변경으로 바꾼다. 모르는 칸은 null. */
export function cellPatch(field: string, value: unknown): Partial<ColumnDraftRow> | null {
  const text = value == null ? "" : String(value);
  switch (field) {
    case "dispType":
      return { dispType: text as ColumnDraftRow["dispType"] };
    case "varName":
    case "expr":
    case "label":
    case "resGrp":
    case "grpCond":
    case "collectAgg":
    case "description":
      return { [field]: text };
    case "dataType":
      return { dataType: (text || null) as ColumnDraftRow["dataType"], domainId: null, domainType: null, domainName: null };
    case "prio":
      return {
        prioList: text
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
      };
    default:
      return null;
  }
}

function typeLabel(v: ResolvedVar | undefined): string {
  if (!v) return "";
  if (v.typeSource === "COLUMN") return `사전 ${v.dataType}`;
  if (v.typeSource === "RULE_RESULT") return `앞 룰 결과 ${v.dataType}`;
  if (v.typeSource === "EXPRESSION_COLUMN") return "자유식";
  return v.typeSource === "UNRESOLVED" ? "타입 없음" : "";
}

export function toGridRow(
  r: ColumnDraftRow,
  opts: { editable: boolean; checks: ColumnCheck[]; exprs: ExprInfo[]; resolved: ResolvedVar | undefined; base: ColumnDraftRow | undefined },
): ColumnGridRow {
  const v = fieldValues(r);
  const editable = opts.editable && !r.deleted;
  const exprCond = r.varKind === "COND" && r.dispType === "Expression";
  return {
    rowKey: r.key,
    varId: r.varId,
    varKind: r.varKind,
    dispType: v.dispType,
    varName: v.varName,
    expr: v.expr,
    label: v.label,
    // 도메인·자유식이면 값 타입 칸은 잠기므로(편집기가 값을 읽지 않는다) 표시 서명을 싣는다.
    dataType: exprCond ? "@expr" : r.domainId != null ? `@domain:${r.domainId}:${r.domainType ?? ""}` : v.dataType,
    resGrp: v.resGrp,
    grpCond: r.varKind === "RESULT" && r.resGrp.trim() !== "" ? v.grpCond : null,
    collectAgg: v.collectAgg,
    prio: v.prio,
    description: v.description,
    domain: exprCond || r.domainId == null ? "" : (r.domainName ?? ""),
    order: `${r.varName}|${opts.editable}`,
    exprInfo: JSON.stringify(opts.exprs),
    check: JSON.stringify(opts.checks),
    del: `${r.varName}|${r.deleted}|${opts.editable}`,
    __row: r,
    __editable: editable,
    __canEdit: opts.editable,
    __checks: opts.checks,
    __exprs: opts.exprs,
    __typeHint: r.domainId == null && r.dataType == null ? typeLabel(opts.resolved) : "",
    __changed: changedFields(r, opts.base),
  };
}

const MUTED: CSSProperties = { color: "var(--color-text-muted)" };
const ICON = 14;
const iconButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
};

/**
 * 테두리 없는 작은 아이콘 버튼.
 *
 * `swallow` 는 **편집되는 칸 안에** 이 버튼을 둘 때만 쓴다. ag-grid 는 칸 요소의 click 리스너에서
 * `singleClickEdit` 을 처리해 편집을 시작하는데(CellMouseListener.onCellClicked), React 의 `onClick` 은
 * 루트 컨테이너에서 합성 이벤트로 처리되므로 그 칸 리스너보다 늦게 돈다 — `onClick` 에서 전파를 끊어도
 * 편집이 먼저 열린다. 그래서 버튼 **자체 엘리먼트에 네이티브 리스너**를 걸어 칸 리스너가 아예 듣지 못하게 한다.
 *
 * 이때 액션도 같은 네이티브 리스너에서 불러야 한다 — 전파를 끊으면 그보다 위인 React 루트 컨테이너의
 * 합성 `onClick` 에는 도달하지 않기 때문이다.
 */
function IconBtn(p: {
  label: string;
  testId?: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 편집 칸 안에 둘지 — true 면 mousedown·click 전파를 네이티브로 끊고 액션도 거기서 부른다. */
  swallow?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // 리스너는 swallow 값이 바뀔 때만 다시 건다 — 그 사이에 갱신된 onClick 을 보려면 ref 로 따라간다.
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const el = ref.current;
    if (!p.swallow || !el) return;
    const stop = (e: Event) => e.stopPropagation();
    const run = (e: Event) => {
      e.stopPropagation();
      latest.current.onClick();
    };
    el.addEventListener("mousedown", stop);
    el.addEventListener("click", run);
    return () => {
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("click", run);
    };
  }, [p.swallow]);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={p.label}
      title={p.label}
      data-testid={p.testId}
      disabled={p.disabled}
      onClick={
        p.swallow
          ? undefined // 네이티브 리스너가 처리한다(위 설명)
          : (e) => {
              e.stopPropagation();
              p.onClick();
            }
      }
      style={{ ...iconButton, cursor: p.disabled ? "default" : "pointer", opacity: p.disabled ? 0.4 : 1 }}
    >
      {p.children}
    </button>
  );
}

const g = (row: Record<string, unknown>) => row as ColumnGridRow;

/** 편집 칸 — 값을 글자로 보이고 testid 를 단다(e2e·테스트가 칸을 찾는 자리). 비었으면 흐린 안내 글자. */
function textCell(testPrefix: string, placeholder = "") {
  return (value: unknown, row: Record<string, unknown>) => {
    const text = value == null ? "" : String(value);
    return (
      <span data-testid={`${testPrefix}-${g(row).rowKey}`} title={text || undefined}>
        {text !== "" ? text : <span style={MUTED}>{placeholder}</span>}
      </span>
    );
  };
}

function exprInfoCell(infos: ExprInfo[]): ReactNode {
  if (infos.length === 0) return <span style={MUTED}>-</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
      {infos.map((x) => {
        const s = x.status;
        return (
          <span key={x.testId} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <span data-testid={`${x.testId}-status`} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              {infos.length > 1 && <span style={MUTED}>{x.label}</span>}
              {s.kind === "error" && <span style={{ color: "var(--color-danger)" }}>{s.message}</span>}
              {s.kind === "unsupported" && <span style={badgeStyle("warning")}>{s.message}</span>}
              {s.kind !== "error" && s.refVars.length > 0 && <span style={{ color: "var(--color-text-secondary)" }}>참조: {s.refVars.join(", ")}</span>}
              {s.programVars.length > 0 && <span style={badgeStyle("info")}>프로그램 변수: {s.programVars.join(", ")}</span>}
              {s.kind === "idle" && <span style={MUTED}>파싱 대기</span>}
            </span>
            {x.preview && (
              <span data-testid={`${x.testId}-preview`} style={x.preview.kind === "value" ? badgeStyle("success") : badgeStyle("warning")}>
                {x.preview.kind === "value" ? `= ${x.preview.text}` : x.preview.text}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function checkCell(row: ColumnGridRow): ReactNode {
  const checks = row.__checks;
  const title = checks.map((c) => c.message).join("\n") || undefined;
  return (
    <span data-testid={`col-check-${row.rowKey}`} title={title}>
      {checks.length === 0 ? (
        <span style={badgeStyle("success")}>통과</span>
      ) : (
        checks.map((c, i) => (
          <span key={`${c.code}-${i}`} data-code={c.code} style={{ color: c.severity === "REJECT" ? "var(--color-danger)" : "var(--color-text-secondary)", marginRight: 6 }}>
            {c.message}
          </span>
        ))
      )}
    </span>
  );
}

const edited = (field: string) => ({ "cell-edited": (row: Record<string, unknown>) => g(row).__changed.includes(field) });

export interface ColumnGridOptions {
  derive: boolean;
  hitPolicy: HitPolicyCode | null;
  /** 부모가 매 렌더 갱신하는 동작 묶음(ref). */
  handlers: { current: ColumnGridHandlers };
}

export function buildColumnGridColumns(opts: ColumnGridOptions): GridColumn[] {
  const h = () => opts.handlers.current;
  const name = (row: ColumnGridRow) => row.__row.varName || row.__row.label || "새 열";
  const isCond = (row: Record<string, unknown>) => g(row).varKind === "COND";
  const exprCond = (row: Record<string, unknown>) => isCond(row) && g(row).dispType === "Expression";
  const can = (row: Record<string, unknown>) => g(row).__editable;
  const cols: GridColumn[] = [
    {
      key: "varId",
      header: "var_id",
      width: 64,
      align: "center",
      render: (_v, row) => (g(row).varId != null ? String(g(row).varId) : <span style={badgeStyle("warning")}>신규</span>),
    },
    {
      key: "varKind",
      header: "구분",
      width: 56,
      align: "center",
      render: (_v, row) => <span style={badgeStyle(isCond(row) ? "neutral" : "info")}>{isCond(row) ? "조건" : "결과"}</span>,
    },
    {
      key: "order",
      meta: false,
      header: "순서",
      width: 56,
      align: "center",
      render: (_v, row) => {
        const r = g(row);
        return (
          <span style={{ display: "inline-flex", gap: 2 }}>
            <IconBtn label={`${name(r)} 위로`} disabled={!r.__canEdit} onClick={() => h().move(r.rowKey, -1)}>
              <IconArrowUp size={ICON} />
            </IconBtn>
            <IconBtn label={`${name(r)} 아래로`} disabled={!r.__canEdit} onClick={() => h().move(r.rowKey, 1)}>
              <IconArrowDown size={ICON} />
            </IconBtn>
          </span>
        );
      },
    },
    {
      key: "dispType",
      header: "표시 타입",
      width: 100,
      editable: can,
      cellEditor: "select",
      cellEditorValuesGetter: (row) => (isCond(row) ? COND_DISPS : RESULT_DISPS),
      cellClassRules: edited("dispType"),
      render: textCell("col-disp"),
    },
    {
      key: "varName",
      // 변수 칸에는 이름만 적는다(2026-09-28). Expression 조건 열은 식을 행 칸마다 적으므로 변수가 없다.
      header: "변수",
      width: 160,
      editable: (row) => can(row) && !exprCond(row),
      cellClassRules: edited("varName"),
      render: (v, row) => (exprCond(row) ? <span style={MUTED}>-</span> : textCell("col-name", "변수")(v, row)),
    },
  ];
  if (opts.derive) {
    cols.push({
      key: "expr",
      meta: false,
      header: "결과 식",
      width: 240,
      editable: (row) => can(row) && !isCond(row),
      cellClassRules: edited("expr"),
      render: textCell("col-expr", "결과 식"),
    });
  }
  cols.push(
    { key: "label", meta: false, header: "표시명", width: 110, editable: can, cellClassRules: edited("label"), render: textCell("col-label") },
    {
      key: "dataType",
      header: "값 타입",
      width: 110,
      editable: (row) => can(row) && !exprCond(row) && g(row).__row.domainId == null,
      cellEditor: "select",
      cellEditorValues: DATA_TYPES,
      cellEditorValueLabels: { "": "타입 없음" },
      cellClassRules: edited("dataType"),
      render: (_v, row) => {
        const r = g(row);
        const d = r.__row;
        if (exprCond(row)) return <span style={MUTED}>자유식</span>;
        return (
          <span data-testid={`col-type-${r.rowKey}`}>
            {d.domainId != null ? (
              `도메인 ${d.domainType ?? ""}`
            ) : d.dataType != null ? (
              d.dataType
            ) : (
              <span style={MUTED}>{r.__typeHint || "타입 없음"}</span>
            )}
          </span>
        );
      },
    },
    {
      // 도메인명·표준명을 직접 넣는다 — 넣은 글자로 서버를 찾아 하나로 정해지면 바로 적용하고, 아니면 찾기 팝업을 연다(부모 handleCellChange).
      // 도메인 번호(domainId)는 내부 키라 보이지 않는다.
      // 찾기·해제 버튼도 이 칸 안에 둔다 — 편집 칸이라 `swallow` 로 전파를 끊어 버튼을 눌러도 편집이 같이 열리지 않게 한다.
      key: "domain",
      meta: false,
      header: "도메인",
      width: 176,
      editable: (row) => can(row) && !exprCond(row),
      cellClassRules: edited("domain"),
      render: (v, row) => {
        const r = g(row);
        if (exprCond(row)) return <span style={MUTED}>-</span>;
        const text = v == null ? "" : String(v);
        const shown = r.__row.domainId != null ? text || "이름 없는 도메인" : "";
        return (
          // 글자는 왼쪽에, 찾기·해제 버튼은 칸 오른쪽 끝에 붙인다(space-between).
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
              width: "100%",
              minWidth: 0,
            }}
          >
            <span
              data-testid={`col-domain-name-${r.rowKey}`}
              title={shown || undefined}
              style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {shown}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none" }}>
              <IconBtn
                label="도메인 찾기"
                testId={`col-domain-open-${r.rowKey}`}
                disabled={!r.__editable}
                swallow
                onClick={() => h().openDomain(r.rowKey)}
              >
                <IconSearch size={ICON} />
              </IconBtn>
              {r.__row.domainId != null && (
                <IconBtn
                  label="도메인 해제"
                  disabled={!r.__editable}
                  swallow
                  onClick={() => h().clearDomain(r.rowKey)}
                >
                  <IconX size={ICON} />
                </IconBtn>
              )}
            </span>
          </span>
        );
      },
    },
    {
      key: "resGrp",
      header: "그룹",
      width: 110,
      editable: (row) => can(row) && !isCond(row),
      cellClassRules: edited("resGrp"),
      render: (v, row) => (isCond(row) ? <span style={MUTED}>-</span> : textCell("col-grp", "그룹 = 결과 변수")(v, row)),
    },
    {
      key: "grpCond",
      header: "열 조건",
      width: 170,
      editable: (row) => can(row) && !isCond(row) && g(row).resGrp.trim() !== "",
      cellClassRules: edited("grpCond"),
      render: (v, row) => (v != null ? textCell("col-grpcond", "비우면 기본 열")(v, row) : <span style={MUTED}>-</span>),
    },
  );
  if (opts.hitPolicy === "COLLECT") {
    cols.push({
      key: "collectAgg",
      header: "집계",
      width: 90,
      editable: (row) => can(row) && !isCond(row),
      cellEditor: "select",
      cellEditorValues: ["", ...AGGS],
      cellClassRules: edited("collectAgg"),
      render: (v, row) => (isCond(row) ? <span style={MUTED}>-</span> : textCell("col-agg", "집계")(v, row)),
    });
  }
  if (opts.hitPolicy === "PRIORITY") {
    cols.push({
      key: "prio",
      header: "순위",
      width: 140,
      editable: (row) => can(row) && !isCond(row),
      cellClassRules: edited("prio"),
      render: (v, row) => (isCond(row) ? <span style={MUTED}>-</span> : textCell("col-prio", "순위(쉼표)")(v, row)),
    });
  }
  cols.push(
    ...uiCols([
      { key: "description", header: "설명", width: 140, editable: can, cellClassRules: edited("description"), render: textCell("col-desc") },
      { key: "exprInfo", header: "식 결과", width: 220, render: (_v, row) => exprInfoCell(g(row).__exprs) },
      { key: "check", header: "검사", width: 170, pinned: "right", render: (_v, row) => checkCell(g(row)) },
      {
        key: "del",
        header: "삭제",
        width: 48,
        align: "center",
        pinned: "right",
        render: (_v, row) => {
          const r = g(row);
          const del = r.__row.deleted;
          return (
            <IconBtn label={`${name(r)} ${del ? "삭제 취소" : "삭제"}`} testId={`col-del-${r.rowKey}`} disabled={!r.__canEdit} onClick={() => h().remove(r.__row)}>
              {del ? <IconArrowBackUp size={ICON} /> : <IconTrash size={ICON} />}
            </IconBtn>
          );
        },
      },
    ]),
  );
  return cols;
}
