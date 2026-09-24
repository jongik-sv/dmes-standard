/**
 * dme 화면(ruleMng·ruleEdit)의 OASIS BFF 호출 — `POST /api/mdm/oasis/{serviceId}/{action}`(TSK-08-02 design F30).
 *
 * 본문은 `{meta:{menuId}, params, grids?}` 이다. OASIS 는 params 의 null 값을 받지 못하므로(“object is null”) null·undefined 칸은
 * 빼고 보낸다. 배열은 params 가 아니라 `grids.<이름>.rows` 로 보낸다(params 배열은 “Generic type” 오류, design Build 이탈 B4).
 */
import { apiRequest } from "@dk-oasis/shared/http";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
  errors?: Array<{ code?: string; field?: string; message?: string }>;
}

/** 서버가 거부한 요청. `code` 는 알 수 있으면 `MDMnnn`·cactus 코드. */
export class OasisCallError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "OasisCallError";
    this.code = code;
  }
}

/** MDM001(row_version 충돌)의 기본 문구 — BPMN 경로에서 meta.message 는 이 문구로 시작한다. */
const ROW_VERSION_CONFLICT_MESSAGE = "다른 사용자가 수정했습니다";

/** row_version 충돌(MDM001)인가. 코드가 오지 않는 경로도 있어 문구로도 본다. */
export function isRowVersionConflict(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e instanceof OasisCallError && e.code === "MDM001") return true;
  return e.message.includes("MDM001") || e.message.startsWith(ROW_VERSION_CONFLICT_MESSAGE);
}

export function omitNullish(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
}

function unwrap<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    const base = env.meta.message?.trim() || "요청이 거부되었습니다.";
    const details = (env.errors ?? [])
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .filter((m): m is string => !!m && m !== base);
    const code = env.meta.code ?? env.errors?.find((e) => e.code)?.code ?? null;
    throw new OasisCallError(details.length > 0 ? `${base}\n- ${details.join("\n- ")}` : base, code);
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  return out as T;
}

export async function callOasis<T>(
  serviceId: string,
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<T> {
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${serviceId}/${action}`, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: serviceId },
      params: omitNullish(params),
      ...(grids ? { grids } : {}),
    }),
  });
  return unwrap<T>(res);
}
