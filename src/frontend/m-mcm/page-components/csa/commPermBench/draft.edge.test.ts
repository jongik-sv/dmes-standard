/** draft.ts 순수 함수 보충 시험(f8) — 변경 줄 만들기·JSON 읽기·허용 값 거르기·SYSADMIN 잠금·실패 문구. */
import { describe, expect, it } from "vitest";
import { indexBench } from "./model";
import {
  PermApplyError,
  PERM_ERROR_CODES,
  fromDraftChange,
  toDraftChange,
  type PermChangeRow,
  type RolePermRow,
  type SearchBenchResult,
} from "./types";
import {
  EMPTY_DRAFT,
  benchErrorText,
  changeKey,
  draftFromRows,
  draftRoleIds,
  draftRows,
  draftSig,
  groupGivesSysadmin,
  keyOf,
  linkDiffKind,
  linkSig,
  outsideOf,
  overlayBench,
  overlayRolePerm,
  overlayRolePerms,
  parseChangesJson,
  permBaseOf,
  permDiffKind,
  registerDefault,
  revertChange,
  roleSig,
  scopeNames,
  setLink,
  setPerm,
  setRegister,
} from "./draft";

const row = (over: Partial<RolePermRow> = {}): RolePermRow => ({
  ROLE_ID: "R1", OBJECT_ID: "o1", OBJECT_NM: "화면 1", MENU_PATH: "", OBJ_BTN_PERM: "search,save,export", OBJ_POPUP_PERM: "itemPop,lotPop",
  OBJ_READ_PERM: "search", BTN_PERM: null, POPUP_PERM: null, DATA_PERM: null, ...over,
});

const bench: SearchBenchResult = {
  users: [
    { USER_ID: "u1", USER_NM: "김민준", DEPT_NM: null, USE_TP: "Y" },
    { USER_ID: "u2", USER_NM: "이서연", DEPT_NM: null, USE_TP: "Y" },
  ],
  groups: [
    { ROLE_GROUP_ID: "G1", ROLE_GROUP_NM: "품질팀", USE_TP: "Y", USER_CNT: 1 },
    { ROLE_GROUP_ID: "G_ADM", ROLE_GROUP_NM: "관리팀", USE_TP: "Y", USER_CNT: 1 },
  ],
  roles: [
    { ROLE_ID: "R1", ROLE_NM: "조회 전용", USE_TP: "Y", GROUP_CNT: 1, USER_CNT: 1, PERM_CNT: 1 },
    { ROLE_ID: "SYSADMIN", ROLE_NM: "시스템 관리자", USE_TP: "Y", GROUP_CNT: 1, USER_CNT: 1, PERM_CNT: 0 },
  ],
  userGroups: [{ USER_ID: "u1", ROLE_GROUP_ID: "G1" }],
  groupRoles: [{ ROLE_GROUP_ID: "G1", ROLE_ID: "R1" }, { ROLE_GROUP_ID: "G_ADM", ROLE_ID: "SYSADMIN" }],
};

const link = (tp: "USER_GRP" | "GRP_ROLE", k1: string, k2: string, op: "ADD" | "DEL"): PermChangeRow => ({ TP: tp, KEY1: k1, KEY2: k2, OP: op, BTN_PERM: null, POPUP_PERM: null });

