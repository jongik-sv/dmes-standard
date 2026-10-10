// ERD 화면 시험 공용 모델. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
import { vi } from "vitest";

import type { ApplyOutcome, ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { fromView } from "../../../pages/dma/erdEdit/state/model-delta";
import type {
  ErdColumn, ErdDiagram, ErdDiagramNode, ErdModelJson, ErdModelView, ErdRelation, ErdState, ErdTable,
} from "../../../pages/dma/erdEdit/types";

export function table(phys: string, logical: string, columnOrder: string[] = []): ErdTable {
  return { phys, logical, comment: "", columnOrder, _rev: {} };
}

export function column(tableId: string, phys: string, logical: string, extra: Partial<ErdColumn> = {}): ErdColumn {
  return { table: tableId, phys, logical, domainId: null, dataType: "VARCHAR2", length: 30, scale: null, notNull: false,
    default: null, comment: "", _rev: {}, ...extra };
}

export function relation(child: string, parent: string, pairs: [string, string][], extra: Partial<ErdRelation> = {}): ErdRelation {
  return { child, parent, pairs, identifying: false, cardinality: { parent: "ONE", child: "ZERO_OR_MORE" }, state: "CONFIRMED",
    dbFk: false, evidence: [], parentRef: null, candidateRank: null, _rev: {}, ...extra };
}

export function emptyModel(): ErdModelJson {
  return { schemaVersion: 1, model: { module: "mcm", schema: "MCMAPUSER" }, tables: {}, columns: {}, keys: {}, relations: {} };
}

export function viewOf(model: ErdModelJson, over: Partial<ErdModelView> = {}): ErdModelView {
  return { modelId: "mcm", rev: 3, ver: "1.000", status: "DRAFT", ownerId: "tester", editors: [], rowVersion: 0,
    model: JSON.stringify(model), diagrams: [], nodes: [], presence: [], ...over };
}

export function stateOf(model: ErdModelJson, over: Partial<ErdModelView> = {}): ErdState {
  return fromView(viewOf(model, over));
}

/** 메뉴(t-1)·오브젝트(t-2) 두 표와 추정 관계 r-1(메뉴.OBJECT_ID → 오브젝트.OBJECT_ID). */
export function menuModel(): ErdModelJson {
  const m = emptyModel();
  m.tables["t-1"] = table("TB_MCM_SEC_MENU", "메뉴", ["c-1", "c-2", "c-4"]);
  m.tables["t-2"] = table("TB_MCM_SEC_OBJ", "오브젝트", ["c-3"]);
  m.columns["c-1"] = column("t-1", "MENU_ID", "메뉴아이디", { domainId: 12, notNull: true });
  m.columns["c-2"] = column("t-1", "OBJECT_ID", "오브젝트아이디", { length: 50 });
  m.columns["c-4"] = column("t-1", "MENU_NM", "메뉴명", { length: 200 });
  m.columns["c-3"] = column("t-2", "OBJECT_ID", "오브젝트아이디", { length: 50, notNull: true });
  m.keys["k-1"] = { table: "t-1", kind: "PK", name: "PK_TB_MCM_SEC_MENU", columns: ["c-1"] };
  m.keys["k-2"] = { table: "t-2", kind: "PK", name: "PK_TB_MCM_SEC_OBJ", columns: ["c-3"] };
  m.relations["r-1"] = relation("t-1", "t-2", [["c-2", "c-3"]], {
    state: "INFERRED", evidence: [{ kind: "NAME_RULE", ref: "PK 이름 일치" }],
  });
  return m;
}

export const MENU_DIAGRAMS: { diagrams: ErdDiagram[]; nodes: ErdDiagramNode[] } = {
  diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }],
  nodes: [
    { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" },
    { diagram: "d-all", table: "t-2", x: 400, y: 0, foldMode: "NONE" },
  ],
};

/** 표 n 개 × 컬럼 m 개. 다이어그램 d-all 에 가로 8개 격자(280×220, S8)로 놓는다. 첫 컬럼이 PK 다. */
export function bigState(n: number, m: number): ErdState {
  const model = emptyModel();
  const nodes: ErdDiagramNode[] = [];
  for (let i = 0; i < n; i++) {
    const t = `t-${i}`;
    const cols: string[] = [];
    for (let j = 0; j < m; j++) {
      const c = `c-${i}-${j}`;
      cols.push(c);
      model.columns[c] = column(t, `COL_${j}`, `컬럼${j}`);
    }
    model.tables[t] = table(`TB_T${String(i).padStart(3, "0")}`, `표${i}`, cols);
    model.keys[`k-${i}`] = { table: t, kind: "PK", name: `PK_T${i}`, columns: [cols[0]] };
    nodes.push({ diagram: "d-all", table: t, x: (i % 8) * 280, y: Math.floor(i / 8) * 220, foldMode: "NONE" });
  }
  return stateOf(model, { diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }], nodes });
}

/** EventSource 가짜 — 시험이 이벤트를 직접 보낸다(SSE 훅 시험·화면 시험 공용). */
export class FakeEventSource {
  static all: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    const e = { data: data === undefined ? "" : JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

const OK_RIGHT = { ok: true, reason: null } as const;

/**
 * 패널·캔버스 시험용 편집 문맥(FE2·FE3 공용). apply 는 vi.fn 이고 기본은 반영(rev+1)이다. over 로 칸을 바꾼다.
 * 예: fakeEditContext(s, { apply: vi.fn(async () => ({ ok: false, notice })) }).
 */
export function fakeEditContext(state: ErdState, over: Partial<ErdEditContext> = {}): ErdEditContext {
  const applied: ApplyOutcome = { ok: true, rev: state.rev + 1, warnings: [] };
  return {
    modelId: state.modelId, session: "ui-test0001", me: "tester", state, status: null,
    rights: { model: OK_RIGHT, diagram: OK_RIGHT, confirm: OK_RIGHT, manageEditors: OK_RIGHT, owner: true },
    diagramId: Object.keys(state.diagrams)[0] ?? null, selectedTableId: null, selectedColumnId: null, highlight: null,
    pendingIds: new Set<string>(),
    apply: vi.fn(async () => applied),
    exclusive: (<T,>(fn: () => Promise<T>) => fn()) as ErdEditContext["exclusive"],
    clearHighlight: vi.fn(), notify: vi.fn(),
    nav: { selectTable: vi.fn(), selectColumn: vi.fn(), openTableFind: vi.fn(), openColumnJump: vi.fn() },
    audit: { show: false, setShow: vi.fn() },
    ...over,
  };
}
