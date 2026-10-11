import { describe, expect, it } from "vitest";

import { ISSUE_LIMIT, applyFromText, groupIssues, isValidApplyFrom } from "../../../pages/dma/erdEdit/panels/ConfirmDialog";
import { versionButtons } from "../../../pages/dma/erdEdit/panels/VersionBar";
import type { ErdCheckIssue } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

const all = () => true;

describe("버전 막대 단추(스펙 4.7)", () => {
  it("DRAFT 소유자는 삭제·확정·해제, 소유자 없는 DRAFT 는 선점, RELEASED 는 새 버전만 켠다", () => {
    const draft = stateOf(menuModel(), MENU_DIAGRAMS);
    const own = versionButtons(fakeEditContext(draft), all);
    expect([own.newVersion.enabled, own.delete.enabled, own.confirm.enabled, own.lock.enabled, own.unlock.enabled]).toEqual([false, true, true, false, true]);
    expect(own.newVersion.title).toContain("이미 DRAFT");
    const orphan = fakeEditContext({ ...draft, ownerId: null });
    const o = versionButtons({ ...orphan, rights: { ...orphan.rights, owner: false } }, all);
    expect([o.delete.enabled, o.lock.enabled, o.unlock.enabled]).toEqual([false, true, false]);
    const rel = versionButtons(fakeEditContext({ ...draft, status: "RELEASED" }), all);
    expect([rel.newVersion.enabled, rel.delete.enabled, rel.lock.enabled]).toEqual([true, false, false]);
    expect(versionButtons(fakeEditContext({ ...draft, status: "RELEASED" }), (a) => a !== "copy").newVersion.enabled).toBe(false);
  });

  it("켜진 단추에도 무엇을 하는지 title 을 준다", () => {
    const draft = stateOf(menuModel(), MENU_DIAGRAMS);
    const rel = versionButtons(fakeEditContext({ ...draft, status: "RELEASED" }), all);
    expect(rel.newVersion).toEqual({ enabled: true, title: "확정본을 복사해 새 DRAFT 를 만듭니다(major = 큰 변경, minor = 작은 변경)" });
    const own = versionButtons(fakeEditContext(draft), all);
    expect([own.delete.title, own.confirm.title, own.unlock.title]).toEqual([
      "이 DRAFT 를 지웁니다", "검사 뒤 이 DRAFT 를 확정본으로 만듭니다", "소유를 내려놓습니다",
    ]);
    const orphan = fakeEditContext({ ...draft, ownerId: null });
    expect(versionButtons({ ...orphan, rights: { ...orphan.rights, owner: false } }, all).lock.title).toBe("이 DRAFT 의 소유자가 됩니다");
  });
});

describe("확정 검사 묶음(S2-28)", () => {
  it("코드별로 묶어 많은 것부터 쓰고, 묶음마다 처음 50건만 싣는다", () => {
    const issue = (code: string, i: number): ErdCheckIssue => ({ code, message: `위반 ${i}`, field: null, itemKey: `TB_X.C${i}` });
    const list = [...Array.from({ length: 700 }, (_, i) => issue("STD_DOMAIN", i)), issue("STD_TYPE", 1), issue("STD_TYPE", 2)];
    const g = groupIssues(list);
    expect(g.map((x) => [x.code, x.count, x.items.length])).toEqual([["STD_DOMAIN", 700, ISSUE_LIMIT], ["STD_TYPE", 2, 2]]);
    expect(g[0].items[49].itemKey).toBe("TB_X.C49");
    expect(applyFromText(new Date(2026, 9, 11, 9, 5, 7))).toBe("2026-10-11 09:05:07");
  });
});

describe("적용 시작 시각 검증", () => {
  it("형식이 맞아도 없는 날짜·시각이면 거절하고, 지금 시각 문자열은 받는다", () => {
    expect(isValidApplyFrom("2026-10-11 09:05:07")).toBe(true);
    expect(isValidApplyFrom(applyFromText(new Date()))).toBe(true);
    expect(isValidApplyFrom("2026-13-45 99:99:99")).toBe(false);
    expect(isValidApplyFrom("2026-02-30 10:00:00")).toBe(false);
    expect(isValidApplyFrom("2026-10-11 24:00:00")).toBe(false);
    expect(isValidApplyFrom("2026-10-11")).toBe(false);
  });
});
