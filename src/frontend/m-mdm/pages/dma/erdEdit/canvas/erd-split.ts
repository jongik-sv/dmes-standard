/**
 * 주제별 나누기(순수, U52) — 표 물리명 앞 토막으로 표를 5-20개씩 묶고, 묶음마다 다이어그램 명령(addDiagram + placeTables)을 만든다.
 * 서버 변경 없이 기존 명령만 쓴다. 같은 입력이면 같은 결과다(입력 순서와 무관: 먼저 물리명 순으로 고른다).
 *
 * 묶는 규칙: (1) 열쇠 = 물리명에서 모델 접두(TB_<X>_)를 뺀 첫 토막. (2) 20개를 넘는 묶음은 그 안 관계 연결 덩어리로 나누고, 덩어리가
 * 20개를 넘으면 물리명 순으로 20개 이하의 고른 조각으로 자른다(21개 = 11 + 10, 이름 `SEC 1`·`SEC 2`). (3) 5개 미만 묶음은 관계가 걸린 다른 묶음에 붙인다(합쳐 20 이하일 때만).
 * 붙일 곳이 없으면 "기타" 로 모아 20개씩 자른다. (4) 결과는 이름순이다(끝 숫자는 수로 겨룬다).
 */
import type { ErdCommandJson, ErdModelJson, ErdState } from "../types";
import { MAX_BATCH, nextSortSeq, tablePrefix, wizardCommands } from "./erd-commands";
import { components, estimatedSize, keyColumns, layoutTables, relationEdges, type Size } from "./erd-layout";

export interface SubjectGroup {
  /** 묶음을 가리키는 값(이름과 같고, 한 결과 안에서 겹치지 않는다). 화면 testid 에 쓴다. 기타 묶음 키는 "기타" 로 시작한다. */
  key: string;
  /** 다이어그램 이름. */
  name: string;
  /** 표 id(물리명 순). */
  tables: string[];
}

const OTHER = "기타";
const DEFAULT_MIN = 5;
const DEFAULT_MAX = 20;

/** 짧은 문자열 비교 — 로캘에 따라 달라지지 않게 코드 단위 순서로 한다. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 표의 주제 열쇠. 모델 접두로 시작하면 그것을 빼고, 아니면 `TB_` 만 뺀다. 첫 토막이 비면 물리명 그대로. */
function subjectKey(phys: string, prefix: string): string {
  const rest = prefix && phys.startsWith(prefix) ? phys.slice(prefix.length) : phys.replace(/^TB_/, "");
  return rest.split("_")[0] || phys;
}

/** 번호를 매긴 이름 — 조각이 하나뿐이면 번호를 붙이지 않는다. */
const numbered = (base: string, n: number, total: number): string => (total > 1 ? `${base} ${n}` : base);

/** 이름 비교 — 끝의 숫자는 수로 겨룬다("SEC 2" < "SEC 10"). 나머지는 코드 단위 순서. */
function cmpName(a: string, b: string): number {
  const pa = a.split(/(\d+)/);
  const pb = b.split(/(\d+)/);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    if (i % 2 === 1) {
      const d = Number(pa[i]) - Number(pb[i]);
      if (d !== 0) return d;
    }
    return cmp(pa[i], pb[i]);
  }
  return pa.length - pb.length;
}

/** 목록(물리명 순)을 max 개 이하의 고른 조각으로 자른다(21개 = 11 + 10). 앞 조각이 하나 더 많을 수 있다. */
function chunk<T>(list: readonly T[], max: number): T[][] {
  const n = Math.ceil(list.length / max);
  const base = Math.floor(list.length / n);
  const extra = list.length % n;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(list.slice(at, at + size));
    at += size;
  }
  return out;
}

