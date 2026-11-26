// B-009 — 도메인 삭제 확인 문구. 서버 규칙(하위는 상위로, 참조는 상위로·없으면 비움)을 그대로 알린다.
import { describe, expect, it } from "vitest";
import { deleteConfirmMessage, directColumnCount } from "../../../pages/dma/domainMng/delete-confirm";
import type { ImpactTable } from "../../../pages/dma/domainMng/types";

const impact = (columns: Array<{ DOMAIN_ID: number }>): ImpactTable => ({
  descendants: [], ruleVars: [], layoutItems: [], otherRefs: [], systems: [], deployHeld: true,
  columns: columns.map((c, i) => ({ COLUMN_ID: i + 1, COLUMN_NAME: `컬럼${i}`, PHYS_NAME: `COL_${i}`, DOMAIN_ID: c.DOMAIN_ID })),
});

describe("domainMng 삭제 확인 문구", () => {
  it("직접 참조 컬럼만 센다(영향도 표의 하위 도메인 참조는 뺀다)", () => {
    expect(directColumnCount(5, impact([{ DOMAIN_ID: 5 }, { DOMAIN_ID: 6 }, { DOMAIN_ID: 5 }]))).toBe(2);
    expect(directColumnCount(5, null)).toBe(0);
  });

  it("상위가 있으면 하위·컬럼·룰 변수를 상위로 옮긴다고 알린다", () => {
    const text = deleteConfirmMessage({
      domain: { DOMAIN_ID: 5, DOMAIN_NAME: "문자 3자리", STD_NAME: "CHAR3", CHILD_COUNT: 1 },
      parent: { DOMAIN_NAME: "내용", STD_NAME: "CTT" },
      impact: impact([{ DOMAIN_ID: 5 }]),
      dirty: false,
    });
    expect(text).toContain("하위 도메인 1개를 상위 도메인 \"내용(CTT)\" 아래로 옮깁니다.");
    expect(text).toContain("참조 컬럼 1개를 상위 도메인 \"내용(CTT)\"으로 옮깁니다.");
    expect(text).toContain("룰 변수도 상위 도메인으로 옮깁니다.");
    expect(text).not.toContain("저장하지 않은");
  });

  it("상위가 없으면 하위는 최상위가 되고 참조 컬럼은 비운다고 알린다", () => {
    const text = deleteConfirmMessage({
      domain: { DOMAIN_ID: 5, DOMAIN_NAME: "문자 3자리", STD_NAME: "CHAR3", CHILD_COUNT: 2 },
      parent: null,
      impact: impact([{ DOMAIN_ID: 5 }, { DOMAIN_ID: 5 }, { DOMAIN_ID: 5 }]),
      dirty: true,
    });
    expect(text).toContain("하위 도메인 2개는 최상위 도메인이 됩니다.");
    expect(text).toContain("참조 컬럼 3개의 도메인을 비웁니다.");
    expect(text).toContain("저장하지 않은 수정 내용은 버립니다.");
  });

  it("하위·참조가 없으면 그 줄을 쓰지 않는다", () => {
    const text = deleteConfirmMessage({
      domain: { DOMAIN_ID: 9, DOMAIN_NAME: "시험", STD_NAME: "CHK_DOM1", CHILD_COUNT: 0 },
      parent: null, impact: impact([]), dirty: false,
    });
    expect(text).not.toContain("하위 도메인");
    expect(text).not.toContain("참조 컬럼");
    expect(text.endsWith("삭제할까요?")).toBe(true);
  });
});
