/**
 * 생산가부(B.D 생산범위) 시트 — Maru 룰 5개(QD_FEAS_*, 시트 하나에 룰 하나, FIRST)를 재질 그룹별 폭 × 두께 칸으로 되편다.
 *
 * - 룰 행: 재질 그룹(MAT_GRP_CD =) · 폭(WID) · 두께(THK) → 생산가부(FEAS_STAT). 같은 상태가 이어진 두께 칸은 한 행으로 합쳐 저장돼 있다.
 * - 축 값은 구간 하한이다. 폭 행 = 그 값 이상 ~ 윗행 값 미만(맨 위 행은 그 값만), 두께 열 = 그 값 이상 ~ 다음 열 값 미만(마지막 열은 그 값만).
 * - 시트 머리·재질 그룹·축은 코드 QC_FEAS_SHEET·QC_FEAS_MATL_GRP, 상태 이름·색은 QC_FEAS_STATE. 코드를 받지 못하면 룰 행에서 축을 거꾸로 뽑는다
 *   (상태가 바뀌는 칸은 모두 행 경계라 칸 상태는 같고, 열 수만 시트보다 적다).
 * React 에 기대지 않는다.
 */
import {
  ruleTitle,
  type CodeSet,
  type RuleRow,
  type RuleVar,
  type RuleView,
} from "@/common/rule";

import { parseCell, testCond, type Cond } from "../shared/cond";

export const SHEET_CODE_ID = "QC_FEAS_SHEET";
export const GROUP_CODE_ID = "QC_FEAS_MATL_GRP";
export const STATE_CODE_ID = "QC_FEAS_STATE";

export const GRP_VAR = "MAT_GRP_CD";
export const WID_VAR = "WID";
export const THK_VAR = "THK";
export const STAT_VAR = "FEAS_STAT";

export interface PostTable {
  heads: string[];
  rows: string[][];
}

export interface FeasSheet {
  /** 시트 코드(2CGL-GI 등). 코드가 없으면 룰 ID. */
  key: string;
  ruleId: string;
  /** 탭 이름(B.D 생산범위(2CGL GI)). */
  tab: string;
  title: string;
  rev: string;
  titleNote: string;
  notes: string[];
  post: PostTable | null;
}

export interface AxisValue {
  label: string;
  value: number;
}

export interface Overlay {
  rows: number;
  cols: number;
  text: string;
  red: boolean;
}

export interface FeasGroup {
  /** 룰 조건 MAT_GRP_CD 값(2CGL-GI-G1). */
  code: string;
  name: string;
  /** 재질코드 목록(1A, AA …). */
  materials: string[];
  /** 재질코드 원문(재질코드(Material Code) = 1A, AA, BA). */
  materialsText: string;
  /** 폭 축(위 → 아래, 큰 값부터). */
  widths: AxisValue[];
  /** 두께 축(작은 값부터). */
  thicks: AxisValue[];
  warn: string;
  warnbox: string;
  overlay: Overlay | null;
}

export interface FeasState {
  code: string;
  name: string;
  /** 칸 배경(의미 토큰). 생산불가는 없음. */
  background?: string;
  /** 점·글자 색. */
  color?: string;
}

/** 칸 하나 — 룰 행이 없으면(주석 영역·범위 밖) state null. */
export interface FeasCell {
  state: string | null;
  rowId: number | null;
  seq: number | null;
}

