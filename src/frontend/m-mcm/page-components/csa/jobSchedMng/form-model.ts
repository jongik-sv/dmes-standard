/**
 * jobSchedMng 상세 폼 모델 — 새 작업·복사 만들기, 서버 정의 ↔ 폼 변환, 저장 요청 만들기, 저장 전 검사.
 * 순수 함수만 둔다. @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared 런타임 없이 시험한다).
 * 유형별 입력은 저장할 때 유형에 맞는 것만 configJson 으로 모으므로, 유형을 바꿔도 이전 유형의 설정은 서버에 가지 않는다.
 */
import type { JobVarRow, VariableType } from "@dk-oasis/shared/variable-table";

import { kindLabel } from "./kind-label";
import type { HandlerRow, JobDef, JobGridRow, JobKind, JobListRow, JobRunGridRow, JobRunRow, JobSaveRequest } from "./types";

export const JOB_ID_PATTERN = /^[A-Za-z0-9_.-]{1,60}$/;
const VAR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;
/** 서버 JobSchedMngService 의 서비스 ID·Action 형식(서비스 ID 는 ^ 를 쓸 수 있다). */
const SERVICE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_^.-]{0,199}$/;
const ACTION_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
/** 서버 JobVars 의 한도·예약어·실행 변수 — @dk-oasis/shared 를 런타임 import 하지 않으므로 RUNTIME_VARIABLES 와 같은 값을 여기 둔다. */
const MAX_VARS = 30;
const MAX_VAR_VALUE_LENGTH = 1000;
const RESERVED_VAR_NAMES: readonly string[] = ["action", "sql", "handlerId", "source", "save"];
const RUNTIME_VAR_VALUES: readonly string[] = [":schedAt", ":now", ":today", ":yesterday", ":monthStart", ":prevMonthStart", ":bizDate", ":bizYesterday", ":prevRunAt", ":jobId", ":moduleCd"];
/** 서버 CollectConfigs 의 한도. */
const COLLECT_ITEMS_MAX = 20;
const COLLECT_KEY_MAX = 100;
const COLLECT_PATH_MAX = 200;
const COLLECT_URL_MAX = 500;
const COLLECT_FIELD_MAX = 100;
/** 목록 응답의 서버 상한(JobDefStore.LIST_MAX) — 총건수 칸이 없어 이 건수에 닿으면 잘렸을 수 있다. */
export const JOB_LIST_MAX = 500;
/** 목록이 서버 상한에 닿아 뒤쪽 작업이 잘렸을 수 있는가. */
export const isJobListTruncated = (count: number): boolean => count >= JOB_LIST_MAX;
/** 예약 작업이 쓰는 내장 서비스 ID — 서비스 실행 유형에는 쓸 수 없다(쿼리 실행·수집·코드 실행 유형이 대신한다). */
export const BUILTIN_SERVICE_IDS: readonly string[] = ["jobDispatch", "jobCode", "jobQuery", "jobCollect"];
const VARIABLE_TYPES: readonly VariableType[] = ["STRING", "NUMBER", "DATE", "JSON"];

/** 유형별 시간 초과 기본값(초) — 설계 §5.1. */
export const DEFAULT_TIMEOUT_SEC: Record<JobKind, number> = { CODE: 1800, BPMN: 600, QUERY: 600, COLLECT: 120 };

/** unsupported = 저장된 정의의 원천을 이 화면이 모른다(예: 2026-10-09 제거한 exchange) — 고칠 때까지 저장할 수 없다. */
export type CollectSourceKind = "sql" | "http" | "unsupported";

export interface CollectItemRow {
  key: string;
  path: string;
}

