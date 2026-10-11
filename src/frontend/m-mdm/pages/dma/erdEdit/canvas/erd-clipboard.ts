/**
 * ERD 공용 클립보드(2차 c3) — 화면 안 메모리 한 칸. 캔버스 표 복사(⌘/Ctrl+C·V)가 쓰고, 컬럼 복사(erd2-panels p7)도 같은 칸을 쓴다.
 * 브라우저 시스템 클립보드는 쓰지 않는다(권한·형식 문제). 같은 탭 안에서만 산다. 같은 모델 안에서만 붙인다(다른 모델이면 거절 글).
 * - 표 묶음(kind "tables"): 고른 표의 표·컬럼(감사 컬럼 포함)·키·고른 표끼리 관계·다이어그램 자리를 복사한 값.
 *   붙이기 = 새 id·새 물리명(`<원래>_COPY`, 겹치면 `_COPY2`…)·논리명 「… 복사」로 만드는 명령 한 묶음(되돌리기 1번).
 * - 컬럼 묶음(kind "columns"): 모양만 정한다. 만들고 붙이는 일은 p7 몫이다.
 * 순수 함수 + 모듈 칸 하나. React 상태가 아니라 복사해도 다시 그리지 않는다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import { nodeKey } from "../state/model-delta";
import type { ErdColumn, ErdCommandJson, ErdKey, ErdModelJson, ErdRelation, ErdState, ErdTable } from "../types";
import { MAX_BATCH, PLACE_GRID } from "./erd-commands";

export interface ClipTable {
  id: string;
  table: ErdTable;
  /** columnOrder 순서. 감사 컬럼도 든다(붙일 때 addTable audit:false 로 원래 모양을 그대로 만든다). */
  columns: { id: string; column: ErdColumn }[];
  keys: { id: string; key: ErdKey }[];
  /** 복사한 다이어그램의 자리. 그 다이어그램에 없던 표면 null. */
  at: FlowPos | null;
}

export interface ErdTablesClip {
  kind: "tables";
  modelId: string;
  tables: ClipTable[];
  /** 고른 표끼리(부모·자식 모두 고른 표)인 관계. 기각·추정·다른 모델 부모는 뺀다. */
  relations: { id: string; relation: ErdRelation }[];
}

/** 컬럼 묶음(p7). 붙이는 규칙은 p7 이 정한다. */
export interface ErdColumnsClip {
  kind: "columns";
  modelId: string;
  /** 복사한 표 id. */
  table: string;
  columns: { id: string; column: ErdColumn }[];
}

export type ErdClip = ErdTablesClip | ErdColumnsClip;

let clip: ErdClip | null = null;
/** 같은 묶음을 마우스 자리 없이 거듭 붙인 횟수(원래 자리 + 간격 × 횟수). 새로 복사하면 0. */
let pasteCount = 0;

export function writeClip(next: ErdClip): void {
  clip = next;
  pasteCount = 0;
}

export function readClip(): ErdClip | null {
  return clip;
}

export function clearClip(): void {
  clip = null;
  pasteCount = 0;
}

const deep = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 고른 표(모델에 있는 것만)를 표 묶음으로 복사한다. 고른 표가 없으면 null. diagramId 는 자리를 읽을 다이어그램. */
export function copyTables(state: ErdState, diagramId: string | null, tableIds: readonly string[]): ErdTablesClip | null {
  const m = state.model;
  const ids = [...new Set(tableIds)].filter((t) => m.tables[t]);
  if (ids.length === 0) return null;
  const picked = new Set(ids);
  const tables = ids.map((t): ClipTable => {
    const table = m.tables[t];
    const node = diagramId ? state.nodes[nodeKey(diagramId, t)] : undefined;
    return {
      id: t,
      table: deep(table),
      columns: table.columnOrder.filter((c) => m.columns[c]).map((c) => ({ id: c, column: deep(m.columns[c]) })),
      keys: Object.entries(m.keys).filter(([, k]) => k.table === t).map(([id, k]) => ({ id, key: deep(k) })),
      at: node ? { x: node.x, y: node.y } : null,
    };
  });
  const relations = Object.entries(m.relations)
    .filter(([, r]) => (r.state === "CONFIRMED" || r.state === "DB") && r.parentRef == null && picked.has(r.child) && picked.has(r.parent))
    .map(([id, r]) => ({ id, relation: deep(r) }));
  return { kind: "tables", modelId: state.modelId, tables, relations };
}

