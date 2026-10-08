/** 예약 작업 상세 폼 모델 — 새 작업·복사 만들기, 저장 전 검사, 변경 여부 판정. */
import {
  emptyConfig,
  type JobKind,
  type JobRecord,
  type JobVariable,
} from "../../data/job-scheduler-mock";
import { validateCron } from "./cron";

/** 상세 폼. isNew 는 아직 저장하지 않은 새 작업(또는 사본)이라는 뜻이다. */
export interface JobForm extends JobRecord {
  isNew: boolean;
}

export const JOB_ID_PATTERN = /^[A-Za-z0-9_.-]{1,60}$/;
const BIND_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 수집 작업 실행 간격 하한(분). 환율은 60분. */
export function collectMinGapMin(form: JobRecord): number | undefined {
  if (form.kind !== "COLLECT") return undefined;
  return form.config.collectSource === "EXCHANGE" ? 60 : 5;
}

export function blankJob(kind: JobKind): JobForm {
  return {
    jobId: "",
    module: "MCM",
    name: "",
    kind,
    desc: "",
    useYn: "Y",
    cron: "0 2 * * *",
    timeoutSec: kind === "COLLECT" ? "120" : "1800",
    retryCount: "0",
    retryIntervalMin: "5",
    nextJobId: "",
    alertTo: "",
    variables: [],
    config: emptyConfig(),
    isNew: true,
  };
}

export function toForm(job: JobRecord): JobForm {
  return { ...job, variables: job.variables.map((v) => ({ ...v })), config: { ...job.config, items: job.config.items.map((i) => ({ ...i })), currencies: [...job.config.currencies] }, isNew: false };
}

/** 코드 작업이 아닌 작업의 사본 — ID 는 비우고 이름 끝에 「(사본)」 을 붙인다. 저장 전에는 아무것도 만들어지지 않는다. */
export function copyForm(source: JobForm): JobForm {
  const copy = toForm(source);
  return { ...copy, jobId: "", name: `${source.name} (사본)`, isNew: true, codeMissing: undefined };
}

export function toRecord(form: JobForm): JobRecord {
  const { isNew: _isNew, ...rest } = form;
  return rest;
}

export function isFormDirty(baseline: JobForm | null, form: JobForm | null): boolean {
  if (!baseline || !form) return false;
  return JSON.stringify(baseline) !== JSON.stringify(form);
}

const isPositiveInt = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 1;
const isNonNegativeInt = (v: string) => /^\d+$/.test(v.trim());

function validateVariable(v: JobVariable): string | null {
  const value = v.value.trim();
  if (value === "" || value.startsWith(":")) return null;
  if (v.type === "NUMBER" && Number.isNaN(Number(value))) return `변수 ${v.name} 의 값이 숫자가 아닙니다.`;
  if (v.type === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `변수 ${v.name} 의 값은 YYYY-MM-DD 이거나 실행 변수(:today 등)여야 합니다.`;
  if (v.type === "JSON") {
    try {
      JSON.parse(value);
    } catch {
      return `변수 ${v.name} 의 값이 올바른 JSON 이 아닙니다.`;
    }
  }
  return null;
}

/** 저장을 막는 오류 목록. 비어 있으면 저장할 수 있다. */
export function validateJob(form: JobForm, existingIds: readonly string[]): string[] {
  const errors: string[] = [];
  const c = form.config;
  const isCode = form.kind === "CODE";

  if (form.isNew) {
    if (!form.jobId.trim()) errors.push("작업 ID 를 입력하세요.");
    else if (!JOB_ID_PATTERN.test(form.jobId.trim())) errors.push("작업 ID 는 영문·숫자·_ . - 만 쓸 수 있습니다(60자 이내).");
    else if (existingIds.includes(form.jobId.trim())) errors.push("이미 있는 작업 ID 입니다.");
  }
  if (!isCode && !form.name.trim()) errors.push("작업명을 입력하세요.");

  const cronError = validateCron(form.cron, collectMinGapMin(form));
  if (cronError) errors.push(`일정: ${cronError}`);

  if (!isPositiveInt(form.timeoutSec)) errors.push("시간 초과(초)는 1 이상의 정수로 입력하세요.");
  if (!isCode) {
    if (!isNonNegativeInt(form.retryCount)) errors.push("재시도 횟수는 0 이상의 정수로 입력하세요.");
    if (Number(form.retryCount) > 0 && !isPositiveInt(form.retryIntervalMin)) errors.push("재시도 간격(분)은 1 이상의 정수로 입력하세요.");
  }

  switch (form.kind) {
    case "BPMN":
      if (!c.serviceId.trim()) errors.push("서비스 ID 를 입력하세요.");
      if (!c.action.trim()) errors.push("Action 을 입력하세요.");
      break;
    case "QUERY": {
      const sql = c.sql.trim();
      if (!sql) errors.push("실행할 SQL 을 입력하세요.");
      else if (/^select\b/i.test(sql)) errors.push("쿼리 작업에는 SELECT 를 쓸 수 없습니다. 값을 모으려면 수집 유형을 쓰세요.");
      else if (!/^(insert|update|delete|merge|begin)\b/i.test(sql)) errors.push("SQL 은 INSERT·UPDATE·DELETE·MERGE 한 문장이나 BEGIN … END; 프로시저 호출이어야 합니다.");
      break;
    }
    case "COLLECT":
      if (c.collectSource === "SQL") {
        if (!c.sql.trim()) errors.push("원천 SQL 을 입력하세요.");
        else if (!/^select\b/i.test(c.sql.trim())) errors.push("수집 원천 SQL 은 SELECT 여야 합니다.");
        if (!c.valueField.trim()) errors.push("값 칸을 입력하세요.");
        if (!c.keyField.trim()) errors.push("키 칸을 입력하세요.");
      } else if (c.collectSource === "HTTP") {
        if (!c.collectUrl.trim()) errors.push("수집 URL 을 입력하세요.");
        if (c.items.length === 0) errors.push("수집 항목을 하나 이상 추가하세요.");
        else if (c.items.some((i) => !i.key.trim() || !i.path.trim())) errors.push("수집 항목의 키와 경로를 모두 입력하세요.");
      } else if (c.currencies.length === 0) {
        errors.push("통화를 하나 이상 고르세요.");
      }
      break;
    case "HTTP":
      if (!c.url.trim()) errors.push("URL 을 입력하세요.");
      if (c.method === "POST" && c.body.trim()) {
        try {
          JSON.parse(c.body);
        } catch {
          errors.push("본문이 올바른 JSON 이 아닙니다.");
        }
      }
      break;
    case "PURGE":
      if (!c.table.trim()) errors.push("대상 표를 입력하세요.");
      if (!c.dateColumn.trim()) errors.push("날짜 칸을 입력하세요.");
      if (!isPositiveInt(c.retainDays)) errors.push("보관 일수는 1 이상의 정수로 입력하세요.");
      if (!isPositiveInt(c.batchSize)) errors.push("한 번에 지울 행 수는 1 이상의 정수로 입력하세요.");
      break;
    default:
      break;
  }

  const seen = new Set<string>();
  for (const v of form.variables) {
    const name = v.name.trim();
    if (!name) errors.push("이름이 빈 변수가 있습니다.");
    else if (!BIND_NAME_PATTERN.test(name)) errors.push(`변수 이름 ${name} 은 영문으로 시작하는 영문·숫자·_ 여야 합니다.`);
    else if (seen.has(name)) errors.push(`변수 이름 ${name} 이 두 번 쓰였습니다.`);
    seen.add(name);
    const message = validateVariable(v);
    if (message) errors.push(message);
  }
  return errors;
}
