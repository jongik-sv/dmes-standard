import { describe, expect, it } from "vitest";

import { NOTICE_COLUMNS } from "../../../pages/lsh/noticeMgmt/notice-columns";

describe("noticeMgmt 목록 열 × MDM 캡션", () => {
  const col = (key: string) => NOTICE_COLUMNS.find((c) => c.key === key);

  it("MDM 컬럼 사전에 있는 TITLE 은 대체 캡션 '제목' 을 적어 둔다 — 화면이 captionPriority=mdm 으로 감싸 MDM 이 있으면 MDM 캡션이 이긴다", () => {
    expect(col("TITLE")).toBeDefined();
    // header 를 지우면 MDM 캡션을 받지 못할 때(장애·공급자 밖·401) 열 key "TITLE" 이 머리글로 보이고 상세 라벨 "제목" 과 어긋난다.
    expect(col("TITLE")?.header).toBe("제목");
    expect(col("TITLE")?.meta).toBeUndefined(); // 연결을 끄지 않는다(MDM 캡션·툴팁·검사)
  });

  it("MDM 물리명과 맞지 않는 표시용 파생 열은 적은 header 를 그대로 쓰고 MDM 연결을 끈다(우선순위 mdm 에서 사전에 우연히 같은 이름이 생겨도 머리글이 바뀌지 않게)", () => {
    for (const key of [
      "CATEGORY_LABEL",
      "FORMAT_LABEL",
      "STATUS_LABEL",
      "POST_PERIOD",
      "PIN_LABEL",
      "TARGET_LABEL",
    ]) {
      expect(typeof col(key)?.header, key).toBe("string");
      expect(col(key)?.meta, key).toBe(false);
    }
  });
});
