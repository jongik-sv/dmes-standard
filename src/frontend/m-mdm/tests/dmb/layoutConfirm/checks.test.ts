import { describe, expect, it } from "vitest";
import { canConfirmLayout } from "../../../pages/dmb/layoutConfirm/checks";

const base = { validated: true, applyFrom: "2026-07-01 00:00:00", checkedApplyFrom: "2026-07-01 00:00:00", errors: 0, warnings: 0,
  acknowledged: false, isOwner: true, canConfirm: true };

describe("canConfirmLayout", () => {
  it("needs validation of the same applyFrom", () => {
    expect(canConfirmLayout(base)).toBe(true);
    expect(canConfirmLayout({ ...base, checkedApplyFrom: "2026-06-30 00:00:00" })).toBe(false);
    expect(canConfirmLayout({ ...base, validated: false })).toBe(false);
  });
  it("errors block, warnings need acknowledgement", () => {
    expect(canConfirmLayout({ ...base, errors: 1 })).toBe(false);
    expect(canConfirmLayout({ ...base, warnings: 2 })).toBe(false);
    expect(canConfirmLayout({ ...base, warnings: 2, acknowledged: true })).toBe(true);
  });
  it("owner and permission", () => {
    expect(canConfirmLayout({ ...base, isOwner: false })).toBe(false);
    expect(canConfirmLayout({ ...base, canConfirm: false })).toBe(false);
  });
});
