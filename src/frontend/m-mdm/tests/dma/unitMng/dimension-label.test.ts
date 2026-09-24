// TSK-04-02 design.md 불변 규칙 I21 — 차원 라벨은 FE 상수 맵으로만 한글을 보여준다. 맵에 없는 코드는
// 코드 문자열 그대로 보여준다(별도 라벨 관리 테이블 신설은 범위 밖, D11).
import { describe, expect, it } from "vitest";
import { dimensionLabel, DIMENSION_LABELS } from "../../../pages/dma/unitMng/types";

describe("dimensionLabel", () => {
  it.each(Object.entries(DIMENSION_LABELS))("%s 는 '%s' 로 매핑된다", (code, label) => {
    expect(dimensionLabel(code)).toBe(label);
  });

  it("맵에 없는 코드는 원본 문자열 그대로 반환한다", () => {
    expect(dimensionLabel("UNKNOWN_DIM")).toBe("UNKNOWN_DIM");
  });
});
