// TSK-06-05 design.md §3.3 — codeConfirm 순수 판정: 상태 라벨, 확정 버튼 활성(I30), apply_from 변환(I34).
import { describe, expect, it } from "vitest";
import {
  canConfirm, checkStatusLabel, checkTitle, toServerDateTime, warningLines, type ConfirmGate,
} from "../../../pages/dmc/codeConfirm/checks";
import type { CheckRow } from "../../../pages/dmc/codeConfirm/types";

const passed = (no: string): CheckRow => ({ no, item: `ITEM_${no}`, severity: "REJECT", status: "PASSED", issues: [] });

const CLEAN: CheckRow[] = [passed("1"), passed("2"), { ...passed("3"), status: "EXEMPT" }];

const OK: ConfirmGate = {
  status: "DRAFT",
  ownerId: "kim",
  me: "kim",
  permitted: true,
  checks: CLEAN,
  checkedApplyFrom: "2026-07-01 00:00:00",
  applyFrom: "2026-07-01 00:00:00",
};

describe("checkStatusLabel", () => {
  it.each([
    ["PASSED", "통과"],
    ["WARNED", "경고"],
    ["REJECTED", "거부"],
    ["EXEMPT", "면제"],
    ["DELEGATED", "공통 검사"],
    ["DEFERRED", "보류"],
  ])("%s → %s", (status, label) => {
    expect(checkStatusLabel(status)).toBe(label);
  });

  it("모르는 값은 그대로 보인다", () => {
    expect(checkStatusLabel("SOMETHING")).toBe("SOMETHING");
  });
});

describe("checkTitle", () => {
  it("검사 번호의 설명을 돌려주고, 모르는 번호는 서버 item 을 그대로 쓴다", () => {
    expect(checkTitle("3", "APPLY_FROM_ORDER")).toBe("apply_from 이 직전 RELEASED 보다 뒤");
    expect(checkTitle("2-2", "CATEGORY_EMPTY")).toBe("해석 결과가 빈 카테고리");
    expect(checkTitle("9", "NEW_ITEM")).toBe("NEW_ITEM");
  });
});

describe("canConfirm (I30)", () => {
  it("모든 조건이 참이면 true", () => {
    expect(canConfirm(OK)).toBe(true);
  });

  it("경고(WARNED)만 있으면 true — 경고는 대화상자에서 확인한다", () => {
    const warned: CheckRow = { no: "2-2", item: "CATEGORY_EMPTY", severity: "WARNING", status: "WARNED", issues: [] };
    expect(canConfirm({ ...OK, checks: [...CLEAN, warned] })).toBe(true);
  });

  it.each<[string, Partial<ConfirmGate>]>([
    ["DRAFT 가 아님", { status: "RELEASED" }],
    ["소유자가 아님", { ownerId: "lee" }],
    ["소유자 없음", { ownerId: null }],
    ["현재 사용자 모름", { me: "" }],
    ["confirm 권한 없음", { permitted: false }],
    ["검사 결과 없음", { checks: null }],
    ["검사 결과가 빈 목록", { checks: [] }],
    ["REJECTED 1건", { checks: [...CLEAN, { ...passed("4"), status: "REJECTED" }] }],
    ["검사한 apply_from 과 입력값이 다름", { applyFrom: "2026-07-01 00:00:01" }],
    ["검사하지 않은 apply_from", { checkedApplyFrom: null }],
    ["apply_from 입력 없음", { applyFrom: null, checkedApplyFrom: null }],
  ])("%s → false", (_name, patch) => {
    expect(canConfirm({ ...OK, ...patch })).toBe(false);
  });
});

describe("toServerDateTime (I34)", () => {
  it("DateTimePicker 값(항상 시·분·초)을 초까지 그대로 보낸다", () => {
    expect(toServerDateTime("2026-10-01 21:45:37")).toBe("2026-10-01 21:45:37");
  });

  it("자정과 23시 59시 59초도 초까지 보존한다", () => {
    expect(toServerDateTime("2026-10-01 00:00:00")).toBe("2026-10-01 00:00:00");
    expect(toServerDateTime("2026-10-01 23:59:59")).toBe("2026-10-01 23:59:59");
  });

  it("datetime-local 의 분 단위 값에 초를 붙인다", () => {
    expect(toServerDateTime("2026-07-01T00:00")).toBe("2026-07-01 00:00:00");
  });

  it("초가 있는 입력은 초를 보존한다", () => {
    expect(toServerDateTime("2026-07-01T09:30:15")).toBe("2026-07-01 09:30:15");
  });

  it("이미 서버 형식이면 그대로 둔다", () => {
    expect(toServerDateTime("2024-01-01 00:00:00")).toBe("2024-01-01 00:00:00");
  });

  it("소수 초는 버린다(서버는 초 단위로 자른다)", () => {
    expect(toServerDateTime("2026-07-01T09:30:15.250")).toBe("2026-07-01 09:30:15");
  });

  it.each(["", "   ", null, undefined, "2026-07-01", "abc"])("빈 값·읽을 수 없는 값(%s) → null", (v) => {
    expect(toServerDateTime(v as string | null | undefined)).toBeNull();
  });
});

describe("warningLines", () => {
  it("WARNED 행의 이슈만 행 순서대로 편다", () => {
    const rows: CheckRow[] = [
      passed("1"),
      { no: "2-1", item: "CATE_ITEM_CODE_MISSING", severity: "WARNING", status: "WARNED",
        issues: [{ code: "CATE_ITEM_CODE_MISSING", message: "소속 코드 없음", field: null, itemKey: "CATE_ITEM:MAJOR,99" }] },
      { no: "4", item: "HAS_CHANGES", severity: "REJECT", status: "REJECTED",
        issues: [{ code: "HAS_CHANGES", message: "바뀐 행 없음", field: null, itemKey: null }] },
      { no: "2-2", item: "CATEGORY_EMPTY", severity: "WARNING", status: "WARNED",
        issues: [{ code: "CATEGORY_EMPTY", message: "해당 코드 0건", field: null, itemKey: "CATE:COATING" }] },
    ];
    expect(warningLines(rows).map((w) => [w.no, w.issue.itemKey])).toEqual([
      ["2-1", "CATE_ITEM:MAJOR,99"],
      ["2-2", "CATE:COATING"],
    ]);
  });

  it("검사 결과가 없으면 빈 목록", () => {
    expect(warningLines(null)).toEqual([]);
  });
});
