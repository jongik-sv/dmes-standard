// TSK-01-03 design.md §3.4 V3 — 메뉴 그룹 이름이 MdmScreenGroup·screens/README §2·DataInitializer 시드와
// 글자까지 같은지 고정한다(불변 규칙 I20).
import { describe, expect, it } from "vitest";
import { MDM_GROUPS, MDM_MENU_ROOT_NAME } from "@/shell";

describe("MDM_GROUPS", () => {
  it("그룹 코드 순서와 폴더 이름", () => {
    expect(Object.keys(MDM_GROUPS)).toEqual(["dma", "dmb", "dmc", "dmd", "dme"]);
    expect(Object.values(MDM_GROUPS)).toEqual(["용어·도메인", "레이아웃", "마스터코드", "마스터데이터", "업무기준"]);
  });

  it("루트 메뉴 이름", () => {
    expect(MDM_MENU_ROOT_NAME).toBe("마루 MDM");
  });
});
