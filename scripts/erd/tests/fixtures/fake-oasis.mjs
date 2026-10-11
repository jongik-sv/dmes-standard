// 가짜 MDM OASIS 서버. POST /api/mdm/oasis/erdEdit/{action} 만 받고, 받은 요청을 기록한다.
import { createServer } from "node:http";

export const success = (result) => ({ status: 200, body: { meta: { success: true }, data: { result } } });
export const failure = (code, message) => ({ status: 200, body: { meta: { success: false, code, message } } });
/** 목록 결과(search). OASIS 는 List 를 grids.result.rows 로 싣는다. */
export const gridSuccess = (rows) => ({ status: 200, body: { meta: { success: true }, data: {}, grids: { result: { rows } } } });

/**
 * @param {(action: string, params: object, req: import("node:http").IncomingMessage) => {status:number, body:any, delayMs?:number}} route
 * @returns {Promise<{url: string, requests: Array<{action, params, headers, body}>, close: () => Promise<void>}>}
 */
export async function startFakeOasis(route) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const m = /^\/api\/mdm\/oasis\/erdEdit\/(\w+)$/.exec(req.url);
      if (req.method !== "POST" || !m) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ action: m[1], params: body.params, headers: req.headers, body });
      const out = route(m[1], body.params, req);
      const send = () => {
        const text = typeof out.body === "string" ? out.body : JSON.stringify(out.body);
        res.writeHead(out.status, { "Content-Type": typeof out.body === "string" ? "text/plain" : "application/json" }).end(text);
      };
      if (out.delayMs) setTimeout(send, out.delayMs);
      else send();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/**
 * 관계 경유점(README 7.1)을 저장하는 가짜 서버 route. inner 가 모르는 요청을 맡기고, 아래만 가로챈다.
 * 계약(README 7.1, 서버 ErdDiagramStore·ErdModelView 와 맞춘 것): setRoute·clearRoutes 명령, view 의 routes = [{diagram, relation, points:[{x,y}]}],
 *   델타 kind diagramRoute(upsert 값 {diagram, relation, points} / delete 값 null).
 *   서버는 모양·참조 오류를 모두 INVALID 로 거절한다 — 없는 다이어그램, 현재(DRAFT) 버전에 없는 관계(같은 묶음의 addRelation 은 있는 것), 빈 relation,
 *   points 가 비었거나 50개 초과, clearRoutes 의 relations 가 null·null 항목. 빈 relations 배열(걸린 관계 없음)과 꺾임점이 없는 관계는 거절하지 않고 건너뛴다(무변경).
 * 계약에 없어서 이 가짜가 가정한 것: 점이 정수 x·y 인지 검사, baseRev < 현재 rev = CONFLICT 거절,
 *   같은 점을 다시 보내거나 없는 route 를 지우면 무변경(rev·델타 없음).
 * - save 의 경유점 명령: dryRun 이 아니면 저장하고 rev 를 올리며 diagramRoute 델타를 낸다. 경유점이 아닌 명령(moveNodes 등)은
 *   통과만 시킨다 — 이 가짜는 그 효과를 흉내 내지 않고 델타에도 넣지 않는다(혼합 묶음의 경유점 처리만 본다).
 *   경유점 명령이 하나도 없는 save 는 inner 로 보낸다.
 * - view(kind 없음): inner 의 응답에 routes 를 더하고 rev 를 맞춘다. view sinceRev: inner 의 델타와 이 route 가 낸 델타를 rev 순으로 합친다.
 * @param {(action: string, params: object, req: any) => any} inner
 * @param {{ rev?: number, routes?: Array<{diagram: string, relation: string, points: Array<{x:number,y:number}>}> }} [seed]
 * @returns {((action: string, params: object, req: any) => any) & { routes: Array<any>, deltas: Array<any> }}
 */