const ORACLE_MAX = 128;

/** `<base>_COPY`, 겹치면 `_COPY2`, `_COPY3`… 128자를 넘으면 앞을 줄인다. taken 에 없는 첫 이름. */
export function copyName(base: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const tail = n === 1 ? "_COPY" : `_COPY${n}`;
    const name = base.slice(0, ORACLE_MAX - tail.length) + tail;
    if (!taken.has(name)) return name;
  }
}

/** 논리명 「… 복사」. 비어 있으면 빈 글. */
export function copyLogical(logical: string): string {
  return logical ? `${logical} 복사` : "";
}

/** 키 이름 — 원래 이름 안의 옛 표 물리명을 새 물리명으로 바꾸고, 없거나 겹치면 `_COPY…` 를 붙인다. */
function keyName(name: string, oldPhys: string, newPhys: string, taken: ReadonlySet<string>): string {
  const swapped = name.includes(oldPhys) ? name.split(oldPhys).join(newPhys) : name;
  if (swapped !== name && swapped.length <= ORACLE_MAX && !taken.has(swapped)) return swapped;
  return copyName(name, taken);
}

/** 붙이기 자리를 마우스 없이 정할 때 원래 자리에서 띄우는 간격(px). */
export const PASTE_GAP = 40;

export interface PastePlan {
  commands: ErdCommandJson[];
  /** 새 표 id(원래 표 순서). */
  tableIds: string[];
  /** 붙이지 못한 이유. 있으면 commands 는 빈 목록. */
  error: string | null;
}

export interface PasteInput {
  model: ErdModelJson;
  modelId: string;
  clip: ErdTablesClip;
  diagramId: string;
  /** 묶음 왼쪽 위를 둘 자리(마우스). null 이면 원래 자리 + 간격. */
  at: FlowPos | null;
  /** 마우스 없이 거듭 붙인 차례(1부터). 간격 × 차례만큼 띄운다. */
  round?: number;
  newId: (prefix: "t" | "c" | "k" | "r") => string;
}

const snap = (v: number): number => Math.round(v / PLACE_GRID) * PLACE_GRID;

/**
 * 표 묶음 → 붙이기 명령 한 묶음. 순서 = 표 → 컬럼 → PK → UK·IX → 관계(+카디널리티) → 다이어그램에 놓기.
 * 관계는 pairs 를 실어 서버가 컬럼을 새로 만들지 않게 한다. dbFk(DB FK 로 만들 관계인가)는 원래 값을 따른다.
 */
