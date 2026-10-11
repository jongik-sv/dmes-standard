// MDM 서버 OASIS erdEdit 를 부르는 작은 클라이언트. scripts/mdm-meta/register-columns.mjs 의 oasis() 와 같은 규칙이다.
// 로컬 전용 인증(스펙 D12): X-Client-Key + 사용자 헤더. node 18.17 내장 fetch·AbortSignal.timeout 만 쓴다.
// 모든 요청은 session·source 를 싣는다. 서버는 MCP·CLI 세션을 접속자 목록에 시한 항목으로 둔다(README S2-11).
import { randomUUID } from "node:crypto";

export const DEFAULTS = Object.freeze({
  base: "http://localhost:8096",
  clientKey: "dmes-bff-local-client-key-2026",
  user: "erd-mcp",
  role: "MDM_STEWARD",
  timeoutMs: 30000,
});

/** 서버 SESSION_NM 칸 크기(ErdCommandService·ErdEditService 가 1~100자를 검사한다). */
export const SESSION_MAX = 100;

/** 이 프로세스의 임의 꼬리표. 세션 이름 규칙 3(CLAUDE_CODE_SESSION_ID 가 없을 때)에 쓴다. 프로세스마다 한 번 정한다. */
const PROCESS_TAG = randomUUID().slice(0, 8);

/**
 * 세션 이름(README "MCP·CLI", S2-7).
 * 1. opts.session(CLI --session)이 있으면 그 값.
 * 2. ERD_SESSION 이 비어 있지 않고 auto 가 아니면 그 값.
 * 3. kind mcp: CLAUDE_CODE_SESSION_ID 가 있으면 claude- + 그 값에서 - 를 뺀 앞 8글자(소문자), 없으면 mcp- + 프로세스 임의 8글자.
 * 4. kind cli: cli- + 사용자.
 * .mcp.json 이 ${CLAUDE_CODE_SESSION_ID} 를 풀면 바깥 셸 값(중첩 실행이면 부모 세션 id)이 들어온다. 그래서 이름은 여기서
 * 이 프로세스의 env 로 만든다. Claude Code 는 MCP 프로세스에 자기 세션 id 를 넣는다(조사 C 4.2 실측).
 */
export function sessionName(env, { kind = "mcp", session, user } = {}) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  let name = text(session);
  if (!name) {
    const fromEnv = text(env.ERD_SESSION);
    if (fromEnv && fromEnv !== "auto") name = fromEnv;
  }
  if (!name && kind === "cli") name = `cli-${user || text(env.ERD_USER) || DEFAULTS.user}`;
  if (!name) {
    const claude = text(env.CLAUDE_CODE_SESSION_ID).replace(/-/g, "").toLowerCase();
    name = claude ? `claude-${claude.slice(0, 8)}` : `mcp-${PROCESS_TAG}`;
  }
  if (name.length > SESSION_MAX) {
    throw new Error(`세션 이름은 1~${SESSION_MAX}자입니다(${name.length}자): ${name.slice(0, 40)}…`);
  }
  return name;
}

/**
 * 환경변수 → 설정. ERD_BASE·ERD_USER·ERD_ROLE·BACKEND_CLIENT_KEY·ERD_SESSION, 비면 기본값.
 * opts.kind: "mcp"(기본, source MCP) | "cli"(source CLI). opts.session: CLI --session.
 */
export function configFromEnv(env, opts = {}) {
  const kind = opts.kind === "cli" ? "cli" : "mcp";
  const user = env.ERD_USER || DEFAULTS.user;
  return {
    base: (env.ERD_BASE || DEFAULTS.base).replace(/\/+$/, ""),
    clientKey: env.BACKEND_CLIENT_KEY || DEFAULTS.clientKey,
    user,
    role: env.ERD_ROLE || DEFAULTS.role,
    session: sessionName(env, { kind, session: opts.session, user }),
    source: kind === "cli" ? "CLI" : "MCP",
    timeoutMs: DEFAULTS.timeoutMs,
  };
}

/** 서버가 업무 오류(meta.success=false)나 JSON 이 아닌 본문을 돌려줬다. */
export class OasisError extends Error {
  constructor(message, { action, code = null, status = null } = {}) {
    super(message);
    this.name = "OasisError";
    this.action = action;
    this.code = code;
    this.status = status;
  }
}

/** 서버에 닿지 못했다(연결 거부·시간 초과). */
export class OasisUnreachableError extends Error {
  constructor(message, { action, cause } = {}) {
    super(message);
    this.name = "OasisUnreachableError";
    this.action = action;
    this.cause = cause;
  }
}

/** null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못한다. */
export function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

