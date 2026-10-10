/**
 * ERD 델타 적용기(스펙 4.4 아래층) — view 응답을 화면 상태로 풀고, SSE change(ErdDelta)를 rev 순서대로 얹는다. React 의존이 없다.
 * - rev 가 지금 rev 이하면 이미 반영한 것(stale)이다. save 응답을 먼저 얹고 같은 rev 의 SSE 가 뒤에 와도 두 번 얹지 않는다.
 * - rev 가 지금 rev + 1 이 아니면 사이 델타를 놓친 것(gap)이다. 호출자는 모델 전체를 다시 읽는다.
 *   서버는 rev 마다 change 하나를 보내고, DRAFT 표지 rev 는 reload 로 보낸다(단계 0). 그래서 rev 는 빈틈없이 이어진다.
 * - 바뀐 모음만 새 객체로 바꾸고 나머지는 참조를 그대로 둔다(캔버스 참조 안정, Local-Rules §19). 입력은 바꾸지 않는다.
 */
import type { ErdChange, ErdDelta, ErdModelJson, ErdModelView, ErdState, ErdVersionEvent } from "../types";

export const nodeKey = (diagram: string, table: string): string => `${diagram}:${table}`;

export function fromView(v: ErdModelView): ErdState {
  const model = JSON.parse(v.model) as ErdModelJson;
  const diagrams: ErdState["diagrams"] = {};
  for (const d of v.diagrams) diagrams[d.id] = d;
  const nodes: ErdState["nodes"] = {};
  for (const n of v.nodes) nodes[nodeKey(n.diagram, n.table)] = n;
  return {
    modelId: v.modelId, rev: v.rev, ver: v.ver, status: v.status, ownerId: v.ownerId, editors: v.editors, rowVersion: v.rowVersion,
    model, diagrams, nodes, presence: v.presence, claims: [],
  };
}

type ModelCollection = "tables" | "columns" | "keys" | "relations";

const MODEL_COLLECTION: Partial<Record<ErdChange["kind"], ModelCollection>> = {
  table: "tables", column: "columns", key: "keys", relation: "relations",
};

/**
 * 이미 복사한 모음에 변경 하나를 쓴다. patch 는 있는 요소에만 덮는다.
 * patch 대상이 없으면 화면 모델이 서버와 어긋난 것이므로 false 를 돌려 호출자가 gap 으로 다시 읽게 한다.
 */
function put(coll: Record<string, unknown>, c: ErdChange): boolean {
  if (c.op === "delete") {
    delete coll[c.id];
    return true;
  }
  if (c.value === null) return true;
  if (c.op === "patch") {
    const prev = coll[c.id];
    if (prev === undefined) return false;
    coll[c.id] = { ...(prev as object), ...c.value };
    return true;
  }
  coll[c.id] = c.value;
  return true;
}

export type DeltaOutcome = { kind: "applied"; state: ErdState } | { kind: "stale" } | { kind: "gap" };

export function applyDelta(state: ErdState, d: ErdDelta): DeltaOutcome {
  if (d.rev <= state.rev) return { kind: "stale" };
  if (d.rev !== state.rev + 1) return { kind: "gap" };
  let model: ErdModelJson = state.model;
  let diagrams = state.diagrams;
  let nodes = state.nodes;
  const copied = new Set<ModelCollection>();
  for (const c of d.changes) {
    const name = MODEL_COLLECTION[c.kind];
    if (name) {
      if (model === state.model) model = { ...state.model };
      if (!copied.has(name)) {
        (model as unknown as Record<ModelCollection, object>)[name] = { ...model[name] };
        copied.add(name);
      }
      if (!put(model[name] as unknown as Record<string, unknown>, c)) return { kind: "gap" };
    } else if (c.kind === "diagram") {
      if (diagrams === state.diagrams) diagrams = { ...diagrams };
      if (!put(diagrams as unknown as Record<string, unknown>, c)) return { kind: "gap" };
    } else if (c.kind === "diagramNode") {
      if (nodes === state.nodes) nodes = { ...nodes };
      if (!put(nodes as unknown as Record<string, unknown>, c)) return { kind: "gap" };
    }
  }
  // rowVersion 은 값이 있을 때만(재전송·다이어그램만은 null, S2-16)
  return { kind: "applied", state: { ...state, rev: d.rev, rowVersion: d.rowVersion ?? state.rowVersion, model, diagrams, nodes } };
}

/** 표준 상태를 다시 읽어야 하는 델타인가(표·컬럼이 바뀜). */
export function touchesColumns(d: ErdDelta): boolean {
  return d.changes.some((c) => c.kind === "column" || c.kind === "table");
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** version 이벤트(S2-12) — 버전 칸만 바꾼다. 같으면 같은 객체. ver 가 다르면 부르는 쪽이 모델을 다시 읽는다. */
export function withVersion(s: ErdState, ev: ErdVersionEvent): ErdState {
  if (s.status === ev.status && s.ownerId === ev.ownerId && s.rowVersion === ev.rowVersion && sameList(s.editors, ev.editors)) return s;
  return { ...s, status: ev.status, ownerId: ev.ownerId, editors: ev.editors, rowVersion: ev.rowVersion };
}
