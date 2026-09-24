/**
 * 피벗 보기 모델(TSK-08-03 design §2.1) — 시안 06-business-rule.html `pvSpec/pvCols/pvBand/pvReorder` 의 TS 포팅과 flatten↔pivot 왕복.
 *
 * 피벗은 저장 표현이 아니라 의사결정표 행(평탄화)을 axis 로 다시 펼쳐 보이는 화면 표현이다(불변 3). 그래서 이 파일의 모든 편집은
 * 평탄화된 `GridRow[]` 를 입력·출력으로 삼고, 저장은 기존 TABLE 파트가 한다. 엔진은 axis 를 읽지 않는다. 순수 함수만 둔다.
 */
import type { CellObj, GridRow } from "../../decision-table/grid-model";
import type { ResolvedVar, VarMeta } from "../../types";

export interface PivotSpec {
  /** axis ROW 인 조건 열(seq 순). */
  rv: ResolvedVar[];
  /** axis COL 인 조건 열(seq 순). */
  cv: ResolvedVar[];
  res: ResolvedVar;
  /** 행 축이 표시 타입 2(구간) 조건 열 하나 — 하한·상한 두 칸으로 편집한다. */
  two: boolean;
  /** 피벗에서 편집: 행 축 2 하나 ∧ 열 축 Equal 하나 ∧ 결과 Value. */
  editable: boolean;
}

const bySeq = (a: ResolvedVar, b: ResolvedVar) => a.seq - b.seq || a.varId - b.varId;
const RANGE_OPS = new Set(["<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <"]);

/**
 * 피벗이 보이는 조건: DECISION ∧ 행 축 조건 열 ≥1 ∧ 열 축 조건 열 ≥1 ∧ 결과 열이 정확히 1개(시안 `pvSpec`). 아니면 null.
 * axis 는 view 의 `varMeta` 에서 읽는다(ResolvedVar 는 해석값이라 axis 가 없다).
 */
export function pvSpec(ruleKind: "DECISION" | "DERIVE", vars: readonly ResolvedVar[], meta: readonly VarMeta[]): PivotSpec | null {
  const axisOf = (v: ResolvedVar) => meta.find((m) => m.varId === v.varId)?.axis ?? "NONE";
  const conds = vars.filter((v) => v.varKind === "COND");
  const ress = vars.filter((v) => v.varKind === "RESULT").sort(bySeq);
  const rv = conds.filter((v) => axisOf(v) === "ROW").sort(bySeq);
  const cv = conds.filter((v) => axisOf(v) === "COL").sort(bySeq);
  if (ruleKind !== "DECISION" || rv.length === 0 || cv.length === 0 || ress.length !== 1) return null;
  const two = rv.length === 1 && rv[0].dispType === "2";
  return { rv, cv, res: ress[0], two, editable: two && cv.length === 1 && cv[0].dispType === "Equal" && ress[0].dispType === "Value" };
}

/** 셀 한 칸의 화면 요약(시안 `summary`) — 열 축 값·행 축 묶음 키로 쓴다. 셀이 없으면 null. */
function summary(cell: CellObj | undefined): string | null {
  if (!cell) return null;
  if (cell.val !== undefined) return cell.val;
  if (cell.expr !== undefined) return cell.expr;
  switch (cell.op) {
    case "NA":
      return "-";
    case "EQ":
      return cell.left ?? "";
    case "IN":
    case "NOT_IN":
      return `${cell.op === "NOT_IN" ? "NOT " : ""}${(cell.list ?? []).join(",")}`;
    default:
      if (cell.op && RANGE_OPS.has(cell.op)) return `${cell.op} ${cell.left ?? ""}~${cell.right ?? ""}`;
      return `${cell.op ?? ""} ${cell.left ?? ""}`.trim();
  }
}

/** 행이 축 열들에서 갖는 키(시안 `pvKey`) — 같은 키면 같은 구간·같은 열이다. */
export function pvKey(row: GridRow, vs: readonly ResolvedVar[]): string {
  return vs.map((v) => summary(row.cells[v.varId]) ?? "-").join(" · ");
}

function normalRows(rows: readonly GridRow[]): GridRow[] {
  return rows.filter((r) => r.rowKind === "NORMAL").sort((a, b) => a.seq - b.seq || a.rowId - b.rowId);
}

