import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jobSchedApi, unwrapPayload } from "./api";
import type { JobSaveRequest } from "./types";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function sent(i = 0): { url: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("list", () => {
  it("list 는 모듈·유형 조건을 보내고 빈 값(null·공백)은 떨군다", async () => {
    reply({ meta: { success: true }, data: { result: { jobs: [] } } });
    await jobSchedApi.list({ moduleCd: "MDM", jobKind: "COLLECT", useYn: "", lastStatus: "  ", keyword: " 환율 " });
    expect(sent().url).toBe("/api/mcm/oasis/jobSchedMng/list");
    expect(sent().body).toEqual({ meta: { menuId: "jobSchedMng" }, params: { moduleCd: "MDM", jobKind: "COLLECT", keyword: "환율" } });
  });

  it("응답 data.result 를 풀어 jobs 를 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          jobs: [{ jobId: "mdm.sync", moduleCd: "MDM", jobNm: "동기화", jobKind: "CODE", cronExpr: "0 1 * * *", cronDesc: "매일 01:00", useYn: "Y", nextRunAt: "2026-10-10T01:00:00", lastStatus: null, codeMissing: true }],
        },
      },
    });
    const jobs = await jobSchedApi.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ jobId: "mdm.sync", jobKind: "CODE", lastStatus: "", codeMissing: true, nextRunAt: "2026-10-10T01:00:00" });
  });
});

describe("save", () => {
  const REQ: JobSaveRequest = {
    jobId: "mcm.a",
    moduleCd: "MCM",
    jobNm: "가",
    jobKind: "QUERY",
    cronExpr: "0 2 * * *",
    useYn: "Y",
    configJson: '{"sql":"DELETE FROM T"}',
    varsJson: "[]",
    timeoutSec: 600,
    ver: 3,
    newJob: false,
  };

  it("save 는 ver 와 newJob 을 그대로 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { def: { jobId: "mcm.a", ver: 4, timeoutSec: 600 } } } });
    const def = await jobSchedApi.save(REQ);
    expect(sent().url).toBe("/api/mcm/oasis/jobSchedMng/save");
    expect(sent().body.params).toMatchObject({ ver: 3, newJob: false, jobId: "mcm.a", timeoutSec: 600 });
    expect(def.ver).toBe(4);
  });

  it("값이 없는 칸(undefined)은 보내지 않는다", async () => {
    reply({ meta: { success: true }, data: { result: { def: { jobId: "mcm.a" } } } });
    await jobSchedApi.save({ ...REQ, ver: undefined, newJob: true, optsJson: undefined, serviceId: undefined });
    const params = sent().body.params;
    expect(params).not.toHaveProperty("ver");
    expect(params).not.toHaveProperty("optsJson");
    expect(params.newJob).toBe(true);
  });

  it("업무 거절(meta.success=false)은 서버 문구로 던진다", async () => {
    reply({ meta: { success: false, message: "다른 사용자가 먼저 고쳤습니다. 다시 불러온 뒤 저장해 주세요" } });
    await expect(jobSchedApi.save(REQ)).rejects.toThrow("다른 사용자가 먼저 고쳤습니다");
  });
});

describe("runNow", () => {
  it("accepted=false 면 message 를 그대로 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { accepted: false, message: "이미 실행 중입니다" } } });
    const r = await jobSchedApi.runNow("mcm.a");
    expect(sent().url).toBe("/api/mcm/oasis/jobSchedMng/runNow");
    expect(sent().body.params).toEqual({ jobId: "mcm.a" });
    expect(r).toEqual({ accepted: false, message: "이미 실행 중입니다", runId: "" });
  });

  it("변수 덮어쓰기는 varOverridesJson 글자로 보낸다", async () => {
    reply({ meta: { success: true }, data: { result: { accepted: true, message: "접수되었습니다", runId: "r1" } } });
    await jobSchedApi.runNow("mcm.a", { baseDt: "2026-10-01" });
    expect(sent().body.params).toEqual({ jobId: "mcm.a", varOverridesJson: '{"baseDt":"2026-10-01"}' });
  });
});

