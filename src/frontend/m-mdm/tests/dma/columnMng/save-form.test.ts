/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_ERROR,
  REQUIRED_ERROR,
  saveFormError,
  toSaveParams,
} from "../../../pages/dma/columnMng/save-form";
import { emptyForm, type ColumnForm } from "../../../pages/dma/columnMng/types";

/**
 * [저장] 화면 선검사와 저장 파라미터. D-141 — 도메인은 필수가 아니다. 비워서 저장할 수 있고, 그때 domainId 는 보내지 않는다
 * (`Number("")` 가 0 이 되어 서버가 "도메인을 찾을 수 없습니다" 로 거부하던 자리).
 */
function form(edit: Partial<ColumnForm>): ColumnForm {
  return {
    ...emptyForm(),
    columnName: "원재료 코일 두께",
    physName: "RMTL_COIL_THK",
    ...edit,
  };
}

describe("saveFormError", () => {
  it("도메인이 비어도 저장을 막지 않는다", () => {
    expect(saveFormError(form({ domainId: "" }), [1, 2, 3])).toBeNull();
  });

  it("논리명·표준 물리명이 비면 필수 문구를 낸다(도메인은 문구에 없다)", () => {
    expect(REQUIRED_ERROR).toBe("논리명·표준 물리명은 필수입니다");
    expect(saveFormError(form({ columnName: " " }), [])).toBe(REQUIRED_ERROR);
    expect(saveFormError(form({ physName: "" }), [])).toBe(REQUIRED_ERROR);
  });

  it("*** 가 남았으면 필수 누락보다 먼저 알린다", () => {
    expect(saveFormError(form({ columnName: "", physName: "RMTL_***" }), [])).toBe(PLACEHOLDER_ERROR);
    expect(saveFormError(form({}), [1, null])).toBe(PLACEHOLDER_ERROR);
  });
});

describe("toSaveParams", () => {
  it("도메인이 비면 domainId 를 undefined 로 둔다(호출부가 빼고 보낸다)", () => {
    expect(toSaveParams(form({ domainId: "" })).domainId).toBeUndefined();
  });

  it("도메인을 고르면 숫자로 보낸다", () => {
    const params = toSaveParams(form({ domainId: "12", required: "Y" }));
    expect(params.domainId).toBe(12);
    expect(params.required).toBe(true);
    expect(params.columnName).toBe("원재료 코일 두께");
  });

  it.each(["<p><br></p>", "<p> </p>\n<p><br></p>", "<p>&nbsp;</p>", "<h2></h2>"])(
    "원문 모드에서 글자 없는 HTML %j 은 빈 값으로 보낸다",
    (html) => {
      const params = toSaveParams(form({ description: html, usageNote: html }));
      expect(params.description).toBe("");
      expect(params.usageNote).toBe("");
    }
  );

  it("그림·구분선만 있는 HTML 이나 글자 있는 HTML·일반 글은 그대로 보낸다", () => {
    const keep = ['<p><img src="https://a.com/x.png"></p>', "<hr>", "<p>글</p>", "일반 글", ""];
    for (const v of keep) expect(toSaveParams(form({ description: v })).description).toBe(v);
  });
});
