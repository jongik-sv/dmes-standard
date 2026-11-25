/**
 * 주문정합성 룰 모델 — Maru 룰 QD_ORDER_CHECK(COLLECT, 조건 66열 → 에러 목록)의 행을 룰 카드 모양으로 바꾸고,
 * 항목 사전(QC_OC_FIELD)·값 라벨(QC_OC_VALUE_LABEL)을 읽는다. 코드를 받지 못하면 항목 라벨은 catalog 에서 읽는다.
 * React 에 기대지 않는다.
 */
import {
  CATALOG,
  varLabel,
  type Catalog,
  type CodeSet,
  type RuleView,
} from "@/common/rule";

import { rowConds, type Cond } from "../shared/cond";

const FALLBACK_RULE_ID = "QD_ORDER_CHECK";
/** 화면 룰 — catalog SCREEN_RULES.orderConsistency 의 첫 룰(없으면 QD_ORDER_CHECK). */
export const RULE_ID: string =
  CATALOG.SCREEN_RULES.orderConsistency?.[0] ?? FALLBACK_RULE_ID;

export const FIELD_CODE_ID = "QC_OC_FIELD";
export const VALUE_LABEL_CODE_ID = "QC_OC_VALUE_LABEL";
export const CATEGORY_CODE_ID = "QC_OC_ERR_CATEGORY";
export const ACTOR_CODE_ID = "QC_OC_ACTOR";

/** 결과 변수. */
export const R = {
  key: "RULE_KEY",
  code: "ERR_CD",
  message: "ERR_MSG",
  category: "ERR_CATEGORY",
  severity: "SEVERITY",
  warn: "WARN_CAND_YN",
  dept: "OWNER_DEPT",
  actor: "ACTOR",
  target: "TARGET_ITEM",
  source: "RULE_SOURCE",
} as const;

/** 분류 정렬 — 누락 < 사용불가 < 불필요 < 한도위반 < 선택오류. */
export const CATEGORY_ORDER = [
  "누락",
  "사용불가",
  "불필요",
  "한도위반",
  "선택오류",
];
const SEVERITY_ORDER: Record<string, number> = { error: 0, warn: 1 };

export type FieldType = "code" | "number" | "string";

export interface OcField {
  key: string;
  label: string;
  type: FieldType;
  /** 원본 표현(EAV·column·EAV|column). */
  origin: string;
  unit: string;
  /** 사전에 적힌 참조 룰 수(시제품 값). */
  refs: number | null;
  labelNote: string;
}

export interface ValueLabel {
  field: string;
  code: string;
  label: string;
  /** 추정·확정. */
  certainty: string;
  evidence: string;
}

export interface OcCond {
  field: string;
  cond: Cond;
}

export interface OcRule {
  rowId: number;
  seq: number;
  /** R-nnn(공통·order)·R-Cnnn(cross). 없으면 「행 n」. */
  key: string;
  errCode: string;
  message: string;
  category: string;
  severity: string;
  warnCandidate: boolean;
  ownerDept: string;
  actor: string;
  /** 대상 항목(에러가 가리키는 주문 항목). */
  target: string;
  /** 공통·order·cross. */
  source: string;
  /** 조건 — 대상 항목 조건을 맨 뒤로(문맥 먼저, 대상 마지막). */
  conds: OcCond[];
}

const s = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).trim();

/** 룰 정의 → 카드 모델(순번 순). 결과 「-」 는 빈 값으로 본다. */
export function toOcRules(
  rule: Pick<RuleView, "vars" | "rows"> | undefined,
): OcRule[] {
  if (!rule) return [];
  return [...rule.rows]
    .filter((r) => r.rowKind !== "DEFAULT")
    .sort((a, b) => a.seq - b.seq)
    .map((row) => {
      const res = (name: string) => {
        const v = s(row.results[name]);
        return v === "-" ? "" : v;
      };
      const target = res(R.target);
      const conds = rowConds(rule.vars, row).map(({ name, cond }) => ({
        field: name,
        cond,
      }));
      const ordered = [
        ...conds.filter((c) => c.field !== target),
        ...conds.filter((c) => c.field === target),
      ];
      return {
        rowId: row.rowId,
        seq: row.seq,
        key: res(R.key) || `행 ${row.seq}`,
        errCode: res(R.code),
        message: res(R.message),
        category: res(R.category),
        severity: res(R.severity) || "error",
        warnCandidate: res(R.warn) === "Y",
        ownerDept: res(R.dept) || "미지정",
        actor: res(R.actor) || "미지정",
        target,
        source: res(R.source),
        conds: ordered,
      };
    });
}

/** 룰 키 순서 — R-nnn 다음 R-Cnnn, 그 밖은 뒤. */
export function ruleOrd(key: string): number {
  const m = /^R-(C?)(\d+)/.exec(key);
  if (!m) return 99999;
  return (m[1] ? 10000 : 0) + Number.parseInt(m[2], 10);
}

export function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i < 0 ? 9 : i;
}

export function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity] ?? 0;
}

const items = (codes: readonly CodeSet[], id: string) =>
  codes.find((c) => c.codeId === id)?.items ?? [];

function typeOf(raw: string, numeric: boolean): FieldType {
  if (raw === "code" || raw === "number" || raw === "string") return raw;
  return numeric ? "number" : "string";
}

