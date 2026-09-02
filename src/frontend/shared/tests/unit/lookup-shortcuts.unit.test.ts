import { describe, expect, it } from "vitest";
import { shouldOpenLookupPopupFromKey } from "../../src/components/lookup/lookup-shortcuts";

describe("lookup popup keyboard shortcut", () => {
  it("opens lookup popup on plain F4", () => {
    expect(shouldOpenLookupPopupFromKey({ key: "F4" })).toBe(true);
  });

  it("does not open without popup callback or while disabled", () => {
    expect(shouldOpenLookupPopupFromKey({ key: "F4" }, { hasOpenPopup: false })).toBe(false);
    expect(shouldOpenLookupPopupFromKey({ key: "F4" }, { disabled: true })).toBe(false);
  });

  it("does not open when F4 is combined with modifier keys", () => {
    expect(shouldOpenLookupPopupFromKey({ key: "F4", altKey: true })).toBe(false);
    expect(shouldOpenLookupPopupFromKey({ key: "F4", ctrlKey: true })).toBe(false);
    expect(shouldOpenLookupPopupFromKey({ key: "F4", metaKey: true })).toBe(false);
    expect(shouldOpenLookupPopupFromKey({ key: "F4", shiftKey: true })).toBe(false);
  });

  it("ignores other keys", () => {
    expect(shouldOpenLookupPopupFromKey({ key: "Enter" })).toBe(false);
  });
});
