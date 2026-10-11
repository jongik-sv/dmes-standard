/**
 * 캔버스 편집 명령 만들기(순수). 서버 명령 모양은 단계 0 ErdCommand·ErdDiagramCommand 다. 다이어그램 노드 자리는 정수(Java int)다.
 * 새 요소 id 는 화면이 정한다(조사 A 2.4d) — 같은 묶음의 뒤 명령이 앞 명령이 만든 id 를 쓴다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdDiagram, ErdDiagramNode, ErdFoldMode, ErdModelJson, ErdState } from "../types";

/** save 한 묶음의 명령 수 상한(서버 ErdCommandService). */
export const MAX_BATCH = 200;
/** 새 표를 놓는 격자(px). 캔버스 끌기 격자와 같다. */
export const PLACE_GRID = 10;

export type IdPrefix = "t" | "c" | "k" | "r" | "d";

/** 안전한 문맥이 아니면(http 의 IP 주소 등) randomUUID 가 없다. 그때는 getRandomValues 로 32자리 16진수를 만든다. */
function defaultUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 서버 ErdIds 규칙 ^[a-z]-[0-9a-zA-Z-]{1,48}$ 를 지키는 새 id. */
export function newElementId(prefix: IdPrefix, uuid: () => string = defaultUuid): string {
  return `${prefix}-${uuid()}`;
}

export interface PlacedNode {
  table: string;
  x: number;
  y: number;
}

const snap = (v: number): number => Math.round(v / PLACE_GRID) * PLACE_GRID;

/** 끈 표의 새 자리. 정수로 반올림하고, 자리가 같거나 이 다이어그램에 없는 표는 뺀다. 남는 것이 없으면 null. */
export function moveNodesCommand(diagram: string, moved: readonly PlacedNode[], nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const out: PlacedNode[] = [];
  for (const m of moved) {
    const cur = nodes[nodeKey(diagram, m.table)];
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    if (!cur || (cur.x === x && cur.y === y)) continue;
    out.push({ table: m.table, x, y });
  }
  return out.length > 0 ? { op: "moveNodes", diagram, nodes: out } : null;
}

const placedOnly = (diagram: string, tables: readonly string[], nodes: Readonly<Record<string, ErdDiagramNode>>): string[] =>
  tables.filter((t) => nodes[nodeKey(diagram, t)] !== undefined);

export function removeFromDiagramCommand(diagram: string, tables: readonly string[], nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const list = placedOnly(diagram, tables, nodes);
  return list.length > 0 ? { op: "removeFromDiagram", diagram, tables: list } : null;
}

/** 접기. 이미 그 모드인 표는 뺀다. */
export function setFoldCommand(diagram: string, tables: readonly string[], foldMode: ErdFoldMode, nodes: Readonly<Record<string, ErdDiagramNode>>): ErdCommandJson | null {
  const list = placedOnly(diagram, tables, nodes).filter((t) => nodes[nodeKey(diagram, t)].foldMode !== foldMode);
  return list.length > 0 ? { op: "setFold", diagram, tables: list, foldMode } : null;
}

/** 모델에서 지운다. 딸린 컬럼·키·관계는 서버가 함께 지우고, 되돌리기 한 번으로 모두 돌아온다(단계 0). */
export function deleteTablesCommands(tables: readonly string[]): ErdCommandJson[] {
  return tables.map((id) => ({ op: "deleteTable", id }));
}

export function addTableCommands(i: { id: string; diagram: string; phys: string; logical: string; at: FlowPos }): ErdCommandJson[] {
  return [
    { op: "addTable", id: i.id, phys: i.phys, logical: i.logical, comment: "" },
    { op: "placeTables", diagram: i.diagram, nodes: [{ table: i.id, x: snap(i.at.x), y: snap(i.at.y) }] },
  ];
}

