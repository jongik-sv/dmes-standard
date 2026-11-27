import { describe, expect, it } from "vitest";
import { permCntText, previewOpenOf } from "./model";
import { createMockPermBenchApi } from "./bench.fixture";
import { PERM_SYSADMIN_ROLE_ID, type BenchMenuRow } from "./types";

const screen = (extra: Partial<BenchMenuRow> = {}): BenchMenuRow => ({
  MENU_ID: "M1", PARENT_MENU_ID: "F1", MENU_NM: "화면", OBJECT_ID: "objA", SORT_SEQ: "1", SHOW_TP: "Y", USE_TP: "Y", VISIBLE: "Y", REASON: null, ...extra,
});

describe("z2 F1 — 미리보기 화면 열림은 서버 VISIBLE·REASON 을 따른다", () => {
  it("서버 VISIBLE=Y + 켠 버튼 없음(빈 효과 퍼미션) = 열림 · 버튼 없음(닫힘이 아니다)", () => {
    expect(previewOpenOf(screen(), false)).toBe("noBtn");
  });

  it("서버 VISIBLE=Y + 켠 버튼 있음 = 열림", () => {
    expect(previewOpenOf(screen(), true)).toBe("open");
  });

  it("숨긴 화면(VISIBLE=Y · MENU_HIDDEN)도 열림 쪽 판정", () => {
    expect(previewOpenOf(screen({ SHOW_TP: "N", REASON: "MENU_HIDDEN" }), false)).toBe("noBtn");
  });

  it("서버 VISIBLE=N 이면 켠 버튼이 있어도 닫힘", () => {
    expect(previewOpenOf(screen({ VISIBLE: "N", REASON: "NO_PERM" }), true)).toBe("closed");
    expect(previewOpenOf(screen({ VISIBLE: "N", REASON: "OBJ_UNUSED" }), false)).toBe("closed");
  });

  it("메뉴 줄이 없으면(트리 못 읽음) 켠 버튼으로 판정", () => {
    expect(previewOpenOf(undefined, true)).toBe("open");
    expect(previewOpenOf(undefined, false)).toBe("closed");
  });
});

describe("z2 F3 — 역할 칸 퍼미션 수", () => {
  it("PERM_CNT -1 = 「퍼미션 모두」, 그 밖 = 「퍼미션 n개」", () => {
    expect(permCntText(-1)).toBe("퍼미션 모두");
    expect(permCntText(0)).toBe("퍼미션 0개");
    expect(permCntText(1234)).toBe("퍼미션 1,234개");
  });

  it("목 searchBench 도 SYSADMIN PERM_CNT = -1(BE 와 같은 계약)", async () => {
    const res = await createMockPermBenchApi().searchBench({});
    const sys = res.roles.find((r) => r.ROLE_ID === PERM_SYSADMIN_ROLE_ID);
    expect(sys?.PERM_CNT).toBe(-1);
    expect(res.roles.filter((r) => r.ROLE_ID !== PERM_SYSADMIN_ROLE_ID).every((r) => r.PERM_CNT >= 0)).toBe(true);
  });
});
