/**
 * 원자재강종 원판연계 — 도금기준(BASE) 룰을 원판으로, 칼라파생(DERIVED) 룰이 재질·적정원료(차선원료 없으면 차선도)를 물려받는다.
 * 칼라전용(STANDALONE)은 원판 없이 자체 결과를 둔다(프로토타입 raw-material-grade 「원판연계」).
 *
 * Maru 에는 파생 행의 결과를 원판 값으로 풀어 넣었고(BASE_RULE_KEY 로 원판을 가리킨다), 기준유형은 결과 열 RULE_KIND 다.
 * 여기서는 그 행들로 원판 → 파생 나무를 만들고, 파생 행마다 「재검토 필요」 사유를 낸다:
 *   - 원판 룰을 찾을 수 없음
 *   - 재질코드·적정원료가 원판과 다름
 *   - 두께범위가 원판 범위 밖
 *   - 원판이 앞 버전과 달라짐(두께범위·재질·적정원료·차선원료) — 프로토타입의 「원판 변경 → 재검토 필요」
 * React 에 기대지 않는 순수 함수다.
 */
import {
  cellOf,
  isBlankValue,
  NA_TEXT,
  type RuleCell,
  type RuleRow,
  type RuleVar,
  type RuleVersion,
  type RuleView,
} from "@/common/rule";

export const RULE_ID = "QD_RAW_MATERIAL_GRADE";

export type RuleKind = "BASE" | "DERIVED" | "STANDALONE";

/** 기준유형 이름 — Maru 코드 QC_RULE_KIND 와 같다(코드 항목이 없을 때 쓴다). */
export const KIND_LABEL: Record<RuleKind, string> = {
  BASE: "도금기준",
  DERIVED: "칼라파생",
  STANDALONE: "칼라전용",
};

/** 빈 결과로 저장한 값. */
const BLANK = { blankValues: ["-"] };

/** 두께 범위 — 아래·위 끝과 포함 여부. 조건을 보지 않으면 null(모든 두께). */
export interface ThkRange {
  lo: number | null;
  hi: number | null;
  loInc: boolean;
  hiInc: boolean;
}

/** 원판연계 노드 — 행 하나. */
export interface LineageNode {
  key: string;
  rowId: number;
  seq: number;
  kind: RuleKind;
  /** 원판 룰 ID(파생만). */
  baseKey: string | null;
  prod: string;
  spec: string;
  use: string;
  thk: ThkRange | null;
  /** 두께범위 글(「0.2 ≤ t < 3」). 조건이 없으면 「—」. */
  thkText: string;
  mat: string;
  pri: string;
  alt: string;
  msg: string;
  inherit: string;
  legacyNo: string;
  legacyType: string;
  /** 재검토 사유(파생만). 비면 원판과 맞다. */
  reviews: string[];
}

export interface Lineage {
  /** 도금기준과 그 파생(원판 순서 = 행 순서). */
  bases: { node: LineageNode; children: LineageNode[] }[];
  /** 칼라전용. */
  standalone: LineageNode[];
  /** 원판을 찾을 수 없는 파생. */
  orphans: LineageNode[];
  /** 룰 ID → 재검토 사유(파생 중 사유가 있는 것만). */
  reviews: Map<string, string[]>;
  counts: { base: number; derived: number; standalone: number; review: number };
}

const text = (v: unknown): string =>
  isBlankValue(v, BLANK) ? "" : String(v).trim();

/** 조건 셀 값 글 — 「= G」 → 「G」, 목록은 「A, B」, 보지 않으면 빈 글. */
export function cellValueText(cell: RuleCell | undefined): string {
  if (!cell || cell.op === "NA") return "";
  if (cell.list && cell.list.length > 0) return cell.list.join(", ");
  if (cell.op === "EQ" && cell.left !== undefined) return cell.left;
  const s = (cell.summary ?? "").trim();
  if (s === "" || s === "-") return "";
  return s.replace(/^=\s*/, "");
}

