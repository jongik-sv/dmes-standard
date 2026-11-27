/**
 * commPermBench 실연결 API — POST /api/mcm/oasis/commPermBench/{action}, body `{ meta, params, grids }`.
 *
 * 모양 = types.ts `PermBenchApi`(mock.ts 와 같다). 화면은 인터페이스만 안다.
 * D36: 목록 입력은 params 배열이 아니라 grids 로 보낸다(saveDraft = `grids.changes.rows`, 응답 `grids.draft`).
 * 응답 envelope 풀기 = commRoleGrpMng/api.ts `unwrapPayload` 와 같은 규칙(meta.success=false 면 throw).
 * HTTP 400 등 2xx 가 아닌 응답도 본문(meta.message "CODE: 설명")을 읽어야 해서 공용 json-api-client 대신 fetch 를 부른다(readResponse).
 */
import {
  PERM_ERROR_CODES,
  PermApplyError,
  type ApplyParams,
  type ApplyResult,
  type DraftResult,
  type ExplainParams,
  type ExplainResult,
  type ImpactResult,
  type PermBenchApi,
  type SaveDraftRequest,
  type SearchBenchParams,
  type SearchBenchResult,
  type SearchHistoryDtlResult,
  type SearchHistoryParams,
  type SearchHistoryResult,
  type SearchMenuTreeParams,
  type SearchMenuTreeResult,
  type SearchRolePermParams,
  type SearchRolePermResult,
  type YN,
} from "./types";

const OASIS_BASE = "/api/mcm/oasis/commPermBench";
const SCREEN_ID = "commPermBench";

export interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

const APPLY_CODES = PERM_ERROR_CODES;

/**
 * 실패 envelope 를 오류로 바꾼다. 서버 BusinessException 문구 = "CODE: 설명"(BE 계약).
 * 앞 코드가 PermApplyErrorCode 면 PermApplyError(code, 설명), 아니면 일반 Error.
 * 충돌 범위(scopes)는 data.scopes 가 오면 쓴다(서버 칸 이름 미확정).
 */
export function failureOf(env: CactusEnvelope): Error {
  const message = env.meta?.message?.trim() || "요청이 거부되었습니다.";
  const scopesRaw = env.data?.["scopes"];
  const scopes = Array.isArray(scopesRaw) ? scopesRaw.map(String) : typeof scopesRaw === "string" ? scopesRaw.split(",").filter(Boolean) : [];
  return failureFromMessage(message, scopes);
}

/** "CODE: 설명" 문구 → 아는 코드면 PermApplyError, 아니면 일반 Error. */
export function failureFromMessage(message: string, scopes: string[] = []): Error {
  const m = /^([A-Z][A-Z0-9_]*)\s*:\s*([\s\S]*)$/.exec(message.trim());
  const code = m ? APPLY_CODES.find((c) => c === m[1]) : undefined;
  if (!code || !m) return new Error(message);
  return new PermApplyError(code, m[2].trim() || message, scopes);
}

/** HTTP 상태별 기본 문구(서버가 문구를 주지 않을 때). json-api-client 와 같은 말. */
const STATUS_TEXT: Record<number, string> = {
  400: "잘못된 요청입니다.",
  401: "로그인이 필요합니다.",
  403: "권한이 없습니다.",
  404: "요청한 데이터를 찾을 수 없습니다.",
  409: "다른 요청과 충돌했습니다. 잠시 뒤 다시 시도합니다.",
  500: "서버 오류가 발생했습니다.",
  502: "서버에서 응답을 받지 못했습니다(게이트웨이 오류). 잠시 뒤 다시 시도합니다.",
  503: "서비스를 일시적으로 사용할 수 없습니다.",
  504: "서버 응답 시간이 지났습니다. 잠시 뒤 다시 시도합니다.",
};

/** fetch 자체가 실패했을 때(TypeError "Failed to fetch" 등) 보이는 글. */
export const NETWORK_ERROR_TEXT = "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도합니다.";

/**
 * HTTP 응답 → 본문. 2xx 가 아니어도 본문을 읽는다.
 * 공용 json-api-client 는 2xx 가 아니면 `error.message`·`message` 만 읽어 Cactus envelope 의 `meta.message`("NOT_FOUND: …")를 잃는다.
 * 그래서 이 화면은 fetch 를 직접 부르고, 실패 envelope 를 failureOf 로 바꾼다(BE 400 INVALID_VALUE 의 "NOT_FOUND: …" 도 코드로 읽는다).
 */
export async function readResponse(res: Response): Promise<unknown> {
  const body = (await res.json().catch(() => null)) as (CactusEnvelope & { message?: string; error?: { message?: string } }) | null;
  if (body?.meta && body.meta.success === false) throw failureOf(body);
  if (!res.ok) {
    const msg = body?.meta?.message || body?.error?.message || body?.message || STATUS_TEXT[res.status] || `요청을 처리하지 못했습니다. (${res.status})`;
    throw failureFromMessage(msg);
  }
  return body;
}

/** 칸 값이 `{ rows }` 모양이면 rows 를, 아니면 그대로. */
const rowsIfGrid = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { rows?: unknown }).rows) ? (v as { rows: unknown[] }).rows : v;

