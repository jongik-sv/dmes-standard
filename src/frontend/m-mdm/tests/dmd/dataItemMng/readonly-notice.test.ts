import { describe, expect, it } from "vitest";

import { readonlyNotice } from "../../../pages/dmd/dataItemMng/messages";

describe("readonlyNotice — 조회 전용 안내 문구", () => {
  it("외부 원천이면 어느 시스템에서 받아 온 값인지 말한다", () => {
    expect(readonlyNotice({ sourceKind: "EXTERNAL", sourceSystem: "ECOS", status: "INUSE" })).toBe(
      "이 마루 데이터는 외부 시스템(ECOS)에서 받아 온 값이라 여기서 고칠 수 없습니다.",
    );
  });

  it("외부 원천인데 시스템 이름이 없으면 이름 없이 말한다", () => {
    expect(readonlyNotice({ sourceKind: "EXTERNAL", sourceSystem: null, status: "INUSE" })).toBe(
      "이 마루 데이터는 외부 시스템에서 받아 온 값이라 여기서 고칠 수 없습니다.",
    );
  });

  it("MDM 원천이 사용 중이 아니면 상태를 말한다", () => {
    expect(readonlyNotice({ sourceKind: "MDM", sourceSystem: null, status: "DEPRECATED" })).toBe(
      "이 마루 데이터는 사용 중이 아닌 상태(DEPRECATED)라 여기서 고칠 수 없습니다.",
    );
  });
});
