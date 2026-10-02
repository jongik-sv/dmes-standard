import { describe, expect, it } from "vitest";
import { versionActionState } from "@/layout/version-rows";
import type { LayoutVersionRow } from "@/layout/types";

const row = (over: Partial<LayoutVersionRow>): LayoutVersionRow => ({
  VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", ROW_VERSION: 0, OWN_LENGTH: 57, LEGACY: "N", ...over,
});
const all = () => true;

describe("versionActionState", () => {
  it("my draft: delete·confirm·unlock·handover on, new versions off", () => {
    const draft = row({ VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "kim" });
    const s = versionActionState({ selected: draft, versions: [draft, row({})], editable: true, canNewMajor: false, canNewMinor: false }, "kim", all);
    expect(s.delete.enabled).toBe(true);
    expect(s.confirm.enabled).toBe(true);
    expect(s.unlock.enabled).toBe(true);
    expect(s.handover.enabled).toBe(true);
    expect(s.lock.enabled).toBe(false);
    expect(s.newMinor.enabled).toBe(false);
  });
  it("unowned draft can be locked, future release can be cancelled", () => {
    const unowned = row({ VER: "2.000", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: null });
    expect(versionActionState({ selected: unowned, versions: [unowned] }, "kim", all).lock.enabled).toBe(true);
    const future = row({ VER: "2.000", STATE: "FUTURE", OWNER_ID: "kim" });
    expect(versionActionState({ selected: future, versions: [future] }, "kim", all).cancelConfirm.enabled).toBe(true);
  });
  it("new version titles show the next number", () => {
    const s = versionActionState({ selected: row({}), versions: [row({})], canNewMajor: true, canNewMinor: true, nextMajor: "2.000",
      nextMinor: "1.001" }, "kim", all);
    expect(s.newMajor.title).toContain("v2.000");
    expect(s.newMinor.title).toContain("v1.001");
  });
  it("permission gates every action", () => {
    const s = versionActionState({ selected: row({}), versions: [row({})], canNewMajor: true, canNewMinor: true }, "kim", () => false);
    expect(Object.values(s).every((a) => !a.enabled)).toBe(true);
  });
});
