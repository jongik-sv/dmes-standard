/**
 * 디버거 모델(3단계 계획 P9) — 서버 기록 실행(`execute`) 한 번의 기록 위에서 커서를 옮기는 순수 함수. React 의존이 없다.
 * 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 "노드 k 실행 전"이다(P-D13). 기록이 없으면 커서는 -1 이다.
 *
 * 변수·멈춤·여기까지·실행 비교는 Task 5, 툴바 문구(`debugStatus`)·기대값 JSON(`expectedFromFinal`)은 Task 10 이 채웠다.
 * 4단계 E4: 고친 값 표시·고침 대기 쌓기·보내기 모양(`editsJsonOf`)·칸 편집 검증(Task 10).
 */
import type { DataType, RunTrace, RuleSetFlow, TraceEdit, TypedValue } from "@/contract/engine-contract.generated";
import { EVAL_TS, RESERVED_CONSTANTS, RESERVED_PREFIX } from "@/evalex/contract-constants";

import { catchTitle } from "../catch-text";
import { CATCH_NAMES, endingBranches } from "../flow-model";
import { frames, sameTyped, validEdits } from "../trace-view";

/** 변수 패널 한 줄 — 커서 자리에서 본 값. created·changed 는 바로 앞 노드가 만들었거나 바꿨는가.
 *  edited 는 커서 자리까지 적용된 고친 값과 지금 값이 같은가(4단계 E4), pending 은 아직 보내지 않은 고침 대기 값인가. */
export interface DebugVar {
  name: string;
  value: TypedValue;
  created: boolean;
  changed: boolean;
  edited: boolean;
  pending?: boolean;
  /** 고침 대기가 덮기 전의 값 — [비우기] 뒤에도 원래 타입으로 다시 고치려고 둔다. */
  was?: TypedValue;
}

/** [여기까지 실행] 결과 — 멈출 자리(index) 또는 한 줄 알림. */
export type RunToResult = { index: number } | { notice: string };

export const PASSED_NOTICE = "이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다";
export const NOT_ON_PATH_NOTICE = "이 입력으로는 이 노드를 지나지 않는다";

/** 실행 비교(E7) 값 한 줄. */
export interface ValueDiffRow {
  name: string;
  before: TypedValue | null;
  after: TypedValue | null;
  same: boolean;
}

/** 실행 비교 — 결과 값 차이와 한쪽 실행에만 지난 노드. */
export interface RunDiff {
  values: ValueDiffRow[];
  onlyBefore: string[];
  onlyAfter: string[];
}

