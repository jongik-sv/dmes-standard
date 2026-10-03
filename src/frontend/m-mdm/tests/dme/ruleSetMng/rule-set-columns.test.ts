import { describe, expect, it } from "vitest";
import { buildRuleSetColumns } from "../../../pages/dme/ruleSetMng/columns";

// 머리글 폭 어림 — 한글·전각 11px, 영문·숫자 7px, 공백 4px(+ 칸 안쪽 여백 12px). e2e 실측(「입력 변수 수」 글자 54px,
// minWidth 60 에서 칸 51px)보다 넉넉히 잡은 값이다. happy-dom 은 레이아웃을 계산하지 않아 글자 수로 어림한다.
const CELL_PADDING = 12;
const headerPx = (h: string) =>
  [...h].reduce((sum, ch) => sum + (ch === " " ? 4 : /[\x21-\x7e]/.test(ch) ? 7 : 11), 0) + CELL_PADDING;

// 목록 칸이 받는 폭 상한 — 1280 폭에서 오른쪽 등록 패널 380px·분할선·여백·세로 스크롤바 몫을 뺀 보수적 값(Local-Rules §30).
const LIST_WIDTH_BUDGET = 800;

describe("ruleSetMng 열 정의", () => {
  const columns = buildRuleSetColumns(() => {});

  it("모든 열의 minWidth 가 머리글 글자를 자르지 않는다", () => {
    for (const c of columns) {
      expect(c.minWidth ?? c.width ?? 0, `${c.header} 의 minWidth`).toBeGreaterThanOrEqual(headerPx(String(c.header)));
    }
  });

  it("minWidth 합이 목록 칸 폭 안이라 가로 스크롤이 생기지 않는다", () => {
    const sum = columns.reduce((acc, c) => acc + (c.minWidth ?? c.width ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(LIST_WIDTH_BUDGET);
  });
});
