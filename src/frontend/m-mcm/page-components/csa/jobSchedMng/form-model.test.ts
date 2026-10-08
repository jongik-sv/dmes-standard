import { describe, expect, it } from "vitest";

import {
  applyHandler,
  buildConfigJson,
  changeModule,
  collectMinGapMin,
  copyForm,
  emptyForm,
  formatDuration,
  formatTimestamp,
  isFormDirty,
  parseVars,
  serializeVars,
  switchKind,
  toForm,
  toJobGridRow,
  toRunGridRow,
  toSaveRequest,
  validateForm,
  type JobForm,
} from "./form-model";
import type { HandlerRow, JobDef } from "./types";

const def = (patch: Partial<JobDef> = {}): JobDef => ({
  jobId: "mcm.job",
  moduleCd: "MCM",
  jobNm: "작업",
  jobKind: "QUERY",
  serviceId: "job^^query",
  svcAction: "run",
  cronExpr: "0 2 * * *",
  cronDesc: "매일 02:00",
  useYn: "Y",
  configJson: '{"sql":"DELETE FROM T WHERE D < :baseDt"}',
  varsJson: '[{"name":"baseDt","type":"DATE","value":":yesterday","desc":"기준일"}]',
  optsJson: "",
  timeoutSec: 600,
  nextRunAt: "2026-10-10T02:00:00",
  jobDesc: "",
  ownerTp: "USER",
  ver: 2,
  ...patch,
});

const valid = (patch: Partial<JobForm> = {}): JobForm => ({
  ...emptyForm("QUERY"),
  jobId: "mcm.a",
  jobNm: "가",
  sql: "DELETE FROM T",
  ...patch,
});

