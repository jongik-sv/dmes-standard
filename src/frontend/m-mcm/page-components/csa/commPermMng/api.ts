/**
 * commPermMng(퍼미션 관리) 화면의 OASIS BFF 호출 래퍼 — perm-bench 새 설계(types.ts 머리 주석이 계약 정본).
 *
 * 호출: POST /api/mcm/oasis/commPermMng/{action}
 *   - lov           — 역할·메뉴 고르기 목록
 *   - search        — 퍼미션 목록(역할 × 오브젝트, 페이지)
 *   - searchPermOne — 퍼미션 한 건의 받는 사람·같은 화면 다른 퍼미션
 *   - save          — PK merge·delete. 목록 입력은 grids.perms.rows(D36 — params 배열 아님)
 *
 * 본 모듈(mcm)은 SqlSession 빈 미등록 — OASIS(`/api/mcm/oasis/...`)만 쓴다.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  PermMenuLov,
  PermOtherRow,
  PermRoleGroupRow,
  PermRoleLov,
  PermRow,
  PermSaveRow,
  PermSearchParams,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commPermMng";

/**
 * Cactus 표준 응답 envelope — 단일 값은 data.{key}, List 는 grids.{key}.rows.
 * BPMN output="result" + Map 반환이면 data.result 안의 키를 그대로 펼친다.
 */
interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
  errors?: { code?: string; message?: string }[];
}

/** 거절 문구 — BE 는 "CODE: 상세" 로 보낸다. 코드가 따로 칸(meta.code·errors[0].code)에만 있으면 앞에 붙여 화면 판정이 같게 한다. */
export function rejectMessage(env: CactusEnvelope): string {
  const msg = env.meta?.message?.trim() || env.errors?.[0]?.message?.trim() || "요청이 거부되었습니다.";
  const code = env.meta?.code || env.errors?.[0]?.code;
  return code && !msg.startsWith(code) ? `${code}: ${msg}` : msg;
}

function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  // OASIS 실행기는 실패를 HTTP 200 + meta.success=false + meta.message 로 돌려준다 — 여기서 던져야 화면이 실패를 안다.
  if (env?.meta && env.meta.success === false) {
    throw new Error(rejectMessage(env));
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out as T;
}

async function callAction<T>(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<T> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: {
      meta: { userId: "admin", menuId: "commPermMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

export interface PermLovPayload {
  roles: PermRoleLov[];
  menus: PermMenuLov[];
}

export interface PermSearchPayload {
  perms: PermRow[];
  TOTAL_CNT: number;
}

export interface PermOnePayload {
  others: PermOtherRow[];
  groups: PermRoleGroupRow[];
  USER_CNT: number;
}

export interface PermSavePayload {
  cnt_merge: number;
  cnt_delete: number;
}

/** action=lov — 역할(SYSADMIN 제외)·메뉴(모듈·폴더) 목록. */
export async function lov(): Promise<PermLovPayload> {
  const r = await callAction<Partial<PermLovPayload>>("lov", {});
  return { roles: r.roles ?? [], menus: r.menus ?? [] };
}

/** action=search — 퍼미션 목록(한 줄 = 역할 × 오브젝트) + 전체 건수. */
export async function searchCmPerm(q: PermSearchParams): Promise<PermSearchPayload> {
  const r = await callAction<Partial<PermSearchPayload>>("search", { ...q });
  return { perms: r.perms ?? [], TOTAL_CNT: Number(r.TOTAL_CNT ?? 0) };
}

/** action=searchPermOne — 고른 퍼미션의 같은 화면 다른 퍼미션·역할 그룹·받는 사람 수. */
export async function searchPermOne(roleId: string, objectId: string): Promise<PermOnePayload> {
  const r = await callAction<Partial<PermOnePayload>>("searchPermOne", { roleId, objectId });
  return { others: r.others ?? [], groups: r.groups ?? [], USER_CNT: Number(r.USER_CNT ?? 0) };
}

/** action=save — 바뀐 퍼미션만 grids.perms.rows 로(OP_TP MERGE·DEL). */
export async function saveCmPerm(rows: PermSaveRow[]): Promise<PermSavePayload> {
  const r = await callAction<Partial<PermSavePayload>>("save", {}, { perms: { rows } });
  return { cnt_merge: Number(r.cnt_merge ?? 0), cnt_delete: Number(r.cnt_delete ?? 0) };
}
