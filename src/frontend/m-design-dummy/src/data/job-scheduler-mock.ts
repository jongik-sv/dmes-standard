/**
 * 예약 작업 관리 시안의 형식과 mock 데이터. 백엔드 호출 없이 이 파일의 값으로만 동작한다.
 * 설계 문서: docs/superpowers/specs/2026-10-08-job-scheduler-design.md
 */

export type JobModule = "MCM" | "MDM" | "MPP" | "MLS" | "MQC" | "MPN";
export const JOB_MODULES: JobModule[] = ["MCM", "MDM", "MPP", "MLS", "MQC", "MPN"];

export type JobKind = "CODE" | "BPMN" | "QUERY" | "COLLECT" | "HTTP" | "PURGE";
export const JOB_KINDS: JobKind[] = ["CODE", "BPMN", "QUERY", "COLLECT", "HTTP", "PURGE"];

export type RunStatus = "OK" | "FAIL" | "RUN" | "SKIP" | "TIMEOUT";
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  OK: "정상",
  FAIL: "실패",
  RUN: "실행 중",
  SKIP: "건너뜀",
  TIMEOUT: "시간 초과",
};

export type VariableType = "STRING" | "NUMBER" | "DATE" | "JSON";
export const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  STRING: "문자",
  NUMBER: "숫자",
  DATE: "날짜",
  JSON: "JSON",
};

/** 실행할 때 값으로 바뀌는 실행 변수. */
export const RUNTIME_VARIABLES: { name: string; desc: string }[] = [
  { name: ":schedAt", desc: "예정 시각" },
  { name: ":today", desc: "오늘" },
  { name: ":yesterday", desc: "어제" },
  { name: ":monthStart", desc: "이달 1일" },
  { name: ":prevRunAt", desc: "직전 성공 회차 시각" },
];

export interface JobVariable {
  name: string;
  type: VariableType;
  value: string;
  desc: string;
}

export type CollectSource = "SQL" | "HTTP" | "EXCHANGE";

export interface CollectItem {
  key: string;
  path: string;
}

/** 유형마다 쓰는 칸이 다르지만 편집 중 유형이 바뀌지 않으므로 한 객체에 펼쳐 둔다. 숫자 칸은 입력 도중 비울 수 있게 글자로 둔다. */
export interface JobConfig {
  /** BPMN 서비스 */
  serviceId: string;
  action: string;
  /** 쿼리 · 수집(SQL) */
  sql: string;
  /** 수집 */
  collectSource: CollectSource;
  valueField: string;
  keyField: string;
  collectUrl: string;
  items: CollectItem[];
  currencies: string[];
  /** HTTP 호출 */
  method: "GET" | "POST";
  url: string;
  body: string;
  successRule: "2XX" | "200";
  /** 보관 삭제 */
  table: string;
  dateColumn: string;
  retainDays: string;
  batchSize: string;
}

export interface JobRecord {
  jobId: string;
  module: JobModule;
  name: string;
  kind: JobKind;
  desc: string;
  useYn: "Y" | "N";
  cron: string;
  timeoutSec: string;
  retryCount: string;
  retryIntervalMin: string;
  /** 이 작업이 성공하면 이어 실행할 작업 ID. */
  nextJobId: string;
  alertTo: string;
  variables: JobVariable[];
  config: JobConfig;
  /** 코드 작업인데 앱에 빈이 없는 상태. */
  codeMissing?: boolean;
}

export interface RunRecord {
  id: string;
  schedAt: string;
  trigger: "일정" | "수동";
  status: RunStatus;
  server: string;
  startedAt: string;
  endedAt: string;
  durationSec: number | null;
  itemCnt: number | null;
  message: string;
}

export function emptyConfig(): JobConfig {
  return {
    serviceId: "",
    action: "",
    sql: "",
    collectSource: "SQL",
    valueField: "",
    keyField: "",
    collectUrl: "",
    items: [],
    currencies: ["USD"],
    method: "POST",
    url: "",
    body: "",
    successRule: "2XX",
    table: "",
    dateColumn: "",
    retainDays: "90",
    batchSize: "1000",
  };
}

