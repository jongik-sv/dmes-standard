import { describe, expect, it } from "vitest";

import { describeLifetime, formatBytes } from "../../../page-components/csa/mdmCacheMng/utils";

describe("mdmCacheMng utils", () => {
  it("formatBytes — 1024 단위 B/KB/MB/GB, KB 부터 소수 1자리", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB"); // 반올림해도 단위는 올리지 않는다
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(300 * 1024 * 1024)).toBe("300.0 MB");
    expect(formatBytes(4 * 1024 * 1024 * 1024)).toBe("4.0 GB");
    expect(formatBytes(2048 * 1024 * 1024 * 1024)).toBe("2048.0 GB"); // GB 가 가장 큰 단위
  });

  it("formatBytes — 음수(잴 수 없음 -1)·null·undefined·NaN 은 '-'", () => {
    expect(formatBytes(-1)).toBe("-");
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(undefined)).toBe("-");
    expect(formatBytes(Number.NaN)).toBe("-");
  });

  it("describeLifetime — 유휴 수명(분)·절대 상한(시간) 도움말, 모르면 빈 문자열", () => {
    expect(describeLifetime(3600, 86400)).toBe(
      "마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간)",
    );
    expect(describeLifetime(90, 5400)).toBe("마지막 조회 뒤 1.5분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 1.5시간)");
    expect(describeLifetime(null, 86400)).toBe("");
    expect(describeLifetime(3600, undefined)).toBe("");
  });
});