describe("validateForm", () => {
  it("CODE 는 처리기를 고르지 않으면 검증 실패", () => {
    const f = { ...emptyForm("CODE", "MDM"), jobId: "mdm.a", jobNm: "가" };
    expect(validateForm(f)).toBe("처리기를 고르세요.");
    expect(validateForm({ ...f, handlerId: "mdm.sync" })).toBeNull();
  });

  it("COLLECT 환율은 MCM 이 아니면 검증 실패", () => {
    const f: JobForm = { ...emptyForm("COLLECT", "MDM"), jobId: "mdm.fx", jobNm: "환율", collectKind: "exchange", currencies: ["USD"] };
    expect(validateForm(f)).toContain("MCM");
    expect(validateForm({ ...f, moduleCd: "MCM" })).toBeNull();
  });

  it("COLLECT 환율의 KRW·소문자 통화는 거절한다", () => {
    const f: JobForm = { ...emptyForm("COLLECT"), jobId: "mcm.fx", jobNm: "환율", collectKind: "exchange", currencies: ["KRW"] };
    expect(validateForm(f)).toContain("KRW");
    expect(validateForm({ ...f, currencies: [] })).toContain("통화");
  });

  it("새 작업의 ID 형식·이름·일정·시간 초과를 차례로 본다", () => {
    expect(validateForm(valid({ jobId: "" }))).toBe("작업 ID 를 입력하세요.");
    expect(validateForm(valid({ jobId: "a:b" }))).toContain("작업 ID");
    expect(validateForm(valid({ jobNm: " " }))).toBe("작업명을 입력하세요.");
    expect(validateForm(valid({ cronExpr: "" }))).toBe("일정을 입력하세요.");
    expect(validateForm(valid(), { cronError: "5칸이어야 합니다." })).toBe("일정: 5칸이어야 합니다.");
    expect(validateForm(valid({ timeoutSec: "5" }))).toContain("시간 초과");
    expect(validateForm(valid({ retryCount: "9" }))).toContain("재시도 횟수");
    expect(validateForm(valid({ retryCount: "2", retryIntervalMin: "0" }))).toContain("재시도 간격");
    expect(validateForm(valid())).toBeNull();
  });

  it("저장된 작업은 ID 를 다시 검사하지 않는다", () => {
    expect(validateForm({ ...valid({ jobId: "x:y" }), isNew: false })).toBeNull();
  });

  it("BPMN 은 서비스 ID·Action 이 필요하고 내장 서비스는 거절한다", () => {
    const f: JobForm = { ...emptyForm("BPMN"), jobId: "mcm.b", jobNm: "비" };
    expect(validateForm(f)).toBe("서비스 ID 를 입력하세요.");
    expect(validateForm({ ...f, serviceId: "job^^query", svcAction: "run" })).toContain("내장 서비스");
    expect(validateForm({ ...f, serviceId: "dma^^term", svcAction: "" })).toBe("Action 을 입력하세요.");
    expect(validateForm({ ...f, serviceId: "dma^^term", svcAction: "sync" })).toBeNull();
  });

  it("COLLECT 의 SQL·HTTP 입력 검사", () => {
    const f: JobForm = { ...emptyForm("COLLECT"), jobId: "mcm.c", jobNm: "수집" };
    expect(validateForm(f)).toBe("원천 SQL 을 입력하세요.");
    expect(validateForm({ ...f, collectSql: "SELECT 1 V FROM DUAL" })).toBe("값 칸을 입력하세요.");
    expect(validateForm({ ...f, collectSql: "SELECT 1 V FROM DUAL", valueField: "V" })).toBeNull();
    const http: JobForm = { ...f, collectKind: "http", collectUrl: "ftp://x" };
    expect(validateForm(http)).toContain("http");
    const url = { ...http, collectUrl: "https://api.example.com/q" };
    expect(validateForm(url)).toContain("수집 항목");
    expect(validateForm({ ...url, items: [{ key: "a", path: "" }] })).toContain("키와 경로");
    expect(validateForm({ ...url, items: [{ key: "a", path: "x" }, { key: "a", path: "y" }] })).toContain("겹칩니다");
    expect(validateForm({ ...url, items: [{ key: "a", path: "x" }] })).toBeNull();
  });

  it("변수 이름·중복·값 형식을 검사한다", () => {
    expect(validateForm(valid({ vars: [{ name: "", type: "STRING", value: "" }] }))).toContain("이름이 빈 변수");
    expect(validateForm(valid({ vars: [{ name: "1a", type: "STRING", value: "" }] }))).toContain("변수 이름 1a");
    expect(validateForm(valid({ vars: [{ name: "a", type: "STRING", value: "" }, { name: "a", type: "STRING", value: "" }] }))).toContain("두 번");
    expect(validateForm(valid({ vars: [{ name: "n", type: "NUMBER", value: "abc" }] }))).toContain("숫자");
    expect(validateForm(valid({ vars: [{ name: "d", type: "DATE", value: "2026/10/01" }] }))).toContain("YYYY-MM-DD");
    expect(validateForm(valid({ vars: [{ name: "d", type: "DATE", value: ":today" }, { name: "j", type: "JSON", value: "{" }] }))).toContain("JSON");
  });
});

describe("변수 JSON", () => {
  it("변수 JSON 왕복 — toSaveRequest(toForm(def)).varsJson 이 정규화되어 같다", () => {
    const d = def({ varsJson: '[ {"type":"DATE","name":" baseDt ","value":":yesterday"} ]' });
    const back = JSON.parse(toSaveRequest(toForm(d)).varsJson);
    expect(back).toEqual([{ name: "baseDt", type: "DATE", value: ":yesterday", desc: "" }]);
    // 한 번 더 돌려도 변하지 않는다.
    const again = toSaveRequest(toForm({ ...d, varsJson: toSaveRequest(toForm(d)).varsJson })).varsJson;
    expect(JSON.parse(again)).toEqual(back);
  });

  it("알 수 없는 형식은 문자로 읽고 잘못된 JSON 은 빈 목록", () => {
    expect(parseVars('[{"name":"a","type":"WEIRD","value":1}]')).toEqual([{ name: "a", type: "STRING", value: "1", desc: "" }]);
    expect(parseVars("{")).toEqual([]);
    expect(parseVars("")).toEqual([]);
    expect(serializeVars([])).toBe("[]");
  });
});

