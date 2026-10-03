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

/**
 * row_version 충돌(MDM001) 안내 — 룰 화면(ruleEdit)·룰 상세(ruleMng)·룰 세트 편집(ruleSetEdit)이 같은 문구를 쓴다(ruleEdit 기능설계서 §6.2).
 * 서버 문구("다른 사용자가 수정했습니다")를 그대로 보이지 않고, 화면은 이 문구와 함께 [다시 불러오기] 를 준다.
 */
export const CONFLICT_MESSAGE = "다른 창에서 바뀌었습니다. 다시 불러오세요";

/** 쓰기 실패를 화면 안내로 바꾼다 — 충돌(MDM001)이면 `CONFLICT_MESSAGE` 와 `conflict: true`, 그 밖은 서버 문구 그대로. */
export function writeFailure(e: unknown): { conflict: boolean; message: string } {
  if (isRowVersionConflict(e)) return { conflict: true, message: CONFLICT_MESSAGE };
  return { conflict: false, message: e instanceof Error ? e.message : String(e) };
}

/** DRAFT 가 아니거나(MDM002) 내 DRAFT 가 아니다(MDM003) — 다른 곳에서 확정·넘기기·삭제됐다(D-144 2단계). 코드가 없는 경로는 문구로 본다. */
export function isDraftGone(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e instanceof OasisCallError && (e.code === "MDM002" || e.code === "MDM003")) return true;
  return e.message.startsWith("DRAFT 상태에서만") || e.message.startsWith("DRAFT 소유자만");
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
