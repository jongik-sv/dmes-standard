/** model.ts·mock.ts 순수 함수 보충 시험(f8) — 토큰 거르기·효과 계산·오브젝트 밖 값·버튼 이유 글. */
import { parseTokens as sharedParse } from "@dk-oasis/shared/token-chip-input";
import { describe, expect, it } from "vitest";
import {
  allowedFromExplain,
  allowedFromPermRow,
  buttonWhy,
  effectivePerm,
  hasPerm,
  orphanTokens,
  parseTokens,
  permCount,
  roleButtonWhy,
  toRolePermMap,
} from "./model";
import { joinTokens, parseTokens as mockParse, readPreset } from "./mock";
import type { ExplainButtonRow, ExplainResult, RolePermRow } from "./types";

const row = (over: Partial<RolePermRow> = {}): RolePermRow => ({
  ROLE_ID: "R1", OBJECT_ID: "o1", OBJECT_NM: "화면 1", MENU_PATH: "", OBJ_BTN_PERM: "search,save,export", OBJ_POPUP_PERM: "itemPop,lotPop",
  OBJ_READ_PERM: "search", BTN_PERM: null, POPUP_PERM: null, DATA_PERM: null, ...over,
});

describe("토큰 거르기 — 입력 코드", () => {
  it("공백·콤마·줄바꿈으로 나누고 trim·중복 제거·처음 순서 유지", () => {
    expect(parseTokens("  search ,save\n\texport,, search  ")).toEqual(["search", "save", "export"]);
    expect(parseTokens(",, ,")).toEqual([]);
    expect(parseTokens(null)).toEqual([]);
    expect(parseTokens(undefined)).toEqual([]);
    expect(parseTokens("")).toEqual([]);
  });

  it("대소문자는 다른 코드로 본다(서버도 그대로 비교)", () => {
    expect(parseTokens("Search,search")).toEqual(["Search", "search"]);
  });

  it("가짜 서버(mock.ts)의 parseTokens 는 공용(shared)과 같은 결과를 낸다", () => {
    for (const s of [" find, save,,find  send ", "a\nb,a", "", null, undefined, "x"]) expect(mockParse(s)).toEqual(sharedParse(s));
  });

  it("joinTokens ↔ parseTokens 로 되돌린다 · 모르는 코드도 그대로 지킨다", () => {
    const list = ["search", "zzUnknown", "save"];
    expect(parseTokens(joinTokens(list))).toEqual(list);
    expect(joinTokens([])).toBe("");
  });

  it("조회만 프리셋(readPreset): 허용 값 순서대로, 조회 성격 코드만, 없으면 빈 목록", () => {
    expect(readPreset(["save", "viewFoo", "view", "queryX", "query", "lotLov", "getItem", "listAll"])).toEqual(["view", "query", "lotLov", "getItem", "listAll"]);
    expect(readPreset(["save", "delete"])).toEqual([]);
    expect(readPreset([])).toEqual([]);
  });
});

describe("effectivePerm · orphanTokens · permCount", () => {
  const allowed = { btn: ["search", "save"], popup: ["itemPop"] };

  it("효과 = 퍼미션 ∩ 오브젝트 허용 값(허용 값 순서) — 오브젝트 밖 값은 뺀다", () => {
    const r = row({ BTN_PERM: "save,print,search", POPUP_PERM: "gonePop,itemPop" });
    expect(effectivePerm("R1", r, allowed)).toEqual({ btn: ["search", "save"], popup: ["itemPop"] });
  });

  it("SYSADMIN 은 줄 없이 허용 값 전부, 역할·오브젝트 사용 안 함이면 SYSADMIN 도 빈 값", () => {
    expect(effectivePerm("SYSADMIN", undefined, allowed)).toEqual(allowed);
    expect(effectivePerm("SYSADMIN", undefined, allowed, { objUnused: true })).toEqual({ btn: [], popup: [] });
    expect(effectivePerm("R1", row({ BTN_PERM: "search" }), allowed, { roleUnused: true })).toEqual({ btn: [], popup: [] });
  });

  it("퍼미션 줄이 없으면(BTN_PERM null) 빈 값, 허용 값을 모르면 줄의 OBJ_* 로 계산", () => {
    expect(hasPerm(row())).toBe(false);
    expect(hasPerm(row({ BTN_PERM: "" }))).toBe(true);
    expect(effectivePerm("R1", row(), allowed)).toEqual({ btn: [], popup: [] });
    expect(effectivePerm("R1", row({ BTN_PERM: "export,print" }), undefined)).toEqual({ btn: ["export"], popup: [] });
    expect(allowedFromPermRow(row())).toEqual({ btn: ["search", "save", "export"], popup: ["itemPop", "lotPop"] });
  });

  it("orphanTokens: 줄에 있으나 오브젝트에 없는 값만(버튼·팝업 따로). 줄이 없으면 비어 있다", () => {
    const r = row({ BTN_PERM: "search,print", POPUP_PERM: "itemPop,oldPop" });
    expect(orphanTokens(r, allowed)).toEqual({ btn: ["print"], popup: ["oldPop"] });
    expect(orphanTokens(row(), allowed)).toEqual({ btn: [], popup: [] });
    expect(orphanTokens(r, undefined)).toEqual({ btn: [], popup: [] });
  });

  it("permCount: SYSADMIN·줄 없음은 null, 아니면 쓰는 버튼 수 / 오브젝트 버튼 수(사용 안 함이면 0)", () => {
    expect(permCount("SYSADMIN", row({ BTN_PERM: "search" }), false, false)).toBeNull();
    expect(permCount("R1", row(), false, false)).toBeNull();
    expect(permCount("R1", row({ BTN_PERM: "search,print" }), false, false)).toEqual({ nb: 1, total: 3 });
    expect(permCount("R1", row({ BTN_PERM: "search" }), true, false)).toEqual({ nb: 0, total: 3 });
  });

  it("toRolePermMap: OBJECT_ID 키 · allowedFromExplain: ALLOWED=Y 만 버튼·팝업으로 나눈다", () => {
    expect([...toRolePermMap([row(), row({ OBJECT_ID: "o2" })]).keys()]).toEqual(["o1", "o2"]);
    const b = (CODE: string, KIND: "BTN" | "POPUP", ALLOWED: "Y" | "N"): ExplainButtonRow => ({ CODE, KIND, ALLOWED, GRANTED: "N", REASON: "NO_PERM", ROLES: "", GROUPS: "" });
    const ex: ExplainResult = { buttons: [b("search", "BTN", "Y"), b("print", "BTN", "N"), b("itemPop", "POPUP", "Y")], paths: [] };
    expect(allowedFromExplain(ex)).toEqual({ btn: ["search"], popup: ["itemPop"] });
  });
});

