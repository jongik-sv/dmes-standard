import { describe, expect, it } from "vitest";
import { NO_PERM, allowedOf, baseValue, deleteConfirmText, entryOf, findDeleted, setCodes, toggleCode, type PermEntry } from "./perm-chips";
import type { PermRow } from "./types";

const ROW: PermRow = {
  ROLE_ID: "role_A",
  OBJECT_ID: "objA",
  OBJ_BTN_PERM: "search,export",
  OBJ_POPUP_PERM: "",
  OBJ_READ_PERM: "search",
  BTN_PERM: "search",
  POPUP_PERM: "",
  DATA_PERM: "",
  HAS_PERM: "Y",
};

const NEW_ROW: PermRow = { ...ROW, OBJECT_ID: "objB", BTN_PERM: "", HAS_PERM: "N" };

describe("z2 F2 — 마지막 칩 끄기는 저장 전에 확인을 묻는다", () => {
  it("마지막 버튼 칩을 끄면 지워지는 건으로 잡히고 확인 글이 나온다", () => {
    const cur = toggleCode(baseValue(ROW), "btn", "search", allowedOf(ROW).btn);
    expect(cur).toBe(NO_PERM);
    const e = entryOf(ROW, cur)!;
    expect(findDeleted([e])).toEqual([e]);
    const text = deleteConfirmText([e]);
    expect(text).toContain("마지막 버튼을 끄면 이 퍼미션이 지워집니다");
    expect(text).toContain("role_A × objA");
  });

  it("버튼이 남는 변경·새로 만든 퍼미션은 묻지 않는다", () => {
    const kept = entryOf(ROW, setCodes(baseValue(ROW), "btn", ["search", "export"], allowedOf(ROW).btn))!;
    const made = entryOf(NEW_ROW, { has: true, btn: ["search"], pop: [] })!;
    expect(findDeleted([kept, made])).toEqual([]);
    expect(deleteConfirmText([kept, made])).toBeNull();
  });

  it("지워지는 건이 많으면 앞 5건만 적고 나머지는 「외 n건」", () => {
    const many: PermEntry[] = Array.from({ length: 7 }, (_, i) => entryOf({ ...ROW, OBJECT_ID: `o${i}` }, NO_PERM)!);
    const text = deleteConfirmText(many)!;
    expect(text).toContain("퍼미션 7건이 지워집니다");
    expect(text).toContain("외 2건");
    expect(text).not.toContain("o5");
  });
});
