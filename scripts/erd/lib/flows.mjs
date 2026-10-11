// MCP 쓰기·변경 도구와 CLI 가 함께 쓰는 흐름: view(이름 풀기) → save·restore·execute → 결과 글.
// MCP SDK·zod 를 import 하지 않는다(CLI 가 이 파일을 쓰고, CLI 는 pnpm install 없이 돈다 — S2-23).
// client 는 lib/oasis.mjs 의 createOasisClient 값이다. 요청마다 session·source 는 client 가 싣는다.
// 오류(OasisError·OasisUnreachableError·InputError)는 던진다. 받는 쪽(MCP 처리기·CLI)이 글로 바꾼다.
import { describeTargets, newId, resolveCommands, resolveTables } from "./commands.mjs";
import { tableArgs } from "./model-text.mjs";
import { formatChangesText, formatClaimText, formatResolveErrors, formatWriteResult } from "./results.mjs";

/** 서버 묶음 상한(ErdCommandService 1..200). */
export const MAX_COMMANDS = 200;
/** claimTable·releaseTable 한 번에 다루는 표 수 상한(README MCP 표). */
export const MAX_TABLES = 20;
/** rev 없는 undo 가 내 세션 변경을 찾는 범위(view sinceRev 의 재전송 상한과 같다). */
export const UNDO_SCAN = 500;

/** 입력이 틀렸다(서버를 부르지 않았다). MCP 는 isError 글, CLI 는 사용 오류(종료 코드 2)로 바꾼다. */
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * 프로세스 상태: 모델마다 이 프로세스가 반영한 rev, 되돌렸거나 되돌리기로 만든 rev(건너뛸 것), 잡은 표 id.
 * MCP 서버는 프로세스 동안 하나를 쓰고, CLI 는 명령마다 새로 만든다.
 */
export function newState() {
  return { applied: new Map(), skip: new Map(), claimed: new Map() };
}
const listIn = (map, key) => {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
};
const setIn = (map, key) => {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
};

/** commands 인자(배열 또는 JSON 배열 글) → 명령 배열. LLM 은 배열을 글로 보내기도 한다. */
export function parseCommands(commands) {
  let list = commands;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch (e) {
      throw new InputError(`commands 를 JSON 으로 읽을 수 없습니다: ${e.message}`);
    }
  }
  if (!Array.isArray(list)) throw new InputError("commands 는 명령 객체 배열(또는 그 JSON 글)이어야 합니다");
  if (list.length < 1 || list.length > MAX_COMMANDS) throw new InputError(`명령은 1~${MAX_COMMANDS}개입니다(${list.length}개)`);
  list.forEach((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.op !== "string" || !c.op) {
      throw new InputError(`명령 #${i + 1} 에 op 가 없습니다(예: {"op":"updateColumn","id":"TB_X.COL","set":{"logical":"…"}})`);
    }
  });
  return list;
}

/** baseRev 뒤 다른 세션 변경(반영이면 내 rev 앞까지, 시험 실행이면 지금 rev 까지). 거절이면 읽지 않는다. */
async function othersSince(client, { modelId, baseRev, result }) {
  if (!result || result.rejection) return null;
  const upto = result.applied ? result.rev - 1 : result.rev;
  if (!(upto > baseRev)) return null;
  const cv = await client.call("view", { modelId, sinceRev: baseRev });
  if (cv.reload) return { reload: true, deltas: [] };
  return { reload: false, deltas: (cv.deltas ?? []).filter((d) => d.rev <= upto && d.session !== client.config.session) };
}

/**
 * apply(MCP apply·confirmRelation·rejectRelation, CLI apply·confirm·reject).
 * baseRev 는 호출자가 준 값을 그대로 보낸다. 이름을 풀려고 읽은 view 의 rev 를 쓰지 않는다(S2-22).
 * dryRun 은 true 일 때만 싣는다(빼면 서버는 false 로 본다).
 * @returns {Promise<{ text: string, isError: boolean, result: object|null }>}
 */