describe("버튼 이유 글(잠김·SYSADMIN)", () => {
  const n = { roleName: (id: string) => `역할${id}`, groupName: (id: string) => `그룹${id}` };
  const ex: ExplainResult = { buttons: [], paths: [{ ROLE_GROUP_ID: "G1", ROLE_ID: "R1", BTN_PERM: "save", POPUP_PERM: null }] };
  const btn = (over: Partial<ExplainButtonRow>): ExplainButtonRow => ({ CODE: "save", KIND: "BTN", ALLOWED: "Y", GRANTED: "N", REASON: "NO_PERM", ROLES: "", GROUPS: "", ...over });

  it("오브젝트에 없는 값·오브젝트 사용 안 함·사용자 사용 안 함이 먼저 판정된다", () => {
    expect(buttonWhy(btn({ ALLOWED: "N", REASON: "NOT_IN_OBJ" }), ex, false, n)).toContain("오브젝트에서 빠진 값");
    expect(buttonWhy(btn({ REASON: "OBJ_UNUSED" }), ex, false, n)).toContain("오브젝트가 「사용 안 함」");
    expect(buttonWhy(btn({ GRANTED: "Y", REASON: "PERM", ROLES: "R1", GROUPS: "G1" }), ex, true, n)).toContain("사용자가 「사용 안 함」");
  });

  it("SYSADMIN 으로 켜졌으면 그룹 → 시스템 관리자 길을 보인다", () => {
    const t = buttonWhy(btn({ GRANTED: "Y", REASON: "SYSADMIN", ROLES: "SYSADMIN", GROUPS: "G_ADM" }), ex, false, n);
    expect(t).toContain("그룹G_ADM → 역할SYSADMIN");
    expect(t).toContain("퍼미션 없이 모든 값");
  });

  it("켜진 길은 explain paths 로 잇고, 길이 없으면 첫 그룹으로 대신한다", () => {
    expect(buttonWhy(btn({ GRANTED: "Y", REASON: "PERM", ROLES: "R1", GROUPS: "G1,G2" }), ex, false, n)).toBe("save — 쓰는 길: 그룹G1 → 역할R1");
    expect(buttonWhy(btn({ GRANTED: "Y", REASON: "PERM", ROLES: "R9", GROUPS: "G2,G3" }), ex, false, n)).toBe("save — 쓰는 길: 그룹G2 → 역할R9");
  });

  it("잠김 이유마다 다른 글", () => {
    expect(buttonWhy(btn({ REASON: "ROLE_UNUSED", ROLES: "R1" }), ex, false, n)).toContain("「역할R1」");
    expect(buttonWhy(btn({ REASON: "GROUP_UNUSED", GROUPS: "G1" }), ex, false, n)).toContain("「그룹G1」");
    expect(buttonWhy(btn({ REASON: "NO_ROLE" }), ex, false, n)).toContain("받은 역할이 없습니다");
    expect(buttonWhy(btn({ REASON: "NO_PERM" }), ex, false, n)).toContain("퍼미션에 없습니다");
  });

  it("roleButtonWhy: 오브젝트 사용 안 함 > 역할 사용 안 함 > 켜짐 > 잠김", () => {
    expect(roleButtonWhy("save", true, "조회", true, true)).toContain("오브젝트가 「사용 안 함」");
    expect(roleButtonWhy("save", true, "조회", false, true)).toContain("「조회」이(가) 「사용 안 함」");
    expect(roleButtonWhy("save", true, "조회", false, false)).toContain("퍼미션에 있습니다");
    expect(roleButtonWhy("save", false, "조회", false, false)).toContain("잠김");
  });
});