const ORACLE_ID = /^[A-Z][A-Z0-9_$#]{0,127}$/;

/** 새 표 물리명 검사(서버 ErdIds·addTable 과 같은 규칙). 맞으면 null. */
export function tablePhysError(model: ErdModelJson, phys: string): string | null {
  if (!phys) return "물리명을 넣으세요.";
  if (!ORACLE_ID.test(phys)) return "물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).";
  if (Object.values(model.tables).some((t) => t.phys === phys)) return `같은 물리명의 표가 이미 있습니다: ${phys}`;
  return null;
}

const TABLE_PREFIX = /^TB_[A-Z0-9]+_/;

/**
 * 모델의 표 접두(U40·U52 공용). 물리명이 `TB_<X>_` 로 시작하는 표를 세어, 가장 흔한 접두가 표 수의 절반을 넘으면 그것, 아니면 "".
 * 같은 수면 접두 글자순으로 앞선 것을 고른다(같은 모델이면 같은 결과).
 */
export function tablePrefix(model: ErdModelJson): string {
  const tables = Object.values(model.tables);
  const count = new Map<string, number>();
  for (const t of tables) {
    const m = TABLE_PREFIX.exec(t.phys);
    if (m) count.set(m[0], (count.get(m[0]) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [prefix, n] of count) {
    if (n > bestCount || (n === bestCount && prefix < best)) {
      best = prefix;
      bestCount = n;
    }
  }
  return bestCount * 2 > tables.length ? best : "";
}

export type NameClashMode = "ASK" | "REUSE" | "RENAME";

/** 관계 추가. pairs 를 싣지 않으면 서버가 부모 PK 를 자식에 복사하고, 식별이면 자식 PK 에 넣는다(스펙 4.1·D7). */
export function addRelationCommand(i: { id: string; parent: string; child: string; identifying: boolean; onNameClash: NameClashMode }): ErdCommandJson {
  return { op: "addRelation", id: i.id, child: i.child, parent: i.parent, identifying: i.identifying, onNameClash: i.onNameClash };
}

export function nextSortSeq(diagrams: Readonly<Record<string, ErdDiagram>>): number {
  const seqs = Object.values(diagrams).map((d) => d.sortSeq);
  return seqs.length === 0 ? 0 : Math.max(...seqs) + 1;
}

/** 다이어그램 마법사 묶음 — addDiagram 뒤 같은 묶음에서 그 id 로 표를 놓는다. 고른 표가 없으면 addDiagram 만. */
export function wizardCommands(i: { id: string; areaName: string; diagramName: string; sortSeq: number; nodes: readonly PlacedNode[] }): ErdCommandJson[] {
  const out: ErdCommandJson[] = [{ op: "addDiagram", id: i.id, areaName: i.areaName, diagramName: i.diagramName, sortSeq: i.sortSeq }];
  if (i.nodes.length > 0) out.push({ op: "placeTables", diagram: i.id, nodes: i.nodes.map((n) => ({ table: n.table, x: n.x, y: n.y })) });
  return out;
}

/** 요소 id 가 속한 표 — 표·컬럼·키·관계(자식 표)·다이어그램 노드 키("다이어그램:표"). 모르면 null. */
export function tableOfElement(model: ErdModelJson, id: string | null): string | null {
  if (!id) return null;
  if (model.tables[id]) return id;
  const owner = model.columns[id]?.table ?? model.keys[id]?.table ?? model.relations[id]?.child;
  if (owner) return owner;
  const colon = id.indexOf(":");
  if (colon > 0 && model.tables[id.slice(colon + 1)]) return id.slice(colon + 1);
  return null;
}

/** 부모(이 표가 자식인 관계의 부모) 또는 자식 표. 기각·다른 모델 부모·자기 참조는 보지 않는다. 물리명 순. */
export function neighborTables(model: ErdModelJson, tableId: string, dir: "parent" | "child"): string[] {
  const out = new Set<string>();
  for (const r of Object.values(model.relations)) {
    if (r.state === "REJECTED" || r.parentRef != null || r.child === r.parent) continue;
    if (dir === "parent" && r.child === tableId && model.tables[r.parent]) out.add(r.parent);
    if (dir === "child" && r.parent === tableId && model.tables[r.child]) out.add(r.child);
  }
  return [...out].sort((a, b) => model.tables[a].phys.localeCompare(model.tables[b].phys));
}

/** 옮겨 갈 부모·자식 표 — 지금 다이어그램에 놓인 표를 먼저, 없으면 첫 표. */
export function nextNeighbor(state: ErdState, from: string, dir: "parent" | "child", diagramId: string | null): string | null {
  const list = neighborTables(state.model, from, dir);
  const here = diagramId ? list.find((t) => state.nodes[nodeKey(diagramId, t)]) : undefined;
  return here ?? list[0] ?? null;
}

export interface ClashChoice {
  parentColumn: string;
  childColumn: string;
  phys: string;
}

/** NEEDS_CHOICE(onNameClash) 의 choices — 서버 ErdRelationOps 가 [{parentColumn, childColumn, phys}] 로 준다. */
export function parseClashChoices(choices: unknown): ClashChoice[] {
  if (!Array.isArray(choices)) return [];
  return choices.filter((c): c is ClashChoice =>
    !!c && typeof c === "object"
    && typeof (c as ClashChoice).parentColumn === "string"
    && typeof (c as ClashChoice).childColumn === "string"
    && typeof (c as ClashChoice).phys === "string");
}

export type RenameField = "logical" | "phys";

export interface RenamePlan {
  /** 보낼 명령. 값이 같으면 null(고칠 것 없음). */
  command: ErdCommandJson | null;
  /** 받을 수 없는 값의 이유. 있으면 command 는 null. */
  error: string | null;
}

const COLUMN_PHYS = /^[A-Z][A-Z0-9_$#]{0,127}$/;

/**
 * 캔버스 그 자리 편집(2차 c2) — 표 이름(column null) 또는 컬럼 이름 한 칸을 바꾸는 명령. 앞뒤 공백은 뺀다.
 * 물리명은 서버 규칙(대문자 Oracle 이름·같은 모델 표 / 같은 표 컬럼 물리명 겹침 금지)을 먼저 본다. 논리명은 빈 값도 받는다.
 */
export function renameCommand(model: ErdModelJson, table: string, column: string | null, field: RenameField, raw: string): RenamePlan {
  const value = raw.trim();
  const target = column ? model.columns[column] : model.tables[table];
  if (!target) return { command: null, error: null };
  if ((target[field] ?? "") === value) return { command: null, error: null };
  if (field === "phys") {
    if (!value) return { command: null, error: "물리명을 넣으세요." };
    if (!COLUMN_PHYS.test(value)) return { command: null, error: "물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내)." };
    const clash = column
      ? (model.tables[table]?.columnOrder ?? []).some((c) => c !== column && model.columns[c]?.phys === value)
      : Object.entries(model.tables).some(([id, t]) => id !== table && t.phys === value);
    if (clash) return { command: null, error: column ? `같은 표에 같은 물리명의 컬럼이 있습니다: ${value}` : `같은 물리명의 표가 이미 있습니다: ${value}` };
  }
  const set = { [field]: value };
  return { command: column ? { op: "updateColumn", id: column, set } : { op: "updateTable", id: table, set }, error: null };
}
