import { describe, expect, it } from "vitest";
import { countByToken, impactLines, removalImpacts, removalMessage } from "./perm-impact";
import {
  OBJECT_TYPE_OPTIONS,
  applyDraft,
  emptyRow,
  fillBlank,
  objectTypeValue,
  restoreRow,
  stripInternal,
  toListRow,
  withField,
  type ObjRow,
} from "./row-model";
import type { ObjPermRow } from "./types";

const perms: ObjPermRow[] = [
  { ROLE_ID: "R1", BTN_PERM: "find,save", POPUP_PERM: "orderPop", USER_CNT: 3 },
  { ROLE_ID: "R2", BTN_PERM: "find", POPUP_PERM: "", USER_CNT: "2" },
];

describe("perm-impact", () => {
  it("값별 퍼미션 수를 센다", () => {
    expect(countByToken(perms, "BTN", ["find", "save", "zzz"])).toEqual([
      { token: "find", count: 2 },
      { token: "save", count: 1 },
      { token: "zzz", count: 0 },
    ]);
  });

  it("뺀 값 중 퍼미션이 쓰는 것만 영향으로 낸다", () => {
    const out = removalImpacts(perms, "BTN", "find,save,old", ["find"]);
    expect(out).toEqual([{ kind: "BTN", token: "save", permCnt: 1, userMax: 3 }]);
    expect(removalMessage(out[0])).toBe("「save」을(를) 빼면 퍼미션 1건(사람 최대 3명)에서 함께 꺼집니다.");
  });

  it("그대로면 영향이 없다", () => {
    expect(removalImpacts(perms, "POPUP", "orderPop", ["orderPop"])).toEqual([]);
  });

  it("저장 응답 impacts 를 안내 줄로 바꾼다", () => {
    expect(
      impactLines([
        { OBJECT_ID: "O1", KIND: "BTN", CODE: "save", PERM_CNT: 2, USER_CNT: 5 },
        { OBJECT_ID: "O1", KIND: "USE_TP", CODE: "N", PERM_CNT: 4, USER_CNT: 9 },
      ]),
    ).toEqual([
      "「O1」 버튼 「save」을(를) 빼서 퍼미션 2건(사람 5명)에서 꺼집니다.",
      "「O1」을(를) 사용 안 함으로 바꿔 퍼미션 4건(사람 9명)이 멈춥니다.",
    ]);
  });
});

describe("row-model", () => {
  const base: ObjRow = { OBJECT_ID: "O1", __rowId: "r-0-O1", nativeeditor_status: "" };

  it("OBJECT_ID 를 바꾸면 비어 있는 FORM_URL 만 화면 코드 경로로 채우고, 메뉴 폴더로 계산하지 않는다(2026-11-26)", () => {
    const resolve = (id: string) => (id === "O2" ? "csa/O2" : null);
    expect(withField(base, "OBJECT_ID", "O2", resolve).FORM_URL).toBe("csa/O2");
    expect(withField({ ...base, FORM_URL: "cma/keep" }, "OBJECT_ID", "O2", resolve).FORM_URL).toBe("cma/keep");
    expect(withField(base, "OBJECT_ID", "O9", resolve).FORM_URL).toBeUndefined();
    expect(withField(base, "OBJECT_ID", "O2").FORM_URL).toBeUndefined();
    expect(withField(base, "OBJECT_ID", "O2", resolve)).not.toHaveProperty("MENU_ID");
  });

  it("초안 반영은 inserted 를 지키고 나머지는 updated, 없는 행이면 prev 를 그대로 둔다", () => {
    const prev = [base, { ...base, __rowId: "r-1-O3", OBJECT_ID: "O3", nativeeditor_status: "inserted" as const }];
    const out = applyDraft(prev, { ...base, OBJECT_NM: "x" });
    expect(out[0].nativeeditor_status).toBe("updated");
    expect(out[1]).toBe(prev[1]);
    expect(applyDraft(prev, { ...base, __rowId: "none" })).toBe(prev);
    expect(applyDraft(prev, { ...prev[1], OBJECT_NM: "y" })[1].nativeeditor_status).toBe("inserted");
  });

  it("저장 body 에서 FE 전용 칸·집계를 뗀다", () => {
    const body = stripInternal({ ...base, MENU_CNT: 1, PERM_CNT: 2, BTN_PERM: "a", __orig: { BTN_PERM: "", POPUP_PERM: "", USE_TP: "Y" } });
    expect(Object.keys(body).sort()).toEqual(["BTN_PERM", "OBJECT_ID"]);
  });

  it("삭제 표시한 행은 초안을 반영해도 삭제로 남는다", () => {
    const prev = [{ ...base, nativeeditor_status: "deleted" as const }];
    expect(applyDraft(prev, { ...base, OBJECT_NM: "x" })[0]).toBe(prev[0]);
  });

  it("행취소는 조회 시점 값으로 되돌리고 FE 칸 __snap 은 저장 body 에 안 실린다", () => {
    const row = toListRow({ OBJECT_ID: "O1", BTN_PERM: "a" } as never, 0);
    const edited: ObjRow = { ...row, BTN_PERM: "a,b", nativeeditor_status: "updated" };
    const back = restoreRow(edited);
    expect(back.BTN_PERM).toBe("a");
    expect(back.nativeeditor_status).toBe("");
    expect(Object.keys(stripInternal(back))).not.toContain("__snap");
  });

  it("새 행은 GridPanel 이 채운 빈 값 대신 기본값(USE_TP Y)을 지키고 채운 값은 남긴다", () => {
    const row = fillBlank({ USE_TP: "", OBJECT_NM: "n", ACCESS_TP: "" }, emptyRow("mcm"));
    expect(row.USE_TP).toBe("Y");
    expect(row.OBJECT_NM).toBe("n");
    expect(row.OBJECT_TYPE).toBe("WEB");
  });

  it("오브젝트 유형은 WEB·POPUP·SUB·WIDGET 네 코드에 한글 이름을 붙이고, 옛 소문자·빈 값은 선택 값으로 맞춘다", () => {
    expect(OBJECT_TYPE_OPTIONS).toEqual([
      { value: "WEB", label: "메뉴 화면" },
      { value: "POPUP", label: "팝업" },
      { value: "SUB", label: "화면 안 기능" },
      { value: "WIDGET", label: "도구 위젯" },
    ]);
    expect(objectTypeValue("web")).toBe("WEB");
    expect(objectTypeValue(" popup ")).toBe("POPUP");
    expect(objectTypeValue("sub")).toBe("SUB");
    expect(objectTypeValue("")).toBe("WEB");
    expect(objectTypeValue(undefined)).toBe("WEB");
  });
});
