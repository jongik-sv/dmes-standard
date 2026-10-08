// src/frontend/shared/tests/unit/cron-input.unit.test.ts
import { describe, expect, it } from "vitest";

import {
  buildCron,
  CRON_PRESETS,
  DEFAULT_EASY,
  describeCron,
  parseCron,
  runTimes,
  toEasy,
  validateCron,
  validateFieldText,
} from "../../src/components/cron-input/cron";

describe("parseCron", () => {
  it("5칸 식과 매크로를 읽는다", () => {
    expect(parseCron("0 2 * * *").ok).toBe(true);
    expect(parseCron("@daily").ok).toBe(true);
    expect(parseCron("0 4 * * 7").ok).toBe(true);
    expect(parseCron("0 9 * * MON-FRI").ok).toBe(true);
  });

  it("빈 글자·6칸·Spring 문법·범위 밖·일+요일 동시 제한을 거절한다", () => {
    expect(parseCron("  ")).toEqual({ ok: false, error: "crontab 식을 입력하세요." });
    expect(parseCron("0 0 0 * * *")).toMatchObject({ ok: false, error: expect.stringContaining("5칸") });
    expect(parseCron("0 0 L * *")).toMatchObject({ ok: false, error: expect.stringContaining("? L W #") });
    expect(parseCron("60 * * * *").ok).toBe(false);
    expect(parseCron("* 24 * * *").ok).toBe(false);
    expect(parseCron("0 9 1 * 1")).toEqual({ ok: false, error: "일과 요일 중 하나는 * 로 두세요." });
  });
});

describe("validateCron / validateFieldText", () => {
  it("간격 하한을 주면 더 짧은 식을 거절한다", () => {
    expect(validateCron("*/5 * * * *", 5)).toBeNull();
    expect(validateCron("*/2 * * * *", 5)).toContain("5분");
    expect(validateCron("0 2 * * *", 60)).toBeNull();
  });

  it("칸 하나의 오류를 칸 이름 없이 돌려준다", () => {
    expect(validateFieldText(0, "*/5")).toBeNull();
    expect(validateFieldText(0, "")).toBe("값을 입력하세요.");
    expect(validateFieldText(1, "25")).not.toBeNull();
  });
});

describe("describeCron", () => {
  it.each([
    ["* * * * *", "매분"],
    ["*/10 * * * *", "10분마다"],
    ["0 * * * *", "매시 정각"],
    ["0 2 * * *", "매일 02:00"],
    ["0 9 * * 1-5", "평일 09:00"],
    ["0 4 * * 0", "매주 일요일 04:00"],
    ["30 0 1 * *", "매월 1일 00:30"],
  ])("%s → %s", (expr, text) => {
    expect(describeCron(expr)).toBe(text);
  });

  it("올바르지 않은 식은 빈 글자", () => {
    expect(describeCron("nope")).toBe("");
  });
});

describe("runTimes", () => {
  it("from 다음 분부터 앞으로 count 개의 실행 시각을 돌려준다", () => {
    const parsed = parseCron("0 2 * * *");
    if (!parsed.ok) throw new Error("parse");
    const times = runTimes(parsed.cron, new Date(2026, 9, 8, 21, 23), 3);
    expect(times.map((d) => [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [10, 9, 2, 0],
      [10, 10, 2, 0],
      [10, 11, 2, 0],
    ]);
  });
});

describe("쉬운 설정 왕복", () => {
  it.each(CRON_PRESETS.map((p) => p.value))("자주 쓰는 식 %s 는 쉬운 설정으로 나타내고 같은 식을 다시 만든다", (expr) => {
    const easy = toEasy(expr);
    expect(easy).not.toBeNull();
    const built = buildCron(easy!);
    expect(built).toEqual({ ok: true, cron: expr });
  });

  it("쉬운 설정으로 나타낼 수 없는 식은 null", () => {
    expect(toEasy("0 0 1 1 *")).toBeNull();
    expect(toEasy("0 9 1 * 1")).toBeNull();
  });

  it("만들 수 없는 설정은 사유를 돌려준다", () => {
    expect(buildCron({ ...DEFAULT_EASY, kind: "weekly", weekdays: [] })).toEqual({ ok: false, error: "요일을 하나 이상 고르세요." });
    expect(buildCron({ ...DEFAULT_EASY, kind: "daily", times: ["02:00", "03:30"] })).toMatchObject({ ok: false });
    expect(buildCron({ ...DEFAULT_EASY, kind: "everyNMinutes", interval: 5, limitHours: true, hourFrom: 20, hourTo: 8 })).toMatchObject({ ok: false });
  });
});
