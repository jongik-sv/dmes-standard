// 이름 → 요소 id 해석과 요소 이름표(README "MCP·CLI", S2-22). MCP apply 와 CLI apply 가 같이 쓴다.
// 순수 함수다 — 네트워크·파일을 쓰지 않는다. view 는 OASIS erdEdit view 응답(ErdModelView: model 은 MODEL_JSON 문자열,
// diagrams 는 다이어그램 목록)이다. 이미 읽은 모델 JSON 을 줘도 된다(다이어그램 이름은 view 에만 있다).
// baseRev 는 여기서 정하지 않는다. 이름을 풀려고 읽은 view 의 rev 를 baseRev 로 쓰면 충돌 검사가 꺼진다(S2-22).
import { randomUUID } from "node:crypto";
import { findDiagram } from "./model-text.mjs";

/** 서버 ErdIds 의 요소 id 규칙. */
export const ELEMENT_ID = /^[a-z]-[0-9a-zA-Z-]{1,48}$/;
const NEAR = 5;
/** setRoute points 개수 상한(서버 MAX_POINTS). */
const MAX_ROUTE_POINTS = 50;

/** 새 요소 id. prefix 는 "t-"·"c-"·"k-"·"r-"·"d-". randomUUID 는 36글자라 규칙의 48글자 안이다. */
export function newId(prefix) {
  return `${prefix}${randomUUID()}`;
}

const parsed = new WeakMap();

/** view(또는 모델 JSON) → { info, tables, columns, keys, relations }. 같은 view 객체는 한 번만 읽는다. */
export function modelOf(view) {
  if (view && typeof view === "object" && parsed.has(view)) return parsed.get(view);
  let m = view ?? {};
  if (typeof m.model === "string") m = JSON.parse(m.model);
  else if (!m.tables && m.model && typeof m.model === "object") m = m.model;
  const out = { info: m.model ?? {}, tables: m.tables ?? {}, columns: m.columns ?? {}, keys: m.keys ?? {}, relations: m.relations ?? {} };
  if (view && typeof view === "object") parsed.set(view, out);
  return out;
}

