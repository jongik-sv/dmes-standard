// TSK-04-03 design.md §4.5 — 분류·이슈·diff 방향·테스트 결과 → 화면 문구(기능설계서 §6·§10).
import { describe, expect, it } from "vitest";
import {
  classificationLabel, directionLabel, issueLevelLabel, resultLabel,
} from "../../../pages/dma/domainMng/change-view";

describe("change-view", () => {
  it("변경 분류 LV-003", () => {
    expect(classificationLabel("NEW")).toBe("신규");
    expect(classificationLabel("COMPATIBLE")).toBe("호환");
    expect(classificationLabel("NARROW_OR_WIDEN")).toBe("좁히기·넓히기");
    expect(classificationLabel("STRUCTURAL")).toBe("구조 변경(금지)");
    expect(classificationLabel("PARENT_CHANGE")).toBe("부모 변경");
    expect(classificationLabel(undefined)).toBe("-");
  });

  it("diff 방향", () => {
    expect(directionLabel("NARROW")).toBe("좁히기");
    expect(directionLabel("WIDEN")).toBe("넓히기");
    expect(directionLabel("CHANGE")).toBe("변경");
    expect(directionLabel("STRUCTURAL")).toBe("구조 변경");
    expect(directionLabel("COMPATIBLE")).toBe("호환");
    expect(directionLabel("LINK")).toBe("연결");
    expect(directionLabel("RELINK")).toBe("교체");
    expect(directionLabel("UNLINK")).toBe("연결 제거");
  });

  it("이슈 수준과 테스트 결과 LV-004", () => {
    expect(issueLevelLabel("ERROR")).toBe("오류");
    expect(issueLevelLabel("WARN")).toBe("경고");
    expect(resultLabel("MATCH")).toBe("일치");
    expect(resultLabel("MISMATCH")).toBe("불일치");
    expect(resultLabel("UNDECIDED")).toBe("판정 불가");
    expect(resultLabel("ERROR")).toBe("판정 오류");
  });
});