describe("유형별 설정", () => {
  it("유형이 바뀌면 이전 유형의 configJson 을 버린다", () => {
    const query = { ...valid({ sql: "DELETE FROM T" }), collectSql: "SELECT 1", valueField: "V" };
    const collect = switchKind(query, "COLLECT");
    expect(collect.jobKind).toBe("COLLECT");
    expect(collect.sql).toBe("");
    expect(collect.jobId).toBe("mcm.a");
    expect(collect.timeoutSec).toBe("120");
    expect(switchKind(collect, "BPMN").collectSql).toBe("");
    // 칸에 남아 있더라도 저장 요청은 현재 유형의 설정만 싣는다.
    expect(JSON.parse(buildConfigJson(query)!)).toEqual({ sql: "DELETE FROM T" });
    expect(buildConfigJson({ ...query, jobKind: "BPMN" })).toBeUndefined();
  });

  it("BPMN 은 svcAction 을 action 으로 쓰지 않는다", () => {
    const req = toSaveRequest({ ...emptyForm("BPMN"), jobId: "mcm.b", jobNm: "비", serviceId: " dma^^term ", svcAction: " sync " });
    expect(req.svcAction).toBe("sync");
    expect(req.serviceId).toBe("dma^^term");
    expect(req).not.toHaveProperty("action");
    expect(req.configJson).toBeUndefined();
  });

  it("QUERY·CODE 는 서비스 ID 를 보내지 않는다(서버가 유형에서 정한다)", () => {
    expect(toSaveRequest(valid())).not.toHaveProperty("serviceId");
    const code = toSaveRequest({ ...emptyForm("CODE", "MDM"), jobId: "mdm.a", jobNm: "가", handlerId: "mdm.sync" });
    expect(code).not.toHaveProperty("svcAction");
    expect(JSON.parse(code.configJson!)).toEqual({ handlerId: "mdm.sync" });
  });

  it("COLLECT 설정을 읽고 다시 쓴다(source·save)", () => {
    const cfg = { source: { kind: "http", url: "https://a.b/c", items: [{ key: "t", path: "data.t" }] }, save: false };
    const form = toForm(def({ jobKind: "COLLECT", serviceId: "job^^collect", configJson: JSON.stringify(cfg) }));
    expect(form.collectKind).toBe("http");
    expect(form.save).toBe(false);
    expect(JSON.parse(buildConfigJson(form)!)).toEqual(cfg);
    const sql = toForm(def({ jobKind: "COLLECT", configJson: '{"source":{"kind":"sql","sql":"SELECT 1 V FROM DUAL","valueField":"V"}}' }));
    expect(sql.save).toBe(true);
    expect(JSON.parse(buildConfigJson(sql)!)).toEqual({ source: { kind: "sql", sql: "SELECT 1 V FROM DUAL", valueField: "V" }, save: true });
  });

  it("수집 간격 하한은 SQL·HTTP 5분, 환율 60분, 다른 유형은 없다", () => {
    expect(collectMinGapMin({ jobKind: "COLLECT", collectKind: "sql" })).toBe(5);
    expect(collectMinGapMin({ jobKind: "COLLECT", collectKind: "http" })).toBe(5);
    expect(collectMinGapMin({ jobKind: "COLLECT", collectKind: "exchange" })).toBe(60);
    expect(collectMinGapMin({ jobKind: "QUERY", collectKind: "exchange" })).toBeUndefined();
  });
});

describe("고급 설정", () => {
  it("재시도는 optsJson 으로 왕복하고 0회면 보내지 않는다", () => {
    const form = toForm(def({ optsJson: '{"retry":{"count":2,"intervalMin":10},"x":1}' }));
    expect(form.retryCount).toBe("2");
    expect(form.retryIntervalMin).toBe("10");
    expect(JSON.parse(toSaveRequest(form).optsJson!)).toEqual({ retry: { count: 2, intervalMin: 10 }, x: 1 });
    expect(toSaveRequest({ ...form, retryCount: "0", extraOpts: {} }).optsJson).toBeUndefined();
  });

  it("저장 요청은 ver 와 newJob 을 싣는다", () => {
    const saved = toSaveRequest(toForm(def()));
    expect(saved).toMatchObject({ newJob: false, ver: 2, timeoutSec: 600, jobKind: "QUERY" });
    const created = toSaveRequest(valid());
    expect(created.newJob).toBe(true);
    expect(created.ver).toBeUndefined();
  });
});

