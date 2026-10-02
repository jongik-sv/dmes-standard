import { describe, expect, it } from "vitest";

import { NOTICE_COLUMNS } from "../../../pages/lsh/noticeMgmt/notice-columns";

describe("noticeMgmt 목록 열 × MDM 캡션", () => {
  const col = (key: string) => NOTICE_COLUMNS.find((c) => c.key === key);

  it("MDM 컬럼 사전에 있는 TITLE 은 header 를 비워 MDM 캡션(labelShort)을 쓴다", () => {
    expect(col("TITLE")).toBeDefined();
    expect(col("TITLE")).not.toHaveProperty("header");
  });

  it("MDM 물리명과 맞지 않는 표시용 파생 열은 적은 header 를 그대로 쓴다(B1 명시 우선)", () => {
    for (const key of [
      "CATEGORY_LABEL",
      "FORMAT_LABEL",
      "STATUS_LABEL",
      "POST_PERIOD",
      "PIN_LABEL",
      "TARGET_LABEL",
    ]) {
      expect(typeof col(key)?.header, key).toBe("string");
    }
  });
});