/**
 * 항목 사전 — 룰의 조건 변수마다 하나. 라벨·타입·원본 표현은 코드 QC_OC_FIELD, 없으면 catalog(label, desc 「code · EAV」).
 * 숫자 여부는 서버 변수 dataType 이 정본이다.
 */
export function fieldsOf(
  rule: Pick<RuleView, "vars"> | undefined,
  codes: readonly CodeSet[],
  ruleId: string = RULE_ID,
  catalog: Catalog = CATALOG,
): OcField[] {
  const codeItems = items(codes, FIELD_CODE_ID);
  const metaConds = catalog.RULES[ruleId]?.conds ?? [];
  const serverConds = (rule?.vars ?? [])
    .filter((v) => v.kind === "COND" && v.name)
    .sort((a, b) => a.seq - b.seq);
  const names =
    serverConds.length > 0
      ? serverConds.map((v) => v.name as string)
      : metaConds.map((c) => c.name);
  return names.map((key) => {
    const numeric =
      serverConds.find((v) => v.name === key)?.dataType === "NUMBER";
    const item = codeItems.find((i) => i.code === key);
    if (item)
      return {
        key,
        label: s(item.name) || key,
        type: typeOf(s(item.attrs[0]), numeric),
        origin: s(item.attrs[1]),
        unit: s(item.attrs[2]),
        refs: s(item.attrs[3]) === "" ? null : Number(item.attrs[3]),
        labelNote: s(item.attrs[4]),
      };
    const meta = metaConds.find((c) => c.name === key);
    const [rawType = "", origin = ""] = (meta?.desc ?? "")
      .split("·")
      .map((x) => x.trim());
    return {
      key,
      label: varLabel(ruleId, key, catalog),
      type: numeric ? "number" : typeOf(rawType, false),
      origin,
      unit: meta?.unit ?? "",
      refs: null,
      labelNote: "",
    };
  });
}

/** 값 라벨 — 코드 = 항목:값, 속성 = 항목·값·근거 등급·추론 근거. 키는 `항목:값`. */
export function valueLabelsOf(
  codes: readonly CodeSet[],
): Map<string, ValueLabel> {
  const out = new Map<string, ValueLabel>();
  for (const i of items(codes, VALUE_LABEL_CODE_ID)) {
    const field = s(i.attrs[0]) || s(i.lvl[0]) || i.code.split(":")[0];
    const code = s(i.attrs[1]) || i.code.slice(field.length + 1);
    out.set(`${field}:${code}`, {
      field,
      code,
      label: s(i.name),
      certainty: s(i.attrs[2]) || "추정",
      evidence: s(i.attrs[3]),
    });
  }
  return out;
}

/** 룰이 조건으로 쓰는 항목별 룰 수(지금 버전 기준). */
export function fieldRefCounts(rules: readonly OcRule[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rules)
    for (const f of new Set(r.conds.map((c) => c.field)))
      out.set(f, (out.get(f) ?? 0) + 1);
  return out;
}

/** 대상 항목별 묶음 — 룰 수 많은 순, 같으면 라벨 순. */
export function groupByTarget(
  rules: readonly OcRule[],
  labelOf: (field: string) => string,
): { target: string; label: string; rules: OcRule[] }[] {
  const map = new Map<string, OcRule[]>();
  for (const r of rules) {
    const k = r.target || "(대상 없음)";
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return [...map.entries()]
    .map(([target, list]) => ({ target, label: labelOf(target), rules: list }))
    .sort(
      (a, b) =>
        b.rules.length - a.rules.length || a.label.localeCompare(b.label, "ko"),
    );
}

export interface RuleFilter {
  target: string;
  condField: string;
  errCode: string;
  actor: string;
  source: string;
  keyword: string;
}

export const EMPTY_FILTER: RuleFilter = {
  target: "",
  condField: "",
  errCode: "",
  actor: "",
  source: "",
  keyword: "",
};

export function filterActive(f: RuleFilter): boolean {
  return Object.values(f).some((v) => v.trim() !== "");
}

/**
 * 룰 거르기. 에러코드는 그 코드가 있으면 정확히, 없으면 부분 일치. 키워드는 룰 키·에러코드·메시지·항목 코드·라벨·조건 값에서 찾는다.
 */
export function filterRules(
  rules: readonly OcRule[],
  f: RuleFilter,
  labelOf: (field: string) => string,
): OcRule[] {
  const code = f.errCode.trim().toUpperCase();
  const exact =
    code !== "" && rules.some((r) => r.errCode.toUpperCase() === code);
  const kw = f.keyword.trim().toLowerCase();
  return rules.filter((r) => {
    if (f.target && r.target !== f.target) return false;
    if (f.condField && !r.conds.some((c) => c.field === f.condField))
      return false;
    if (code) {
      const c = r.errCode.toUpperCase();
      if (exact ? c !== code : !c.includes(code)) return false;
    }
    if (f.actor && r.actor !== f.actor) return false;
    if (f.source && r.source !== f.source) return false;
    if (kw) {
      const hay = [
        r.key,
        r.errCode,
        r.message,
        r.target,
        labelOf(r.target),
        r.ownerDept,
        r.actor,
        ...r.conds.flatMap((c) => [
          c.field,
          labelOf(c.field),
          ...c.cond.values,
          c.cond.low ?? "",
          c.cond.high ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}
