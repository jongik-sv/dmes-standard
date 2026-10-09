/**
 * jobSchedMng OASIS 호출 — POST /api/mcm/oasis/jobSchedMng/{list|get|save|setUse|runNow|history|cronPreview|handlers|delete}.
 * 계약: 설계 §7, 계획 Task 10 표. 응답은 data.result(Map). envelope 해제는 csa/commWidgetMng/api.ts 와 같은 규칙이다.
 * meta.userId 는 보내지 않는다 — 서버가 인증 정보로 채운다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import {
  SCREEN_ID,
  type CollectDataQuery,
  type CollectDataResult,
  type CronPreviewResult,
  type HandlerRow,
  type JobDef,
  type JobListFilters,
  type JobListRow,
  type JobRunRow,
  type JobSaveRequest,
  type RunNowResult,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = `/api/mcm/oasis/${SCREEN_ID}`;

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** 봉투를 풀어 data(+data.result)와 grids.{key}.rows 를 한 객체로 합친다. 업무 거절(meta.success=false)은 예외로 던진다. */
export function unwrapPayload(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
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
  return out;
}

/**
 * params 에서 null·undefined 값을 뺀다. cactus 요청 변환기는 params 값마다 TypedObject 를 만드는데
 * null 이면 요청 전체가 실패한다. 빈 칸은 키를 빼서 보내고 서버가 null 로 읽는다.
 */
export function dropNullParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

async function callAction(action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { menuId: SCREEN_ID }, params: dropNullParams(params) },
  });
  return unwrapPayload(res);
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function toJobListRow(r: Record<string, unknown>): JobListRow {
  return {
    jobId: str(r.jobId),
    moduleCd: str(r.moduleCd),
    jobNm: str(r.jobNm),
    jobKind: str(r.jobKind),
    cronExpr: str(r.cronExpr),
    cronDesc: str(r.cronDesc),
    useYn: str(r.useYn),
    nextRunAt: str(r.nextRunAt),
    lastStatus: str(r.lastStatus),
    lastServerNm: str(r.lastServerNm),
    lastEndedAt: str(r.lastEndedAt),
    ownerTp: str(r.ownerTp),
    codeMissing: r.codeMissing === true,
  };
}

export function toJobDef(r: Record<string, unknown>): JobDef {
  return {
    jobId: str(r.jobId),
    moduleCd: str(r.moduleCd),
    jobNm: str(r.jobNm),
    jobKind: str(r.jobKind),
    serviceId: str(r.serviceId),
    svcAction: str(r.svcAction),
    cronExpr: str(r.cronExpr),
    cronDesc: str(r.cronDesc),
    useYn: str(r.useYn),
    configJson: str(r.configJson),
    varsJson: str(r.varsJson),
    optsJson: str(r.optsJson),
    misfireRunYn: str(r.misfireRunYn),
    timeoutSec: num(r.timeoutSec),
    nextRunAt: str(r.nextRunAt),
    jobDesc: str(r.jobDesc),
    ownerTp: str(r.ownerTp),
    ver: num(r.ver),
  };
}

function requireDef(out: Record<string, unknown>): JobDef {
  if (!isRecord(out.def)) throw new Error("서버 응답에 작업 정의가 없습니다.");
  return toJobDef(out.def);
}

/** 목록 — 조건은 비어 있지 않은 것만 보낸다. */
async function list(filters: Partial<JobListFilters> = {}): Promise<JobListRow[]> {
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === "string" && v.trim() !== "") params[k] = v.trim();
  }
  const out = await callAction("list", params);
  return Array.isArray(out.jobs) ? out.jobs.filter(isRecord).map(toJobListRow) : [];
}

async function get(jobId: string): Promise<JobDef> {
  return requireDef(await callAction("get", { jobId }));
}

