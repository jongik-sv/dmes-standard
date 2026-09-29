/**
 * 값 테스트 입력 줄 모델(TSK-08-04 design §2.5·§6.7 ④). 입력 줄은 화면 입력 계약(`computeContract` — 룰 열·varMeta·서버 AST →
 * evalex `computeInputContract`)의 이름 합집합이다: 조건 변수(always) 뒤에 행별 필수·선택 이름을 행 순서대로 처음 나온 자리에 한 번씩.
 *
 * 레코드는 `buildInputJson` 이 만든다 — 키 보냄 끔 = 키 없음(MISSING_KEY), 빈 칸 = 키 있고 null(필수면 REQUIRED_NULL), 값은
 * 문자열 그대로(타입 변환은 서버 엔진 몫, I21).
 */
import type { InputContract, VarType } from "@/contract/engine-contract.generated";

import { typeBadge } from "../decision-table/columns";
import { computeContract, type AstByText, type ContractSource } from "../sections/contract/contract-view";
import type { ResolvedVar, VarCandidate } from "../types";

/** 입력 줄 한 칸. */
export interface InputField {
  /** 레코드 키(계약에 나온 글자 그대로). */
  name: string;
  label: string | null;
  typeBadge: string;
  /** "조건·키 필수" 또는 "N행 필수"·"N행 선택"(둘 다면 " · " 로 잇는다). */
  contractBadge: string;
  /** 조건 변수(always) — 키가 늘 있어야 한다. */
  always: boolean;
  /** 도메인 이름(룰 열의 `domainName`). 도메인 표준 식은 view 에 실려 오지 않아 싣지 않는다. */
  domain: string | null;
  description: string | null;
}

/** 다른 카드(⑥ 케이스 수정 팝업)에 넘기는 입력 줄 요약. */
export type InputFieldInfo = Pick<InputField, "name" | "label" | "typeBadge" | "contractBadge">;

export interface InputFieldsResult {
  fields: InputField[];
  /** AST 를 못 받아 계약에서 빠진 식 — 그 참조 변수는 입력 줄에 없다. */
  pending: string[];
  /** 계약 계산이 던진 사유(편집 중인 셀 등). 있으면 입력 줄이 없다. */
  failure: string | null;
}

const key = (name: string) => name.toUpperCase();

/** 계약 타입 → 배지(룰 열이 아닌 이름). */
function contractTypeBadge(t: VarType): string {
  switch (t.dataType) {
    case "NUMBER":
      return t.scale != null ? `Number(${t.scale})` : "Number";
    case "BOOLEAN":
      return "Boolean";
    case "DATE":
      return "일자";
    default:
      return "String";
  }
}

/** 계약 → 입력 줄. 이름은 대소문자를 무시하고 한 번만 싣는다(첫 글자 모양을 쓴다). */
export function fieldsOfContract(contract: InputContract, vars: readonly ResolvedVar[], candidates: readonly VarCandidate[] = []): InputField[] {
  const order: string[] = [];
  const first = new Map<string, VarType>();
  const always = new Set<string>();
  const required = new Map<string, number>();
  const optional = new Map<string, number>();
  const see = (t: VarType) => {
    if (!first.has(key(t.name))) {
      first.set(key(t.name), t);
      order.push(key(t.name));
    }
  };
  for (const t of contract.always) {
    see(t);
    always.add(key(t.name));
  }
  for (const r of contract.rows) {
    for (const [list, counts] of [
      [r.required, required],
      [r.optional, optional],
    ] as const) {
      const seen = new Set<string>();
      for (const t of list) {
        see(t);
        if (seen.has(key(t.name))) continue;
        seen.add(key(t.name));
        counts.set(key(t.name), (counts.get(key(t.name)) ?? 0) + 1);
      }
    }
  }
  const byName = new Map<string, ResolvedVar>();
  for (const v of vars) if (v.varKind === "COND" && !v.exprVar && v.varName) byName.set(key(v.varName), v);
  const candidateByName = new Map(candidates.map((c) => [key(c.name), c]));
  return order.map((k) => {
    const t = first.get(k)!;
    const v = byName.get(k);
    const parts: string[] = [];
    if (always.has(k)) parts.push("조건·키 필수");
    else {
      if (required.get(k)) parts.push(`${required.get(k)}행 필수`);
      if (optional.get(k)) parts.push(`${optional.get(k)}행 선택`);
    }
    return {
      name: t.name,
      label: v?.label ?? candidateByName.get(k)?.label ?? null,
      typeBadge: v ? typeBadge(v) : contractTypeBadge(t),
      contractBadge: parts.join(" · "),
      always: always.has(k),
      domain: v?.domainName ?? null,
      description: v?.description ?? null,
    };
  });
}

