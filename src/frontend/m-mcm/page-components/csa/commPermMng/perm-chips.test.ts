import { describe, expect, it } from "vitest";
import {
  NO_PERM,
  allowedOf,
  baseValue,
  chipStates,
  effective,
  entryOf,
  findEmptyBtn,
  foldSaved,
  isDirty,
  makeValue,
  outNotice,
  presetMatch,
  rowState,
  setCodes,
  shortSummary,
  splitCodes,
  toSaveRows,
  toViewRow,
  toggleCode,
} from "./perm-chips";
import type { PermRow } from "./types";

/** 시험 고정 자료: role_MN_MPP_WORK_VIEW × mppWorkView — print 는 오브젝트 밖 값(D15). */
const VIEW_ROW: PermRow = {
  ROLE_ID: "role_MN_MPP_WORK_VIEW",
  OBJECT_ID: "mppWorkView",
  OBJ_BTN_PERM: "search,export",
  OBJ_POPUP_PERM: "lotPop",
  OBJ_READ_PERM: "search",
  BTN_PERM: "search,export,print",
  POPUP_PERM: "lotPop",
  DATA_PERM: "DP1",
  HAS_PERM: "Y",
};

const EMPTY_ROW: PermRow = {
  ROLE_ID: "role_X",
  OBJECT_ID: "mppPlanReg",
  OBJ_BTN_PERM: "find,save,order,send,export",
  OBJ_POPUP_PERM: "orderPop,lineSelPop",
  OBJ_READ_PERM: "find",
  BTN_PERM: "",
  POPUP_PERM: "",
  DATA_PERM: "",
  HAS_PERM: "N",
};

describe("splitCodes · effective", () => {
  it("콤마·공백으로 나누고 빈 값·중복을 뺀다", () => {
    expect(splitCodes(" find, send ,,find  save")).toEqual(["find", "send", "save"]);
    expect(splitCodes(undefined)).toEqual([]);
  });
  it("실제 값 = 퍼미션 ∩ 오브젝트, 오브젝트 순서", () => {
    expect(effective(["send", "print", "find"], ["find", "save", "send"])).toEqual(["find", "send"]);
  });
});

describe("chipStates", () => {
  it("밖 값은 뒤에 줄 긋고 누를 수 없게 둔다", () => {
    const a = allowedOf(VIEW_ROW);
    const b = baseValue(VIEW_ROW);
    const chips = chipStates(a.btn, b.btn, b.btn, true, "");
    expect(chips.map((c) => c.code)).toEqual(["search", "export", "print"]);
    expect(chips[2]).toMatchObject({ out: true, on: false, disabled: true });
    expect(chips[0]).toMatchObject({ on: true, out: false, changed: false, disabled: false });
  });
  it("퍼미션이 없으면 모두 꺼지고 누를 수 없다. 코드 조건은 hit 로 표시", () => {
    const chips = chipStates(["find", "send"], [], [], false, "SEN");
    expect(chips.every((c) => c.disabled && !c.on)).toBe(true);
    expect(chips.find((c) => c.code === "send")?.hit).toBe(true);
  });
  it("바꾼 칩은 changed", () => {
    const chips = chipStates(["find", "send"], ["find", "send"], ["find"], true, "");
    expect(chips.map((c) => c.changed)).toEqual([false, true]);
  });
});

describe("toggleCode (D14)", () => {
  it("버튼을 켜고 끈다. 밖 값·퍼미션 없음은 그대로", () => {
    const cur = { has: true, btn: ["find"], pop: [] };
    expect(toggleCode(cur, "btn", "send", ["find", "send"]).btn).toEqual(["find", "send"]);
    expect(toggleCode(cur, "btn", "print", ["find", "send"])).toBe(cur);
    expect(toggleCode(NO_PERM, "btn", "find", ["find"])).toBe(NO_PERM);
  });
  it("마지막 버튼을 끄면 퍼미션이 빠진다(밖 값·팝업이 남아도)", () => {
    const cur = { has: true, btn: ["find", "print"], pop: ["orderPop"] };
    expect(toggleCode(cur, "btn", "find", ["find", "send"])).toEqual(NO_PERM);
  });
  it("팝업은 모두 꺼도 퍼미션이 남는다", () => {
    const cur = { has: true, btn: ["find"], pop: ["orderPop"] };
    expect(toggleCode(cur, "pop", "orderPop", ["orderPop"])).toEqual({ has: true, btn: ["find"], pop: [] });
  });
});

describe("makeValue · presetMatch (D18)", () => {
  it("조회만 = OBJ_READ_PERM, 모두 = 버튼·팝업 전부", () => {
    const a = allowedOf(EMPTY_ROW);
    expect(makeValue("read", a)).toEqual({ has: true, btn: ["find"], pop: [] });
    expect(makeValue("all", a)).toEqual({ has: true, btn: a.btn, pop: ["orderPop", "lineSelPop"] });
  });
  it("조회만 값이 없거나 버튼 허용 값이 없으면 만들 수 없다", () => {
    expect(makeValue("read", { btn: ["save"], pop: [], read: [] })).toBeNull();
    expect(makeValue("all", { btn: [], pop: ["p"], read: [] })).toBeNull();
  });
  it("프리셋 일치는 밖 값을 보지 않는다", () => {
    const a = allowedOf(VIEW_ROW);
    expect(presetMatch(["search", "export", "print"], a)).toEqual({ all: true, read: false });
    expect(presetMatch(["search"], a)).toEqual({ all: false, read: true });
  });
});

