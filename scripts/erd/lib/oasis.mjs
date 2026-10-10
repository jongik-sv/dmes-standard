// MDM 서버 OASIS erdEdit 를 부르는 작은 클라이언트. scripts/mdm-meta/register-columns.mjs 의 oasis() 와 같은 규칙이다.
// 로컬 전용 인증(스펙 D12): X-Client-Key + 사용자 헤더. node 18.17 내장 fetch·AbortSignal.timeout 만 쓴다.

export const DEFAULTS = Object.freeze({
  base: "http://localhost:8096",
  clientKey: "dmes-bff-local-client-key-2026",
  user: "erd-mcp",
  role: "MDM_STEWARD",
  timeoutMs: 30000,
});

/** 환경변수 → 설정. ERD_BASE·ERD_USER·ERD_ROLE·BACKEND_CLIENT_KEY·ERD_SESSION, 비면 기본값. */
export function configFromEnv(env) {
  const user = env.ERD_USER || DEFAULTS.user;
  return {
    base: (env.ERD_BASE || DEFAULTS.base).replace(/\/+$/, ""),
    clientKey: env.BACKEND_CLIENT_KEY || DEFAULTS.clientKey,
    user,
    role: env.ERD_ROLE || DEFAULTS.role,
    session: env.ERD_SESSION || `mcp-${user}`,
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

/** @returns {{config: object, call: (action: string, params: object) => Promise<any>}} */
export function createOasisClient(config, fetchImpl = globalThis.fetch) {
  async function call(action, params = {}) {
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
        body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: compact(params) }),
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
    return body.data?.result ?? body.data ?? {};
  }
  return { config, call };
}

/** 오류를 LLM 이 다음에 할 일까지 읽을 수 있는 문장으로(스펙 4.5). */
export function describeError(e, config) {
  if (e instanceof OasisUnreachableError) {
    return `${e.message}\n다음: MDM 서버(기본 포트 8096)를 켜거나 ERD_BASE 환경변수를 확인한 뒤 같은 도구를 다시 부르세요.`;
  }
  if (e instanceof OasisError) {
    if (e.status === 401 || e.status === 403) {
      return `인증이 거절되었습니다(HTTP ${e.status}): ${e.message}\n다음: BACKEND_CLIENT_KEY 가 서버의 cactus.security.client-key 와 같은지, ERD_USER(${config.user})·ERD_ROLE(${config.role})이 맞는지 확인하세요.`;
    }
    if (e.code === "MDM029") {
      return `[MDM029] ${e.message}\n다음: modelId 를 확인하세요. 모델 목록은 m-mdm ERD 화면에서 보거나 OASIS erdEdit/search 로 읽습니다.`;
    }
    return `[${e.code ?? `HTTP ${e.status}`}] ${e.message}\n다음: 입력을 고쳐 다시 부르세요. 같은 오류가 이어지면 사용자에게 서버 로그 확인을 부탁하세요.`;
  }
  return `${e?.message ?? e}\n다음: 입력을 확인하고 다시 부르세요.`;
}