/** 열 축 값 순서: 앞 룰 결과면 그 룰의 행 순서(`priorOrder`)가 먼저, 그 뒤에 이 표에서 처음 나온 순서(시안 `pvCols`). */
export function pvCols(spec: PivotSpec, rows: readonly GridRow[], priorOrder: readonly string[] = []): string[] {
  const ck = [...new Set(priorOrder)];
  for (const r of normalRows(rows)) {
    const k = pvKey(r, spec.cv);
    if (!ck.includes(k)) ck.push(k);
  }
  return ck;
}

/** `rowId` 행과 행 축 키가 같은 NORMAL 행 전부(시안 `pvBand`). 없으면 빈 배열. */
export function pvBand(spec: PivotSpec, rows: readonly GridRow[], rowId: number): GridRow[] {
  const a = rows.find((r) => r.rowId === rowId);
  if (!a) return [];
  const k = pvKey(a, spec.rv);
  return rows.filter((r) => r.rowKind === "NORMAL" && pvKey(r, spec.rv) === k);
}

/** 편집 뒤 행 순서를 구간 하한 → 상한 → 열 순서로 다시 매긴다(시안 `pvReorder`). 기본 행은 끝에 그대로 둔다. */
export function pvReorder(spec: PivotSpec, rows: readonly GridRow[], priorOrder: readonly string[] = []): GridRow[] {
  const ck = pvCols(spec, rows, priorOrder);
  const id = spec.rv[0].varId;
  const n = (x: string | undefined) => (x == null || x === "" ? Infinity : Number(x));
  const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
  const sorted = normalRows(rows)
    .slice()
    .sort(
      (a, b) =>
        cmp(n(a.cells[id]?.left), n(b.cells[id]?.left)) ||
        cmp(n(a.cells[id]?.right), n(b.cells[id]?.right)) ||
        ck.indexOf(pvKey(a, spec.cv)) - ck.indexOf(pvKey(b, spec.cv)),
    )
    .map((r, i) => ({ ...r, seq: i + 1 }));
  return [...sorted, ...rows.filter((r) => r.rowKind !== "NORMAL")];
}

/** 피벗 한 구간(행 축 키가 같은 행 묶음). */
export interface PivotBand {
  key: string;
  first: GridRow;
  /** 행 축 셀(구간이면 하한 left·상한 right). */
  ax: CellObj;
  /** 하한 부등호 `<=`(이상)·`<`(초과). */
  lo: "<=" | "<";
  /** 상한 부등호 `<`(미만)·`<=`(이하). */
  hi: "<" | "<=";
  /** 열 축 값 → 그 칸의 행들(2개 이상이면 겹침). */
  cells: Record<string, GridRow[]>;
}

export interface PivotView {
  cols: string[];
  bands: PivotBand[];
}

/** 평탄화 행 → 피벗(시안 `pivotHtml` 의 bands·m). 행 순서가 곧 구간 순서다. */
export function buildPivot(spec: PivotSpec, rows: readonly GridRow[], priorOrder: readonly string[] = []): PivotView {
  const cols = pvCols(spec, rows, priorOrder);
  const bands: PivotBand[] = [];
  const byKey = new Map<string, PivotBand>();
  for (const r of normalRows(rows)) {
    const a = pvKey(r, spec.rv);
    let b = byKey.get(a);
    if (!b) {
      const ax = r.cells[spec.rv[0].varId] ?? {};
      const [lo, hi] = ax.op && RANGE_OPS.has(ax.op) ? (ax.op.split(" 변수 ") as ["<=" | "<", "<" | "<="]) : (["<=", "<"] as const);
      b = { key: a, first: r, ax, lo, hi, cells: {} };
      byKey.set(a, b);
      bands.push(b);
    }
    (b.cells[pvKey(r, spec.cv)] ||= []).push(r);
  }
  return { cols, bands };
}

/** 피벗 → 평탄화 행(구간 → 열 순서). 피벗에 없는 행(기본 행 등)은 `rows` 에서 그대로 끝에 붙인다. */
export function flattenPivot(spec: PivotSpec, pv: PivotView, rows: readonly GridRow[]): GridRow[] {
  const out: GridRow[] = [];
  for (const b of pv.bands) for (const c of pv.cols) out.push(...(b.cells[c] ?? []));
  return [...out, ...rows.filter((r) => r.rowKind !== "NORMAL")];
}