export function withRoutes(inner, seed = {}) {
  const state = { rev: seed.rev ?? 12, routes: [...(seed.routes ?? [])], deltas: [] };
  const keyOf = (d, r) => `${d}:${r}`;
  const samePoints = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const route = (action, params, req) => {
    if (action === "save") {
      const cmds = JSON.parse(params.commandsJson ?? "[]");
      if (!cmds.some((c) => c.op === "setRoute" || c.op === "clearRoutes")) return inner(action, params, req);
      const dry = params.dryRun === true;
      const reject = (index, code, message, extra = {}) =>
        success({ applied: false, rev: state.rev, rowVersion: null, dryRun: dry, changes: [], warnings: [], rejection: { code, commandIndex: index, message, hint: null, elementId: null, property: null, ...extra } });
      if (params.baseRev != null && params.baseRev < state.rev) {
        return reject(0, "CONFLICT", "다른 세션이 먼저 바꾼 값입니다", { hint: `getChangesSince(${params.baseRev}) 로 바뀐 값을 읽고 다시 보내세요`, byRev: state.rev, bySession: "ui-41000207", byUserId: "41000207" });
      }
      const cur = inner("view", { modelId: params.modelId }, req).body.data.result;
      const seen = JSON.parse(cur.model);
      const diagrams = new Set((cur.diagrams ?? []).map((d) => d.id));
      const created = new Set(cmds.filter((c) => c.op === "addRelation").map((c) => c.id)); // 같은 묶음의 addRelation 은 효과를 흉내 내지 않고 id 만 안다
      const next = [...state.routes];
      const changes = [];
      for (const [index, c] of cmds.entries()) {
        if (c.op !== "setRoute" && c.op !== "clearRoutes") continue;
        if (!diagrams.has(c.diagram)) return reject(index, "INVALID", `없는 다이어그램입니다: ${c.diagram}`, { elementId: c.diagram });
        if (c.op === "setRoute") {
          if (typeof c.relation !== "string" || !c.relation.trim()) return reject(index, "INVALID", "relation 이 비었습니다", { elementId: c.diagram });
          if (!seen.relations?.[c.relation] && !created.has(c.relation)) return reject(index, "INVALID", `모델에 없는 관계입니다: ${c.relation}`, { elementId: c.relation });
          const pts = c.points;
          if (!Array.isArray(pts) || pts.length < 1 || pts.length > 50 || !pts.every((p) => Number.isInteger(p?.x) && Number.isInteger(p?.y))) {
            return reject(index, "INVALID", "points 는 정수 좌표 1~50개입니다", { property: "points" });
          }
          const at = next.findIndex((r) => keyOf(r.diagram, r.relation) === keyOf(c.diagram, c.relation));
          if (at >= 0 && samePoints(next[at].points, pts)) continue;
          const row = { diagram: c.diagram, relation: c.relation, points: pts };
          if (at >= 0) next[at] = row;
          else next.push(row);
          changes.push({ kind: "diagramRoute", id: keyOf(c.diagram, c.relation), op: "upsert", value: row });
        } else {
          if (!Array.isArray(c.relations)) return reject(index, "INVALID", "relations 가 없습니다", { elementId: c.diagram });
          if (c.relations.some((x) => x == null)) return reject(index, "INVALID", "relations 에 빈 항목이 있습니다", { elementId: c.diagram });
          for (const rel of c.relations) { // 빈 배열이면 건너뛴다(무변경)
            const at = next.findIndex((r) => keyOf(r.diagram, r.relation) === keyOf(c.diagram, rel));
            if (at < 0) continue;
            next.splice(at, 1);
            changes.push({ kind: "diagramRoute", id: keyOf(c.diagram, rel), op: "delete", value: null });
          }
        }
      }
      if (dry) return success({ applied: false, rev: state.rev, rowVersion: null, dryRun: true, changes, warnings: [], rejection: null });
      state.routes = next;
      if (changes.length) {
        state.rev += 1;
        state.deltas.push({ modelId: params.modelId, rev: state.rev, userId: "41000207", session: params.session, source: params.source, rowVersion: null, changes });
      }
      return success({ applied: true, rev: state.rev, rowVersion: state.rev, dryRun: false, changes, warnings: [], rejection: null });
    }
    if (action === "view" && params.sinceRev != null) {
      const base = inner(action, params, req).body?.data?.result?.deltas ?? [];
      const deltas = [...base, ...state.deltas.filter((d) => d.rev > params.sinceRev)].sort((a, b) => a.rev - b.rev);
      return success({ rev: Math.max(state.rev, ...deltas.map((d) => d.rev)), reload: false, deltas });
    }
    if (action === "view" && params.kind == null) {
      const out = inner(action, params, req);
      const result = out.body?.data?.result;
      if (!result) return out;
      return success({ ...result, rev: state.rev, routes: state.routes });
    }
    return inner(action, params, req);
  };
  Object.defineProperties(route, { routes: { get: () => state.routes }, deltas: { get: () => state.deltas } });
  return route;
}

