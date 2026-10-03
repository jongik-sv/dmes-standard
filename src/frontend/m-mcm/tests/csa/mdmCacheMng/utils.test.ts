import { describe, expect, it } from "vitest";

import { definitionKey, describeLifetime, entryKindLabel, formatBytes, shouldWaitAfterForce, withEntryKind } from "../../../page-components/csa/mdmCacheMng/utils";

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

  it("definitionKey — 버전 대상의 본문 키는 마지막 @ + 소수 셋째 자리 숫자 앞이 정의 키다(서버와 같은 규칙)", () => {
    expect(definitionKey("CODE", "PROC_CD@1.000")).toBe("PROC_CD");
    expect(definitionKey("RULE", "A@B@2.010")).toBe("A@B");
    expect(definitionKey("LAYOUT", "42@1.000")).toBe("42");
    expect(definitionKey("CODE", "PROC_CD")).toBe("PROC_CD");
    expect(definitionKey("CODE", "X@1")).toBe("X@1");
    expect(definitionKey("COLUMN", "X@1.000")).toBe("X@1.000");
  });

  it("entryKindLabel — 값·목차·본문(최종)·본문(옛), 옛 모듈(구분 없음)은 빈 문자열", () => {
    expect(entryKindLabel("VALUE", null)).toBe("값");
    expect(entryKindLabel("TOC", null)).toBe("목차");
    expect(entryKindLabel("BODY", true)).toBe("본문(최종)");
    expect(entryKindLabel("BODY", false)).toBe("본문(옛)");
    expect(entryKindLabel(null, null)).toBe("");
  });

  it("withEntryKind — current 만 바뀐 같은 행 키에도 새 구분 문구가 칸 값으로 실린다(그리드 셀 갱신)", () => {
    const base = { rowId: "CODE:X@1.000", type: "CODE" as const, key: "X@1.000", absent: false, loadedAt: "", lastAccessAt: "", hits: 0, remainingSeconds: 0, bytes: 1, part: "BODY" as const, ver: "1.000" };
    const before = withEntryKind([{ ...base, current: true }]);
    const after = withEntryKind([{ ...base, current: false }]);
    expect(before[0].kind).toBe("본문(최종)");
    expect(after[0].kind).toBe("본문(옛)");
    expect(after[0].rowId).toBe(before[0].rowId);
    expect(withEntryKind([{ ...base, part: "TOC", ver: null, current: null }])[0].kind).toBe("목차");
  });

  it("describeLifetime — 옛 버전 본문 수명을 알면 덧붙인다", () => {
    expect(describeLifetime(3600, 86400, 600)).toBe(
      "마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간). 옛 버전 본문은 10분",
    );
    expect(describeLifetime(3600, 86400, null)).toBe("마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간)");
  });

  it("shouldWaitAfterForce — 실패·반영 유형 없음·순번 없음이면 기다리지 않는다", () => {
    expect(shouldWaitAfterForce({ applied: ["RULE"], failedType: null, toSeq: 7 })).toBe(7);
    expect(shouldWaitAfterForce({ applied: ["RULE"], failedType: "CODE", toSeq: 7 })).toBeNull();
    expect(shouldWaitAfterForce({ applied: [], failedType: null, toSeq: 7 })).toBeNull();
    expect(shouldWaitAfterForce({ applied: [], failedType: "RULE", toSeq: null })).toBeNull();
    expect(shouldWaitAfterForce({ applied: ["RULE"], failedType: null, toSeq: null })).toBeNull();
    expect(shouldWaitAfterForce({ applied: ["RULE"], failedType: null, toSeq: 0 })).toBeNull();
  });
});