/** 저장 — ver·newJob 을 그대로 보낸다(낙관적 잠금·신규 판별은 서버가 한다). */
async function save(request: JobSaveRequest): Promise<JobDef> {
  return requireDef(await callAction("save", { ...request }));
}

async function setUse(jobId: string, useYn: "Y" | "N"): Promise<JobDef> {
  return requireDef(await callAction("setUse", { jobId, useYn }));
}

/** 지금 한 번 실행 — accepted=false 면 message 가 거절 사유다. */
async function runNow(jobId: string, varOverrides?: Record<string, string>): Promise<RunNowResult> {
  const out = await callAction("runNow", {
    jobId,
    varOverridesJson: varOverrides && Object.keys(varOverrides).length > 0 ? JSON.stringify(varOverrides) : null,
  });
  return { accepted: out.accepted === true, message: str(out.message), runId: str(out.runId) };
}

async function history(jobId: string, limit = 100): Promise<JobRunRow[]> {
  const out = await callAction("history", { jobId, limit });
  return Array.isArray(out.runs)
    ? out.runs.filter(isRecord).map((r) => ({
        schedAt: str(r.schedAt),
        triggerTp: str(r.triggerTp),
        status: str(r.status),
        serverNm: str(r.serverNm),
        serviceTag: str(r.serviceTag),
        startedAt: str(r.startedAt),
        endedAt: str(r.endedAt),
        itemCnt: r.itemCnt === null || r.itemCnt === undefined ? null : num(r.itemCnt),
        msg: str(r.msg),
        reqUsrId: str(r.reqUsrId),
      }))
    : [];
}

/** 수집 값(읽기 전용) — 서버가 최대 500행, SLOT 내림차순·항목 키 오름차순으로 돌려준다. */
async function collectData(query: CollectDataQuery): Promise<CollectDataResult> {
  const out = await callAction("collectData", { ...query });
  const rows = Array.isArray(out.rows)
    ? out.rows.filter(isRecord).map((r) => ({
        slot: str(r.slot),
        itemKey: str(r.itemKey),
        valueNum: r.valueNum === null || r.valueNum === undefined || r.valueNum === "" ? null : num(r.valueNum),
        valueTxt: str(r.valueTxt),
        collectedAt: str(r.collectedAt),
      }))
    : [];
  return {
    rows,
    truncated: out.truncated === true,
    nextBeforeSlot: str(out.nextBeforeSlot),
    latestSlot: str(out.latestSlot),
    count: out.count === undefined ? rows.length : num(out.count, rows.length),
  };
}

/** 서버가 계산한 설명·다음 예정·오류. 유효하지 않은 식은 valid=false + error. */
async function cronPreview(expr: string): Promise<CronPreviewResult> {
  const out = await callAction("cronPreview", { expr });
  return {
    valid: out.valid === true,
    error: out.error === undefined || out.error === null ? undefined : str(out.error),
    desc: out.desc === undefined || out.desc === null ? undefined : str(out.desc),
    next: Array.isArray(out.next) ? out.next.map(str) : undefined,
    minGapMin: out.minGapMin === undefined || out.minGapMin === null ? undefined : num(out.minGapMin),
  };
}

async function handlers(): Promise<HandlerRow[]> {
  const out = await callAction("handlers");
  return Array.isArray(out.handlers)
    ? out.handlers.filter(isRecord).map((h) => ({
        handlerId: str(h.handlerId),
        moduleCd: str(h.moduleCd),
        handlerNm: str(h.handlerNm),
        defaultCron: str(h.defaultCron),
        varsJson: str(h.varsJson),
        seenAt: str(h.seenAt),
        missing: h.missing === true,
      }))
    : [];
}

/** 화면에서 만든(USER) 작업만 지울 수 있다. */
async function remove(jobId: string): Promise<string> {
  const out = await callAction("delete", { jobId });
  return str(out.deleted) || jobId;
}

export const jobSchedApi = { list, get, save, setUse, runNow, history, collectData, cronPreview, handlers, remove };