/** 한 정의(보이는 표·편집본 또는 다른 버전)의 입력 줄. 계약 계산이 던지면 입력 줄 없이 사유를 돌려준다. */
export function inputFields(src: ContractSource, asts: AstByText, candidates: readonly VarCandidate[] = []): InputFieldsResult {
  try {
    const { contract, pending } = computeContract(src, asts);
    return { fields: fieldsOfContract(contract, src.vars, candidates), pending, failure: null };
  } catch (e) {
    return { fields: [], pending: [], failure: e instanceof Error ? e.message : String(e) };
  }
}

/** 입력 레코드 JSON — 입력 줄 순서. 키 보냄이 꺼진 칸은 키를 빼고, 빈 칸은 null 로 싣는다. */
export function buildInputJson(
  fields: readonly Pick<InputField, "name">[],
  values: Readonly<Record<string, string | undefined>>,
  keySent: Readonly<Record<string, boolean | undefined>>,
): string {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    if (keySent[f.name] === false) continue;
    const v = values[f.name];
    out[f.name] = v === undefined || v === "" ? null : v;
  }
  return JSON.stringify(out);
}

/** 케이스 입력 JSON → 입력 칸(카드 ⑥ "불러오기"). 없는 키는 키 보냄 끔, null 은 빈 칸, 나머지는 문자열. 입력 줄에 없는 키는 버린다. */
export function inputFromCase(
  fields: readonly Pick<InputField, "name">[],
  inputJson: string,
): { values: Record<string, string>; keySent: Record<string, boolean> } {
  const parsed = JSON.parse(inputJson) as Record<string, unknown>;
  const byKey = new Map(Object.entries(parsed).map(([k, v]) => [key(k), v] as const));
  const values: Record<string, string> = {};
  const keySent: Record<string, boolean> = {};
  for (const f of fields) {
    const has = byKey.has(key(f.name));
    keySent[f.name] = has;
    if (!has) continue;
    const v = byKey.get(key(f.name));
    values[f.name] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return { values, keySent };
}

/**
 * 케이스 입력 JSON 에 지금 계약의 없는 키를 null 로 채운다 — 룰 화면에 컬럼(변수)이 새로
 * 들어오면 그 컬럼이 테스트 케이스 입력에도 null 로 보여야 하기 때문이다.
 *
 * <p>기존 키의 값과 키 순서는 그대로 둔다(JSON.parse 가 순서를 유지한다). 케이스가 만들어진
 * 뒤 룰이 바뀌면 입력 JSON 에 없는 키가 생기고, 엔진은 그 키를 REQUIRED_NULL(또는
 * MISSING_KEY) 로 처리한다 — 화면에서 그 사실을 미리 보이게 하는 것이 목적이고, 값 판정은
 * 여전히 서버 몫이다(I21).
 *
 * <p>JSON 객체가 아니면 원본을 그대로 돌려준다(수정 팝업의 입력 검사가 따로 잡는다).
 */
export function mergeMissingInputKeys(inputJson: string, fields: readonly Pick<InputField, "name">[]): string {
  let parsed: Record<string, unknown>;
  try {
    const v = JSON.parse(inputJson.trim()) as unknown;
    if (v === null || typeof v !== "object" || Array.isArray(v)) return inputJson;
    parsed = v as Record<string, unknown>;
  } catch {
    return inputJson;
  }
  let changed = false;
  for (const f of fields) {
    if (!(f.name in parsed)) {
      parsed[f.name] = null;
      changed = true;
    }
  }
  return changed ? JSON.stringify(parsed) : inputJson;
}