function job(base: Partial<JobRecord> & Pick<JobRecord, "jobId" | "module" | "name" | "kind" | "cron">, config: Partial<JobConfig> = {}): JobRecord {
  return {
    desc: "",
    useYn: "Y",
    timeoutSec: base.kind === "COLLECT" ? "120" : "1800",
    retryCount: "0",
    retryIntervalMin: "5",
    nextJobId: "",
    alertTo: "",
    variables: [],
    ...base,
    config: { ...emptyConfig(), ...config },
  };
}

export const INITIAL_JOBS: JobRecord[] = [
  job({
    jobId: "mcm.screenUsageRollup",
    module: "MCM",
    name: "화면 사용 일별 집계",
    kind: "CODE",
    cron: "0 2 * * *",
    desc: "전일 화면 사용 기록을 일별로 집계합니다.",
    variables: [{ name: "baseDt", type: "DATE", value: ":yesterday", desc: "집계 기준일(코드 기본값)" }],
  }),
  job({
    jobId: "mcm.revokedTokenPurge",
    module: "MCM",
    name: "폐기 토큰 정리",
    kind: "CODE",
    cron: "0 * * * *",
    desc: "만료된 폐기 토큰을 지웁니다.",
    timeoutSec: "600",
  }),
  job({
    jobId: "mcm.collectPurge",
    module: "MCM",
    name: "수집 값 보관 삭제",
    kind: "CODE",
    cron: "30 3 * * *",
    desc: "보관 기간이 지난 수집 값을 지웁니다.",
    variables: [{ name: "retainDays", type: "NUMBER", value: "90", desc: "보관 일수" }],
  }),
  job({
    jobId: "mcm.jobRunSweep",
    module: "MCM",
    name: "멈춘 실행 정리",
    kind: "CODE",
    cron: "*/5 * * * *",
    desc: "서버가 죽어 실행 중으로 남은 기록을 시간 초과로 바꿉니다.",
    timeoutSec: "300",
  }),
  job(
    {
      jobId: "mcm.exchangeRate",
      module: "MCM",
      name: "환율 수집",
      kind: "COLLECT",
      cron: "0 9,15 * * 1-5",
      desc: "평일 두 번 주요 통화 환율을 수집합니다.",
    },
    { collectSource: "EXCHANGE", currencies: ["USD", "JPY", "EUR"] },
  ),
  job(
    {
      jobId: "mcm.lineUtilization",
      module: "MCM",
      name: "라인 가동률 수집",
      kind: "COLLECT",
      cron: "*/10 * * * *",
      desc: "라인별 가동률을 10분마다 모아 홈 위젯에 보여 줍니다.",
    },
    {
      collectSource: "SQL",
      sql: "SELECT LINE_CD AS ITEM_KEY\n     , ROUND(RUN_MIN / NULLIF(PLAN_MIN, 0) * 100, 1) AS ITEM_VALUE\n  FROM TB_MCM_LINE_STATUS\n WHERE STATUS_DT >= :today",
      valueField: "ITEM_VALUE",
      keyField: "ITEM_KEY",
    },
  ),
  job(
    {
      jobId: "mcm.plantTemperature",
      module: "MCM",
      name: "공장 온도 수집",
      kind: "COLLECT",
      cron: "*/15 * * * *",
      desc: "설비 온도 센서 서버에서 공장별 온도를 읽어 옵니다.",
    },
    {
      collectSource: "HTTP",
      collectUrl: "iot.dongkuk.example/v1/plant/temperature",
      items: [
        { key: "PLANT_A", path: "$.plants[0].temp" },
        { key: "PLANT_B", path: "$.plants[1].temp" },
      ],
    },
  ),
  job(
    {
      jobId: "mdm.masterSync",
      module: "MDM",
      name: "마스터 동기화",
      kind: "BPMN",
      cron: "0 1 * * *",
      desc: "전일 변경된 마스터 데이터를 동기화합니다.",
      alertTo: "mdm-admin@dongkuk.example",
      variables: [
        { name: "baseDt", type: "DATE", value: ":yesterday", desc: "동기화 기준일" },
        { name: "scope", type: "STRING", value: "ALL", desc: "동기화 범위" },
      ],
    },
    { serviceId: "mdmMasterSync", action: "sync" },
  ),
  job(
    {
      jobId: "mdm.metaRevPurge",
      module: "MDM",
      name: "메타 리비전 보관 삭제",
      kind: "PURGE",
      cron: "0 4 * * 0",
      desc: "180일이 지난 메타 리비전을 지웁니다.",
    },
    { table: "TB_MDM_META_REV", dateColumn: "C_AT", retainDays: "180", batchSize: "5000" },
  ),
  job(
    {
      jobId: "mpp.dailyClose",
      module: "MPP",
      name: "일마감 처리",
      kind: "QUERY",
      cron: "30 0 * * *",
      desc: "전일 생산 실적을 마감합니다. 성공하면 일정 스냅샷 적재가 이어 실행됩니다.",
      nextJobId: "mpn.scheduleSnapshot",
    },
    { sql: "BEGIN PKG_MPP_CLOSE.DAILY_CLOSE(:schedAt); END;" },
  ),
  job(
    {
      jobId: "mpn.scheduleSnapshot",
      module: "MPN",
      name: "일정 스냅샷 적재",
      kind: "QUERY",
      cron: "15 6 * * 1-5",
      desc: "평일 아침 계획 일정을 스냅샷 표에 쌓습니다.",
      variables: [{ name: "snapDt", type: "DATE", value: ":today", desc: "스냅샷 기준일" }],
    },
    {
      sql: "INSERT INTO TB_MPN_SCHED_SNAP (SNAP_DT, PLAN_ID, PLAN_QTY)\nSELECT :snapDt\n     , PLAN_ID\n     , PLAN_QTY\n  FROM TB_MPN_PLAN\n WHERE PLAN_STATUS = 'CONFIRMED'",
    },
  ),
  job(
    {
      jobId: "mls.erpPush",
      module: "MLS",
      name: "ERP 출하 실적 전송",
      kind: "HTTP",
      cron: "*/30 8-20 * * 1-6",
      desc: "새 출하 실적이 생기면 ERP 에 알립니다.",
      timeoutSec: "120",
      retryCount: "2",
      retryIntervalMin: "5",
      alertTo: "mls-admin@dongkuk.example",
    },
    {
      method: "POST",
      url: "erp.dongkuk.example/mes/shipments/push",
      body: '{\n  "since": ":prevRunAt"\n}',
      successRule: "2XX",
    },
  ),
  job(
    {
      jobId: "mls.noticeArchive",
      module: "MLS",
      name: "공지 보관 이동",
      kind: "BPMN",
      cron: "0 3 1 * *",
      useYn: "N",
      desc: "오래된 공지를 보관 표로 옮깁니다. 오류 조사를 위해 중지했습니다.",
      variables: [{ name: "olderThanDays", type: "NUMBER", value: "365", desc: "보관으로 옮길 기준 일수" }],
    },
    { serviceId: "mlsNoticeArchive", action: "archive" },
  ),
  job(
    {
      jobId: "mqc.inspectLogPurge",
      module: "MQC",
      name: "검사 로그 보관 삭제",
      kind: "PURGE",
      cron: "0 5 * * *",
      desc: "90일이 지난 검사 로그를 지웁니다.",
    },
    { table: "TB_MQC_INSPECT_LOG", dateColumn: "C_AT", retainDays: "90", batchSize: "2000" },
  ),
  job({
    jobId: "mqc.legacyRecalc",
    module: "MQC",
    name: "구 품질지표 재계산",
    kind: "CODE",
    cron: "0 23 * * 6",
    desc: "옛 품질지표를 다시 계산합니다.",
    timeoutSec: "3600",
    codeMissing: true,
    variables: [{ name: "targetYm", type: "DATE", value: ":monthStart", desc: "대상 월" }],
  }),
];