/** 상세 폼. 숫자 칸은 입력 도중 비울 수 있게 글자로 둔다. isNew 는 아직 저장하지 않은 새 작업(또는 사본)이다. */
export interface JobForm {
  isNew: boolean;
  /** CODE(코드가 등록한 작업)면 이름·유형·처리기·변수 이름 형식을 바꿀 수 없다. 새 작업은 USER. */
  ownerTp: string;
  /** 낙관적 잠금 번호. 새 작업은 없다. */
  ver?: number;
  /** CODE 유형인데 처리기가 최근 기동 목록에 없다. */
  codeMissing: boolean;
  jobId: string;
  moduleCd: string;
  jobNm: string;
  jobKind: JobKind;
  jobDesc: string;
  useYn: "Y" | "N";
  cronExpr: string;
  timeoutSec: string;
  retryCount: string;
  retryIntervalMin: string;
  /** 놓친 회차 한 번 실행 — 켜면 MCM 이 꺼져 있다 돌아와 놓친 회차를 건너뛰지 않고 한 번 실행한다(기본 꺼짐, 서버 MISFIRE_RUN_YN). */
  misfireRunOnce: boolean;
  /** retry 밖의 고급 설정 키 — 화면이 모르는 키도 저장 때 그대로 돌려보낸다. */
  extraOpts: Record<string, unknown>;
  /** BPMN */
  serviceId: string;
  svcAction: string;
  /** CODE */
  handlerId: string;
  /** QUERY */
  sql: string;
  /** COLLECT */
  collectKind: CollectSourceKind;
  collectSql: string;
  valueField: string;
  keyField: string;
  collectUrl: string;
  /** HTTP 수집: 일시 오류(503·502·504·429·연결 시간 초과)일 때 몇 초 뒤 한 번 다시 부른다. 저장된 설정에 키가 없으면 끔(기존 작업 동작 그대로). */
  retryTransient: boolean;
  items: CollectItemRow[];
  /** false 면 읽기만 하고 수집 값 표에 저장하지 않는다(외부 트리거용). */
  save: boolean;
  vars: JobVarRow[];
}

/** 새 작업 — 선택한 유형의 기본값. */
export function emptyForm(kind: JobKind, moduleCd = "MCM"): JobForm {
  return {
    isNew: true,
    ownerTp: "USER",
    ver: undefined,
    codeMissing: false,
    jobId: "",
    moduleCd,
    jobNm: "",
    jobKind: kind,
    jobDesc: "",
    useYn: "Y",
    cronExpr: "0 2 * * *",
    timeoutSec: String(DEFAULT_TIMEOUT_SEC[kind]),
    retryCount: "0",
    retryIntervalMin: "5",
    misfireRunOnce: false,
    extraOpts: {},
    serviceId: "",
    svcAction: "",
    handlerId: "",
    sql: "",
    collectKind: "sql",
    collectSql: "",
    valueField: "",
    keyField: "",
    collectUrl: "",
    retryTransient: true,   // 새 작업의 기본은 켬 — 저장된 기존 작업은 키가 없으면 끔이다(toForm)
    items: [],
    save: true,
    vars: [],
  };
}

/** 저장 전(새 작업) 유형을 바꾼다 — 공통 칸(ID·이름·설명·사용·일정·모듈)만 이어받고 이전 유형의 설정·변수는 버린다. */
export function switchKind(form: JobForm, kind: JobKind): JobForm {
  if (kind === form.jobKind) return form;
  return {
    ...emptyForm(kind, form.moduleCd),
    jobId: form.jobId,
    jobNm: form.jobNm,
    jobDesc: form.jobDesc,
    useYn: form.useYn,
    cronExpr: form.cronExpr,
  };
}

/** 모듈을 바꾸면 고른 처리기가 그 모듈 것이 아니므로 비운다. */
export function changeModule(form: JobForm, moduleCd: string): JobForm {
  if (moduleCd === form.moduleCd) return form;
  return {
    ...form,
    moduleCd,
    handlerId: form.jobKind === "CODE" ? "" : form.handlerId,
    vars: form.jobKind === "CODE" ? [] : form.vars,
  };
}