describe("draft — 변경 줄 만들기 (UPD · 되돌리기)", () => {
  it("값이 다르면 UPD, 현재 값으로 되돌리면(순서 달라도) 줄이 지워진다", () => {
    const base = permBaseOf(row({ BTN_PERM: "search,save", POPUP_PERM: "itemPop" }));
    const k = changeKey("ROLE_OBJ", "R1", "o1");
    const d1 = setPerm(EMPTY_DRAFT, "R1", "o1", ["search", "save", "export"], ["itemPop"], base);
    expect(d1.get(k)).toMatchObject({ OP: "UPD", BTN_PERM: "search,save,export", POPUP_PERM: "itemPop" });
    expect(setPerm(d1, "R1", "o1", ["save", "search"], ["itemPop"], base).size).toBe(0);
  });

  it("버튼이 비면 팝업도 함께 비워 저장 줄에는 팝업이 없다", () => {
    const base = permBaseOf(row({ BTN_PERM: "search", POPUP_PERM: "itemPop" }));
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", [], ["itemPop"], base).get(changeKey("ROLE_OBJ", "R1", "o1"))).toEqual({
      TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o1", OP: "DEL", BTN_PERM: null, POPUP_PERM: null,
    });
  });

  it("같은 값으로 다시 부르면 같은 초안 객체를 돌려준다(불필요한 새 객체 없음)", () => {
    const base = permBaseOf(row());
    const d1 = setPerm(EMPTY_DRAFT, "R1", "o1", ["search"], [], base);
    expect(setPerm(d1, "R1", "o1", ["search"], [], base)).toBe(d1);
    const l1 = setLink(EMPTY_DRAFT, "GRP_ROLE", "G1", "R1", false, true);
    expect(setLink(l1, "GRP_ROLE", "G1", "R1", false, true)).toBe(l1);
  });

  it("소속: 현재 켜짐을 끄면 DEL, 현재 값과 같으면 아무것도 만들지 않는다", () => {
    const d = setLink(EMPTY_DRAFT, "GRP_ROLE", "G1", "R1", false, true);
    expect(draftRows(d)).toEqual([link("GRP_ROLE", "G1", "R1", "DEL")]);
    expect(setLink(EMPTY_DRAFT, "USER_GRP", "u1", "G1", true, true).size).toBe(0);
    expect(draftRows(revertChange(d, changeKey("GRP_ROLE", "G1", "R1")))).toEqual([]);
    expect(revertChange(d, "nope")).toBe(d);
  });

  it("역할 안의 서로 다른 화면·소속은 서명이 따로 움직인다", () => {
    const base = permBaseOf(row());
    let d = setLink(EMPTY_DRAFT, "USER_GRP", "u1", "G1", false, true);
    const sig0 = linkSig(d);
    d = setPerm(d, "R1", "o1", ["search"], [], base);
    expect(linkSig(d)).toBe(sig0);
    expect(roleSig(d, "R1")).toContain("o1");
    expect(roleSig(d, "R2")).toBe("[]");
    expect(draftRoleIds(d)).toEqual(["R1"]);
    expect(draftRoleIds([...draftRows(d), { ...draftRows(d)[1], KEY2: "o2" }])).toEqual(["R1"]);
    expect(draftSig(d)).toBe(JSON.stringify(draftRows(d)));
  });

  it("draftFromRows: 같은 키는 뒤 것이 이기고 순서는 뒤로 간다", () => {
    const a = link("USER_GRP", "u1", "G1", "ADD");
    const b = link("USER_GRP", "u2", "G1", "ADD");
    const a2 = { ...a, OP: "DEL" as const };
    const d = draftFromRows([a, b, a2]);
    expect(draftRows(d).map(keyOf)).toEqual([keyOf(b), keyOf(a)]);
    expect(d.get(keyOf(a))?.OP).toBe("DEL");
  });
});