export function pasteTablesPlan(i: PasteInput): PastePlan {
  const { model, clip } = i;
  if (clip.modelId !== i.modelId) return { commands: [], tableIds: [], error: "다른 모델에서 복사한 표는 붙일 수 없습니다." };
  const physTaken = new Set(Object.values(model.tables).map((t) => t.phys));
  const keyTaken = new Set(Object.values(model.keys).map((k) => k.name));
  const tableMap = new Map<string, string>();
  const colMap = new Map<string, string>();
  const commands: ErdCommandJson[] = [];
  const keyCmds: ErdCommandJson[] = [];

  for (const ct of clip.tables) {
    const id = i.newId("t");
    tableMap.set(ct.id, id);
    const phys = copyName(ct.table.phys, physTaken);
    physTaken.add(phys);
    commands.push({ op: "addTable", id, phys, logical: copyLogical(ct.table.logical), comment: ct.table.comment ?? "", audit: false });
    // 맨 앞(position 0)에 거꾸로 넣어 원래 순서를 그대로 만든다. 끝에 넣으면 서버가 감사 컬럼 블록 앞으로 끼워 순서가 바뀔 수 있다.
    for (const { id: oldCol } of ct.columns) colMap.set(oldCol, i.newId("c"));
    for (const { id: oldCol, column: c } of [...ct.columns].reverse()) {
      commands.push({
        op: "addColumn", id: colMap.get(oldCol)!, table: id, phys: c.phys, logical: c.logical, domainId: c.domainId, dataType: c.dataType,
        length: c.length, scale: c.scale, notNull: c.notNull, defaultValue: c.default, comment: c.comment ?? "", position: 0,
      });
    }
    for (const { key: k } of [...ct.keys].sort((a, b) => (a.key.kind === "PK" ? -1 : 0) - (b.key.kind === "PK" ? -1 : 0))) {
      const cols = k.columns.map((c) => colMap.get(c)).filter((c): c is string => !!c);
      if (cols.length === 0) continue;
      const name = keyName(k.name || `${k.kind}_${phys}`, ct.table.phys, phys, keyTaken);
      keyTaken.add(name);
      keyCmds.push(k.kind === "PK"
        ? { op: "setPrimaryKey", table: id, columns: cols, name }
        : { op: "addKey", id: i.newId("k"), table: id, kind: k.kind, name, columns: cols });
    }
  }
  commands.push(...keyCmds);

  for (const { relation: r } of clip.relations) {
    const child = tableMap.get(r.child);
    const parent = tableMap.get(r.parent);
    const pairs = r.pairs.map(([c, p]) => [colMap.get(c), colMap.get(p)]);
    // pairs 가 비면 서버가 부모 PK 로 컬럼을 새로 만든다 — 원래와 다른 모양이 되므로 붙이지 않는다.
    if (!child || !parent || pairs.length === 0 || pairs.some(([c, p]) => !c || !p)) continue;
    const id = i.newId("r");
    commands.push({ op: "addRelation", id, child, parent, identifying: r.identifying, pairs, onNameClash: "REUSE", dbFk: r.dbFk });
    if (r.cardinality.parent !== "ONE" || r.cardinality.child !== "ZERO_OR_MORE") {
      commands.push({ op: "updateRelation", id, set: { cardinality: { ...r.cardinality } } });
    }
  }

  // 자리 — 마우스 자리면 묶음 왼쪽 위를 그 자리에, 아니면 원래 자리 + 간격 × 차례. 자리가 없던 표는 묶음 오른쪽 아래로 늘어놓는다.
  const known = clip.tables.filter((t) => t.at);
  const minX = known.length ? Math.min(...known.map((t) => t.at!.x)) : 0;
  const minY = known.length ? Math.min(...known.map((t) => t.at!.y)) : 0;
  const round = Math.max(1, i.round ?? 1);
  const dx = i.at ? i.at.x - minX : PASTE_GAP * round;
  const dy = i.at ? i.at.y - minY : PASTE_GAP * round;
  let spare = 0;
  const nodes = clip.tables.map((t) => {
    const base = t.at ?? { x: minX + spare * PASTE_GAP, y: minY + (spare++) * PASTE_GAP };
    return { table: tableMap.get(t.id)!, x: snap(base.x + dx), y: snap(base.y + dy) };
  });
  commands.push({ op: "placeTables", diagram: i.diagramId, nodes });

  if (commands.length > MAX_BATCH) {
    return { commands: [], tableIds: [], error: `한 번에 붙일 수 있는 명령은 ${MAX_BATCH}개입니다. 표를 나눠 복사하세요.` };
  }
  return { commands, tableIds: clip.tables.map((t) => tableMap.get(t.id)!), error: null };
}

/** 마우스 없이 붙일 차례를 하나 올리고 돌려준다(1부터). */
export function nextPasteRound(): number {
  pasteCount += 1;
  return pasteCount;
}