describe("history · cronPreview · handlers · remove", () => {
  it("history 는 runs 를 서비스 태그까지 읽는다", async () => {
    reply({ meta: { success: true }, data: { result: { runs: [{ schedAt: "2026-10-09T02:00:00", triggerTp: "S", status: "OK", serverNm: "ap01:mcm:1", serviceTag: "tag1", itemCnt: 12, msg: null }] } } });
    const runs = await jobSchedApi.history("mcm.a");
    expect(sent().body.params).toEqual({ jobId: "mcm.a", limit: 100 });
    expect(runs[0]).toMatchObject({ status: "OK", serviceTag: "tag1", itemCnt: 12, msg: "" });
  });

  it("cronPreview 는 식을 보내고 valid·desc·next·minGapMin 을 읽는다", async () => {
    reply({ meta: { success: true }, data: { result: { valid: true, desc: "매일 02:00", next: ["2026-10-10T02:00:00"], minGapMin: 1440 } } });
    const p = await jobSchedApi.cronPreview("0 2 * * *");
    expect(sent().body.params).toEqual({ expr: "0 2 * * *" });
    expect(p).toEqual({ valid: true, error: undefined, desc: "매일 02:00", next: ["2026-10-10T02:00:00"], minGapMin: 1440 });
  });

  it("cronPreview 오류 응답은 valid=false 와 error", async () => {
    reply({ meta: { success: true }, data: { result: { valid: false, error: "5칸이어야 합니다" } } });
    const p = await jobSchedApi.cronPreview("0 0 0 * * *");
    expect(p.valid).toBe(false);
    expect(p.error).toBe("5칸이어야 합니다");
  });

  it("handlers 는 missing 을 불리언으로 읽는다", async () => {
    reply({ meta: { success: true }, data: { result: { handlers: [{ handlerId: "mdm.sync", moduleCd: "MDM", handlerNm: "동기화", defaultCron: null, varsJson: "[]", missing: true }] } } });
    const hs = await jobSchedApi.handlers();
    expect(hs[0]).toMatchObject({ handlerId: "mdm.sync", missing: true, defaultCron: "" });
  });

  it("remove 는 deleted 를 돌려준다", async () => {
    reply({ meta: { success: true }, data: { result: { deleted: "mcm.a" } } });
    expect(await jobSchedApi.remove("mcm.a")).toBe("mcm.a");
    expect(sent().url).toBe("/api/mcm/oasis/jobSchedMng/delete");
  });
});

describe("unwrapPayload", () => {
  it("grids.{key}.rows 도 펼친다", () => {
    expect(unwrapPayload({ grids: { jobs: { rows: [{ a: 1 }] } } })).toEqual({ jobs: [{ a: 1 }] });
  });
});

describe("collectData", () => {
  it("조건을 params 로 보내고(빈 값은 뺀다) 행·잘림 정보를 돌려준다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          rows: [
            { slot: "202610090850", itemKey: "TEMP", valueNum: 21.5, valueTxt: null, collectedAt: "2026-10-09T08:50:01" },
            { slot: "202610090850", itemKey: "NOTE", valueNum: null, valueTxt: "맑음", collectedAt: "2026-10-09T08:50:01" },
          ],
          truncated: true,
          nextBeforeSlot: "202610090850",
          latestSlot: null,
          count: 2,
        },
      },
    });
    const res = await jobSchedApi.collectData({ jobId: "mcm.weather", days: 7, itemKey: undefined, latestOnly: false, limit: 500 });
    expect(sent().url).toBe("/api/mcm/oasis/jobSchedMng/collectData");
    expect(sent().body.params).toEqual({ jobId: "mcm.weather", days: 7, latestOnly: false, limit: 500 });
    expect(res.truncated).toBe(true);
    expect(res.nextBeforeSlot).toBe("202610090850");
    expect(res.latestSlot).toBe("");
    expect(res.rows[0]).toEqual({ slot: "202610090850", itemKey: "TEMP", valueNum: 21.5, valueTxt: "", collectedAt: "2026-10-09T08:50:01" });
    expect(res.rows[1].valueNum).toBeNull();
  });

  it("행이 없으면 빈 목록이다", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    const res = await jobSchedApi.collectData({ jobId: "mcm.weather" });
    expect(res).toEqual({ rows: [], truncated: false, nextBeforeSlot: "", latestSlot: "", count: 0 });
  });
});