const STATE_TONE: Record<string, Pick<FeasState, "background" | "color">> = {
  white: { color: "var(--color-text-muted)" },
  blue: {
    background: "var(--color-primary-soft)",
    color: "var(--color-primary)",
  },
  yellow: {
    background: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  red: { background: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

/** 코드를 받지 못했을 때의 상태(시트 범례와 같은 이름). */
export const FALLBACK_STATES: FeasState[] = [
  { code: "-", name: "생산불가", ...STATE_TONE.white },
  { code: "P", name: "생산가능", ...STATE_TONE.blue },
  { code: "C", name: "조건부 생산", ...STATE_TONE.yellow },
  { code: "X", name: "생산불가(검증 완료)", ...STATE_TONE.red },
];

const codeSet = (codes: readonly CodeSet[], id: string) =>
  codes.find((c) => c.codeId === id)?.items ?? [];

const text = (v: string | null | undefined) => (v ?? "").trim();

/** 상태 목록 — QC_FEAS_STATE(속성1 = 표시 색 white·blue·yellow·red), 없으면 기본. */
export function statesOf(codes: readonly CodeSet[]): FeasState[] {
  const items = codeSet(codes, STATE_CODE_ID);
  if (items.length === 0) return FALLBACK_STATES;
  return items.map((i) => ({
    code: i.code,
    name: text(i.name) || i.code,
    ...(STATE_TONE[text(i.attrs[0]).toLowerCase()] ??
      FALLBACK_STATES.find((s) => s.code === i.code) ??
      {}),
  }));
}

export function stateOf(
  states: readonly FeasState[],
  code: string | null,
): FeasState | undefined {
  return code === null ? undefined : states.find((s) => s.code === code);
}

function parsePost(raw: string): PostTable | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { heads?: unknown; rows?: unknown };
    if (!Array.isArray(v.heads) || !Array.isArray(v.rows)) return null;
    return {
      heads: v.heads.map(String),
      rows: v.rows.map((r) => (Array.isArray(r) ? r.map(String) : [])),
    };
  } catch {
    return null;
  }
}

/** 시트 목록 — 룰 순서대로. 시트 코드(속성6 = 룰 ID)가 없으면 룰 제목으로 대신한다. */
export function sheetsOf(
  codes: readonly CodeSet[],
  ruleIds: readonly string[],
): FeasSheet[] {
  const items = codeSet(codes, SHEET_CODE_ID);
  return ruleIds.map((ruleId) => {
    const i = items.find((x) => text(x.attrs[5]) === ruleId);
    if (!i)
      return {
        key: ruleId,
        ruleId,
        tab: ruleTitle(ruleId),
        title: ruleTitle(ruleId),
        rev: "",
        titleNote: "",
        notes: [],
        post: null,
      };
    return {
      key: i.code,
      ruleId,
      tab: text(i.name) || ruleTitle(ruleId),
      title: text(i.attrs[0]) || text(i.name),
      rev: text(i.attrs[1]),
      titleNote: text(i.attrs[2]),
      notes: text(i.attrs[3])
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
      post: parsePost(text(i.attrs[4])),
    };
  });
}

/** 축 글(「1260,1230,…,650↑」) → 값. 숫자가 아닌 칸은 뺀다. */
export function parseAxis(raw: string): AxisValue[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((label) => ({ label, value: Number.parseFloat(label) }))
    .filter((a) => Number.isFinite(a.value));
}

function parseOverlay(raw: string): Overlay | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Overlay>;
    const rows = Number(v.rows);
    const cols = Number(v.cols);
    if (!(rows > 0) || !(cols > 0)) return null;
    return { rows, cols, text: String(v.text ?? ""), red: v.red === true };
  } catch {
    return null;
  }
}

interface VarIndex {
  grp?: RuleVar;
  wid?: RuleVar;
  thk?: RuleVar;
}

const varsOf = (rule: Pick<RuleView, "vars">): VarIndex => ({
  grp: rule.vars.find((v) => v.name === GRP_VAR),
  wid: rule.vars.find((v) => v.name === WID_VAR),
  thk: rule.vars.find((v) => v.name === THK_VAR),
});

const condOf = (row: RuleRow, v: RuleVar | undefined): Cond =>
  parseCell(v ? row.cells[String(v.varId)] : undefined);