/** @returns {{config: object, call: (action: string, params: object) => Promise<any>, rows: (action: string, params: object) => Promise<any[]>}} */
export function createOasisClient(config, fetchImpl = globalThis.fetch) {
  async function post(action, params) {
    const url = `${config.base}/api/mdm/oasis/erdEdit/${action}`;
    let res;
    let text;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "X-Client-Key": config.clientKey,
          "X-Authenticated-User": config.user,
          "X-Authenticated-Role": config.role,
        },
        // 세션·출처를 먼저 두고 params 로 덮는다(호출자가 준 값이 이긴다).
        body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: compact({ session: config.session, source: config.source, ...params }) }),
      });
      text = await res.text(); // 본문 읽기도 같은 시간 제한 안에서
    } catch (e) {
      throw new OasisUnreachableError(`${config.base} 에 닿지 못했습니다(erdEdit/${action}): ${e.cause?.code ?? e.name} ${e.message}`, {
        action,
        cause: e,
      });
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OasisError(`erdEdit/${action} HTTP ${res.status}: ${text.slice(0, 200)}`, { action, status: res.status });
    }
    if (body?.meta?.success !== true) {
      throw new OasisError(body?.meta?.message || `erdEdit/${action} HTTP ${res.status}`, {
        action,
        code: body?.meta?.code ?? null,
        status: res.status,
      });
    }
    return body;
  }
  async function call(action, params = {}) {
    const body = await post(action, params);
    return body.data?.result ?? body.data ?? {};
  }
  /** 목록을 돌려주는 액션(search). OASIS 는 List 결과를 data.result 가 아니라 grids.result.rows 로 싣는다. */
  async function rows(action, params = {}) {
    const body = await post(action, params);
    const list = body.grids?.result?.rows ?? body.data?.result;
    return Array.isArray(list) ? list : [];
  }
  return { config, call, rows };
}

/** 오류를 LLM 이 다음에 할 일까지 읽을 수 있는 문장으로(스펙 4.5). */
export function describeError(e, config) {
  if (e instanceof OasisUnreachableError) {
    return `${e.message}\n다음: MDM 서버(기본 포트 8096)를 켜거나 ERD_BASE 환경변수를 확인한 뒤 같은 도구를 다시 부르세요.`;
  }
  if (e instanceof OasisError) {
    // meta.code 가 있으면 서버가 업무 오류로 답한 것이다(HTTP 상태가 403 이어도 인증 거절이 아니다). 코드 없는 401·403 이 client-key·게이트웨이 거절이다.
    if ((e.status === 401 || e.status === 403) && !e.code) {
      return `인증이 거절되었습니다(HTTP ${e.status}): ${e.message}\n다음: BACKEND_CLIENT_KEY 가 서버의 cactus.security.client-key 와 같은지, ERD_USER(${config.user})·ERD_ROLE(${config.role})이 맞는지 확인하세요.`;
    }
    if (e.code === "MDM029") {
      return `[MDM029] ${e.message}\n다음: modelId 를 확인하세요. 모델 목록은 models(CLI)·listModels(MCP)로 봅니다. 이미 지워진 모델일 수 있습니다(모델 삭제는 되돌릴 수 없고, 같은 모듈로 다시 등록할 수 있습니다).`;
    }
    // 모델 삭제(delete kind=MODEL) 거절. 서버가 준 이유(메시지)를 앞에 두고 코드별 규칙만 알린다. 편집 안내(공동 편집자·getModelText)는 붙이지 않는다.
    if (e.action === "delete" && e.code === "MDM016") {
      return `[MDM016] ${e.message}\n다음: DRAFT 가 없는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN) 역할이 있어야 지울 수 있습니다. 사용자(${config.user})·역할(${config.role})을 확인하고, 관리자에게 부탁하거나 관리자 역할(ERD_ROLE)로 다시 하세요.`;
    }
    if (e.action === "delete" && e.code === "MDM001") {
      return `[MDM001] ${e.message}\n다음: 아무것도 지워지지 않았습니다. 잠시 뒤 같은 삭제를 다시 하세요. 같은 오류가 이어지면 그 모델을 보는 화면·에이전트가 계속 표시를 보내는 것이니 닫은 뒤 하세요.`;
    }
    // 모델 삭제(delete kind=MODEL)의 권한 거절은 편집 권한이 아니다. 서버가 준 이유(메시지)를 앞에 두고 삭제 규칙만 알린다.
    if (e.action === "delete" && (e.code === "MDM003" || e.code === "MDM002")) {
      return `[${e.code}] ${e.message}\n다음: 모델 삭제는 관리자(MDM_STD_ADMIN·SYSADMIN)나 RELEASED·REQUESTED·APPROVED 버전이 하나도 없고 DRAFT 소유자일 때만 됩니다. 사용자(${config.user})·역할(${config.role})을 확인하세요.`;
    }
    if (e.code === "MDM003" || e.code === "MDM002") {
      return `[${e.code}] ${e.message}\n다음: getModelText 머리줄로 DRAFT 인지 보고, 소유자·공동 편집자인지 확인하세요. 둘 다 맞는데 이 오류면 그사이 DRAFT 소유자나 상태가 바뀐 것이니 다시 읽고 한 번만 다시 보내세요. 아니면 사용자에게 DRAFT 선점·공동 편집자 등록을 부탁하세요.`;
    }
    return `[${e.code ?? `HTTP ${e.status}`}] ${e.message}\n다음: 입력을 고쳐 다시 부르세요. 같은 오류가 이어지면 사용자에게 서버 로그 확인을 부탁하세요.`;
  }
  return `${e?.message ?? e}\n다음: 입력을 확인하고 다시 부르세요.`;
}