describe("setCodes (칩 묶음·토큰 입력 결과)", () => {
  it("허용 밖 값은 받지 않고 원래 있던 밖 값은 남긴다. 순서는 오브젝트 순서", () => {
    const next = setCodes(baseValue(VIEW_ROW), "btn", ["export", "nope"], ["search", "export"]);
    expect(next).toEqual({ has: true, btn: ["export", "print"], pop: ["lotPop"] });
  });
  it("「모두」 프리셋 = 허용 값 전부를 준다. 밖 값은 그대로", () => {
    const a = allowedOf(VIEW_ROW);
    expect(setCodes({ has: true, btn: ["print"], pop: [] }, "btn", a.btn, a.btn).btn).toEqual(["search", "export", "print"]);
  });
  it("버튼이 하나도 안 남으면 퍼미션 빼기, 팝업은 비워도 남는다", () => {
    const cur = { has: true, btn: ["find"], pop: ["orderPop"] };
    expect(setCodes(cur, "btn", [], ["find"])).toEqual(NO_PERM);
    expect(setCodes(cur, "pop", [], ["orderPop"])).toEqual({ has: true, btn: ["find"], pop: [] });
  });
  it("같은 값이면 원래 객체를 돌려주고, 퍼미션이 없으면 바꾸지 않는다", () => {
    const cur = { has: true, btn: ["find", "send"], pop: [] };
    expect(setCodes(cur, "btn", ["send", "find"], ["find", "send"])).toBe(cur);
    expect(setCodes(NO_PERM, "btn", ["find"], ["find"])).toBe(NO_PERM);
  });
});

describe("isDirty · rowState · entryOf", () => {
  it("순서만 바뀌면 바뀐 것이 아니다. 껐다 다시 켜면 같다", () => {
    const base = { has: true, btn: ["a", "b"], pop: [] };
    expect(isDirty(base, { has: true, btn: ["b", "a"], pop: [] })).toBe(false);
    const a = ["a", "b"];
    const back = toggleCode(toggleCode(base, "btn", "b", a), "btn", "b", a);
    expect(entryOf({ ...EMPTY_ROW, HAS_PERM: "Y", BTN_PERM: "a,b", OBJ_BTN_PERM: "a,b" }, back)).toBeNull();
  });
  it("줄 상태: new · gone · empty · changed", () => {
    const has = { has: true, btn: ["a"], pop: [] };
    expect(rowState(NO_PERM, has)).toBe("new");
    expect(rowState(has, NO_PERM)).toBe("gone");
    expect(rowState(NO_PERM, NO_PERM)).toBe("empty");
    expect(rowState(has, { ...has, btn: ["a", "b"] })).toBe("changed");
    expect(rowState(has, has)).toBe("");
  });
});

describe("toSaveRows", () => {
  it("MERGE 에는 밖 값을 넣지 않고 DATA_PERM 은 그대로 넘긴다", () => {
    const a = allowedOf(VIEW_ROW);
    const cur = toggleCode(baseValue(VIEW_ROW), "btn", "export", a.btn);
    const e = entryOf(VIEW_ROW, cur)!;
    expect(toSaveRows([e])).toEqual([
      {
        ROLE_ID: "role_MN_MPP_WORK_VIEW",
        OBJECT_ID: "mppWorkView",
        BTN_PERM: "search",
        POPUP_PERM: "lotPop",
        DATA_PERM: "DP1",
        OP_TP: "MERGE",
      },
    ]);
  });
  it("팝업만 고친 줄도 BTN ∖ OBJ_BTN 을 빼고 보낸다(D15 식, PERM_NOT_IN_OBJ 회피)", () => {
    const a = allowedOf(VIEW_ROW);
    const cur = toggleCode(baseValue(VIEW_ROW), "pop", "lotPop", a.pop);
    const e = entryOf(VIEW_ROW, cur)!;
    expect(toSaveRows([e])).toEqual([
      {
        ROLE_ID: "role_MN_MPP_WORK_VIEW",
        OBJECT_ID: "mppWorkView",
        BTN_PERM: "search,export",
        POPUP_PERM: "",
        DATA_PERM: "DP1",
        OP_TP: "MERGE",
      },
    ]);
  });
  it("뺀 퍼미션 = DEL, 새로 만든 퍼미션 = MERGE", () => {
    const del = entryOf(VIEW_ROW, NO_PERM)!;
    const made = entryOf(EMPTY_ROW, makeValue("read", allowedOf(EMPTY_ROW))!)!;
    const rows = toSaveRows([del, made]);
    expect(rows.map((r) => r.OP_TP)).toEqual(["DEL", "MERGE"]);
    expect(rows[1]).toMatchObject({ BTN_PERM: "find", POPUP_PERM: "" });
  });
});