/** 커서 k 에서 본 변수(이름 순). k < n 이면 노드 k 실행 전 그 노드 범위의 ctx, k ≥ n 이면 마지막 노드 뒤. */
export function variablesAt(trace: RunTrace, flow: RuleSetFlow, cursor: number): DebugVar[] {
  const n = trace.nodes.length;
  const k = Math.max(0, Math.trunc(cursor));
  const fr = n > 0 ? frames(trace, flow) : [];
  const ctx = n === 0 ? trace.input : k < n ? fr[k].before : fr[n - 1].ctx;
  // created·changed 는 바로 앞 노드가 바꾼 이름 가운데 — 그 노드 실행 전 ctx 에 없었으면 created, 있었으면 changed.
  // 앞 노드가 다른 병렬 갈래에 있으면(둘째 갈래 첫 노드·합류 전) 그 노드가 바꾼 값은 지금 범위에 없으므로, 지금 값이 앞 노드 실행 뒤 값과 같을 때만 표시한다.
  const prevFrame = n === 0 || k === 0 ? null : fr[Math.min(k, n) - 1];
  const touched = new Map<string, { existed: boolean; after: TypedValue | undefined }>();
  if (prevFrame) {
    const had = new Set(Object.keys(prevFrame.before).map((x) => x.toLowerCase()));
    const afterOf = (name: string) => Object.entries(prevFrame.ctx).find(([key]) => key.toLowerCase() === name)?.[1];
    for (const name of prevFrame.changed) {
      const lower = name.toLowerCase();
      touched.set(lower, { existed: had.has(lower), after: afterOf(lower) });
    }
  }
  // 4단계 E4 — 커서 자리까지 적용된 고친 값(k < n 이면 beforeSeq ≤ 노드 k 의 seq, 끝이면 모두). 지금 값이 고친 값과 같을 때만 "고침".
  const upto = k < n ? trace.nodes[k].seq : Number.POSITIVE_INFINITY;
  const editedValues = new Map<string, TypedValue[]>();
  for (const e of validEdits(trace)) {
    if (e.beforeSeq > upto) continue;
    for (const [name, v] of Object.entries(e.values ?? {})) {
      const lower = name.toLowerCase();
      editedValues.set(lower, [...(editedValues.get(lower) ?? []), v ?? NULL_VALUE]);
    }
  }
  return Object.entries(ctx)
    .map(([name, value]) => {
      const t = touched.get(name.toLowerCase());
      const mine = !!t && sameTyped(t.after, value);
      const edited = (editedValues.get(name.toLowerCase()) ?? []).some((x) => sameTyped(x, value));
      return { name, value, created: mine && !t.existed, changed: mine && t.existed, edited };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** from(inclusive 면 포함) 부터 중단점 노드가 있는 첫 커서, 없으면 null. */
export function nextStop(trace: RunTrace, from: number, inclusive: boolean, stops: ReadonlySet<string>): number | null {
  for (let i = Math.max(0, inclusive ? from : from + 1); i < trace.nodes.length; i++) if (stops.has(trace.nodes[i].nodeId)) return i;
  return null;
}

/** [여기까지 실행] — 커서(inclusive 면 포함) 뒤에서 nodeId 를 찾는다. 앞에만 있으면 PASSED_NOTICE, 기록에 없으면 NOT_ON_PATH_NOTICE. */
export function runToIndex(trace: RunTrace, cursor: number, inclusive: boolean, nodeId: string): RunToResult {
  const start = Math.max(0, inclusive ? cursor : cursor + 1);
  const ids = trace.nodes.map((t) => t.nodeId);
  for (let i = start; i < ids.length; i++) if (ids[i] === nodeId) return { index: i };
  return ids.slice(0, Math.min(start, ids.length)).includes(nodeId) ? { notice: PASSED_NOTICE } : { notice: NOT_ON_PATH_NOTICE };
}

/** 두 실행 기록 비교(E7) — 최종 결과 값과 지난 노드 차이. */
export function compareRuns(before: RunTrace, after: RunTrace): RunDiff {
  const a = before.finalValues ?? {};
  const b = after.finalValues ?? {};
  const names = [...Object.keys(a), ...Object.keys(b).filter((x) => !Object.prototype.hasOwnProperty.call(a, x))];
  const values = names.map((name) => {
    const x = Object.prototype.hasOwnProperty.call(a, name) ? a[name] : null;
    const y = Object.prototype.hasOwnProperty.call(b, name) ? b[name] : null;
    return { name, before: x, after: y, same: sameTyped(x, y) };
  });
  const visited = (t: RunTrace) => [...new Set(t.nodes.map((x) => x.nodeId))];
  const va = visited(before);
  const vb = visited(after);
  const inB = new Set(vb);
  const inA = new Set(va);
  return { values, onlyBefore: va.filter((id) => !inB.has(id)), onlyAfter: vb.filter((id) => !inA.has(id)) };
}

/** 기록이 없을 때의 디버그 툴바 문구. */
export const NO_RECORD_STATUS = "아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다";
/** 실행 권한(`execute`)이 없을 때 실행 단추·메뉴의 title. */
export const RUN_DENIED_TITLE = "디버거는 편집 권한이 있어야 쓸 수 있다";

/**
 * 디버그 툴바 상태 문구(P-D13 — 커서 k 는 "노드 k 실행 전").
 * 기록 없음 → 시작 안내, 기록 노드 0개 → `실행 전 오류 — {첫 위반}`, k < n → `{k+1}/{n} · {nodeId} 실행 전`,
 * k = n 이고 마지막 노드가 ERROR → `오류로 멈춤 — {nodeId}: {첫 위반}`, k = n 이고 `endedBy` 가 있으면(처리 갈래가 끝냄, 받는 노드 spec §9)
 * `예외로 끝남: {받는 노드 제목} · {n}단계 · 결과 변수 {m}개`(제목은 실행 흐름 `flow` 의 label, 없으면 받는 종류 이름, 노드를 못 찾으면 ID),
 * 그 밖 k = n → `완료 · {n}단계 · 결과 변수 {m}개`, 끝내는 IF 갈래로 끝났으면 뒤에 ` · IF {제목}의 「{갈래}」 갈래에서 끝냈다`(R12).
 * 첫 위반은 그 노드의 위반, 없으면 세트 전체 위반의 첫 문구다.
 */
export function debugStatus(trace: RunTrace | null, cursor: number, pending = 0, flow?: RuleSetFlow): string {
  if (!trace) return NO_RECORD_STATUS;
  const edited = editCount(validEdits(trace));
  return `${baseStatus(trace, cursor, flow)}${edited > 0 ? ` · 고친 값 ${edited}건` : ""}${pending > 0 ? ` · 고침 대기 ${pending}건` : ""}`;
}

/**
 * 끝내는 IF 갈래로 끝난 실행의 표시 문장(R12, implicit-join spec §11) — `endedBy` 가 없고 마지막 기록이 END 일 때, 기록의 IF 가운데 고른 선이
 * 끝내는 갈래인 마지막 IF. 제목은 IF label(없으면 "조건"), 갈래는 선 label(없으면 "그 외"·"갈래 {order}"). 아니면 null. 계약 칸이 아니라 화면 계산이다(J-D17).
 */
export function endedBranchText(trace: RunTrace, flow: RuleSetFlow): string | null {
  const n = trace.nodes.length;
  if (trace.endedBy || n === 0 || trace.nodes[n - 1].kind !== "END") return null;
  for (let i = n - 1; i >= 0; i--) {
    const t = trace.nodes[i];
    if (t.kind !== "IF" || !t.chosenEdgeId) continue;
    if (!(endingBranches(flow, t.nodeId) ?? []).includes(t.chosenEdgeId)) continue;
    const title = flow.nodes.find((x) => x.id === t.nodeId)?.label ?? "조건";
    const e = flow.edges.find((x) => x.id === t.chosenEdgeId);
    const branch = e?.label ?? (e?.otherwise ? "그 외" : `갈래 ${e?.order ?? ""}`.trim());
    return `IF ${title}의 「${branch}」 갈래에서 끝냈다`;
  }
  return null;
}

function baseStatus(trace: RunTrace, cursor: number, flow?: RuleSetFlow): string {
  const n = trace.nodes.length;
  const firstOf = (own: readonly { message: string }[] | null | undefined) => own?.[0]?.message ?? trace.violations?.[0]?.message ?? "";
  if (n === 0) return `실행 전 오류 — ${firstOf(null)}`;
  const k = Math.max(0, Math.trunc(cursor));
  if (k < n) return `${k + 1}/${n} · ${trace.nodes[k].nodeId} 실행 전`;
  const lastNode = trace.nodes[n - 1];
  if (lastNode.status === "ERROR") return `오류로 멈춤 — ${lastNode.nodeId}: ${firstOf(lastNode.violations)}`;
  const tail = `${n}단계 · 결과 변수 ${Object.keys(trace.finalValues ?? {}).length}개`;
  if (trace.endedBy) {
    const c = flow?.nodes.find((x) => x.id === trace.endedBy);
    return `예외로 끝남: ${c ? catchTitle(c) || c.id : trace.endedBy} · ${tail}`;
  }
  const ended = flow ? endedBranchText(trace, flow) : null;
  return `완료 · ${tail}${ended ? ` · ${ended}` : ""}`;
}

/** TypedValue → 기대값 JSON 값. 서버 `RuleCaseJudge.sameValue` 가 받는 모양(NUMBER 는 십진 문자열 그대로, LIST 는 items 를 원소마다). */
function expectedValue(v: TypedValue | null | undefined): unknown {
  if (v == null) return null;
  switch (v.type) {
    case "NULL":
      return null;
    case "BOOLEAN":
      return v.value === "true";
    case "LIST":
      return (v.items ?? []).map(expectedValue);
    default:
      return v.value;
  }
}

/**
 * 케이스 기대값 JSON — 실행 결과의 최종 변수로 채운다(Review Focus 1). 키 순서는 finalValues 그대로다.
 * NUMBER 는 글자 그대로(`1.10` 을 `1.1` 로 바꾸지 않는다 — 서버가 BigDecimal 로 견준다), BOOLEAN 은 불린, NULL 은 null,
 * LIST 는 기록의 `items` 를 같은 규칙으로 푼 배열이다(Task 4 ⚠️ — 기록의 LIST 에는 value 가 없다).
 */
export function expectedFromFinal(finalValues: Record<string, TypedValue>): string {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(finalValues ?? {})) out[name] = expectedValue(v);
  return JSON.stringify(out, null, 2);
}

// ── 4단계 E4 — 값 고치기 ───────────────────────────────────────────────────────

export const NULL_VALUE: TypedValue = { type: "NULL" };
export type EditKind = "NUMBER" | "STRING" | "BOOLEAN";
export type EditParse = { value: TypedValue } | { error: string };

export const NUMBER_REJECT = "숫자가 아니다 — 값을 고치지 않았다";
export const BOOLEAN_REJECT = "true 나 false 만 쓴다 — 값을 고치지 않았다";
export const LIST_REJECT = "목록 값은 비우기만 한다";
/** 고친 값이 든 기록으로 새 케이스 기대값을 채우지 않는다(스펙 §2.4, 편차 후보 1). */
export const EDITED_EXPECTED_TITLE = "고친 값으로 나온 결과라 기대값으로 쓸 수 없다";

export const droppedEditsNotice = (n: number) => `뒤에서 고친 값 ${n}건을 지웠다`;
export const pendingDroppedNotice = (n: number) => `자리를 옮겨 고침 대기 ${n}건을 버렸다`;

/** 고친 값 수 — edit 마다 이름 수의 합. */
export function editCount(edits: readonly TraceEdit[]): number {
  return edits.reduce((s, e) => s + Object.keys(e.values ?? {}).length, 0);
}

const EDIT_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** 십진 글자 → JSON 숫자 글자. 부호 + 와 정수부 앞 0 을 떼고 소수 글자는 그대로 둔다(1.10 보존 — 서버 BigDecimal 이 그대로 받는다). */
export function numberText(text: string): string {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return text.trim();
  const int = m[2].replace(/^0+(?=\d)/, "");
  return `${m[1] === "-" ? "-" : ""}${int}${m[3] !== undefined ? `.${m[3]}` : ""}`;
}

/** 칸 글자 → 고친 값. 원래 타입에 맞지 않으면 거절 문구. STRING 은 글자 그대로(앞뒤 공백 포함). */
export function parseEditText(kind: EditKind, text: string): EditParse {
  if (kind === "NUMBER") {
    const t = text.trim();
    return EDIT_NUMBER.test(t) ? { value: { type: "NUMBER", value: numberText(t) } } : { error: NUMBER_REJECT };
  }
  if (kind === "BOOLEAN") {
    const t = text.trim().toLowerCase();
    return t === "true" || t === "false" ? { value: { type: "BOOLEAN", value: t } } : { error: BOOLEAN_REJECT };
  }
  return { value: { type: "STRING", value: text } };
}

/** 칸 편집 타입 — 값의 타입이 원래 타입이다. NULL 이면 세트 선언 타입(NUMBER·BOOLEAN 이 아니면 STRING), LIST 는 null(비우기만). */
export function editKindOf(value: TypedValue, declared: DataType | undefined): EditKind | null {
  switch (value.type) {
    case "LIST":
      return null;
    case "NULL":
      return declared === "NUMBER" || declared === "BOOLEAN" ? declared : "STRING";
    default:
      return value.type;
  }
}

/** 레코드 입력이 막는 예약 이름(상수·EVAL_TS·'_' 접두, 대소문자 무시)이면 거절 문구 — evalex `checkRecordKeys` 와 같은 규칙·문구다. 이 폴더는 evalex 함수를 쓰지 않아(불변 9) 상수만 가져온다. */
export function reservedKeyText(name: string): string | null {
  const u = name.toUpperCase();
  return (RESERVED_CONSTANTS as readonly string[]).includes(u) || u === EVAL_TS || name.startsWith(RESERVED_PREFIX) ? `예약된 레코드 키: ${name}` : null;
}

/**
 * 받는 노드가 넣는 이름(CATCH_*, 대소문자 무시)이면 거절 문구(컨트롤러 Ruling 3). 엔진은 받는 룰 직전 CATCH_* 를 적어 두고 돌아오는 합류에서
 * 그 값으로 되돌리므로(이름 그대로 지운다) 고친 CATCH_* 는 합류에서 조용히 사라지거나, 대소문자가 다르면 합류 뒤까지 남는다 — 그래서 고치지 않는다.
 */
export function catchEditText(name: string): string | null {
  return CATCH_NAMES.includes(name.toUpperCase()) ? `받는 노드가 넣는 값이라 고치지 않는다: ${name}` : null;
}

/** 줄의 편집 타입 — 비워 NULL 이 된 줄은 비우기 전 값의 타입을 따른다(LIST 였던 줄은 선언 타입 규칙). */
export function editKindOfVar(v: DebugVar, declared: DataType | undefined): EditKind | null {
  const base = v.value.type === "NULL" && v.was && v.was.type !== "NULL" && v.was.type !== "LIST" ? v.was : v.value;
  return editKindOf(base, declared);
}

/** 이름을 대소문자 무시로 바꿔 넣는다(엔진 `RecordKeys.putReplacing`). */
function putName(values: Record<string, TypedValue>, name: string, value: TypedValue): void {
  const lower = name.toLowerCase();
  for (const k of Object.keys(values)) if (k !== name && k.toLowerCase() === lower) delete values[k];
  values[name] = value;
}

/** 보낼 edit — 앞 지점은 그대로, 같은 지점은 값을 합치고(대기가 이긴다), 뒤 지점은 버린다(스펙 §2.4). dropped = 버린 이름 수. */
export function mergeEdits(applied: readonly TraceEdit[], pending: TraceEdit): { edits: TraceEdit[]; dropped: number } {
  const same = applied.find((e) => e.beforeSeq === pending.beforeSeq);
  const values: Record<string, TypedValue> = { ...(same?.values ?? {}) };
  for (const [name, v] of Object.entries(pending.values)) putName(values, name, v);
  return {
    edits: [...applied.filter((e) => e.beforeSeq < pending.beforeSeq), { beforeSeq: pending.beforeSeq, nodeId: pending.nodeId, values }],
    dropped: editCount(applied.filter((e) => e.beforeSeq > pending.beforeSeq)),
  };
}

/** TypedValue → JSON 원형 값 글자(recordJson 과 같은 모양). JSON.stringify(Number(…)) 는 1.10 을 1.1 로 바꾸므로 손으로 짓는다. */
function valueJson(v: TypedValue | null | undefined): string {
  if (v == null) return "null";
  switch (v.type) {
    case "NULL":
      return "null";
    case "NUMBER":
      return numberText(v.value);
    case "BOOLEAN":
      return v.value === "true" ? "true" : "false";
    case "LIST":
      return `[${(v.items ?? []).map(valueJson).join(",")}]`;
    default:
      return JSON.stringify(v.value);
  }
}

/** `execute` 의 `editsJson` — `[{"beforeSeq":n,"nodeId":"…","values":{"이름":값}}]`. */
export function editsJsonOf(edits: readonly TraceEdit[]): string {
  const one = (e: TraceEdit) =>
    `{"beforeSeq":${e.beforeSeq},"nodeId":${JSON.stringify(e.nodeId)},"values":{${Object.entries(e.values)
      .map(([name, v]) => `${JSON.stringify(name)}:${valueJson(v)}`)
      .join(",")}}}`;
  return `[${edits.map(one).join(",")}]`;
}

/** 고침 대기를 변수 줄에 덮는다 — 있는 이름(대소문자 무시)은 값을 바꾸고 pending, 없는 이름은 새 줄. 이름 순. */
export function applyPending(vars: DebugVar[], pending: TraceEdit | null): DebugVar[] {
  if (!pending) return vars;
  const rest = new Map(Object.entries(pending.values).map(([name, v]) => [name.toLowerCase(), [name, v] as const]));
  if (rest.size === 0) return vars;
  const out: DebugVar[] = vars.map((v) => {
    const hit = rest.get(v.name.toLowerCase());
    if (!hit) return v;
    rest.delete(v.name.toLowerCase());
    return { ...v, value: hit[1], pending: true, was: v.value };
  });
  for (const [name, value] of rest.values()) out.push({ name, value, created: false, changed: false, edited: false, pending: true });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