/** 처리기를 고르면 이름(비었을 때)·기본 일정·기본 변수를 채운다. */
export function applyHandler(form: JobForm, handler: HandlerRow | null): JobForm {
  if (!handler) return { ...form, handlerId: "", vars: [] };
  return {
    ...form,
    handlerId: handler.handlerId,
    jobNm: form.jobNm.trim() === "" ? handler.handlerNm : form.jobNm,
    cronExpr: handler.defaultCron ? handler.defaultCron : form.cronExpr,
    vars: parseVars(handler.varsJson),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

function parseObject(json: string): Record<string, unknown> {
  if (!json || json.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 변수 JSON(`[{name,type,value,desc}]`)을 표 행으로 읽는다. 읽을 수 없으면 빈 목록. */
export function parseVars(json: string): JobVarRow[] {
  if (!json || json.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((r) => ({
      name: text(r.name),
      type: VARIABLE_TYPES.includes(r.type as VariableType) ? (r.type as VariableType) : "STRING",
      value: text(r.value),
      desc: text(r.desc),
    }));
  } catch {
    return [];
  }
}

/** 표 행을 서버로 보낼 변수 JSON 글자로 만든다 — 칸 순서를 고정하고 이름은 앞뒤 공백을 지운다. */
export function serializeVars(vars: readonly JobVarRow[]): string {
  return JSON.stringify(vars.map((v) => ({ name: v.name.trim(), type: v.type, value: v.value, desc: v.desc ?? "" })));
}

/** 서버 정의(get·save 응답)를 폼으로. 유형에 맞는 configJson 만 읽는다. */
export function toForm(def: JobDef, codeMissing = false): JobForm {
  const kind = (["CODE", "BPMN", "QUERY", "COLLECT"].includes(def.jobKind) ? def.jobKind : "BPMN") as JobKind;
  const base = emptyForm(kind, def.moduleCd || "MCM");
  const opts = parseObject(def.optsJson);
  const { retry, ...extraOpts } = opts;
  const retryObj = isRecord(retry) ? retry : {};
  const form: JobForm = {
    ...base,
    isNew: false,
    ownerTp: def.ownerTp || "USER",
    ver: def.ver,
    codeMissing,
    jobId: def.jobId,
    jobNm: def.jobNm,
    jobDesc: def.jobDesc,
    useYn: def.useYn === "N" ? "N" : "Y",
    cronExpr: def.cronExpr,
    timeoutSec: String(def.timeoutSec || DEFAULT_TIMEOUT_SEC[kind]),
    retryCount: String(typeof retryObj.count === "number" ? retryObj.count : 0),
    retryIntervalMin: String(typeof retryObj.intervalMin === "number" ? retryObj.intervalMin : 5),
    misfireRunOnce: def.misfireRunYn === "Y",
    extraOpts,
    vars: parseVars(def.varsJson),
  };
  const config = parseObject(def.configJson);
  switch (kind) {
    case "CODE":
      form.handlerId = text(config.handlerId);
      break;
    case "BPMN":
      form.serviceId = def.serviceId;
      form.svcAction = def.svcAction;
      break;
    case "QUERY":
      form.sql = text(config.sql);
      break;
    case "COLLECT": {
      const source = isRecord(config.source) ? config.source : {};
      const sourceKind = text(source.kind);
      form.collectKind = sourceKind === "http" ? "http" : sourceKind === "sql" || sourceKind === "" ? "sql" : "unsupported";
      form.collectSql = text(source.sql);
      form.valueField = text(source.valueField);
      form.keyField = text(source.keyField);
      form.collectUrl = text(source.url);
      form.retryTransient = source.retryTransient === true;
      form.items = Array.isArray(source.items)
        ? source.items.filter(isRecord).map((i) => ({ key: text(i.key), path: text(i.path) }))
        : [];
      form.save = config.save !== false;
      break;
    }
    default:
      break;
  }
  return form;
}

/** 저장 전(새 작업)으로 되돌린 사본 — ID 는 비우고 이름 끝에 「(사본)」 을 붙인다. 코드가 등록한 작업은 복사하지 않는다. */
export function copyForm(source: JobForm): JobForm {
  return {
    ...source,
    isNew: true,
    ownerTp: "USER",
    ver: undefined,
    codeMissing: false,
    jobId: "",
    jobNm: `${source.jobNm} (사본)`,
    items: source.items.map((i) => ({ ...i })),
    vars: source.vars.map((v) => ({ ...v })),
    extraOpts: { ...source.extraOpts },
  };
}

export function isFormDirty(baseline: JobForm | null, form: JobForm | null): boolean {
  if (!baseline || !form) return false;
  return JSON.stringify(baseline) !== JSON.stringify(form);
}

/** 수집 작업 실행 간격 하한(분) — SQL·HTTP 5분. 다른 유형은 없다. */
export function collectMinGapMin(form: Pick<JobForm, "jobKind" | "collectKind">): number | undefined {
  if (form.jobKind !== "COLLECT") return undefined;
  return 5;
}

function collectConfig(form: JobForm): Record<string, unknown> {
  let source: Record<string, unknown>;
  if (form.collectKind === "http") {
    source = {
      kind: "http",
      url: form.collectUrl.trim(),
      retryTransient: form.retryTransient,
      items: form.items.map((i) => ({ key: i.key.trim(), path: i.path.trim() })),
    };
  } else {
    source = { kind: "sql", sql: form.collectSql, valueField: form.valueField.trim() };
    if (form.keyField.trim() !== "") source.keyField = form.keyField.trim();
  }
  return { source, save: form.save };
}

/** 유형에 맞는 설정만 담은 configJson. BPMN 은 설정이 없다(undefined). */
export function buildConfigJson(form: JobForm): string | undefined {
  switch (form.jobKind) {
    case "CODE":
      return JSON.stringify({ handlerId: form.handlerId });
    case "QUERY":
      return JSON.stringify({ sql: form.sql });
    case "COLLECT":
      return JSON.stringify(collectConfig(form));
    default:
      return undefined;
  }
}

function buildOptsJson(form: JobForm): string | undefined {
  const opts: Record<string, unknown> = { ...form.extraOpts };
  const count = Number(form.retryCount);
  if (Number.isInteger(count) && count > 0) opts.retry = { count, intervalMin: Number(form.retryIntervalMin) };
  return Object.keys(opts).length === 0 ? undefined : JSON.stringify(opts);
}

/** save 요청 params. BPMN 의 Action 은 예약 키 action 이 아니라 svcAction 으로 보낸다. */
export function toSaveRequest(form: JobForm): JobSaveRequest {
  const request: JobSaveRequest = {
    jobId: form.jobId.trim(),
    moduleCd: form.moduleCd,
    jobNm: form.jobNm.trim(),
    jobKind: form.jobKind,
    cronExpr: form.cronExpr.trim(),
    useYn: form.useYn,
    configJson: buildConfigJson(form),
    varsJson: serializeVars(form.vars),
    optsJson: buildOptsJson(form),
    misfireRunYn: form.misfireRunOnce ? "Y" : "N",
    jobDesc: form.jobDesc.trim() === "" ? undefined : form.jobDesc.trim(),
    timeoutSec: Number(form.timeoutSec),
    ver: form.isNew ? undefined : form.ver,
    newJob: form.isNew,
  };
  if (form.jobKind === "BPMN") {
    request.serviceId = form.serviceId.trim();
    request.svcAction = form.svcAction.trim();
  }
  return request;
}

const isInt = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

/** yyyy-MM-dd 또는 yyyy-MM-dd HH:mm[:ss](공백·T 모두) — 서버 JobVars.normalizeDate 가 받는 모양. 실제 달력에 있는 날짜·시각이어야 한다. */
function isServerDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  return h < 24 && mi < 60 && sec < 60;
}

/** 서버 JobVars.isNumber(BigDecimal) 가 받는 숫자 모양. */
const isServerNumber = (value: string): boolean => /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value);

function validateVariable(v: JobVarRow): string | null {
  if (v.value.length > MAX_VAR_VALUE_LENGTH) return `변수 ${v.name} 의 값은 ${MAX_VAR_VALUE_LENGTH}자까지입니다.`;
  const value = v.value.trim();
  if (value === "") return null;
  if (value.startsWith(":")) {
    return RUNTIME_VAR_VALUES.includes(value) ? null : `알 수 없는 실행 변수입니다: ${value} (${[...RUNTIME_VAR_VALUES].sort().join(" ")})`;
  }
  if (v.type === "NUMBER" && !isServerNumber(value)) return `변수 ${v.name} 의 값이 숫자가 아닙니다.`;
  if (v.type === "DATE" && !isServerDate(value)) return `변수 ${v.name} 의 값은 YYYY-MM-DD 또는 YYYY-MM-DD HH:mm[:ss] 이거나 실행 변수(:today 등)여야 합니다.`;
  if (v.type === "JSON") {
    try {
      JSON.parse(value);
    } catch {
      return `변수 ${v.name} 의 값이 올바른 JSON 이 아닙니다.`;
    }
  }
  return null;
}

function validateCollect(form: JobForm): string | null {
  if (form.collectKind === "sql") {
    if (form.collectSql.trim() === "") return "원천 SQL 을 입력하세요.";
    if (form.valueField.trim() === "") return "값 칸을 입력하세요.";
    if (form.valueField.trim().length > COLLECT_FIELD_MAX || form.keyField.trim().length > COLLECT_FIELD_MAX) return `값 칸·항목 칸은 ${COLLECT_FIELD_MAX}자 이하로 입력하세요.`;
    return null;
  }
  if (form.collectKind === "http") {
    const url = form.collectUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return "수집 주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다.";
    if (url.length > COLLECT_URL_MAX) return `수집 주소는 ${COLLECT_URL_MAX}자 이하여야 합니다.`;
    if (/^https?:\/\/[^/?#]*@/i.test(url)) return "수집 주소에는 사용자 정보(user:password@)를 쓸 수 없습니다.";
    if (form.items.length === 0) return "수집 항목을 하나 이상 추가하세요.";
    if (form.items.length > COLLECT_ITEMS_MAX) return `수집 항목은 ${COLLECT_ITEMS_MAX}개까지입니다.`;
    if (form.items.some((i) => i.key.trim() === "" || i.path.trim() === "")) return "수집 항목의 키와 경로를 모두 입력하세요.";
    if (form.items.some((i) => i.key.trim().length > COLLECT_KEY_MAX)) return `수집 항목의 키는 ${COLLECT_KEY_MAX}자 이하여야 합니다.`;
    if (form.items.some((i) => i.path.trim().length > COLLECT_PATH_MAX)) return `수집 항목의 경로는 ${COLLECT_PATH_MAX}자 이하여야 합니다.`;
    const keys = form.items.map((i) => i.key.trim());
    if (new Set(keys).size !== keys.length) return "수집 항목의 키가 겹칩니다.";
    return null;
  }
  return "지원하지 않는 수집 원천입니다. 원천을 SQL 또는 HTTP JSON 으로 바꿔 저장하세요(환율 수집은 MDM 환율 마스터로 일원화되어 제거됨).";
}

/**
 * 저장을 막는 첫 오류 문구. 비어 있으면 null. 서버가 같은 검사를 다시 하므로 여기서는 빠른 안내용으로 거른다.
 * 일정 식 검사는 shared 의 validateCron 이 맡으므로 화면이 결과를 cronError 로 넘긴다(m-mcm 시험이 shared 런타임을 쓰지 않는다).
 */
export function validateForm(form: JobForm, options: { cronError?: string | null } = {}): string | null {
  if (form.isNew) {
    if (form.jobId.trim() === "") return "작업 ID 를 입력하세요.";
    if (!JOB_ID_PATTERN.test(form.jobId.trim())) return "작업 ID 는 영문·숫자·_ . - 만 쓸 수 있습니다(60자 이내).";
  }
  if (form.jobNm.trim() === "") return "작업명을 입력하세요.";
  if (form.jobNm.trim().length > 100) return "작업명은 100자 이내로 입력하세요.";
  if (form.jobDesc.length > 500) return "설명은 500자 이내로 입력하세요.";

  if (form.cronExpr.trim() === "") return "일정을 입력하세요.";
  if (options.cronError) return `일정: ${options.cronError}`;

  if (!isInt(form.timeoutSec, 10, 86400)) return "시간 초과(초)는 10~86400 사이의 정수로 입력하세요.";
  if (!isInt(form.retryCount, 0, 5)) return "재시도 횟수는 0~5 사이의 정수로 입력하세요.";
  if (Number(form.retryCount) > 0 && !isInt(form.retryIntervalMin, 1, 120)) return "재시도 간격(분)은 1~120 사이의 정수로 입력하세요.";

  switch (form.jobKind) {
    case "CODE":
      if (form.handlerId.trim() === "") return "처리기를 고르세요.";
      break;
    case "BPMN":
      if (form.serviceId.trim() === "") return "서비스 ID 를 입력하세요.";
      if (BUILTIN_SERVICE_IDS.includes(form.serviceId.trim())) return "내장 서비스(jobDispatch·jobCode·jobQuery·jobCollect)는 코드 실행·쿼리 실행·수집 유형으로 등록하세요.";
      if (!SERVICE_ID_PATTERN.test(form.serviceId.trim())) return "서비스 ID 는 영문으로 시작하는 영문·숫자·_ ^ . - 200자 이내여야 합니다.";
      if (form.svcAction.trim() === "") return "Action 을 입력하세요.";
      if (!ACTION_PATTERN.test(form.svcAction.trim())) return "Action 은 영문으로 시작하는 영문·숫자·_ 50자 이내여야 합니다.";
      break;
    case "QUERY":
      if (form.sql.trim() === "") return "실행할 SQL 을 입력하세요.";
      break;
    case "COLLECT": {
      const error = validateCollect(form);
      if (error) return error;
      break;
    }
    default:
      break;
  }

  if (form.vars.length > MAX_VARS) return `변수는 ${MAX_VARS}개까지 쓸 수 있습니다.`;
  const seen = new Set<string>();
  for (const v of form.vars) {
    const name = v.name.trim();
    if (name === "") return "이름이 빈 변수가 있습니다.";
    if (!VAR_NAME_PATTERN.test(name)) return `변수 이름 ${name} 은 영문으로 시작하는 영문·숫자·_ 30자 이내여야 합니다.`;
    if (RESERVED_VAR_NAMES.includes(name)) return `변수 이름 ${name} 은(는) 예약어입니다(${RESERVED_VAR_NAMES.join(" ")}).`;
    if (seen.has(name)) return `변수 이름 ${name} 이 두 번 쓰였습니다.`;
    seen.add(name);
    const message = validateVariable(v);
    if (message) return message;
  }
  return null;
}

/** "2026-10-09T01:02:03" → "2026-10-09 01:02" (초까지 필요하면 withSeconds). 비었거나 모르는 모양이면 그대로. */
export function formatTimestamp(iso: string, withSeconds = false): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/.exec(iso);
  if (!m) return iso;
  return withSeconds && m[3] ? `${m[1]} ${m[2]}${m[3]}` : `${m[1]} ${m[2]}`;
}

/** 시작~끝의 소요 글자("1분 05초"). 끝이 없으면 빈 글자. */
export function formatDuration(startedAt: string, endedAt: string): string {
  if (!startedAt || !endedAt) return "";
  const a = Date.parse(startedAt);
  const b = Date.parse(endedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "";
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return `${min}분 ${String(rest).padStart(2, "0")}초`;
  return `${Math.floor(min / 60)}시간 ${String(min % 60).padStart(2, "0")}분`;
}

/** 목록 응답 한 줄을 그리드 행으로 — 다음 예정은 사용 중이고 코드가 있을 때만 보인다. */
export function toJobGridRow(r: JobListRow): JobGridRow {
  const active = r.useYn !== "N" && !r.codeMissing;
  return {
    jobId: r.jobId,
    moduleCd: r.moduleCd,
    jobNm: r.jobNm,
    jobKind: r.jobKind,
    kindLabel: kindLabel(r.jobKind),
    cronExpr: r.cronExpr,
    cronDesc: r.cronDesc,
    useYn: r.useYn,
    nextRun: active && r.nextRunAt ? formatTimestamp(r.nextRunAt) : "-",
    lastStatus: r.lastStatus,
    lastServerNm: r.lastServerNm,
    codeMissing: r.codeMissing,
  };
}

/** 이력 응답 한 줄을 그리드 행으로. 같은 예정 시각에 일정·수동이 함께 있을 수 있어 구분을 키에 넣는다. */
export function toRunGridRow(r: JobRunRow): JobRunGridRow {
  return {
    rowId: `${r.schedAt}|${r.triggerTp}`,
    schedAt: formatTimestamp(r.schedAt, true),
    trigger: r.triggerTp === "M" ? "수동" : r.triggerTp === "C" ? "놓친 회차" : "일정",
    status: r.status,
    serverNm: r.serverNm,
    serviceTag: r.serviceTag,
    startedAt: formatTimestamp(r.startedAt, true),
    endedAt: formatTimestamp(r.endedAt, true),
    duration: formatDuration(r.startedAt, r.endedAt),
    itemCnt: r.itemCnt,
    msg: r.msg,
  };
}
