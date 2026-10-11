import { describe, expect, it } from "vitest";

import { evidenceText, issueLabel, SOURCE_LABEL, timeText } from "../../../pages/dma/erdEdit/labels";

describe("문구 사전(U30)", () => {
  it("확정 코드를 한국어로, 모르는 코드는 그대로", () => {
    expect(issueLabel("ERD_STD_DOMAIN")).toBe("도메인 다름");
    expect(issueLabel("ERD_INFERRED_LEFT")).toBe("검토 안 한 추정 관계");
    expect(issueLabel("X_NEW")).toBe("X_NEW");
  });
  it("근거는 종류를 한국어로, 경로는 마지막 조각만", () => {
    expect(evidenceText({ kind: "SQL_JOIN", ref: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql:1108" }))
      .toBe("SQL 조인 V1__baseline.sql:1108");
    expect(evidenceText({ kind: "NAME_RULE", ref: "PK 이름 일치" })).toBe("이름 규칙 PK 이름 일치");
  });
  it("출처 한국어", () => {
    expect(SOURCE_LABEL.MCP).toBe("Claude");
    expect(SOURCE_LABEL.UI).toBe("화면");
  });
  it("시각 — 오늘이면 HH:mm, 아니면 MM-dd HH:mm, 없거나 깨지면 빈 글", () => {
    const now = new Date(2026, 9, 11, 15, 0, 0);
    expect(timeText("2026-10-11T14:03:22", now)).toBe("14:03");
    expect(timeText("2026-10-10T09:05:00", now)).toBe("10-10 09:05");
    expect(timeText(null, now)).toBe("");
    expect(timeText("어제", now)).toBe("");
  });
});
