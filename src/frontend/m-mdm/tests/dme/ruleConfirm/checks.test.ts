// TSK-08-05 design.md §3.3 — ruleConfirm 순수 판정: 상태 라벨·항목 제목, 확정 버튼 활성(I34), apply_from 변환(I38),
// 경고 분리(계약 변경 / 일반), 계약 영역 상태(I41).
import { describe, expect, it } from "vitest";
import {
  canConfirm, checkStatusLabel, checkTitle, contractState, splitWarnings, toServerDateTime, type ConfirmGate,
} from "../../../pages/dme/ruleConfirm/checks";
import type { CheckIssue, CheckItem } from "../../../pages/dme/ruleConfirm/types";

const ITEMS = ["SAVE_CHECKS", "NOT_EMPTY", "TEST_CASES", "RESULT_VAR_RELEASED"];
const passed = (item: string): CheckItem => ({ item, status: "PASSED", issues: [] });
const CLEAN: CheckItem[] = ITEMS.map(passed);

const warning = (code: string, message: string, itemKey: string | null = null): CheckIssue => ({
  severity: "WARNING", code, message, field: "SAVE_CHECKS", itemKey,
});

const OK: ConfirmGate = {
  status: "DRAFT",
  ownerId: "kim",
  me: "kim",
  permitted: true,
  items: CLEAN,
  applyFromCheck: { status: "PASSED", previousApplyFrom: "2026-01-01 00:00:00", message: null },
  checkedApplyFrom: "2026-07-01 00:00:00",
  applyFrom: "2026-07-01 00:00:00",
};

describe("checkStatusLabel", () => {
  it.each([
    ["PASSED", "통과"],
    ["WARNED", "경고"],
    ["REJECTED", "거부"],
    ["EXEMPT", "면제"],
  ])("%s → %s", (status, label) => {
    expect(checkStatusLabel(status)).toBe(label);
  });

  it("모르는 값은 그대로 보인다", () => {
    expect(checkStatusLabel("SOMETHING")).toBe("SOMETHING");
  });
});

describe("checkTitle", () => {
  it.each([
    ["SAVE_CHECKS", "저장 시 검사 전부"],
    ["NOT_EMPTY", "비어 있음"],
    ["TEST_CASES", "값 테스트"],
    ["RESULT_VAR_RELEASED", "결과 변수 참조"],
    ["APPLY_FROM", "적용 순서"],
  ])("%s → %s", (item, title) => {
    expect(checkTitle(item)).toBe(title);
  });

  it("모르는 항목은 서버 item 을 그대로 쓴다", () => {
    expect(checkTitle("NEW_ITEM")).toBe("NEW_ITEM");
  });
});

describe("canConfirm (I34)", () => {
  it("모든 조건이 참이면 true", () => {
    expect(canConfirm(OK)).toBe(true);
  });

  it("경고(WARNED)만 있으면 true — 경고는 대화상자에서 확인한다", () => {
    expect(canConfirm({ ...OK, items: [...CLEAN.slice(1), { item: "SAVE_CHECKS", status: "WARNED", issues: [] }] })).toBe(true);
  });

  it("최초 버전의 적용 순서 면제(EXEMPT)는 막지 않는다", () => {
    expect(canConfirm({ ...OK, applyFromCheck: { status: "EXEMPT", previousApplyFrom: null, message: null } })).toBe(true);
  });

  it.each<[string, Partial<ConfirmGate>]>([
    ["DRAFT 가 아님", { status: "RELEASED" }],
    ["소유자가 아님", { ownerId: "lee" }],
    ["소유자 없음", { ownerId: null }],
    ["현재 사용자 모름", { me: "" }],
    ["confirm 권한 없음", { permitted: false }],
    ["검사 결과 없음", { items: null }],
    ["검사 결과가 빈 목록", { items: [] }],
    ["REJECTED 항목 1건", { items: [...CLEAN.slice(0, 3), { item: "RESULT_VAR_RELEASED", status: "REJECTED", issues: [] }] }],
    ["적용 순서 REJECTED", { applyFromCheck: { status: "REJECTED", previousApplyFrom: "2026-07-01 00:00:00", message: "x" } }],
    ["검사한 apply_from 과 입력값이 다름", { applyFrom: "2026-07-01 00:00:01" }],
    ["검사하지 않은 apply_from", { checkedApplyFrom: null }],
    ["apply_from 입력 없음", { applyFrom: null, checkedApplyFrom: null }],
  ])("%s → false", (_name, patch) => {
    expect(canConfirm({ ...OK, ...patch })).toBe(false);
  });
});