export function subjectGroups(
  model: ErdModelJson, tables: readonly string[], opt: { min?: number; max?: number } = {},
): SubjectGroup[] {
  const min = opt.min ?? DEFAULT_MIN;
  const max = opt.max ?? DEFAULT_MAX;
  const byPhys = (a: string, b: string): number => cmp(model.tables[a].phys, model.tables[b].phys) || cmp(a, b);
  const ids = [...new Set(tables)].filter((t) => model.tables[t]).sort(byPhys);
  if (ids.length === 0) return [];
  const prefix = tablePrefix(model);
  const edges = relationEdges(model, new Set(ids));

  // (1) 열쇠로 모은다(열쇠 순).
  const byKey = new Map<string, string[]>();
  for (const id of ids) {
    const key = subjectKey(model.tables[id].phys, prefix);
    const list = byKey.get(key);
    if (list) list.push(id);
    else byKey.set(key, [id]);
  }

  // (2) 큰 묶음 나누기 — 관계 덩어리를 큰 것부터 담고(덩어리가 max 를 넘으면 물리명 순으로 자른다), 더 담을 수 없으면 새 조각.
  const groups: { name: string; tables: string[] }[] = [];
  for (const key of [...byKey.keys()].sort(cmp)) {
    const members = byKey.get(key)!;
    if (members.length <= max) {
      groups.push({ name: key, tables: members });
      continue;
    }
    const set = new Set(members);
    const comps = components(members, edges.filter((e) => set.has(e.source) && set.has(e.target)))
      .sort((a, b) => b.length - a.length || byPhys(a[0], b[0]));
    const bins: string[][] = [];
    for (const comp of comps) {
      if (comp.length > max) {
        for (const part of chunk(comp, max)) bins.push(part);
        continue;
      }
      const bin = bins.find((b) => b.length + comp.length <= max);
      if (bin) bin.push(...comp);
      else bins.push([...comp]);
    }
    bins.forEach((bin, i) => groups.push({ name: numbered(key, i + 1, bins.length), tables: bin.sort(byPhys) }));
  }

  // (3) 작은 묶음 붙이기 — 작은 것부터(같으면 이름순), 관계가 걸린 묶음 중 가장 많은 쪽(같으면 이름순)에 합쳐 max 이하일 때만 붙인다.
  const owner = new Map<string, number>();
  const live = new Set<number>();
  groups.forEach((g, i) => {
    live.add(i);
    for (const t of g.tables) owner.set(t, i);
  });
  const smalls = groups.map((_, i) => i).filter((i) => groups[i].tables.length < min)
    .sort((a, b) => groups[a].tables.length - groups[b].tables.length || cmp(groups[a].name, groups[b].name));
  for (const a of smalls) {
    if (!live.has(a) || groups[a].tables.length >= min) continue;
    const links = new Map<number, number>();
    for (const e of edges) {
      const s = owner.get(e.source)!;
      const t = owner.get(e.target)!;
      if (s === t) continue;
      if (s === a) links.set(t, (links.get(t) ?? 0) + 1);
      else if (t === a) links.set(s, (links.get(s) ?? 0) + 1);
    }
    const target = [...links.entries()]
      .filter(([b]) => live.has(b) && groups[a].tables.length + groups[b].tables.length <= max)
      .sort(([ba, na], [bb, nb]) => nb - na || cmp(groups[ba].name, groups[bb].name))[0];
    if (!target) continue;
    const b = target[0];
    groups[b].tables = [...groups[b].tables, ...groups[a].tables].sort(byPhys);
    for (const t of groups[a].tables) owner.set(t, b);
    live.delete(a);
  }

  // 붙일 곳이 없는 작은 묶음은 "기타" 로 모아 물리명 순 max 개씩.
  const kept: { name: string; tables: string[] }[] = [];
  const rest: string[] = [];
  groups.forEach((g, i) => {
    if (!live.has(i)) return;
    if (g.tables.length < min) rest.push(...g.tables);
    else kept.push(g);
  });
  const others = chunk(rest.sort(byPhys), max);
  others.forEach((tablesOf, i) => kept.push({ name: numbered(OTHER, i + 1, others.length), tables: tablesOf }));

  // (4) 이름순.
  return kept.sort((a, b) => cmpName(a.name, b.name)).map((g) => ({ key: g.name, name: g.name, tables: g.tables }));
}

/**
 * 묶음마다 wizardCommands 모양(addDiagram + placeTables). 표 자리는 2-D 배치(layoutTables, aspect = 캔버스 가로/세로 비)다.
 * sortSeq 는 지금 다이어그램 다음 번호부터 묶음 순서대로 올린다. 한 배열이 MAX_BATCH 를 넘지 않게 묶음 단위로 나눈다
 * (addDiagram 과 그 placeTables 는 늘 같은 배열 — 뒤 명령이 앞 명령이 만든 id 를 쓴다).
 */
export function splitCommands(
  state: ErdState, groups: readonly SubjectGroup[], areaName: string, newId: () => string, showAudit: boolean, aspect: number,
): ErdCommandJson[][] {
  const model = state.model;
  const keys = keyColumns(model);
  const size = (id: string): Size => estimatedSize(model, id, "NONE", keys, showAudit);
  let seq = nextSortSeq(state.diagrams);
  const out: ErdCommandJson[][] = [];
  let cur: ErdCommandJson[] = [];
  for (const g of groups) {
    const pos = layoutTables(model, g.tables, size, undefined, aspect);
    const nodes = g.tables.filter((t) => pos[t]).map((table) => ({ table, x: pos[table].x, y: pos[table].y }));
    const cmds = wizardCommands({ id: newId(), areaName, diagramName: g.name, sortSeq: seq++, nodes });
    if (cur.length > 0 && cur.length + cmds.length > MAX_BATCH) {
      out.push(cur);
      cur = [];
    }
    cur.push(...cmds);
  }
  if (cur.length > 0) out.push(cur);
  return out;
}
