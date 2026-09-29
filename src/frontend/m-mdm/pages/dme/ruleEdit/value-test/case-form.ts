/**
 * 테스트 케이스 수정 팝업의 폼 모델(카드 ⑥) — 입력·기대 JSON 과 폼 줄을 서로 바꾼다. 팝업은 [폼 | JSON] 탭을 두고 탭을 바꿀 때와 저장할 때
 * 이 함수로 변환한다. 폼을 건드리지 않았으면 팝업이 원래 JSON 글자를 그대로 쓴다(06 키 순서·숫자 표기 보존) — 여기서는 변환만 한다.
 *
 * 입력: 줄은 입력 계약 이름(카드 ④ 입력 줄과 같은 순서) 뒤에 계약에 없는 키. 키 보냄 끔 = 키 없음, 빈 칸 = null, 값은 문자열(타입 변환은 서버 엔진, I21).
 * 기대: 줄은 결과 이름 뒤에 계약에 없는 키, 그리고 hit. 서버는 기대 JSON 에 있는 키만 견주므로(RuleCaseJudge.compare) 비교 끔 = 키 없음.
 * 결과 이름은 엔진 `RuleEvaluator.resultNames` 와 같다 — 결과 열 그룹(`resGrp`)이면 그룹 이름 하나, 아니면 변수명.
 * 숫자 결과 변수 값은 JSON 숫자로, 적어 넣은 글자를 바꾸지 않고 싣는다(`expectedFromResult` 와 같은 표기).
 */
import type { ResolvedVar, StoredRow, VarMeta } from "../types";

/** 폼 한 줄. `on` 은 입력이면 키 보냄, 기대면 비교다. `extra` 는 계약·결과 변수에 없는 키(빼기 가능). */
export interface CaseFormRow {
  key: string;
  value: string;
  on: boolean;
  extra: boolean;
}

/** 기대 hit — 고른 행의 row_id(엔진 hits 순서). 비었으면 null(적중도 기본 행도 없음). */
export interface HitForm {
  on: boolean;
  rowIds: number[];
}

export interface ExpectedForm {
  /** 기대값 없이 돌려 보기만(기대 JSON 빈 값). */
  none: boolean;
  rows: CaseFormRow[];
  hit: HitForm;
}

const NUMBER_TEXT = /^[+-]?\d+(\.\d+)?$/;
const HIT = "hit";
const upper = (s: string) => s.toUpperCase();