export async function applyFlow(client, state, { modelId, baseRev, commands, dryRun = false }) {
  const list = parseCommands(commands);
  const view = await client.call("view", { modelId });
  const { commands: resolved, errors } = resolveCommands(view, list, { newId });
  if (errors.length) return { text: formatResolveErrors(errors, list), isError: true, result: null };
  const result = await client.call("save", { modelId, baseRev, commandsJson: JSON.stringify(resolved), dryRun: dryRun ? true : undefined });
  if (result.applied) listIn(state.applied, modelId).push(result.rev); // 서버가 dryRun 을 몰라 저장한 경우도 반영으로 센다
  const others = await othersSince(client, { modelId, baseRev, result });
  const { config } = client;
  const out = formatWriteResult(result, { op: "apply", commands: resolved, view, baseRev, dryRun, session: config.session, user: config.user, others });
  return { ...out, result };
}

/**
 * view sinceRev 델타. reload 이고 서버가 fromRev(기록을 줄 수 있는 가장 이른 sinceRev — 다시 읽기 지점·500건 한도)를 주면
 * 거기부터 한 번만 다시 읽는다. 그래도 reload 거나 fromRev 가 없으면(옛 서버) null.
 */
async function changesFrom(client, modelId, sinceRev) {
  let cv = await client.call("view", { modelId, sinceRev });
  if (cv.reload && cv.fromRev != null && cv.fromRev > sinceRev) cv = await client.call("view", { modelId, sinceRev: cv.fromRev });
  return cv.reload ? null : cv;
}

/** rev 하나의 델타(누가 했는가). 기록 구간 밖(다시 읽기 지점 앞·500건을 넘게 지남)이거나 없으면 null. */
async function deltaAt(client, modelId, rev) {
  if (!(rev >= 1)) return null;
  const cv = await changesFrom(client, modelId, rev - 1);
  if (!cv) return null;
  return (cv.deltas ?? []).find((d) => d.rev === rev) ?? null;
}

/**
 * rev 없는 undo 의 대상: 이 프로세스가 반영한 마지막 rev, 없으면(재시작) 최근 500 rev 에서 내 세션의 마지막 델타. 건너뛸 rev 는 뺀다.
 * copy 로 만든 DRAFT 처럼 그 구간 앞에 다시 읽기 지점이 있으면 서버 fromRev 부터 다시 읽는다(defect.mcpUndoReload).
 */
async function lastOwnRev(client, state, modelId, view) {
  const skip = setIn(state.skip, modelId);
  const mine = state.applied.get(modelId) ?? [];
  for (let i = mine.length - 1; i >= 0; i--) if (!skip.has(mine[i])) return mine[i];
  const cv = await changesFrom(client, modelId, Math.max(0, (view.rev ?? 0) - UNDO_SCAN));
  if (!cv) return null;
  const ds = cv.deltas ?? [];
  for (let i = ds.length - 1; i >= 0; i--) {
    if (ds[i].session === client.config.session && !skip.has(ds[i].rev)) return ds[i].rev;
  }
  return null;
}

/**
 * undo(MCP undo, CLI undo). rev 를 빼면 lastOwnRev. 무엇을 되돌렸는지(누구의 몇 rev) 글에 적는다.
 * 되돌린 rev 와 되돌리기로 생긴 rev 는 이 프로세스에서 다시 고르지 않는다(되돌리기의 되돌리기 = 다시 하기를 막는다).
 */
