import { describe, expect, it } from "vitest";
import { buildMockGraph, createMockPermBenchApi } from "./bench.fixture";
import { indexBench, toRolePermMap, groupsOfUser } from "./model";
import { PermApplyError, type RolePermRow } from "./types";
import {
  EMPTY_DRAFT,
  benchErrorText,
  changeKey,
  changeText,
  draftRows,
  impactPeople,
  overlayBench,
  overlayRolePerm,
  parseChangesJson,
  permBaseOf,
  permDiffKind,
  setLink,
  setPerm,
  setRegister,
} from "./draft";
import { failureOf, readResponse } from "./api";

const row = (over: Partial<RolePermRow>): RolePermRow => ({
  ROLE_ID: "R1", OBJECT_ID: "o1", OBJECT_NM: "화면 1", MENU_PATH: "", OBJ_BTN_PERM: "search,save,export", OBJ_POPUP_PERM: "itemPop",
  OBJ_READ_PERM: "search", BTN_PERM: null, POPUP_PERM: null, DATA_PERM: null, ...over,
});

describe("draft — 초안 차이", () => {
  it("체크를 두 번 바꾸면(현재 값으로 돌아오면) 초안이 빈다", () => {
    const d1 = setLink(EMPTY_DRAFT, "USER_GRP", "u1", "G1", true, false);
    expect(draftRows(d1)).toEqual([{ TP: "USER_GRP", KEY1: "u1", KEY2: "G1", OP: "ADD", BTN_PERM: null, POPUP_PERM: null }]);
    const d2 = setLink(d1, "USER_GRP", "u1", "G1", false, false);
    expect(d2.size).toBe(0);
  });

  it("퍼미션: 없던 줄에 켜면 ADD, 마지막 칩을 끄면 DEL(현재 있음) 또는 줄 지움(현재 없음)", () => {
    const none = permBaseOf(row({}));
    const d1 = setPerm(EMPTY_DRAFT, "R1", "o1", ["search"], [], none);
    expect(d1.get(changeKey("ROLE_OBJ", "R1", "o1"))).toMatchObject({ OP: "ADD", BTN_PERM: "search", POPUP_PERM: "" });
    expect(setPerm(d1, "R1", "o1", [], [], none).size).toBe(0);
    const has = permBaseOf(row({ BTN_PERM: "search,save", POPUP_PERM: "" }));
    expect(setPerm(EMPTY_DRAFT, "R1", "o1", [], ["itemPop"], has).get(changeKey("ROLE_OBJ", "R1", "o1"))).toMatchObject({ OP: "DEL", BTN_PERM: null });
  });

  it("오브젝트 밖 값은 고친 줄에서만 빠진다 — 허용 값이 현재와 같으면 줄을 만들지 않는다", () => {
    const base = permBaseOf(row({ BTN_PERM: "search,print", POPUP_PERM: "" }));
    // print 는 오브젝트에 없다. 칩은 print 를 그대로 되붙여 보내도 저장 줄에서는 빠진다
    const d1 = setPerm(EMPTY_DRAFT, "R1", "o1", ["search", "save", "print"], [], base);
    expect(d1.get(changeKey("ROLE_OBJ", "R1", "o1"))).toMatchObject({ OP: "UPD", BTN_PERM: "search,save" });
    // 다시 search 만(현재 허용 값과 같음) → 줄 지움(print 를 말없이 빼지 않는다)
    expect(setPerm(d1, "R1", "o1", ["search", "print"], [], base).size).toBe(0);
  });

  it("SYSADMIN 퍼미션은 만들지 않는다", () => {
    expect(setPerm(EMPTY_DRAFT, "SYSADMIN", "o1", ["search"], [], permBaseOf(row({}))).size).toBe(0);
  });

  it("폴더 체크: 미등록 화면만 처음 값(search · 없으면 첫 버튼)으로 등록, 버튼 없는 화면은 건너뜀, 해제는 DEL", () => {
    const rows = new Map([
      ["o1", row({ OBJECT_ID: "o1" })],
      ["o2", row({ OBJECT_ID: "o2", OBJ_BTN_PERM: "find,save" })],
      ["o3", row({ OBJECT_ID: "o3", BTN_PERM: "search,save", POPUP_PERM: "" })],
      ["o4", row({ OBJECT_ID: "o4", OBJ_BTN_PERM: "" })],
    ]);
    const baseOf = (oid: string) => permBaseOf(rows.get(oid));
    const isReg = (oid: string) => !!rows.get(oid)?.BTN_PERM;
    const on = setRegister(EMPTY_DRAFT, "R1", ["o1", "o2", "o3", "o4"], true, baseOf, isReg);
    expect(on.changed).toBe(2);
    expect(on.skipped).toBe(1);
    expect(draftRows(on.draft).map((c) => [c.KEY2, c.OP, c.BTN_PERM])).toEqual([
      ["o1", "ADD", "search"],
      ["o2", "ADD", "find"],
    ]);
    const off = setRegister(EMPTY_DRAFT, "R1", ["o1", "o3"], false, baseOf, isReg);
    expect(draftRows(off.draft).map((c) => [c.KEY2, c.OP])).toEqual([["o3", "DEL"]]);
  });

  it("overlayBench·overlayRolePerm: 초안을 얹고, 변경이 없으면 같은 객체", async () => {
    const api = createMockPermBenchApi();
    const idx = indexBench(await api.searchBench({}));
    const u = idx.users[0].USER_ID;
    expect(overlayBench(idx, EMPTY_DRAFT)).toBe(idx);
    const d = setLink(EMPTY_DRAFT, "USER_GRP", u, "RG_QC_TEAM", true, false);
    const v = overlayBench(idx, d);
    expect(groupsOfUser(v, u)).toContain("RG_QC_TEAM");
    expect(groupsOfUser(idx, u)).not.toContain("RG_QC_TEAM");
    const g = buildMockGraph();
    const oid = [...g.objects.keys()][0];
    // 퍼미션 없는 오브젝트 줄은 menuFolderId 를 줄 때만 온다(bench-be #13, z2 F5) — 그 오브젝트의 폴더로 읽는다
    const perms = toRolePermMap((await api.searchRolePerm({ roleId: "ROLE_VIEWER", menuFolderId: g.objects.get(oid)!.folder, source: "CUR" })).perms);
    const base = permBaseOf(perms.get(oid));
    const d2 = setPerm(EMPTY_DRAFT, "ROLE_VIEWER", oid, base.allowedBtn, [], base);
    const view = overlayRolePerm(perms, "ROLE_VIEWER", d2);
    expect(view).not.toBe(perms);
    expect(permDiffKind(perms.get(oid), view.get(oid))).toBe(base.has ? "mod" : "add");
    expect(overlayRolePerm(perms, "ROLE_MAINT", d2)).toBe(perms);
  });

  it("CHANGES_JSON(camelCase) 읽기 · 깨진 JSON 은 PERM_DRAFT_CORRUPT", () => {
    const d = parseChangesJson('[{"tp":"GRP_ROLE","key1":"G1","key2":"R1","op":"DEL","btnPerm":null,"popupPerm":null}]');
    expect(draftRows(d)).toEqual([{ TP: "GRP_ROLE", KEY1: "G1", KEY2: "R1", OP: "DEL", BTN_PERM: null, POPUP_PERM: null }]);
    expect(parseChangesJson("[]").size).toBe(0);
    expect(() => parseChangesJson("{oops")).toThrow(PermApplyError);
  });

  it("바꾼 것 글·영향 사람 묶기", () => {
    const n = { user: () => "김민준", group: () => "품질팀", role: () => "현장 조회 전용", object: () => "코일 현황" };
    expect(changeText({ TP: "USER_GRP", KEY1: "u1", KEY2: "G1", OP: "ADD", BTN_PERM: null, POPUP_PERM: null }, n)).toBe("「김민준」을(를) 「품질팀」에 넣음");
    const base = permBaseOf(row({ BTN_PERM: "search", POPUP_PERM: "" }));
    expect(changeText({ TP: "ROLE_OBJ", KEY1: "R1", KEY2: "o1", OP: "UPD", BTN_PERM: "search,save", POPUP_PERM: "" }, n, base)).toBe("「현장 조회 전용」 × 「코일 현황」 o1 버튼 +save");
    const people = impactPeople([
      { USER_ID: "u1", USER_NM: "가", OBJECT_ID: "o1", OBJECT_NM: "A", GAINED: "save", LOST: null },
      { USER_ID: "u2", USER_NM: "나", OBJECT_ID: "o1", OBJECT_NM: "A", GAINED: null, LOST: "save" },
      { USER_ID: "u2", USER_NM: "나", OBJECT_ID: "o2", OBJECT_NM: "B", GAINED: null, LOST: "search" },
    ]);
    expect(people.map((p) => [p.USER_ID, p.GAIN_CNT, p.LOSE_CNT])).toEqual([["u2", 0, 2], ["u1", 1, 0]]);
  });
});

describe("api — 실패 문구 읽기", () => {
  it("HTTP 400 envelope 의 meta.message 「NOT_FOUND: …」를 코드로 읽는다", async () => {
    const res = new Response(JSON.stringify({ meta: { success: false, code: "C002", message: "NOT_FOUND: 변경 대상이 없습니다: u9" } }), { status: 400 });
    const err = await readResponse(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermApplyError);
    expect((err as PermApplyError).code).toBe("NOT_FOUND");
    expect(benchErrorText(err).reload).toBe(true);
    const busy = failureOf({ meta: { success: false, message: "PERM_DRAFT_BUSY: 잠금" } });
    expect((busy as PermApplyError).code).toBe("PERM_DRAFT_BUSY");
    expect(failureOf({ meta: { success: false, message: "그냥 실패" } })).not.toBeInstanceOf(PermApplyError);
  });
});
