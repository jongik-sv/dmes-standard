// TSK-01-03 design.md §3.4 V2 — 상태·잠금 배지의 라벨·클래스와 색 토큰 규칙(불변 규칙 I22).
// 배지는 Mantine 없이 인라인 스타일로 그리므로 node 환경의 정적 렌더로 충분하다.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftLockBadge, VersionStatusBadge } from "@/shell";
import type { MdmVersionStatus } from "@/shell";

// 04 샘플 기준일(04:1061) 2026-09-03 00:00 KST
const NOW = new Date("2026-09-03T00:00:00+09:00");

function statusBadge(status: MdmVersionStatus | string, applyFrom?: string | null) {
  return renderToStaticMarkup(
    createElement(VersionStatusBadge, { status: status as MdmVersionStatus, applyFrom, now: NOW }),
  );
}

function lockBadge(status: MdmVersionStatus, ownerId?: string | null) {
  return renderToStaticMarkup(createElement(DraftLockBadge, { status, ownerId, currentUserId: "me" }));
}

function expectTokenColorsOnly(html: string) {
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(html).not.toContain("rgb(");
  expect(html).toContain("var(--color-");
}

describe("VersionStatusBadge", () => {
  it.each([
    ["DRAFT", "작성 중", "draft"],
    ["REQUESTED", "상신", "requested"],
    ["APPROVED", "승인", "approved"],
    ["CANCELLED", "철회", "cancelled"],
  ])("%s 는 '%s' 라벨과 --%s 클래스", (status, label, key) => {
    const html = statusBadge(status);
    expect(html).toContain(`>${label}<`);
    expect(html).toContain(`mdm-status-badge mdm-status-badge--${key}`);
    expect(html).toContain(`data-status="${status}"`);
    expectTokenColorsOnly(html);
  });

  it("RELEASED 이고 applyFrom 이 과거면 '확정'", () => {
    const html = statusBadge("RELEASED", "2026-07-01 00:00:00");
    expect(html).toContain(">확정<");
    expect(html).toContain("mdm-status-badge--released");
    expectTokenColorsOnly(html);
  });

  it("RELEASED 이고 applyFrom 이 미래면 '적용 대기'(04:378 미적용 버전 표시)", () => {
    const html = statusBadge("RELEASED", "2026-10-01 00:00:00");
    expect(html).toContain(">적용 대기<");
    expect(html).toContain("mdm-status-badge--pending");
    expectTokenColorsOnly(html);
  });

  it("applyFrom 이 now 와 같으면 적용된 것으로 본다(경계 포함)", () => {
    expect(statusBadge("RELEASED", "2026-09-03 00:00:00")).toContain(">확정<");
    expect(statusBadge("RELEASED", "2026-09-03T00:00:00+09:00")).toContain(">확정<");
  });

  it("applyFrom 이 없으면 RELEASED 는 '확정'", () => {
    expect(statusBadge("RELEASED", null)).toContain(">확정<");
  });

  it("알 수 없는 상태는 원문 그대로 --unknown", () => {
    const html = statusBadge("ARCHIVED");
    expect(html).toContain(">ARCHIVED<");
    expect(html).toContain("mdm-status-badge--unknown");
    expectTokenColorsOnly(html);
  });
});

describe("DraftLockBadge", () => {
  it("DRAFT 이고 소유자가 없으면 '선점 가능'", () => {
    const html = lockBadge("DRAFT", null);
    expect(html).toContain(">선점 가능<");
    expect(html).toContain("mdm-lock-badge mdm-lock-badge--free");
    expectTokenColorsOnly(html);
  });

  it("DRAFT 이고 소유자가 나면 '편집 중(나)'", () => {
    const html = lockBadge("DRAFT", "me");
    expect(html).toContain(">편집 중(나)<");
    expect(html).toContain("mdm-lock-badge--mine");
    expect(html).toContain('data-owner="me"');
    expectTokenColorsOnly(html);
  });

  it("DRAFT 이고 소유자가 남이면 '잠김 · {ownerId} 편집 중'", () => {
    const html = lockBadge("DRAFT", "kim");
    expect(html).toContain(">잠김 · kim 편집 중<");
    expect(html).toContain("mdm-lock-badge--locked");
    expect(html).toContain('data-owner="kim"');
    expectTokenColorsOnly(html);
  });

  it.each(["RELEASED", "REQUESTED", "APPROVED", "CANCELLED"] as const)(
    "%s 에서는 아무것도 그리지 않는다(RELEASED 뒤 owner 는 기록일 뿐)",
    (status) => {
      expect(lockBadge(status, "kim")).toBe("");
    },
  );
});