/** 관리자인가. README 7.2: 역할 MDM_STD_ADMIN 또는 SYSADMIN. 서버의 MdmCurrentUser.roleIds() 는 Set 이라 쉼표로 이은 헤더에서 포함 여부를 본다. */
const isAdmin = (req) =>
  String(req?.headers?.["x-authenticated-role"] ?? "")
    .split(",")
    .map((r) => r.trim())
    .some((r) => ["MDM_STD_ADMIN", "SYSADMIN"].includes(r));

/** search 행에 싣지 않는 가짜 내부 칸. */
const HIDDEN = ["tableCount", "versions", "deleteBusy"];
/** 비관리자 삭제를 막는 버전 상태(README 7.2). */
const BLOCKING = ["RELEASED", "REQUESTED", "APPROVED"];
/** 실제 서버(MdmErrors.of / invalid)의 meta.message 모양: 코드의 기본 문구 + ": " + 이유. */
const NOT_OWNER = "DRAFT 소유자만 할 수 있습니다";
const ADMIN_ROLE = "표준 관리자 역할이 있어야 할 수 있습니다";
const RETRY = "다른 사용자가 수정했습니다. 다시 불러오세요";
const INVALID = (detail) => failure("MDM021", `입력값이 올바르지 않습니다: ${detail}`);
const NO_MODEL = () => failure("MDM029", "ERD 모델이 없습니다");

/**
 * 모델 관리(README 7.2)를 흉내 내는 가짜 서버 route. inner 가 모르는 요청을 맡기고, 아래만 가로챈다.
 * 실제 서버(b2, ErdEditService·ErdModelDeletion·ErdVersionService)를 따른 것:
 * - search(kind 없음): 행마다 status(계산된 모델 상태 CREATED·INUSE·DEPRECATED. 기본 CREATED)·releasedVer(칸은 늘 있고 확정본이 없으면 null)·createdBy.
 *   kind=SCHEMAS = 행 {schemaName}(seed.schemas), 모르는 kind = MDM021.
 * - delete kind=MODEL(완전 삭제, ver·rowVersion 없음)의 거절은 모두 실패 응답(meta.success=false)이고 meta.message = 「기본 문구: 이유」다.
 *   없는 모델 MDM029 → (비관리자만) DRAFT 없음 MDM016 → 소유자 없는 DRAFT·DRAFT 소유자 아님·막는 버전(RELEASED 2.000, APPROVED 3.000 …) MDM003 →
 *   표시가 계속 들어옴 MDM001(모델 칸 deleteBusy 로 흉내). 관리자(MDM_STD_ADMIN·SYSADMIN)는 DRAFT·확정본이 없어도 지운다. 모르는 kind = MDM021.
 * - 삭제 뒤 그 modelId 의 모든 요청(view 포함)은 MDM029. 같은 modelId 로 다시 reg 하면 rev 는 0 이 아니라 지운 rev + 2 로 이어진다(b2 fixes 5).
 * - 입력 오류 = MDM021(「입력값이 올바르지 않습니다: …」), reg 는 모듈 하나에 모델 하나만(UX_TB_MDM_ERD_MODEL_MODULE)·modelId 겹침도 거절,
 *   import FROM_DB 는 dryRun 거절·baseRev 필수·baseRev > rev 이면 INVALID 거절·표가 있는 모델이면 INVALID "이미 표가 있습니다(n개)…" 거절.
 * 계약에 없어서 이 가짜가 가정한 것: reg 는 {modelId} 를 돌려주고 새 모델은 DRAFT 1.000·소유자 = 요청 사용자(헤더), import 성공은 rev 1 증가·표 3개가 생기고
 *   summary 를 돌려준다, delete kind=MODEL 의 응답은 {ok:true}.
 * 이 route 가 만든 모델의 view 는 빈 모델(표 수는 import 뒤 3)이다. seed 모델(예: mcm)의 view·save 등은 inner 가 맡는다.
 * @param {(action: string, params: object, req: any) => any} inner
 * @param {{ models?: Array<object>, schemas?: string[] }} [seed] search 행 모양: { modelId, moduleId, schemaName, modelName, rev, draftVer, ownerId, status, releasedVer, createdBy }.
 *   draftVer 가 null 이면 DRAFT 가 없는 모델이다(칸을 안 주면 DRAFT 가 있다고 본다).
 *   가짜 내부 칸(search 에 싣지 않음): tableCount(표 수, 기본 0), versions(버전 목록 「상태」 또는 「상태 번호」, 기본 releasedVer 가 있으면 [`RELEASED ${releasedVer}`]),
 *   deleteBusy(true 면 비관리자·관리자 모두 삭제가 MDM001 로 거절된다).
 */
