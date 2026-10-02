/**
 * MDM 화면 메타 — 물리명 변환(MdmNames.toPhysName 과 같은 규칙)과 캡션 결정(spec B1·B2).
 */
import { describe, expect, it } from "vitest";
import { resolveCaption, toPhysName } from "../../src/mdm-meta";
import { column } from "./mdm-meta-fixtures";

describe("toPhysName", () => {
  it.each([
    ["codeNm", "CODE_NM"],
    ["CODE_NM", "CODE_NM"],
    ["title", "TITLE"],
    ["sortSeq", "SORT_SEQ"],
    ["useYn", "USE_YN"],
    ["item2Cd", "ITEM2_CD"],
    ["abc1Def", "ABC1_DEF"],
    ["ABCDef", "ABCDEF"],
    ["  codeNm  ", "CODE_NM"],
    ["code_nm", "CODE_NM"],
  ])("%s → %s", (input, expected) => {
    expect(toPhysName(input)).toBe(expected);
  });

  it("비거나 공백뿐이면 null", () => {
    expect(toPhysName("")).toBeNull();
    expect(toPhysName("   ")).toBeNull();
    expect(toPhysName(null)).toBeNull();
    expect(toPhysName(undefined)).toBeNull();
  });
});

describe("resolveCaption", () => {
  const full = column("TITLE", {
    columnName: "컬럼명",
    labelLong: "긴 라벨",
    labelMid: "중간 라벨",
    labelShort: "짧은 라벨",
  });

  it("그리드는 labelShort → labelMid → labelLong → columnName 순", () => {
    expect(resolveCaption(full, "grid", undefined, "explicit", "title")).toBe("짧은 라벨");
    expect(resolveCaption({ ...full, labelShort: null }, "grid", undefined, "explicit", "title")).toBe("중간 라벨");
    expect(resolveCaption({ ...full, labelShort: " ", labelMid: null }, "grid", undefined, "explicit", "title")).toBe(
      "긴 라벨"
    );
    expect(
      resolveCaption({ ...full, labelShort: null, labelMid: null, labelLong: null }, "grid", undefined, "explicit", "t")
    ).toBe("컬럼명");
  });

  it("폼은 labelMid → labelLong → labelShort → columnName 순", () => {
    expect(resolveCaption(full, "form", undefined, "explicit", "title")).toBe("중간 라벨");
    expect(resolveCaption({ ...full, labelMid: null }, "form", undefined, "explicit", "title")).toBe("긴 라벨");
    expect(resolveCaption({ ...full, labelMid: null, labelLong: null }, "form", undefined, "explicit", "title")).toBe(
      "짧은 라벨"
    );
  });

  it("모두 없거나 MDM 에 없으면 화면 키", () => {
    expect(resolveCaption(null, "grid", undefined, "explicit", "title")).toBe("title");
    expect(resolveCaption(column("TITLE"), "form", null, "mdm", "title")).toBe("title");
  });

  it("explicit 우선: 적은 값이 이기고, 비웠을 때만 MDM", () => {
    expect(resolveCaption(full, "grid", "화면 제목", "explicit", "title")).toBe("화면 제목");
    expect(resolveCaption(full, "grid", undefined, "explicit", "title")).toBe("짧은 라벨");
  });

  it("mdm 우선: MDM 캡션이 이기고, MDM 에 없으면 적은 값", () => {
    expect(resolveCaption(full, "grid", "화면 제목", "mdm", "title")).toBe("짧은 라벨");
    expect(resolveCaption(null, "grid", "화면 제목", "mdm", "title")).toBe("화면 제목");
  });

  it('빈 문자열("")은 일부러 비운 머리글이라 그대로 둔다', () => {
    expect(resolveCaption(full, "grid", "", "explicit", "title")).toBe("");
    expect(resolveCaption(null, "grid", "", "explicit", "title")).toBe("");
  });
});