/** 두께 셀 → 범위. 「a <= 변수 < b」 꼴만 읽고, 다른 꼴(= a 등)은 같은 끝 두 개로 본다. 보지 않으면 null. */
export function thkRangeOf(cell: RuleCell | undefined): ThkRange | null {
  if (!cell || cell.op === "NA") return null;
  const lo = cell.left !== undefined ? Number(cell.left) : NaN;
  const hi = cell.right !== undefined ? Number(cell.right) : NaN;
  const op = cell.op ?? "";
  const m = op.match(/^(<=|<)\s*변수\s*(<=|<)$/);
  if (m && Number.isFinite(lo) && Number.isFinite(hi))
    return { lo, hi, loInc: m[1] === "<=", hiInc: m[2] === "<=" };
  if (op === "EQ" && Number.isFinite(lo))
    return { lo, hi: lo, loInc: true, hiInc: true };
  return null;
}

/** 범위 글 — 「0.2 ≤ t < 3」. 없으면 「—」. */
export function thkRangeText(r: ThkRange | null): string {
  if (!r) return NA_TEXT;
  if (r.lo !== null && r.lo === r.hi && r.loInc && r.hiInc)
    return `t = ${r.lo}`;
  const lo = r.lo === null ? "" : `${r.lo} ${r.loInc ? "≤" : "<"} `;
  const hi = r.hi === null ? "" : ` ${r.hiInc ? "≤" : "<"} ${r.hi}`;
  return `${lo}t${hi}`;
}

/** 안쪽 범위인가 — inner 가 outer 안에 있다. outer 가 null 이면 모두 안이고, inner 가 null 이면(모든 두께) outer 가 null 일 때만 안이다. */
export function rangeInside(
  inner: ThkRange | null,
  outer: ThkRange | null,
): boolean {
  if (!outer) return true;
  if (!inner) return false;
  const loOk =
    outer.lo === null ||
    (inner.lo !== null &&
      (inner.lo > outer.lo ||
        (inner.lo === outer.lo && (outer.loInc || !inner.loInc))));
  const hiOk =
    outer.hi === null ||
    (inner.hi !== null &&
      (inner.hi < outer.hi ||
        (inner.hi === outer.hi && (outer.hiInc || !inner.hiInc))));
  return loOk && hiOk;
}

function kindOf(v: string): RuleKind {
  return v === "BASE" || v === "DERIVED" ? v : "STANDALONE";
}

/** 행 하나 → 노드(재검토 사유는 비어 있다). */
export function nodeOf(vars: readonly RuleVar[], row: RuleRow): LineageNode {
  const r = row.results;
  const thk = thkRangeOf(cellOf(vars, row, "THK"));
  const kind = kindOf(text(r.RULE_KIND));
  return {
    key: text(r.RULE_KEY) || `행 ${row.rowId}`,
    rowId: row.rowId,
    seq: row.seq,
    kind,
    baseKey: kind === "DERIVED" ? text(r.BASE_RULE_KEY) || null : null,
    prod: cellValueText(cellOf(vars, row, "PRD_NM_CD")),
    spec: cellValueText(cellOf(vars, row, "SPC_AVR")),
    use: cellValueText(cellOf(vars, row, "ORD_USG_CD")),
    thk,
    thkText: thkRangeText(thk),
    mat: text(r.MAT_CD),
    pri: text(r.RAW_MAT_PRI),
    alt: text(r.RAW_MAT_ALT),
    msg: text(r.RAW_GRADE_MSG),
    inherit: text(r.INHERIT_NOTE),
    legacyNo: text(r.LEGACY_NO),
    legacyType: text(r.LEGACY_TYPE),
    reviews: [],
  };
}

/** 원판이 바뀌었는지 볼 값 — 두께범위·재질·적정원료·차선원료(프로토타입 resultKey). */
function baseSignature(n: LineageNode): string {
  return [n.thkText, n.mat, n.pri, n.alt].join("|");
}