export function withModels(inner, seed = {}) {
  const state = { models: (seed.models ?? []).map((m) => ({ ...m })), deleted: [], gone: new Set(), lastRev: new Map(), created: new Set() };
  const user = (req) => req?.headers?.["x-authenticated-user"] ?? "erd-mcp";
  const tablesOf = (m) => m.tableCount ?? 0;
  const versionsOf = (m) => m.versions ?? (m.releasedVer ? [`RELEASED ${m.releasedVer}`] : []);
  const row = (m) => ({ status: "CREATED", releasedVer: null, createdBy: null, ...Object.fromEntries(Object.entries(m).filter(([k]) => !HIDDEN.includes(k))) });
  const route = (action, params, req) => {
    const mine = state.models.find((m) => m.modelId === params.modelId);
    if (action === "search") {
      if (params.kind == null || params.kind === "") return gridSuccess(state.models.map(row));
      if (params.kind === "SCHEMAS") return gridSuccess((seed.schemas ?? []).map((schemaName) => ({ schemaName })));
      return INVALID(`search 가 지원하지 않는 kind 입니다: ${params.kind}`);
    }
    if (action === "reg") {
      for (const f of ["modelId", "moduleId", "schemaName", "modelName"]) {
        if (!params[f]) return INVALID(`${f} 은 필수입니다`);
      }
      if (mine) return INVALID(`이미 있는 모델 ID 입니다: ${params.modelId}`);
      const other = state.models.find((m) => m.moduleId === params.moduleId);
      if (other) return INVALID(`모듈 ${params.moduleId} 에는 이미 모델이 있습니다: ${other.modelId}`);
      state.models.push({
        modelId: params.modelId, moduleId: params.moduleId, schemaName: String(params.schemaName).toUpperCase(), modelName: params.modelName,
        rev: state.lastRev.has(params.modelId) ? state.lastRev.get(params.modelId) + 2 : 0, draftVer: "1.000", ownerId: user(req), status: "CREATED", releasedVer: null,
        createdBy: user(req), tableCount: 0,
      });
      state.gone.delete(params.modelId);
      state.created.add(params.modelId);
      return success({ modelId: params.modelId });
    }
    if (action === "delete" && params.kind !== undefined && params.kind !== "" && params.kind !== "MODEL") {
      return INVALID(`delete 가 지원하지 않는 kind 입니다: ${params.kind}`);
    }
    if (action === "delete" && params.kind === "MODEL") {
      if (!mine) return NO_MODEL();
      if (!isAdmin(req)) {
        if (mine.draftVer === null) return failure("MDM016", `${ADMIN_ROLE}: DRAFT 가 없는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN)만 지울 수 있습니다`);
        if (!mine.ownerId) {
          return failure("MDM003", `${NOT_OWNER}: 소유자가 없는 DRAFT 입니다. 먼저 선점(lock)해 소유자가 되거나 관리자(MDM_STD_ADMIN·SYSADMIN)에게 요청하세요`);
        }
        if (mine.ownerId !== user(req)) {
          return failure("MDM003", `${NOT_OWNER}: 모델 삭제는 DRAFT 소유자(${mine.ownerId}) 또는 관리자(MDM_STD_ADMIN·SYSADMIN)만 할 수 있습니다`);
        }
        const blocking = versionsOf(mine).filter((v) => BLOCKING.includes(v.split(" ")[0]));
        if (blocking.length) {
          return failure("MDM003", `${NOT_OWNER}: 확정·요청·승인된 버전(${blocking.join(", ")})이 있는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN)만 지울 수 있습니다`);
        }
      }
      if (mine.deleteBusy) return failure("MDM001", `${RETRY}: 모델을 지우는 동안 작업 중 표시가 계속 들어옵니다. 잠시 뒤 다시 시도하세요`);
      state.models = state.models.filter((m) => m !== mine);
      state.deleted.push(mine.modelId);
      state.gone.add(mine.modelId);
      state.lastRev.set(mine.modelId, mine.rev);
      return success({ ok: true });
    }
    if (state.gone.has(params.modelId)) return NO_MODEL(); // 삭제된 모델: view·save·import … 모두 MDM029
    if (mine) {
      if (action === "view" && params.kind == null && params.sinceRev == null && state.created.has(mine.modelId)) {
        const tables = Object.fromEntries(Array.from({ length: tablesOf(mine) }, (_, i) => [`t-imp${i}`, { phys: `TB_IMP_${i}`, logical: "", comment: "", columnOrder: [], _rev: {} }]));
        return success({
          modelId: mine.modelId, rev: mine.rev, ver: mine.draftVer, status: "DRAFT", ownerId: mine.ownerId, editors: [], rowVersion: 1,
          model: JSON.stringify({ schemaVersion: 1, model: { module: mine.moduleId, schema: mine.schemaName }, tables, columns: {}, keys: {}, relations: {}, _tombstones: {} }),
          diagrams: [], nodes: [], presence: [],
        });
      }
      if (action === "import") {
        if (params.kind !== "FROM_DB") return INVALID(`import 의 kind 는 FROM_DB·APPLY_DIFF 입니다: ${params.kind}`);
        if (params.baseRev == null) return INVALID("baseRev 는 필수입니다");
        if (params.dryRun === true) return INVALID("import 는 dryRun 을 받지 않습니다. 차이는 compare kind=DB_DIFF 로 먼저 보세요");
        const rejected = (message, hint) =>
          success({ applied: false, rev: mine.rev, rowVersion: null, changes: [], warnings: [], rejection: { code: "INVALID", commandIndex: 0, message, hint, elementId: null, property: null }, summary: null });
        if (params.baseRev > mine.rev) return rejected(`baseRev 가 현재 rev(${mine.rev})보다 큽니다`, "getChangesSince 로 받은 rev 를 쓰세요");
        if (tablesOf(mine) > 0) return rejected(`이미 표가 있습니다(${tablesOf(mine)}개). 첫 가져오기는 표가 없는 모델에만 합니다`, "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요");
        mine.rev += 1;
        mine.tableCount = 3;
        return success({
          applied: true, rev: mine.rev, rowVersion: mine.rev, changes: [], warnings: [{ code: "SKIPPED", message: "가져오지 않은 표 1개" }], rejection: null,
          summary: { tables: 3, columns: 21, keys: 4, relations: { DB: 2, INFERRED: 1 }, diagramId: "d-import-all" },
        });
      }
    }
    return inner(action, params, req);
  };
  Object.defineProperties(route, { models: { get: () => state.models }, deleted: { get: () => state.deleted } });
  return route;
}