describe("draft — 폴더·모듈 한꺼번에 등록·해제", () => {
  const rows = new Map<string, RolePermRow>([
    ["a", row({ OBJECT_ID: "a", OBJ_BTN_PERM: "search,save", BTN_PERM: "search", POPUP_PERM: "" })],
    ["b", row({ OBJECT_ID: "b", OBJ_BTN_PERM: "find,save" })],
    ["c", row({ OBJECT_ID: "c", OBJ_BTN_PERM: "save" })],
  ]);
  const baseOf = (id: string) => permBaseOf(rows.get(id));
  const isReg = (id: string) => rows.get(id)?.BTN_PERM != null;

  it("등록 뒤 같은 범위를 해제하면 초안이 비고, 이미 등록된 화면은 건드리지 않는다", () => {
    const on = setRegister(EMPTY_DRAFT, "R1", ["a", "b", "c"], true, baseOf, isReg);
    expect(on.changed).toBe(2);
    expect(draftRows(on.draft).map((c) => [c.KEY2, c.BTN_PERM])).toEqual([["b", "find"], ["c", "save"]]);
    // 초안 값을 isRegNow 로 되돌려 주면(화면이 하는 일) 해제 때 줄이 사라진다
    const reg2 = (id: string) => isReg(id) || on.draft.has(changeKey("ROLE_OBJ", "R1", id));
    const off = setRegister(on.draft, "R1", ["b", "c"], false, baseOf, reg2);
    expect(off.changed).toBe(2);
    expect(off.draft.size).toBe(0);
  });

  it("초안에서 해제한 화면을 다시 등록하면 현재 값으로 돌아간다(DEL 줄 지움)", () => {
    const off = setRegister(EMPTY_DRAFT, "R1", ["a"], false, baseOf, isReg);
    expect(draftRows(off.draft)[0].OP).toBe("DEL");
    const back = setRegister(off.draft, "R1", ["a"], true, baseOf, () => false);
    expect(back.draft.size).toBe(0);
    expect(back.changed).toBe(1);
  });

  it("SYSADMIN 역할은 등록·해제 모두 아무것도 하지 않는다 · 처음 값 규칙", () => {
    const r = setRegister(EMPTY_DRAFT, "SYSADMIN", ["b"], true, baseOf, () => false);
    expect(r).toEqual({ draft: EMPTY_DRAFT, changed: 0, skipped: 0 });
    expect(registerDefault(permBaseOf(row({ OBJ_BTN_PERM: "save,search" })))).toEqual(["search"]);
    expect(registerDefault(permBaseOf(row({ OBJ_BTN_PERM: "save,export" })))).toEqual(["save"]);
    expect(registerDefault(permBaseOf(row({ OBJ_BTN_PERM: null })))).toEqual([]);
  });
});