/** 원판의 바뀐 값 글 — 「두께범위 0.2 ≤ t < 2.2 → 0.2 ≤ t < 2.5」 들. */
function baseChanges(prev: LineageNode, next: LineageNode): string[] {
  const out: string[] = [];
  const pairs: [string, string, string][] = [
    ["두께범위", prev.thkText, next.thkText],
    ["재질코드", prev.mat, next.mat],
    ["적정원료", prev.pri, next.pri],
    ["차선원료", prev.alt, next.alt],
  ];
  for (const [label, a, b] of pairs)
    if (a !== b) out.push(`${label} ${a || NA_TEXT} → ${b || NA_TEXT}`);
  return out;
}

/** 파생 행 재검토 사유. prevBase 는 앞 버전의 같은 원판(없으면 비교하지 않는다). */
export function reviewReasons(
  child: LineageNode,
  base: LineageNode | undefined,
  prevBase?: LineageNode,
  versions?: { prev: string; next: string },
): string[] {
  if (!base) return [`원판 룰 ${child.baseKey ?? NA_TEXT} 을 찾을 수 없습니다`];
  const out: string[] = [];
  if (child.mat !== base.mat)
    out.push(
      `재질코드가 원판과 다릅니다(원판 ${base.mat || NA_TEXT} · 파생 ${child.mat || NA_TEXT})`,
    );
  if (child.pri !== base.pri)
    out.push(
      `적정원료가 원판과 다릅니다(원판 ${base.pri || NA_TEXT} · 파생 ${child.pri || NA_TEXT})`,
    );
  if (!rangeInside(child.thk, base.thk))
    out.push(
      `두께범위(${child.thkText})가 원판 범위(${base.thkText}) 밖입니다`,
    );
  if (prevBase && baseSignature(prevBase) !== baseSignature(base))
    out.push(
      `원판 ${base.key} 변경${versions ? `(v${versions.prev} → v${versions.next})` : ""}: ${baseChanges(prevBase, base).join(", ")}`,
    );
  return out;
}

/**
 * 원판연계 나무. rule 은 지금 보는 버전, prev 는 그 바로 앞 버전(없으면 원판 변경은 보지 않는다).
 */
export function buildLineage(
  rule: Pick<RuleView, "vars" | "rows" | "ver"> | undefined,
  prev?: Pick<RuleVersion, "vars" | "rows" | "ver">,
): Lineage {
  const rows = [...(rule?.rows ?? [])].sort(
    (a, b) => a.seq - b.seq || a.rowId - b.rowId,
  );
  const nodes = rows.map((row) => nodeOf(rule!.vars, row));
  const prevBases = new Map(
    (prev?.rows ?? [])
      .map((row) => nodeOf(prev!.vars, row))
      .filter((n) => n.kind === "BASE")
      .map((n) => [n.key, n]),
  );
  const versions =
    prev?.ver && rule?.ver ? { prev: prev.ver, next: rule.ver } : undefined;
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const bases = nodes
    .filter((n) => n.kind === "BASE")
    .map((node) => ({ node, children: [] as LineageNode[] }));
  const orphans: LineageNode[] = [];
  const reviews = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.kind !== "DERIVED") continue;
    const base = n.baseKey ? byKey.get(n.baseKey) : undefined;
    const baseOk = base?.kind === "BASE" ? base : undefined;
    n.reviews = reviewReasons(
      n,
      baseOk,
      baseOk ? prevBases.get(baseOk.key) : undefined,
      versions,
    );
    if (n.reviews.length > 0) reviews.set(n.key, n.reviews);
    const parent = bases.find((b) => b.node === baseOk);
    if (parent) parent.children.push(n);
    else orphans.push(n);
  }
  const standalone = nodes.filter((n) => n.kind === "STANDALONE");
  return {
    bases,
    standalone,
    orphans,
    reviews,
    counts: {
      base: bases.length,
      derived: nodes.length - bases.length - standalone.length,
      standalone: standalone.length,
      review: reviews.size,
    },
  };
}

/** 지금 버전의 바로 앞 버전 — 이력에서 ver 가 같은 것의 앞. 없으면 undefined. */
export function previousVersion(
  versions: readonly RuleVersion[],
  ver: string | null | undefined,
): RuleVersion | undefined {
  if (!ver) return undefined;
  const idx = versions.findIndex((v) => v.ver === ver);
  return idx > 0 ? versions[idx - 1] : undefined;
}