/**
 * 응답 모양(BE 확인, 가이드 6-D-1):
 *   - 그리드 하나 action(searchMenuTree·searchRolePerm·loadDraft·saveDraft·apply·searchHistory·searchHistoryDtl) = `data.grids.<칸>.rows`
 *   - 여러 칸 action(searchBench·explain·impact) = `data.result.<칸>`(Map)
 *   - 맨 위 `grids.<칸>.rows` 도 받아 둔다(예전 모양 대비).
 * apply 의 칸 이름이 `result` 라 data.result(Map) 를 먼저 펴고 그리드 칸이 덮어쓴다.
 */
export function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) throw failureOf(env);
  const out: Record<string, unknown> = {};
  const data = env?.data;
  if (data) {
    for (const [k, v] of Object.entries(data)) if (k !== "grids" && k !== "result") out[k] = v;
    const inner = data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      for (const [k, v] of Object.entries(inner as Record<string, unknown>)) out[k] = rowsIfGrid(v);
    }
    const dg = data["grids"];
    if (dg && typeof dg === "object") {
      for (const [k, v] of Object.entries(dg as Record<string, { rows?: unknown[] }>)) out[k] = v?.rows ?? [];
    }
  }
  if (env?.grids) for (const [key, val] of Object.entries(env.grids)) if (!(key in out)) out[key] = val?.rows ?? [];
  return out as T;
}

type Grids = Record<string, { rows: Record<string, unknown>[] }>;

/** 응답 칸이 비어 오면 빈 배열로 채운다. */
const rowsOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function createPermBenchApi(fetchImpl: typeof fetch = (...a) => fetch(...a)): PermBenchApi {
  async function call(action: string, params: Record<string, string> = {}, grids?: Grids): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetchImpl(`${OASIS_BASE}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ meta: { menuId: SCREEN_ID }, params, ...(grids ? { grids } : {}) }),
      });
    } catch (e) {
      // 네트워크 오류(fetch 의 TypeError)는 영어 원문 대신 한국어 안내. 다른 곳에서 "CODE: 설명" 으로 던진 오류도 같은 규칙으로 읽는다
      if (e instanceof TypeError) throw new Error(NETWORK_ERROR_TEXT, { cause: e });
      throw e instanceof Error ? failureFromMessage(e.message) : e;
    }
    return unwrapPayload<Record<string, unknown>>(await readResponse(res));
  }

  return {
    async searchBench(p: SearchBenchParams): Promise<SearchBenchResult> {
      const r = await call("searchBench", { userQ: p.userQ ?? "", roleGroupId: p.roleGroupId ?? "", roleId: p.roleId ?? "" });
      return {
        users: rowsOf(r.users),
        groups: rowsOf(r.groups),
        roles: rowsOf(r.roles),
        userGroups: rowsOf(r.userGroups),
        groupRoles: rowsOf(r.groupRoles),
        // ME_SYSADMIN(bench-be f3 추가) — 옛 서버는 칸이 없어 넣지 않는다(화면은 없으면 SYSADMIN 아님으로 본다)
        ...(Array.isArray(r.me) ? { me: rowsOf<{ ME_SYSADMIN: YN }>(r.me) } : {}),
      };
    },
    async searchMenuTree(p: SearchMenuTreeParams): Promise<SearchMenuTreeResult> {
      const r = await call("searchMenuTree", { userId: p.userId ?? "", roleId: p.roleId ?? "", source: p.source });
      return { menus: rowsOf(r.menus) };
    },
    async explain(p: ExplainParams): Promise<ExplainResult> {
      const r = await call("explain", { userId: p.userId, objectId: p.objectId, source: p.source });
      return { buttons: rowsOf(r.buttons), paths: rowsOf(r.paths) };
    },
    async searchRolePerm(p: SearchRolePermParams): Promise<SearchRolePermResult> {
      const r = await call("searchRolePerm", { roleId: p.roleId, menuFolderId: p.menuFolderId ?? "", source: p.source });
      return { perms: rowsOf(r.perms) };
    },
    async loadDraft(): Promise<DraftResult> {
      return { draft: rowsOf((await call("loadDraft")).draft) };
    },
    async saveDraft(req: SaveDraftRequest): Promise<DraftResult> {
      const rows = req.grids.changes.rows as unknown as Record<string, unknown>[];
      return { draft: rowsOf((await call("saveDraft", {}, { changes: { rows } })).draft) };
    },
    async discardDraft(): Promise<void> {
      await call("discardDraft");
    },
    async impact(): Promise<ImpactResult> {
      const r = await call("impact");
      return { summary: rowsOf(r.summary), impacts: rowsOf(r.impacts) };
    },
    async apply(p: ApplyParams): Promise<ApplyResult> {
      return { result: rowsOf((await call("apply", { confirmLoss: p.confirmLoss, memo: p.memo })).result) };
    },
    async searchHistory(p: SearchHistoryParams): Promise<SearchHistoryResult> {
      const r = await call("searchHistory", { fromDt: p.fromDt ?? "", toDt: p.toDt ?? "", applyUserId: p.applyUserId ?? "" });
      return { his: rowsOf(r.his) };
    },
    async searchHistoryDtl(p: { applyId: string }): Promise<SearchHistoryDtlResult> {
      return { dtl: rowsOf((await call("searchHistoryDtl", { applyId: p.applyId })).dtl) };
    },
  };
}