/** 축을 룰 행에서 뽑는다 — 하한(= 값·범위 왼쪽)과 닫힌 오른쪽 끝. */
function axisFromRows(
  rows: readonly RuleRow[],
  v: RuleVar | undefined,
  desc: boolean,
): AxisValue[] {
  const values = new Set<number>();
  for (const row of rows) {
    const c = condOf(row, v);
    if (c.op === "EQ") values.add(Number(c.values[0]));
    else if (c.op === "BETWEEN") {
      values.add(Number(c.low));
      if (c.highInclusive) values.add(Number(c.high));
    } else if (c.op === "GE" || c.op === "GT") values.add(Number(c.values[0]));
  }
  return [...values]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => (desc ? b - a : a - b))
    .map((value) => ({ label: String(value), value }));
}

/** 재질 그룹 행만 — MAT_GRP_CD 조건이 그 그룹 코드를 받는 행(순번 순). */
function groupRows(
  rule: Pick<RuleView, "vars" | "rows">,
  code: string,
): RuleRow[] {
  const { grp } = varsOf(rule);
  return rule.rows
    .filter((r) => r.rowKind !== "DEFAULT")
    .filter((r) => testCond(condOf(r, grp), code, false) === "P")
    .sort((a, b) => a.seq - b.seq);
}

/**
 * 시트의 재질 그룹 — 코드 QC_FEAS_MATL_GRP(단계1 = 시트 코드)의 순서. 코드가 없으면 룰 행의 MAT_GRP_CD 값 순서대로 만들고 축은 행에서 뽑는다.
 */
export function groupsOf(
  codes: readonly CodeSet[],
  sheet: Pick<FeasSheet, "key">,
  rule: Pick<RuleView, "vars" | "rows"> | undefined,
): FeasGroup[] {
  const items = codeSet(codes, GROUP_CODE_ID).filter(
    (i) => text(i.lvl[0]) === sheet.key,
  );
  if (items.length > 0)
    return items.map((i) => ({
      code: i.code,
      name: text(i.name) || i.code,
      materials: text(i.attrs[0])
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
      materialsText: text(i.attrs[1]),
      widths: parseAxis(text(i.attrs[2])),
      thicks: parseAxis(text(i.attrs[3])),
      warn: text(i.attrs[4]),
      warnbox: text(i.attrs[5]),
      overlay: parseOverlay(text(i.attrs[6])),
    }));
  if (!rule) return [];
  const { grp, wid, thk } = varsOf(rule);
  const order: string[] = [];
  for (const row of [...rule.rows].sort((a, b) => a.seq - b.seq)) {
    const c = condOf(row, grp);
    if (c.op === "EQ" && !order.includes(c.values[0])) order.push(c.values[0]);
  }
  return order.map((code) => {
    const rows = groupRows(rule, code);
    return {
      code,
      name: code,
      materials: [],
      materialsText: "",
      widths: axisFromRows(rows, wid, true),
      thicks: axisFromRows(rows, thk, false),
      warn: "",
      warnbox: "",
      overlay: null,
    };
  });
}

/** 주석 영역(시트 왼쪽 위 rows × cols) 칸인가. */
export function isOverlay(group: FeasGroup, wi: number, ti: number): boolean {
  return !!group.overlay && wi < group.overlay.rows && ti < group.overlay.cols;
}

/** 그룹 칸 펼치기 — [폭 행][두께 열]. 각 칸은 축 하한 값으로 첫 적중 행을 찾는다. */
export function expandGroup(
  rule: Pick<RuleView, "vars" | "rows"> | undefined,
  group: FeasGroup,
): FeasCell[][] {
  const empty = (): FeasCell => ({ state: null, rowId: null, seq: null });
  if (!rule) return group.widths.map(() => group.thicks.map(empty));
  const { wid, thk } = varsOf(rule);
  const rows = groupRows(rule, group.code).map((row) => ({
    row,
    w: condOf(row, wid),
    t: condOf(row, thk),
  }));
  return group.widths.map((w) =>
    group.thicks.map((t) => {
      const hit = rows.find(
        (r) =>
          testCond(r.w, String(w.value), true) === "P" &&
          testCond(r.t, String(t.value), true) === "P",
      );
      if (!hit) return empty();
      const raw = hit.row.results[STAT_VAR];
      return {
        state: raw === null || raw === undefined ? null : String(raw).trim(),
        rowId: hit.row.rowId,
        seq: hit.row.seq,
      };
    }),
  );
}