export type PivotEdit =
  | { type: "cell"; bandRowId: number; col: string; value: string }
  | { type: "band"; bandRowId: number; lo: string; lop: string; hi: string; hop: string }
  | { type: "addBand"; bandRowId: number }
  | { type: "delBand"; bandRowId: number };

export interface PivotEditResult {
  rows: GridRow[];
  lastTempId: number;
  message: string;
}

/**
 * 피벗 편집 한 번 — 셀 하나 = 행 하나, 구간 하나 = 열 수만큼의 행(시안 `bindPivot`). 편집이 불가능한 모양이거나 할 일이 없으면 null.
 * 새 행은 `lastTempId` 보다 1 작은 음수 임시 ID 를 쓴다(서버가 발급 ID 로 바꾼다). 편집 뒤에는 `pvReorder` 로 순서를 다시 매긴다.
 */
export function applyPivotEdit(
  spec: PivotSpec,
  rows: readonly GridRow[],
  edit: PivotEdit,
  lastTempId: number,
  priorOrder: readonly string[] = [],
): PivotEditResult | null {
  if (!spec.editable) return null;
  const rid = spec.rv[0].varId;
  const cid = spec.cv[0].varId;
  const resId = spec.res.varId;
  let temp = Math.min(lastTempId, 0);
  const newId = () => --temp;
  const done = (next: GridRow[], message: string): PivotEditResult => ({ rows: pvReorder(spec, next, priorOrder), lastTempId: temp, message });
  const band = pvBand(spec, rows, edit.bandRowId);

  switch (edit.type) {
    case "cell": {
      if (band.length === 0) return null;
      const val = edit.value.trim();
      const xs = band.filter((r) => pvKey(r, spec.cv) === edit.col);
      if (xs.length > 1) return null; // 겹침 — 피벗에서 고치지 않는다
      if (xs.length === 0) {
        if (!val) return null;
        const id = newId();
        const added: GridRow = {
          rowId: id,
          seq: 9999,
          rowKind: "NORMAL",
          note: "",
          cells: { [rid]: { ...band[0].cells[rid] }, [cid]: { op: "EQ", left: edit.col }, [resId]: { val } },
        };
        return done([...rows, added], `행 추가 row_id ${id}. ${edit.col} 열 빈칸에 값을 넣었다`);
      }
      const target = xs[0];
      if (!val) return done(rows.filter((r) => r.rowId !== target.rowId), `row_id ${target.rowId}를 지웠다. 이 조합은 적중 행이 없어 NULL이 된다`);
      return done(
        rows.map((r) => (r.rowId === target.rowId ? { ...r, cells: { ...r.cells, [resId]: { val } } } : r)),
        `row_id ${target.rowId} 결과 셀을 ${val}로 바꿨다`,
      );
    }
    case "band": {
      if (band.length === 0) return null;
      const cell: CellObj = { op: `${edit.lop} 변수 ${edit.hop}`, left: edit.lo.trim(), right: edit.hi.trim() };
      const ids = new Set(band.map((r) => r.rowId));
      return done(
        rows.map((r) => (ids.has(r.rowId) ? { ...r, cells: { ...r.cells, [rid]: { ...cell } } } : r)),
        `구간 행 ${band.length}개의 두께 셀을 ${cell.left} ${edit.lop === "<=" ? "이상" : "초과"} ${cell.right} ${edit.hop === "<=" ? "이하" : "미만"}로 바꿨다`,
      );
    }
    case "addBand": {
      if (band.length === 0) return null;
      const ax = band[0].cells[rid] ?? {};
      // 앞 구간이 상한을 포함하면 새 구간은 초과로 시작한다.
      const cell: CellObj = { op: `${String(ax.op).endsWith("<=") ? "<" : "<="} 변수 <`, left: ax.right ?? "", right: "" };
      const added: GridRow[] = band.map((r) => ({ ...r, rowId: newId(), seq: 9999, cells: { ...r.cells, [rid]: { ...cell } } }));
      return done([...rows, ...added], `구간 추가. 행 ${added.length}개(row_id ${added[0].rowId}~${added[added.length - 1].rowId}). 상한을 채워야 저장된다`);
    }
    case "delBand": {
      if (band.length === 0) return null;
      const ids = new Set(band.map((r) => r.rowId));
      return done(rows.filter((r) => !ids.has(r.rowId)), `구간 행 ${band.length}개를 지웠다. 빈틈이 생기면 검사에서 경고한다`);
    }
  }
}