describe("새 작업 · 복사 · 처리기", () => {
  it("복사는 ID 를 비우고 이름에 (사본)을 붙이며 USER 작업으로 만든다", () => {
    const copy = copyForm(toForm(def({ ownerTp: "CODE" })));
    expect(copy).toMatchObject({ isNew: true, jobId: "", jobNm: "작업 (사본)", ownerTp: "USER", ver: undefined });
  });

  it("처리기를 고르면 이름(비었을 때)·기본 일정·변수를 채운다", () => {
    const handler: HandlerRow = { handlerId: "mdm.sync", moduleCd: "MDM", handlerNm: "동기화", defaultCron: "0 1 * * *", varsJson: '[{"name":"days","type":"NUMBER","value":"7"}]', seenAt: "", missing: false };
    const f = applyHandler(emptyForm("CODE", "MDM"), handler);
    expect(f).toMatchObject({ handlerId: "mdm.sync", jobNm: "동기화", cronExpr: "0 1 * * *" });
    expect(f.vars).toEqual([{ name: "days", type: "NUMBER", value: "7", desc: "" }]);
    expect(applyHandler({ ...f, jobNm: "내 이름" }, handler).jobNm).toBe("내 이름");
    expect(applyHandler(f, null)).toMatchObject({ handlerId: "", vars: [] });
  });

  it("모듈을 바꾸면 CODE 의 처리기를 비운다", () => {
    const f = { ...emptyForm("CODE", "MDM"), handlerId: "mdm.sync" };
    expect(changeModule(f, "MPP")).toMatchObject({ moduleCd: "MPP", handlerId: "" });
    expect(changeModule(valid({ sql: "x" }), "MPP").sql).toBe("x");
  });

  it("변경 여부는 내용 비교로 판정한다", () => {
    const base = toForm(def());
    expect(isFormDirty(base, toForm(def()))).toBe(false);
    expect(isFormDirty(base, { ...base, jobNm: "다름" })).toBe(true);
    expect(isFormDirty(null, base)).toBe(false);
  });
});

describe("표시 글자", () => {
  it("시각을 분(또는 초)까지 보인다", () => {
    expect(formatTimestamp("2026-10-09T02:03:04")).toBe("2026-10-09 02:03");
    expect(formatTimestamp("2026-10-09T02:03:04", true)).toBe("2026-10-09 02:03:04");
    expect(formatTimestamp("")).toBe("");
  });

  it("소요 시간", () => {
    expect(formatDuration("2026-10-09T02:00:00", "2026-10-09T02:00:07")).toBe("7초");
    expect(formatDuration("2026-10-09T02:00:00", "2026-10-09T02:01:05")).toBe("1분 05초");
    expect(formatDuration("2026-10-09T02:00:00", "")).toBe("");
  });
});

describe("그리드 행 변환", () => {
  it("목록 행은 사용 중이고 코드가 있을 때만 다음 예정을 보인다", () => {
    const row = { jobId: "a", moduleCd: "MCM", jobNm: "가", jobKind: "COLLECT", cronExpr: "*/5 * * * *", cronDesc: "5분마다", useYn: "Y", nextRunAt: "2026-10-10T01:05:00", lastStatus: "OK", lastServerNm: "s", lastEndedAt: "", ownerTp: "USER", codeMissing: false };
    expect(toJobGridRow(row)).toMatchObject({ kindLabel: "수집", nextRun: "2026-10-10 01:05", lastStatus: "OK" });
    expect(toJobGridRow({ ...row, useYn: "N" }).nextRun).toBe("-");
    expect(toJobGridRow({ ...row, codeMissing: true }).nextRun).toBe("-");
  });

  it("이력 행은 구분 이름·소요·서비스 태그를 담고 구분이 키에 들어간다", () => {
    const run = { schedAt: "2026-10-09T02:00:00", triggerTp: "M", status: "OK", serverNm: "s", serviceTag: "tag", startedAt: "2026-10-09T02:00:01", endedAt: "2026-10-09T02:00:08", itemCnt: 3, msg: "", reqUsrId: "u" };
    expect(toRunGridRow(run)).toMatchObject({ rowId: "2026-10-09T02:00:00|M", trigger: "수동", duration: "7초", serviceTag: "tag", itemCnt: 3 });
    expect(toRunGridRow({ ...run, triggerTp: "S" }).trigger).toBe("일정");
  });
});