/**
 * 값 → 축 칸 번호. 폭(desc): 맨 위 칸은 그 값만, 아래 칸은 그 값 이상 ~ 윗칸 값 미만.
 * 두께(asc): 마지막 칸은 그 값만, 나머지는 그 값 이상 ~ 다음 칸 값 미만. 어느 칸에도 없으면 -1.
 */
export function locate(
  axis: readonly AxisValue[],
  value: number,
  kind: "width" | "thick",
): number {
  if (!Number.isFinite(value) || axis.length === 0) return -1;
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  if (kind === "width") {
    if (eq(value, axis[0].value)) return 0;
    for (let i = 1; i < axis.length; i++)
      if (value >= axis[i].value - 1e-9 && value < axis[i - 1].value) return i;
    return -1;
  }
  const last = axis.length - 1;
  if (eq(value, axis[last].value)) return last;
  for (let i = 0; i < last; i++)
    if (value >= axis[i].value - 1e-9 && value < axis[i + 1].value) return i;
  return -1;
}

/** 재질코드(1A 등) → 그 시트의 재질 그룹. */
export function groupOfMaterial(
  groups: readonly FeasGroup[],
  material: string,
): FeasGroup | undefined {
  const m = material.trim().toUpperCase();
  if (m === "") return undefined;
  return groups.find((g) => g.materials.some((x) => x.toUpperCase() === m));
}

export interface FeasChange {
  key: string;
  ver: string;
  applyFrom: string;
  kind: "최초 등록" | "셀 수정";
  item: string;
  before: string;
  after: string;
}

/**
 * 버전 이력 → 칸 단위 변경(새 버전 먼저). 칸은 지금 축(코드)으로 펼쳐 비교한다. 첫 버전은 「최초 등록」 한 줄.
 */
export function feasChanges(
  sheet: Pick<FeasSheet, "tab" | "key">,
  groups: readonly FeasGroup[],
  versions: readonly Pick<RuleView, "vars" | "rows" | "ver" | "applyFrom">[],
  states: readonly FeasState[],
): FeasChange[] {
  const name = (code: string | null) =>
    code === null ? "해당 없음" : (stateOf(states, code)?.name ?? code);
  const short = sheet.tab
    .replace("B.D 생산범위", "")
    .replace(/[()]/g, "")
    .trim();
  const perVersion: FeasChange[][] = [];
  versions.forEach((v, i) => {
    const ver = v.ver ?? "";
    const applyFrom = v.applyFrom ?? "";
    if (i === 0) {
      perVersion.push([
        {
          key: `${ver}|init`,
          ver,
          applyFrom,
          kind: "최초 등록",
          item: `${short} · 재질 그룹 ${groups.length}종`,
          before: "",
          after: `룰 행 ${v.rows.length}개`,
        },
      ]);
      return;
    }
    const prev = versions[i - 1];
    const out: FeasChange[] = [];
    for (const g of groups) {
      const a = expandGroup(prev, g);
      const b = expandGroup(v, g);
      g.widths.forEach((w, wi) =>
        g.thicks.forEach((t, ti) => {
          if (isOverlay(g, wi, ti)) return;
          const before = a[wi]?.[ti]?.state ?? null;
          const after = b[wi]?.[ti]?.state ?? null;
          if (before === after) return;
          out.push({
            key: `${ver}|${g.code}|${wi}|${ti}`,
            ver,
            applyFrom,
            kind: "셀 수정",
            item: `[${short} · ${g.name}] 폭 ${w.label} × 두께 ${t.label}`,
            before: name(before),
            after: name(after),
          });
        }),
      );
    }
    perVersion.push(out);
  });
  return perVersion.reverse().flat();
}