describe("toServerDateTime (I38)", () => {
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
    expect(toServerDateTime("2026-01-01 00:00:00")).toBe("2026-01-01 00:00:00");
  });

  it("소수 초는 버린다(서버는 초 단위로 자른다)", () => {
    expect(toServerDateTime("2026-07-01T09:30:15.250")).toBe("2026-07-01 09:30:15");
  });

  it.each([[""], ["  "], [null], [undefined], ["2026-07-01"], ["not a date"]])("%s → null", (input) => {
    expect(toServerDateTime(input)).toBeNull();
  });
});

describe("splitWarnings", () => {
  const gap = warning("NULL_GAP", "빈틈이 있습니다", "VAR:1");
  const contract = warning("CONTRACT_CHANGED", "필수 조건 변수 COIL_WID 가 추가되었습니다", "VAR:2");

  it("WARNING 이슈를 code 가 CONTRACT_CHANGED 인 것과 나머지로 나눈다(ERROR 는 빼고 항목 순서 유지)", () => {
    const items: CheckItem[] = [
      { item: "SAVE_CHECKS", status: "REJECTED", issues: [
        gap, contract, { severity: "ERROR", code: "RANGE_REVERSED", message: "경계 역순", field: "SAVE_CHECKS", itemKey: null },
      ] },
      passed("NOT_EMPTY"),
      { item: "TEST_CASES", status: "WARNED", issues: [warning("CASE_NOTE", "참고")] },
      passed("RESULT_VAR_RELEASED"),
    ];
    const out = splitWarnings(items);
    expect(out.general.map((w) => [w.item, w.issue.code])).toEqual([["SAVE_CHECKS", "NULL_GAP"], ["TEST_CASES", "CASE_NOTE"]]);
    expect(out.contract.map((w) => [w.item, w.issue.code])).toEqual([["SAVE_CHECKS", "CONTRACT_CHANGED"]]);
  });

  it("validate 의 contractWarnings 도 계약 변경으로 받되, 항목에 이미 있는 같은 경고는 한 번만 담는다", () => {
    const other = warning("CONTRACT_CHANGED", "조건 변수 SURF_GRD 가 빠졌습니다", "VAR:3");
    const out = splitWarnings([{ item: "SAVE_CHECKS", status: "WARNED", issues: [contract] }], [contract, other]);
    expect(out.contract.map((w) => w.issue.message)).toEqual([contract.message, other.message]);
    expect(out.general).toEqual([]);
  });

  it("검사 전(null)이면 둘 다 빈 목록", () => {
    expect(splitWarnings(null)).toEqual({ general: [], contract: [] });
  });
});

describe("contractState (I41)", () => {
  const contract = warning("CONTRACT_CHANGED", "필수 조건 변수 추가");
  const rejectedSave: CheckItem = { item: "SAVE_CHECKS", status: "REJECTED", issues: [] };

  it("최초 버전이면 FIRST", () => {
    expect(contractState(true, CLEAN, [])).toBe("FIRST");
  });

  it("검사 전이면 NOT_CHECKED — 변경 없음으로 단정하지 않는다", () => {
    expect(contractState(false, null, [])).toBe("NOT_CHECKED");
  });

  it("저장 시 검사가 거부면 계약 경고가 없어도 BLOCKED", () => {
    expect(contractState(false, [rejectedSave, ...CLEAN.slice(1)], [])).toBe("BLOCKED");
  });

  it("계약 변경 경고가 있으면 CHANGED", () => {
    expect(contractState(false, CLEAN, [contract])).toBe("CHANGED");
  });

  it("항목 안에만 계약 변경 경고가 있어도 CHANGED", () => {
    expect(contractState(false, [{ item: "SAVE_CHECKS", status: "WARNED", issues: [contract] }, ...CLEAN.slice(1)], [])).toBe("CHANGED");
  });

  it("검사를 했고 저장 시 검사가 통과이며 경고가 없으면 NONE", () => {
    expect(contractState(false, CLEAN, [])).toBe("NONE");
  });
});