describe("draft — CHANGES_JSON(camelCase) ↔ 변경 줄(SNAKE)", () => {
  it("toDraftChange·fromDraftChange 는 서로 되돌린다 · undefined 값은 null", () => {
    const r: PermChangeRow = { TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o1", OP: "UPD", BTN_PERM: "search", POPUP_PERM: "" };
    expect(toDraftChange(r)).toEqual({ tp: "ROLE_OBJ", key1: "R1", key2: "o1", op: "UPD", btnPerm: "search", popupPerm: "" });
    expect(fromDraftChange(toDraftChange(r))).toEqual(r);
    expect(toDraftChange({ ...r, BTN_PERM: undefined as unknown as null }).btnPerm).toBeNull();
    expect(fromDraftChange({ tp: "USER_GRP", key1: "u", key2: "g", op: "ADD", btnPerm: undefined as unknown as null, popupPerm: null }).BTN_PERM).toBeNull();
  });

  it("초안 → JSON → parseChangesJson 로 같은 초안이 돌아온다", () => {
    const d = setLink(EMPTY_DRAFT, "USER_GRP", "u1", "G1", true, false);
    const d2 = setPerm(d, "R1", "o1", ["search", "save"], ["itemPop"], permBaseOf(row()));
    const json = JSON.stringify(draftRows(d2).map(toDraftChange));
    expect(draftSig(parseChangesJson(json))).toBe(draftSig(d2));
  });

  it("빈 값·null·undefined 는 빈 초안", () => {
    expect(parseChangesJson(null).size).toBe(0);
    expect(parseChangesJson(undefined).size).toBe(0);
    expect(parseChangesJson("").size).toBe(0);
  });

  it.each([
    ["JSON 아님", "{oops"],
    ["배열 아님", '{"tp":"USER_GRP"}'],
    ["null 원소", "[null]"],
    ["원소가 글", '["x"]'],
    ["필수 칸 빠짐(op)", '[{"tp":"USER_GRP","key1":"u","key2":"g"}]'],
    ["필수 칸 빈 글(key2)", '[{"tp":"USER_GRP","key1":"u","key2":"","op":"ADD"}]'],
  ])("깨진 초안(%s)은 PERM_DRAFT_CORRUPT", (_n, json) => {
    try {
      parseChangesJson(json);
      throw new Error("던지지 않음");
    } catch (e) {
      expect(e).toBeInstanceOf(PermApplyError);
      expect((e as PermApplyError).code).toBe("PERM_DRAFT_CORRUPT");
    }
  });

  it("옛 모양(SNAKE 키)으로 저장된 줄은 읽지 못한다(camelCase 만 받는다)", () => {
    expect(() => parseChangesJson('[{"TP":"USER_GRP","KEY1":"u","KEY2":"g","OP":"ADD"}]')).toThrow(PermApplyError);
  });
});

describe("draft — 칩 상태 · 오브젝트 밖 값(D15) · 프리셋", () => {
  it("permBaseOf: 줄이 없으면(BTN_PERM null) 값이 비고, 조회만은 오브젝트 허용 값 안에서만", () => {
    const none = permBaseOf(row());
    expect(none).toMatchObject({ has: false, btn: [], popup: [], allowedBtn: ["search", "save", "export"], readBtn: ["search"] });
    const has = permBaseOf(row({ BTN_PERM: "search", POPUP_PERM: "", OBJ_READ_PERM: "search,gone" }));
    expect(has.has).toBe(true);
    expect(has.readBtn).toEqual(["search"]);
    expect(permBaseOf(undefined)).toMatchObject({ has: false, allowedBtn: [], readBtn: [] });
  });

  it("오브젝트 밖 값: 줄에 있어도 outsideOf 로 보이고, 고친 줄 저장 값에서는 빠진다", () => {
    const base = permBaseOf(row({ BTN_PERM: "search,print", POPUP_PERM: "oldPop" }));
    expect(outsideOf(base)).toEqual(["print", "oldPop"]);
    const d = setPerm(EMPTY_DRAFT, "R1", "o1", ["search", "save", "print"], ["itemPop", "oldPop"], base);
    expect(d.get(changeKey("ROLE_OBJ", "R1", "o1"))).toMatchObject({ OP: "UPD", BTN_PERM: "search,save", POPUP_PERM: "itemPop" });
  });

  it("고치지 않은 줄은 초안에 없으므로 오브젝트 밖 값이 말없이 빠지지 않는다", () => {
    const base = permBaseOf(row({ BTN_PERM: "search,print", POPUP_PERM: "" }));
    // 칩을 건드렸다가 허용 값 기준으로 같은 값으로 돌려 놓으면 줄이 없다(= 저장 때 print 도 그대로)
    const d = setPerm(EMPTY_DRAFT, "R1", "o1", ["search", "print"], [], base);
    expect(d.size).toBe(0);
  });

  it("「모두」 = 허용 값 전부, 「조회만」 = readBtn, 「없음」 = 등록 해제", () => {
    const base = permBaseOf(row({ BTN_PERM: "search,save", POPUP_PERM: "" }));
    const k = changeKey("ROLE_OBJ", "R1", "o1");
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", base.allowedBtn, base.allowedPopup, base).get(k)).toMatchObject({ OP: "UPD", BTN_PERM: "search,save,export", POPUP_PERM: "itemPop,lotPop" });
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", base.readBtn, [], base).get(k)).toMatchObject({ OP: "UPD", BTN_PERM: "search", POPUP_PERM: "" });
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", [], [], base).get(k)).toMatchObject({ OP: "DEL" });
    // 등록 안 된 줄의 「없음」 = 줄 없음, 조회만이 이미 같은 값이면 줄 없음
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", [], [], permBaseOf(row())).size).toBe(0);
    const readOnly = permBaseOf(row({ BTN_PERM: "search", POPUP_PERM: "" }));
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", readOnly.readBtn, [], readOnly).size).toBe(0);
  });

  it("조회만 값이 하나도 없으면 setPerm 은 빈 버튼으로 보고 등록 해제로 읽는다(화면이 막아야 한다)", () => {
    const base = permBaseOf(row({ OBJ_READ_PERM: "", BTN_PERM: "search", POPUP_PERM: "" }));
    expect(base.readBtn).toEqual([]);
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", base.readBtn, [], base).get(changeKey("ROLE_OBJ", "R1", "o1"))?.OP).toBe("DEL");
  });

  it("permDiffKind(on/off/new/lost 의 바탕): 등록·해제·값 바뀜·같음", () => {
    const none = row();
    const a = row({ BTN_PERM: "search", POPUP_PERM: "" });
    const b = row({ BTN_PERM: "search,save", POPUP_PERM: "" });
    expect(permDiffKind(none, a)).toBe("add");
    expect(permDiffKind(a, none)).toBe("del");
    expect(permDiffKind(a, b)).toBe("mod");
    expect(permDiffKind(b, row({ BTN_PERM: "save,search", POPUP_PERM: "" }))).toBeNull();
    expect(permDiffKind(none, undefined)).toBeNull();
    expect(linkDiffKind(true, false)).toBe("del");
    expect(linkDiffKind(false, true)).toBe("add");
    expect(linkDiffKind(true, true)).toBeNull();
  });
});

describe("draft — 초안을 얹는 함수", () => {
  it("overlayRolePerm: 없던 화면 ADD 는 줄을 새로 만들고, DEL 은 값을 비운다", () => {
    const map = new Map([["o1", row({ BTN_PERM: "search", POPUP_PERM: "" })]]);
    const d = setPerm(setPerm(EMPTY_DRAFT, "R1", "o1", [], [], permBaseOf(map.get("o1"))), "R1", "o9", ["search"], [], permBaseOf(undefined));
    // o9 는 허용 값을 모르는 줄이라 버튼이 걸러진다 → 줄 없음. 허용 값을 아는 줄로 다시 시험한다
    expect(d.size).toBe(1);
    const view = overlayRolePerm(map, "R1", [{ TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o9", OP: "ADD", BTN_PERM: "search", POPUP_PERM: "" }, ...draftRows(d)]);
    expect(view.get("o1")).toMatchObject({ BTN_PERM: null, POPUP_PERM: null });
    expect(view.get("o9")).toMatchObject({ ROLE_ID: "R1", OBJECT_ID: "o9", BTN_PERM: "search" });
    expect(map.get("o1")?.BTN_PERM).toBe("search");
  });

  it("overlayRolePerms: 읽지 않은 역할은 건너뛰고 변경이 없으면 같은 객체", () => {
    const maps = new Map([["R1", new Map([["o1", row({ BTN_PERM: "search", POPUP_PERM: "" })]])]]);
    expect(overlayRolePerms(maps, EMPTY_DRAFT)).toBe(maps);
    const rows: PermChangeRow[] = [
      { TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o1", OP: "UPD", BTN_PERM: "save", POPUP_PERM: "" },
      { TP: "ROLE_OBJ", KEY1: "R2", KEY2: "o1", OP: "ADD", BTN_PERM: "save", POPUP_PERM: "" },
    ];
    const out = overlayRolePerms(maps, rows);
    expect(out.get("R1")?.get("o1")?.BTN_PERM).toBe("save");
    expect(out.has("R2")).toBe(false);
  });

  it("overlayBench: 소속 DEL 은 사람·그룹·역할 색인에서 모두 빠지고, 퍼미션 줄만 있으면 같은 객체", () => {
    const idx = indexBench(bench);
    expect(overlayBench(idx, [{ TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o1", OP: "ADD", BTN_PERM: "search", POPUP_PERM: "" }])).toBe(idx);
    const v = overlayBench(idx, [link("USER_GRP", "u1", "G1", "DEL"), link("GRP_ROLE", "G1", "R1", "DEL")]);
    expect(v.userGroups.get("u1")).toEqual([]);
    expect(v.groupRoles.get("G1")).toEqual([]);
    expect(v.roleGroups.has("R1")).toBe(false);
    expect(idx.userGroups.get("u1")).toEqual(["G1"]);
    const again = overlayBench(idx, [link("GRP_ROLE", "G1", "R1", "ADD")]);
    expect(again.groupRoles.get("G1")).toEqual(["R1"]);
  });
});

describe("draft — SYSADMIN 잠금", () => {
  it("groupGivesSysadmin: 현재 색인 또는 초안을 얹은 색인에서 SYSADMIN 을 주는 그룹만 true", () => {
    const idx = indexBench(bench);
    expect(groupGivesSysadmin(idx, "G_ADM")).toBe(true);
    expect(groupGivesSysadmin(idx, "G1")).toBe(false);
    expect(groupGivesSysadmin(idx, "없음")).toBe(false);
    const withAdd = overlayBench(idx, [link("GRP_ROLE", "G1", "SYSADMIN", "ADD")]);
    expect(groupGivesSysadmin(withAdd, "G1")).toBe(true);
    // 초안에서 뺀 그룹은 초안 색인으로는 false 지만 현재 색인으로는 true — 화면은 둘 다 본다(GroupCol)
    const withDel = overlayBench(idx, [link("GRP_ROLE", "G_ADM", "SYSADMIN", "DEL")]);
    expect(groupGivesSysadmin(withDel, "G_ADM")).toBe(false);
    expect(groupGivesSysadmin(idx, "G_ADM")).toBe(true);
  });

  it("SYSADMIN 역할의 퍼미션은 setPerm·setRegister 모두 막는다(버튼·팝업 무엇이든)", () => {
    const base = permBaseOf(row({ BTN_PERM: "search", POPUP_PERM: "" }));
    expect(setPerm(EMPTY_DRAFT, "SYSADMIN", "o1", [], [], base)).toBe(EMPTY_DRAFT);
    expect(setPerm(EMPTY_DRAFT, "SYSADMIN", "o1", ["save"], ["itemPop"], base)).toBe(EMPTY_DRAFT);
  });
});

describe("draft — 실패 문구(benchErrorText) · 충돌 범위 이름", () => {
  it("아는 코드마다 문구가 있고, 다시 읽기를 권하는 것은 PERM_CONFLICT·NOT_FOUND 뿐이다", () => {
    const reload = PERM_ERROR_CODES.filter((c) => benchErrorText(new PermApplyError(c, "상세")).reload);
    expect(reload).toEqual(["PERM_CONFLICT", "NOT_FOUND"]);
    for (const c of PERM_ERROR_CODES) expect(benchErrorText(new PermApplyError(c, "상세")).message.length).toBeGreaterThan(5);
  });

  it("PERM_DRAFT_BUSY·PERM_DRAFT_CORRUPT 는 서버 설명을 붙이지 않은 고정 문구", () => {
    expect(benchErrorText(new PermApplyError("PERM_DRAFT_BUSY", "x")).message).toContain("다시 저장");
    expect(benchErrorText(new PermApplyError("PERM_DRAFT_BUSY", "x")).message).not.toContain("(x)");
    expect(benchErrorText(new PermApplyError("PERM_DRAFT_CORRUPT", "x")).message).toContain("초안을 버리고");
  });

  it("NOT_FOUND 는 서버 설명을 괄호로 붙이고 다시 읽기를 권한다 · 일반 오류·알 수 없는 값", () => {
    expect(benchErrorText(new PermApplyError("NOT_FOUND", "변경 대상이 없습니다: u9"))).toMatchObject({ reload: true });
    expect(benchErrorText(new PermApplyError("NOT_FOUND", "변경 대상이 없습니다: u9")).message).toContain("(변경 대상이 없습니다: u9)");
    expect(benchErrorText(new Error("망가짐"))).toEqual({ message: "망가짐", reload: false });
    expect(benchErrorText("글")).toEqual({ message: "요청을 처리하지 못했습니다.", reload: false });
  });

  it("scopeNames: 사람·그룹·역할 이름으로 바꾸고 모르는 ID 는 그대로", () => {
    const idx = indexBench(bench);
    expect(scopeNames(["u1", "G1", "R1", "zzz"], idx)).toEqual(["사람 김민준", "그룹 품질팀", "역할 조회 전용", "zzz"]);
    // 서버 범위 = 접두째(f10). 접두가 있으면 그 종류에서만 찾고, 같은 이름은 한 번만
    expect(scopeNames(["user:u1", "group:G1", "role:R1", "role:u1", "user:u1"], idx)).toEqual(["사람 김민준", "그룹 품질팀", "역할 조회 전용", "역할 u1"]);
  });
});
