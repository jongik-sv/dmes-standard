/**
 * 예약 작업 관리 시안의 실행 이력 mock 생성기.
 * 작업마다 정해 둔 상태 순서(최근 순)를 crontab 식의 지난 실행 시각에 맞춰 펼친다.
 */
import type { JobRecord, RunRecord, RunStatus } from "../../data/job-scheduler-mock";
import { formatDateTime, parseCron, runTimes } from "./cron";

interface Spec {
  s: RunStatus;
  /** 수동 실행이면 지금부터 몇 분 전인지. 없으면 일정 회차. */
  manualAgoMin?: number;
  cnt?: number;
  dur?: number;
  msg?: string;
}

const ok = (cnt: number, dur = 4): Spec => ({ s: "OK", cnt, dur });
const fail = (msg: string, dur = 3): Spec => ({ s: "FAIL", msg, dur });
const skip = (msg: string): Spec => ({ s: "SKIP", msg });
const timeout = (msg = "서버 응답 없음"): Spec => ({ s: "TIMEOUT", msg });
const manual = (agoMin: number, spec: Spec): Spec => ({ ...spec, manualAgoMin: agoMin });

const MISSED = "놓친 회차를 건너뜀";
const OVERLAP = "이전 회차 실행 중";

/** 작업별 이력 형태(최근 순). */
const PATTERNS: Record<string, Spec[]> = {
  "mcm.screenUsageRollup": [ok(1284, 41), ok(1251, 39), skip(MISSED), ok(1190, 36), manual(2600, ok(1190, 35)), ok(1177, 38), ok(1164, 37), ok(1102, 33)],
  "mcm.revokedTokenPurge": [ok(12, 1), ok(9, 1), ok(0, 1), ok(15, 1), ok(7, 1), ok(11, 1), ok(3, 1), ok(8, 1)],
  "mcm.collectPurge": [ok(3480, 22), ok(3512, 24), fail("삭제 대상 조회 시간 초과", 61), ok(3390, 21), manual(4300, ok(7020, 44)), ok(3301, 20), ok(3288, 20)],
  "mcm.jobRunSweep": [ok(0, 1), ok(0, 1), ok(1, 1), ok(0, 1), skip(OVERLAP), ok(0, 1), ok(0, 1), ok(0, 1)],
  "mcm.exchangeRate": [ok(3, 2), ok(3, 2), ok(3, 3), fail("환율 서버 응답 오류", 5), manual(3000, ok(3, 2)), ok(3, 2), ok(3, 2)],
  "mcm.lineUtilization": [fail("수집된 값이 없습니다.", 2), fail("수집된 값이 없습니다.", 2), fail("수집된 값이 없습니다.", 3), ok(12, 2), ok(12, 2), ok(11, 2), skip(OVERLAP), ok(12, 2)],
  "mcm.plantTemperature": [ok(2, 1), ok(2, 1), ok(2, 1), skip(OVERLAP), ok(2, 1), ok(2, 2), ok(2, 1), ok(2, 1)],
  "mdm.masterSync": [ok(8421, 214), ok(8390, 207), fail("서비스 응답 오류: 동기화 대상 조회 실패", 12), ok(8340, 205), manual(4000, ok(120, 18)), ok(8302, 201), ok(8288, 199)],
  "mdm.metaRevPurge": [ok(412, 9), ok(388, 8), ok(0, 2), ok(401, 9), ok(377, 8), ok(395, 9), ok(402, 9), ok(366, 7)],
  "mpp.dailyClose": [manual(2, { s: "RUN" }), ok(9402, 118), ok(9388, 121), timeout(), ok(9311, 117), ok(9290, 119), ok(9276, 115)],
  "mpp.equipmentUtilization": [ok(8, 2), ok(8, 2), ok(8, 2), fail("수집된 값이 없습니다.", 2), ok(7, 2), ok(8, 2), skip(OVERLAP), ok(8, 2)],
  "mpn.scheduleSnapshot": [skip(MISSED), ok(5120, 17), ok(5098, 16), ok(5071, 16), manual(3200, ok(5071, 16)), ok(5044, 15), ok(5010, 15)],
  "mls.erpPush": [timeout(), ok(37, 6), ok(41, 7), fail("HTTP 502 응답", 4), ok(33, 6), skip(OVERLAP), ok(29, 5), ok(36, 6)],
  "mls.noticeArchive": [fail("서비스 응답 오류: 대상 공지 조회 실패", 9), ok(214, 31), ok(198, 30), ok(207, 29), ok(181, 27), ok(176, 26)],
  "mqc.inspectLogPurge": [ok(6120, 51), ok(5988, 50), ok(6044, 52), skip(MISSED), manual(2900, ok(12044, 98)), ok(5903, 48), ok(5876, 47)],
  "mqc.legacyRecalc": [ok(310, 612), ok(305, 598), ok(311, 640), ok(298, 590), ok(302, 601), ok(299, 595)],
};

const serverOf = (job: JobRecord, index: number) =>
  index % 3 === 1 ? `mes-ap02:${job.module.toLowerCase()}:3988` : `mes-ap01:${job.module.toLowerCase()}:4123`;

export function buildHistory(job: JobRecord, now: Date): RunRecord[] {
  const specs = PATTERNS[job.jobId] ?? [];
  const parsed = parseCron(job.cron);
  const scheduledCount = specs.filter((s) => s.manualAgoMin === undefined).length;
  // 일정 회차는 지금부터 거꾸로 센 crontab 실행 시각을 최근 순으로 쓴다. 중지된 작업은 3주 전에서 시작한다.
  const anchor = job.useYn === "N" ? new Date(now.getTime() - 21 * 24 * 3600 * 1000) : now;
  const slots = parsed.ok ? runTimes(parsed.cron, anchor, scheduledCount, -1) : [];
  let slotIndex = 0;
  const rows: RunRecord[] = specs.map((spec, i) => {
    const manualRun = spec.manualAgoMin !== undefined;
    const sched = manualRun
      ? new Date(now.getTime() - (spec.manualAgoMin ?? 0) * 60000)
      : (slots[slotIndex++] ?? new Date(now.getTime() - (i + 1) * 3600 * 1000));
    const started = new Date(sched.getTime() + (manualRun ? 0 : 1000));
    const dur = spec.s === "RUN" ? null : spec.s === "SKIP" ? 0 : spec.s === "TIMEOUT" ? Number(job.timeoutSec) || 1800 : (spec.dur ?? 3);
    const ended = dur === null ? null : new Date(started.getTime() + dur * 1000);
    return {
      id: `${job.jobId}#${i}`,
      schedAt: formatDateTime(sched),
      trigger: manualRun ? "수동" : "일정",
      status: spec.s,
      server: serverOf(job, i),
      startedAt: formatDateTime(started, true),
      endedAt: ended ? formatDateTime(ended, true) : "",
      durationSec: dur,
      itemCnt: spec.s === "OK" ? (spec.cnt ?? 0) : spec.s === "SKIP" ? 0 : null,
      message: spec.msg ?? "",
    };
  });
  return rows.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

export function buildAllHistory(jobs: JobRecord[], now: Date): Record<string, RunRecord[]> {
  return Object.fromEntries(jobs.map((j) => [j.jobId, buildHistory(j, now)]));
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return "";
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