/** JSON 객체 글자 → 객체. 객체가 아니면 던진다(메시지는 팝업이 그대로 보인다). */
export function parseObject(text: string, what: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error(`${what} JSON 을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(`${what}은 JSON 객체({ … })여야 합니다.`);
  return v as Record<string, unknown>;
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** 이름 목록(대소문자 무시)과 JSON 객체 → 폼 줄. 목록에 없는 키는 뒤에 extra 줄로 남긴다. */
function rowsOf(names: readonly string[], obj: Record<string, unknown>, skip: (k: string) => boolean = () => false): CaseFormRow[] {
  const byKey = new Map(Object.entries(obj).map(([k, v]) => [upper(k), v] as const));
  const known = new Set(names.map(upper));
  const rows: CaseFormRow[] = names.map((name) => ({ key: name, value: text(byKey.get(upper(name))), on: byKey.has(upper(name)), extra: false }));
  for (const [k, v] of Object.entries(obj)) {
    if (known.has(upper(k)) || skip(k)) continue;
    rows.push({ key: k, value: text(v), on: true, extra: true });
  }
  return rows;
}

/** 입력 JSON → 입력 폼 줄. `names` 는 입력 계약 이름(없으면 모든 키가 extra 줄). */
export function inputFormOf(names: readonly string[], inputJson: string): CaseFormRow[] {
  return rowsOf(names, inputJson.trim() === "" ? {} : parseObject(inputJson.trim(), "입력"));
}

/** 입력 폼 줄 → 입력 JSON. 키 보냄이 꺼진 줄은 빼고, 빈 칸은 null, 나머지는 글자 그대로의 문자열. */
export function inputJsonOf(rows: readonly CaseFormRow[]): string {
  const out: Record<string, string | null> = {};
  for (const r of rows) if (r.on) out[r.key] = r.value === "" ? null : r.value;
  return JSON.stringify(out);
}

function hitIds(v: unknown): number[] {
  if (v === null || v === undefined) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

/** 기대 줄 하나가 가리키는 결과 — 그룹이면 `name` 이 그룹 이름, `members` 가 그룹에 든 열의 변수명, `v` 는 첫 열(그룹 열은 타입이 같다). */
export interface ResultSlot {
  name: string;
  v: ResolvedVar;
  members: string[];
}

/** 결과 이름(순서대로, 그룹은 처음 나온 자리에 하나). 식 변수·이름 없는 변수는 뺀다. */
export function resultSlots(vars: readonly ResolvedVar[], meta: readonly Pick<VarMeta, "varId" | "resGrp">[] = []): ResultSlot[] {
  const grpOf = new Map(meta.map((m) => [m.varId, m.resGrp?.trim() || null] as const));
  const slots: ResultSlot[] = [];
  const byGroup = new Map<string, ResultSlot>();
  for (const v of vars) {
    if (v.varKind !== "RESULT" || !v.varName) continue;
    const g = grpOf.get(v.varId);
    if (!g) {
      slots.push({ name: v.varName, v, members: [] });
      continue;
    }
    const slot = byGroup.get(upper(g));
    if (slot) slot.members.push(v.varName);
    else {
      const s = { name: g, v, members: [v.varName] };
      byGroup.set(upper(g), s);
      slots.push(s);
    }
  }
  return slots;
}

/** 기대 JSON → 기대 폼. 빈 글자면 "기대값 없이" 이고 모든 줄이 비교 끔이다. */
export function expectedFormOf(slots: readonly ResultSlot[], expectedJson: string): ExpectedForm {
  const trimmed = expectedJson.trim();
  const obj = trimmed === "" ? {} : parseObject(trimmed, "기대");
  const hitKey = Object.keys(obj).find((k) => k === HIT);
  return {
    none: trimmed === "",
    rows: rowsOf(slots.map((x) => x.name), obj, (k) => k === HIT),
    hit: { on: hitKey !== undefined, rowIds: hitKey !== undefined ? hitIds(obj[hitKey]) : [] },
  };
}

/** 기대 값 글자 → JSON 리터럴. 빈 칸 null, 숫자 변수(또는 extra)의 숫자 글자는 숫자, 배열 글자는 배열, 나머지는 문자열. */
function literal(value: string, numeric: boolean): string {
  if (value === "") return "null";
  if (numeric && NUMBER_TEXT.test(value)) return value.startsWith("+") ? value.slice(1) : value;
  if (value.trim().startsWith("[")) {
    try {
      const v = JSON.parse(value) as unknown;
      if (Array.isArray(v)) return JSON.stringify(v);
    } catch {
      // 배열로 못 읽으면 글자 그대로 문자열로 싣는다.
    }
  }
  return JSON.stringify(value);
}

function hitLiteral(ids: readonly number[]): string {
  if (ids.length === 0) return "null";
  return ids.length === 1 ? String(ids[0]) : JSON.stringify(ids);
}

/** 기대 폼 → 기대 JSON. "기대값 없이" 면 빈 글자. 줄 순서: 결과 이름 → hit → 계약에 없는 키. */
export function expectedJsonOf(slots: readonly ResultSlot[], form: ExpectedForm): string {
  if (form.none) return "";
  const numeric = new Set(slots.filter((x) => x.v.dataType === "NUMBER").map((x) => upper(x.name)));
  const parts: string[] = [];
  for (const r of form.rows.filter((x) => !x.extra && x.on)) parts.push(`${JSON.stringify(r.key)}:${literal(r.value, numeric.has(upper(r.key)))}`);
  if (form.hit.on) parts.push(`"${HIT}":${hitLiteral(form.hit.rowIds)}`);
  for (const r of form.rows.filter((x) => x.extra && x.on)) parts.push(`${JSON.stringify(r.key)}:${literal(r.value, true)}`);
  return `{${parts.join(",")}}`;
}

export interface HitOption {
  value: string;
  label: string;
}

/**
 * 적중 행 후보 — 표시 순서(NORMAL 은 seq 순, 기본 행은 끝)로 "N행 · 행 설명"/"기본 행". 저장 전 행(임시 음수 ID)은 저장하면 row_id 가
 * 바뀌어 기대값이 늘 틀리게 되므로 뺀다. 이미 고른 row_id 가 후보에 없으면(지운 행 등) 잃지 않게 끝에 더한다.
 */
export function hitOptionsOf(rows: readonly StoredRow[], selected: readonly number[]): HitOption[] {
  const ordered = rows
    .filter((r) => r.rowId > 0)
    .sort((a, b) => (a.rowKind === b.rowKind ? a.seq - b.seq : a.rowKind === "DEFAULT" ? 1 : -1));
  const options = ordered.map((r) => {
    const head = r.rowKind === "DEFAULT" ? "기본 행" : `${r.seq}행`;
    return { value: String(r.rowId), label: r.note ? `${head} · ${r.note}` : head };
  });
  const known = new Set(options.map((o) => o.value));
  for (const id of selected) if (!known.has(String(id))) options.push({ value: String(id), label: `row ${id}(표에 없음)` });
  return options;
}

/** 고른 적중 행(선택 순서) → row_id 목록을 후보 순서(엔진 hits 순서)로 정렬한다. */
export function orderHitIds(values: readonly string[], options: readonly HitOption[]): number[] {
  const order = options.map((o) => o.value);
  return [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(Number);
}