export async function undoFlow(client, state, { modelId, rev, dryRun = false }) {
  const view = await client.call("view", { modelId });
  const target = rev ?? (await lastOwnRev(client, state, modelId, view));
  const { config } = client;
  if (target === null || target === undefined) {
    return {
      text: `되돌릴 rev 를 찾지 못했습니다. 이 세션(${config.session})이 최근 ${UNDO_SCAN} rev 안에 반영한 변경이 없거나 모두 되돌렸습니다.\n다음: getChangesSince 로 되돌릴 rev 를 찾아 rev 를 주세요.`,
      isError: true,
      result: null,
    };
  }
  const undone = await deltaAt(client, modelId, target);
  const result = await client.call("restore", { modelId, rev: target, dryRun: dryRun ? true : undefined });
  if (result.applied) {
    const skip = setIn(state.skip, modelId);
    skip.add(target);
    skip.add(result.rev);
  }
  const out = formatWriteResult(result, { op: "undo", undoRev: target, undone, view, baseRev: null, dryRun, session: config.session, user: config.user, others: null });
  return { ...out, result };
}

function tableList(tables) {
  const names = tableArgs(tables);
  if (names.length > MAX_TABLES) throw new InputError(`표는 한 번에 ${MAX_TABLES}개까지입니다(${names.length}개)`);
  return names;
}

/** claimTable(MCP)·claim(CLI): 표마다 execute kind=CLAIM. 잡은 표는 state 에 둔다(종료 때 놓는다). */
export async function claimFlow(client, state, { modelId, tables }) {
  const names = tableList(tables);
  if (!names.length) throw new InputError("잡을 표를 tables 로 주세요(물리명 또는 t- id)");
  const view = await client.call("view", { modelId });
  const { resolved, errors } = resolveTables(view, names);
  const labels = describeTargets(view, resolved.map((x) => x.id));
  const held = setIn(state.claimed, modelId);
  const rows = [];
  const results = [];
  for (const { id } of resolved) {
    const r = await client.call("execute", { modelId, kind: "CLAIM", tableId: id });
    if (r?.ok) held.add(id);
    rows.push({ label: labels.get(id), result: r });
    results.push({ tableId: id, ...r });
  }
  return { ...formatClaimText("CLAIM", rows, errors, { session: client.config.session }), result: results };
}

/** releaseTable(MCP)·release(CLI): tables 를 빼면 이 프로세스가 잡은 표 전부. */
export async function releaseFlow(client, state, { modelId, tables }) {
  const names = tableList(tables);
  const held = setIn(state.claimed, modelId);
  const view = await client.call("view", { modelId });
  let resolved;
  let errors = [];
  if (names.length) ({ resolved, errors } = resolveTables(view, names));
  else resolved = [...held].map((id) => ({ ref: id, id }));
  if (!resolved.length && !errors.length) {
    return { text: `이 프로세스(세션 ${client.config.session})가 잡은 표가 없습니다. 놓을 표를 tables 로 주세요.`, isError: false, result: [] };
  }
  const labels = describeTargets(view, resolved.map((x) => x.id));
  const rows = [];
  const results = [];
  for (const { id } of resolved) {
    const r = await client.call("execute", { modelId, kind: "RELEASE", tableId: id });
    held.delete(id);
    rows.push({ label: labels.get(id), result: r });
    results.push({ tableId: id, ...r });
  }
  return { ...formatClaimText("RELEASE", rows, errors, { session: client.config.session }), result: results };
}

/** 종료 때 잡은 표를 모두 놓아 본다. 실패는 버린다(600초 뒤 만료된다). 놓아 본 수를 돌려준다. */
export async function releaseAll(client, state) {
  const jobs = [];
  for (const [modelId, ids] of state.claimed) {
    for (const id of ids) jobs.push(client.call("execute", { modelId, kind: "RELEASE", tableId: id }));
    ids.clear();
  }
  await Promise.allSettled(jobs);
  return jobs.length;
}

/** getChangesSince(MCP)·changes(CLI): view sinceRev + 이름 풀기용 view. */
export async function changesFlow(client, { modelId, rev, session, excludeMine, tables, raw }) {
  const cv = await client.call("view", { modelId, sinceRev: rev });
  const view = cv.reload ? null : await client.call("view", { modelId });
  const out = formatChangesText(cv, { view, sinceRev: rev, mySession: client.config.session, session, excludeMine, tables, raw });
  return { text: out.text, raw: out.raw, isError: false, result: cv };
}