describe("shortSummary", () => {
  it("모두 · 조회 · n/m", () => {
    const a = allowedOf(EMPTY_ROW);
    expect(shortSummary("find,save,order,send,export", a)).toBe("모두");
    expect(shortSummary("find", a)).toBe("조회");
    expect(shortSummary("find,send", a)).toBe("2/5");
  });
});

describe("toViewRow", () => {
  it("바뀐 건이 있으면 지금 값으로 칩·줄 상태를 만든다", () => {
    const e = entryOf(VIEW_ROW, NO_PERM)!;
    const v = toViewRow(VIEW_ROW, e, "exp");
    expect(v.__key).toBe("role_MN_MPP_WORK_VIEW|mppWorkView");
    expect(v.__state).toBe("gone");
    expect(v._rowState).toBe("deleted");
    expect(v.__btnChips.find((c) => c.code === "export")).toMatchObject({ on: false, changed: true, hit: true, disabled: true });
    expect(toViewRow(EMPTY_ROW, undefined, "").__state).toBe("empty");
  });
});

describe("toViewRow 칸 값 = 지금 값(리뷰 #1)", () => {
  it("고칠 때마다 BTN_PERM·POPUP_PERM 칸 값이 바뀐다(밖 값 포함), 퍼미션이 빠지면 빈 값", () => {
    const a = allowedOf(VIEW_ROW);
    const c1 = toggleCode(baseValue(VIEW_ROW), "btn", "export", a.btn);
    const v1 = toViewRow(VIEW_ROW, entryOf(VIEW_ROW, c1)!, "");
    expect(v1.BTN_PERM).toBe("search,print");
    const c2 = toggleCode(c1, "pop", "lotPop", a.pop);
    const v2 = toViewRow(VIEW_ROW, entryOf(VIEW_ROW, c2)!, "");
    expect(v2.POPUP_PERM).toBe("");
    expect(v2.BTN_PERM).toBe("search,print");
    const gone = toViewRow(VIEW_ROW, entryOf(VIEW_ROW, NO_PERM)!, "");
    expect([gone.BTN_PERM, gone.POPUP_PERM]).toEqual(["", ""]);
  });
  it("밖 값 안내 한 줄(D15)", () => {
    expect(toViewRow(VIEW_ROW, undefined, "").__btnOut).toBe("오브젝트에 없는 값 print 는 저장 때 빠집니다");
    expect(toViewRow(VIEW_ROW, undefined, "").__popOut).toBeNull();
    expect(outNotice(["a"], ["a"])).toBeNull();
  });
});

describe("findEmptyBtn — 빈 버튼 MERGE 막기(리뷰 #3)", () => {
  /** 버튼 값이 모두 오브젝트 밖이 된 퍼미션. */
  const ALL_OUT: PermRow = { ...VIEW_ROW, BTN_PERM: "print", OBJ_BTN_PERM: "search,export" };
  it("팝업만 고쳐 버튼이 남지 않는 MERGE 를 찾는다", () => {
    const a = allowedOf(ALL_OUT);
    const cur = toggleCode(baseValue(ALL_OUT), "pop", "lotPop", a.pop);
    const e = entryOf(ALL_OUT, cur)!;
    expect(findEmptyBtn([e])).toEqual([e]);
  });
  it("DEL·버튼이 있는 MERGE·바뀌지 않은 건은 걸리지 않는다", () => {
    const del = entryOf(ALL_OUT, NO_PERM)!;
    const ok = entryOf(VIEW_ROW, toggleCode(baseValue(VIEW_ROW), "btn", "export", ["search", "export"]))!;
    expect(findEmptyBtn([del, ok])).toEqual([]);
  });
});

describe("foldSaved — 저장한 값을 조회 줄에 접기(리뷰 #7)", () => {
  it("MERGE 는 허용 값만, DEL 은 퍼미션 없음으로, 안 바뀐 줄은 같은 객체", () => {
    const a = allowedOf(VIEW_ROW);
    const pend = new Map([
      ["role_MN_MPP_WORK_VIEW|mppWorkView", entryOf(VIEW_ROW, toggleCode(baseValue(VIEW_ROW), "btn", "export", a.btn))!],
    ]);
    const [v, e] = foldSaved([VIEW_ROW, EMPTY_ROW], pend);
    expect(v).toMatchObject({ HAS_PERM: "Y", BTN_PERM: "search", POPUP_PERM: "lotPop" });
    expect(e).toBe(EMPTY_ROW);
    const del = foldSaved([VIEW_ROW], new Map([["role_MN_MPP_WORK_VIEW|mppWorkView", entryOf(VIEW_ROW, NO_PERM)!]]));
    expect(del[0]).toMatchObject({ HAS_PERM: "N", BTN_PERM: "", POPUP_PERM: "" });
  });
});