const up = (s) => String(s).trim().toUpperCase();
/** 앞의 '스키마.' 를 뗀다(점이 하나 남을 때만): MCMAPUSER.TB_X → TB_X. */
const dropSchema = (s) => s.replace(/^[A-Z0-9_$#]+\.(?=[^.]+$)/, "");
const isId = (v, prefix) => typeof v === "string" && v.startsWith(prefix) && ELEMENT_ID.test(v);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 가까운 이름: key 를 품은 이름, 없으면 key 가 품은 이름. 5개까지. */
function nearOf(names, key) {
  const k = key.replace(/\*+$/, "");
  const inside = names.filter((n) => n.includes(k));
  return (inside.length ? inside : names.filter((n) => k.includes(n))).sort().slice(0, NEAR);
}

function colsText(m, ids) {
  const names = ids.map((id) => m.columns[id]?.phys ?? "?");
  return names.length === 1 ? names[0] : `(${names.join(", ")})`;
}

/** 관계 글. getModelText 의 Ref 줄과 같은 모양: 자식표.컬럼 > 부모표.컬럼, 복합은 (A, B), 다른 모델 부모는 @모델. */
export function relText(m, r) {
  const pairs = r.pairs ?? [];
  const child = `${m.tables[r.child]?.phys ?? "?"}.${colsText(m, pairs.map((p) => p[0]))}`;
  const parent = r.parentRef ? `@${r.parentRef.model}` : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, pairs.map((p) => p[1]))}`;
  return `${child} > ${parent}`;
}

/** 이름 찾기 색인. 묶음 안에서 새로 만든 표·컬럼·키·다이어그램을 더하므로 부를 때마다 새로 만든다. */
function indexOf(view) {
  const m = modelOf(view);
  const tables = new Map(); // 물리명(대문자) → 표 id
  const tablePhys = new Map(); // 표 id → 물리명
  for (const [id, t] of Object.entries(m.tables)) {
    tables.set(up(t.phys), id);
    tablePhys.set(id, t.phys);
  }
  const columns = new Map(); // "표.컬럼"(대문자) → 컬럼 id
  for (const [id, c] of Object.entries(m.columns)) {
    const tp = tablePhys.get(c.table);
    if (tp != null) columns.set(`${up(tp)}.${up(c.phys)}`, id);
  }
  const keys = new Map(); // 키 이름(대문자) → 키 id 목록
  const pks = new Map(); // 표 id → PK id
  for (const [id, k] of Object.entries(m.keys)) {
    if (k.name) keys.set(up(k.name), [...(keys.get(up(k.name)) ?? []), id]);
    if (k.kind === "PK") pks.set(k.table, id);
  }
  // m 은 modelOf 가 캐시한 객체라 같은 묶음의 새 요소(remember)를 더하려면 복사본이어야 한다.
  const mine = { ...m, tables: { ...m.tables }, columns: { ...m.columns }, relations: { ...m.relations } };
  return { view: { ...(view ?? {}), diagrams: [...(view?.diagrams ?? [])] }, m: mine, tables, tablePhys, columns, keys, pks, pairless: new Set() };
}

function table(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "표 물리명이나 t- id 가 비었습니다", near: [] };
  if (isId(value, "t-")) return { id: value };
  const key = dropSchema(up(value));
  const id = ix.tables.get(key);
  return id ? { id } : { error: "없는 표입니다", near: nearOf([...ix.tables.keys()], key) };
}

function column(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "컬럼 \"표.컬럼\" 이나 c- id 가 비었습니다", near: [] };
  if (isId(value, "c-")) return { id: value };
  const parts = up(value).split(".");
  if (parts.length === 3) parts.shift(); // 스키마.표.컬럼
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: "컬럼은 \"표.컬럼\" 또는 c- id 로 씁니다", near: [] };
  const [t, c] = parts;
  const id = ix.columns.get(`${t}.${c}`);
  if (id) return { id };
  if (!ix.tables.has(t)) return { error: `없는 표입니다(${t})`, near: nearOf([...ix.tables.keys()], t) };
  const inTable = [...ix.columns.keys()].filter((k) => k.startsWith(`${t}.`)).map((k) => k.slice(t.length + 1));
  const near = nearOf(inTable, c);
  return { error: "없는 컬럼입니다", near: (near.length ? near : inTable.sort().slice(0, NEAR)).map((x) => `${t}.${x}`) };
}

/** 관계 글 한쪽: "표.컬럼" | "표.(A, B)" | "@모델". 못 읽으면 null. */
function side(text) {
  const s = up(text);
  if (s.startsWith("@")) return s.length > 1 ? { model: s.slice(1).trim() } : null;
  const mt = /^(.+?)\.(?:\(([^)]*)\)|([^.()]+))$/.exec(s);
  if (!mt) return null;
  const cols = (mt[2] ?? mt[3]).split(",").map((x) => x.trim()).filter(Boolean);
  return cols.length ? { table: dropSchema(mt[1].trim()), cols } : null;
}

const PAIRLESS_HINT = "addRelation 에 pairs 를 주거나 r- id 로 가리키세요";

function relation(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "관계 글이나 r- id 가 비었습니다", near: [] };
  if (isId(value, "r-")) return { id: value };
  // getModelText 의 Ref 줄("Ref 자식.컬럼 > 부모.컬럼 상태 (근거, ...)")을 그대로 붙여도 된다: 앞의 Ref 와 뒤의 상태·근거를 뗀다.
  const text = value
    .trim()
    .replace(/^Ref\s+/i, "")
    .replace(/\s+[A-Z][A-Z_]*(?:\s*\(.*\))?\s*$/, "");
  const at = text.indexOf(">");
  const child = at > 0 ? side(text.slice(0, at)) : null;
  const parent = at > 0 ? side(text.slice(at + 1)) : null;
  if (!child || child.model || !parent) {
    return { error: "관계는 \"자식표.컬럼 > 부모표.컬럼\"(복합은 \"자식표.(A, B) > 부모표.(A, B)\") 또는 r- id 로 씁니다", near: [] };
  }
  const { m } = ix;
  const ph = (cid) => up(m.columns[cid]?.phys ?? "?");
  const tp = (tid) => up(m.tables[tid]?.phys ?? "?");
  const hits = Object.entries(m.relations).filter(([, r]) => {
    const pairs = r.pairs ?? [];
    if (tp(r.child) !== child.table || !sameList(pairs.map((p) => ph(p[0])), child.cols)) return false;
    if (parent.model) return up(r.parentRef?.model ?? "") === parent.model;
    if (r.parentRef) return false;
    return tp(r.parent) === parent.table && sameList(pairs.map((p) => ph(p[1])), parent.cols);
  });
  if (hits.length === 1) return { id: hits[0][0] };
  if (hits.length > 1) {
    return { error: "같은 글의 관계가 여러 개입니다. r- id 로 고르세요", near: hits.map(([id, r]) => `${id}(${r.state})`).sort() };
  }
  const near = Object.entries(m.relations)
    .filter(([, r]) => tp(r.child) === child.table)
    .map(([id, r]) => `${id} ${relText(m, r)}`)
    .sort()
    .slice(0, NEAR);
  // 같은 묶음의 addRelation 이 pairs 없이 와서 색인하지 못한 관계가 있으면 그 탓일 수 있다 — 안내를 덧붙인다.
  if (ix.pairless.size) near.push(PAIRLESS_HINT);
  return { error: "없는 관계입니다", near };
}

function key(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "키 이름, \"표:PK\", k- id 가 비었습니다", near: [] };
  if (isId(value, "k-")) return { id: value };
  const s = up(value);
  const pk = /^(.+):PK$/.exec(s);
  if (pk) {
    const t = table(ix, pk[1]);
    if (t.error) return t;
    const id = ix.pks.get(t.id);
    return id ? { id } : { error: `${pk[1]} 에 PK 가 없습니다`, near: [] };
  }
  const ids = ix.keys.get(s) ?? [];
  if (ids.length === 1) return { id: ids[0] };
  if (ids.length > 1) return { error: "같은 이름의 키가 여러 개입니다. k- id 로 고르세요", near: [...ids].sort() };
  return { error: "없는 키입니다", near: nearOf([...ix.keys.keys()], s) };
}

function diagram(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "다이어그램 이름이나 d- id 가 비었습니다", near: [] };
  if (isId(value, "d-")) return { id: value };
  try {
    return { id: findDiagram(ix.view, value).id };
  } catch (e) {
    return { error: e.message, near: [] };
  }
}

/** 새 요소를 만드는 명령과 id 앞글자. id 를 주지 않으면 newId 로 만든다. */
const NEW_PREFIX = { addTable: "t-", addColumn: "c-", addKey: "k-", addRelation: "r-", addDiagram: "d-", copyDiagram: "d-" };
/** 기존 요소를 id 칸으로 가리키는 명령과 그 요소 종류. */
const ID_OF = {
  updateTable: table, deleteTable: table,
  updateColumn: column, moveColumn: column, deleteColumn: column, applyDomain: column,
  updateKey: key, deleteKey: key,
  updateRelation: relation, confirmRelation: relation, rejectRelation: relation, deleteRelation: relation,
  updateDiagram: diagram, deleteDiagram: diagram,
};

/**
 * 해석한 새 요소를 색인에 더한다. 같은 묶음의 뒤 명령이 물리명으로 가리킬 수 있다.
 * 같은 묶음의 addRelation 도 색인에 든다 — 뒤 명령이 "자식표.컬럼 > 부모표.컬럼" 으로 가리킬 수 있다.
 * 알려진 한계: 같은 묶음 안의 이름 바꾸기(set.phys·updateDiagram 의 이름), setPrimaryKey 는 색인에 반영하지 않는다.
 * 그런 것은 id 로 가리키거나 묶음을 나눈다.
 */
function remember(ix, cmd) {
  if (cmd.op === "addTable" && typeof cmd.phys === "string") {
    ix.tables.set(up(cmd.phys), cmd.id);
    ix.tablePhys.set(cmd.id, cmd.phys);
    // 의도적으로 최소 항목이다 — 이름 해석(table·column·relText)이 읽는 phys 만 있다. logical·schema·PK/키 정보·컬럼 목록은 없으므로
    // 소비자(table(), column(), relText, describeTargets)는 phys 외의 값에 기대면 안 된다. 필요한 값이 늘면 여기서 함께 채운다.
    ix.m.tables[cmd.id] = { phys: cmd.phys };
  } else if (cmd.op === "addColumn" && typeof cmd.phys === "string") {
    const tp = ix.tablePhys.get(cmd.table);
    if (tp != null) ix.columns.set(`${up(tp)}.${up(cmd.phys)}`, cmd.id);
    ix.m.columns[cmd.id] = { table: cmd.table, phys: cmd.phys };
  } else if (cmd.op === "addRelation" && typeof cmd.id === "string") {
    // 관계 글("자식.컬럼 > 부모.컬럼")로 가리킬 수 있게 이름 해석용 최소 항목을 넣는다(pairs 는 이미 컬럼 id 로 풀린 값).
    // pairs 가 없거나 비면 글이 "자식. > 부모." 꼴이라 글로는 못 가리킨다 — 색인하지 않고(r- id 로는 가리킬 수 있다) 기억만 해 둔다.
    if (!Array.isArray(cmd.pairs) || cmd.pairs.length === 0) {
      ix.pairless.add(cmd.id);
      return;
    }
    ix.m.relations[cmd.id] = { child: cmd.child, parent: cmd.parent ?? null, pairs: cmd.pairs, parentRef: cmd.parentRef ?? null, state: cmd.state ?? "CONFIRMED" };
  } else if (cmd.op === "addKey" && typeof cmd.name === "string") {
    ix.keys.set(up(cmd.name), [...(ix.keys.get(up(cmd.name)) ?? []), cmd.id]);
    if (cmd.kind === "PK" && typeof cmd.table === "string") ix.pks.set(cmd.table, cmd.id);
  } else if (cmd.op === "addDiagram" || cmd.op === "copyDiagram") {
    ix.view.diagrams.push({ id: cmd.id, areaName: cmd.areaName, diagramName: cmd.diagramName });
  }
}

/**
 * 명령의 이름을 id 로 바꾼다(README "이름 → id 해석" 표).
 * - 표: id(표 명령)·table·child·parent·tables[]·nodes[].table — t- id 또는 물리명(대소문자·앞의 스키마 무시)
 * - 컬럼: id(컬럼 명령)·columns[]·updateKey 의 set.columns[]·pairs[][] — c- id 또는 "표.컬럼". parentRef 가 있으면 pairs 의 부모 쪽은 그대로 둔다
 * - 관계: id(관계 명령) — r- id 또는 "자식표.컬럼 > 부모표.컬럼"
 * - 키: id(키 명령) — k- id, 키 이름, "표:PK"
 * - 다이어그램: diagram·id(다이어그램 명령)·copyDiagram 의 from — d- id, "업무영역/이름", 이름(유일할 때). copyDiagram 의 id 는 새 d- id(빼면 만든다)
 * - 경유점: setRoute 의 diagram·relation, clearRoutes 의 diagram·relations[] — 위의 다이어그램·관계 규칙. 같은 묶음의 addRelation 이 만든 관계도 글로 가리킬 수 있다.
 * id 모양(t-·c-·…)의 값은 있는지 보지 않고 그대로 보낸다. 지운 요소면 서버가 누가 언제 지웠는지 NOT_FOUND 로 알려 준다.
 * 모르는 op 는 고치지 않고 보낸다(서버 ErdStrictReader 가 판정한다).
 * @returns {{ commands: object[], errors: { index: number, field: string, value: string, message: string, near: string[] }[] }}
 */
export function resolveCommands(view, commands, { newId: makeId = newId } = {}) {
  const ix = indexOf(view);
  const out = [];
  const errors = [];
  commands.forEach((src, index) => {
    const cmd = JSON.parse(JSON.stringify(src));
    const before = errors.length;
    const fail = (field, value, r) =>
      errors.push({ index, field, value: typeof value === "string" ? value : JSON.stringify(value), message: r.error, near: r.near ?? [] });
    const fix = (holder, prop, fn, field) => {
      const v = holder[prop];
      if (v === null || v === undefined) return;
      const r = fn(ix, v);
      if (r.error) fail(field, v, r);
      else holder[prop] = r.id;
    };
    const fixList = (list, fn, field) => {
      if (Array.isArray(list)) list.forEach((_, i) => fix(list, i, fn, `${field}[${i}]`));
    };
    const op = cmd.op;
    if (NEW_PREFIX[op]) {
      if (cmd.id === null || cmd.id === undefined) cmd.id = makeId(NEW_PREFIX[op]);
      else if (!isId(cmd.id, NEW_PREFIX[op])) {
        fail("id", cmd.id, { error: `새 요소 id 는 ${NEW_PREFIX[op]} 로 시작하는 id 여야 합니다(빼면 새로 만든다)`, near: [] });
      }
    } else if (ID_OF[op]) fix(cmd, "id", ID_OF[op], "id");
    for (const f of ["table", "child", "parent"]) fix(cmd, f, table, f);
    fixList(cmd.tables, table, "tables");
    if (Array.isArray(cmd.nodes)) cmd.nodes.forEach((n, i) => n && typeof n === "object" && fix(n, "table", table, `nodes[${i}].table`));
    fixList(cmd.columns, column, "columns");
    if (op === "updateKey" && cmd.set && typeof cmd.set === "object") fixList(cmd.set.columns, column, "set.columns");
    if (Array.isArray(cmd.pairs)) {
      cmd.pairs.forEach((p, i) => {
        if (!Array.isArray(p)) return;
        fix(p, 0, column, `pairs[${i}][0]`);
        if (!cmd.parentRef) fix(p, 1, column, `pairs[${i}][1]`);
      });
    }
    fix(cmd, "diagram", diagram, "diagram");
    if (op === "copyDiagram") fix(cmd, "from", diagram, "from"); // README 7.2: 복사 원본
    // 경유점 명령(README 7.1): setRoute 의 relation, clearRoutes 의 relations[] — r- id 또는 "자식표.컬럼 > 부모표.컬럼".
    if (op === "setRoute") {
      if (cmd.relation === null || cmd.relation === undefined) fail("relation", "", { error: "relation 이 필요합니다(관계 글이나 r- id)", near: [] });
      else fix(cmd, "relation", relation, "relation");
      // points 모양은 서버가 INVALID 로 거절하지만, 보내기 전에 칸 이름과 함께 알린다(서버: 1~50개, 정수 x·y).
      const pts = cmd.points;
      if (!Array.isArray(pts) || pts.length < 1 || pts.length > MAX_ROUTE_POINTS) {
        fail("points", pts ?? "", { error: `points 는 정수 x, y 를 가진 점 1~${MAX_ROUTE_POINTS}개의 배열이어야 합니다`, near: [] });
      } else {
        pts.forEach((p, i) => {
          if (!p || typeof p !== "object" || Array.isArray(p) || !Number.isInteger(p.x) || !Number.isInteger(p.y)) {
            fail(`points[${i}]`, p ?? "", { error: "점은 정수 x, y 를 가진 객체여야 합니다(예: {\"x\":120,\"y\":40})", near: [] });
          }
        });
      }
    }
    if (op === "clearRoutes") {
      if (!Array.isArray(cmd.relations)) fail("relations", cmd.relations ?? "", { error: "relations 는 관계 목록(배열)이어야 합니다(관계 글이나 r- id)", near: [] });
      else fixList(cmd.relations, relation, "relations");
    }
    if (errors.length === before) remember(ix, cmd);
    out.push(cmd);
  });
  return { commands: out, errors };
}

/** 표 이름·id 목록 → [{ref, id}] (겹친 표는 한 번). claimTable·releaseTable 이 쓴다. */
export function resolveTables(view, names) {
  const ix = indexOf(view);
  const resolved = [];
  const errors = [];
  names.forEach((ref, index) => {
    const r = table(ix, ref);
    if (r.error) errors.push({ index, field: "tables", value: String(ref), message: r.error, near: r.near ?? [] });
    else if (!resolved.some((x) => x.id === r.id)) resolved.push({ ref, id: r.id });
  });
  return { resolved, errors };
}

/** getChangesSince 의 tables 거르기: 정확한 물리명, 끝이 * 면 접두사, t- id. */
export function pickTableIds(view, names) {
  const ix = indexOf(view);
  const ids = new Set();
  const missing = [];
  for (const raw of names) {
    let hit = isId(raw, "t-");
    if (hit) ids.add(raw);
    const key = dropSchema(up(raw));
    const prefix = key.endsWith("*") ? key.replace(/\*+$/, "") : null;
    for (const [phys, id] of ix.tables) {
      if (prefix !== null ? phys.startsWith(prefix) : phys === key) {
        ids.add(id);
        hit = true;
      }
    }
    if (!hit) missing.push(raw);
  }
  return { ids, missing };
}

/** 델타 한 건이 건드린 표 id. 지운 요소는 m(지우기 전 모델)에서 찾는다. */
export function tablesOfChange(m, ch, changes = []) {
  const v = ch?.value ?? null;
  switch (ch?.kind) {
    case "table":
      return [ch.id];
    case "column":
      return [v?.table ?? m.columns[ch.id]?.table].filter(Boolean);
    case "key":
      return [v?.table ?? m.keys[ch.id]?.table].filter(Boolean);
    case "relation": {
      const r = v ?? m.relations[ch.id];
      return r ? [r.child, r.parent].filter(Boolean) : [];
    }
    case "diagramNode":
      return [String(ch.id).split(":")[1]].filter(Boolean);
    case "diagramRoute": {
      const rid = v?.relation ?? String(ch.id).split(":")[1];
      // 같은 변경 목록에서 새로 만든 관계는 그 upsert 값으로 표를 안다(지운 관계의 연쇄 삭제 경유점은 어느 쪽에도 없어 못 찾는다).
      const made = changes.find((c) => c?.kind === "relation" && c.op === "upsert" && c.id === rid)?.value;
      const r = m.relations[rid] ?? made ?? null;
      return r ? [r.child, r.parent].filter(Boolean) : [];
    }
    default:
      return [];
  }
}

/**
 * 요소 id → 사람이 읽는 이름: 표 "TB_X", 컬럼 "TB_X.COL", 키 "TB_X:PK"·"TB_X:키이름", 관계 "TB_X.COL > TB_Y.COL",
 * 다이어그램 "업무영역/이름", 다이어그램 노드 "업무영역/이름:TB_X", 관계 경유점 "업무영역/이름:자식표.컬럼 > 부모표.컬럼". 모르는 id 는 그대로 둔다.
 * changes(델타의 upsert 값)를 주면 그 값을 먼저 쓴다 — 새로 만든 요소와 이름을 바꾼 요소도 이름이 나온다.
 * @returns {Map<string, string>}
 */
export function describeTargets(view, ids, changes = []) {
  const base = modelOf(view);
  const m = { tables: { ...base.tables }, columns: { ...base.columns }, keys: { ...base.keys }, relations: { ...base.relations } };
  const bucket = { table: "tables", column: "columns", key: "keys", relation: "relations" };
  for (const ch of changes ?? []) {
    if (ch?.op === "upsert" && bucket[ch.kind] && ch.value && typeof ch.value === "object") m[bucket[ch.kind]][ch.id] = ch.value;
  }
  const diagrams = new Map((view?.diagrams ?? []).map((d) => [d.id, `${d.areaName}/${d.diagramName}`]));
  for (const ch of changes ?? []) {
    // 새로 만들거나 이름을 바꾼 다이어그램은 델타 값(areaName·diagramName)으로 덮어쓴다.
    const v = ch?.value;
    if (ch?.op === "upsert" && ch.kind === "diagram" && typeof ch.id === "string" && v && typeof v === "object" && v.diagramName != null) {
      diagrams.set(ch.id, `${v.areaName ?? ""}/${v.diagramName}`);
    }
  }
  const tp = (id) => m.tables[id]?.phys;
  const label = (id) => {
    if (typeof id !== "string") return String(id);
    if (m.tables[id]) return tp(id) ?? id;
    const c = m.columns[id];
    if (c) return `${tp(c.table) ?? "?"}.${c.phys}`;
    const k = m.keys[id];
    if (k) return k.kind === "PK" ? `${tp(k.table) ?? "?"}:PK` : `${tp(k.table) ?? "?"}:${k.name}`;
    const r = m.relations[id];
    if (r) return relText(m, r);
    if (diagrams.has(id)) return diagrams.get(id);
    const node = /^(d-[^:]+):(t-.+)$/.exec(id);
    if (node) return `${diagrams.get(node[1]) ?? node[1]}:${tp(node[2]) ?? node[2]}`;
    const route = /^(d-[^:]+):(r-.+)$/.exec(id);
    if (route) {
      const r = m.relations[route[2]];
      return `${diagrams.get(route[1]) ?? route[1]}:${r ? relText(m, r) : route[2]}`;
    }
    return id;
  };
  return new Map(ids.map((id) => [id, label(id)]));
}
