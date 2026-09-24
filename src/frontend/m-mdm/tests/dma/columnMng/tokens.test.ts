import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER,
  composeLogicalName,
  composePhysName,
  hasPlaceholder,
  replaceToken,
} from "../../../pages/dma/columnMng/tokens";
import type { NameToken } from "../../../pages/dma/columnMng/types";

/** TSK-04-04 design.md §3.4 — 토큰 조합(불변 규칙 I1). 분해 규칙 자체는 서버가 한다. */
function token(
  seq: number,
  surface: string,
  status: NameToken["status"],
  abbr: string,
  termName?: string,
): NameToken {
  const resolved = status !== "UNKNOWN";
  return {
    seq,
    surface,
    status,
    termId: resolved ? seq * 10 : null,
    termName: resolved ? (termName ?? surface) : null,
    senseNo: resolved ? 1 : null,
    engAbbr: status === "NO_ABBR" || !resolved ? null : abbr,
    abbr,
    candidates: [],
  };
}

const tokens: NameToken[] = [
  token(1, "원자재", "SYNONYM", "RMTL", "원재료"),
  token(2, "코일", "MATCHED", "COIL"),
  token(3, "두께", "MATCHED", "THK"),
  token(4, "편차", "UNKNOWN", "***"),
];

describe("tokens", () => {
  it("자리 표시자는 글자 그대로 *** 다", () => {
    expect(PLACEHOLDER).toBe("***");
  });

  it("약어를 _ 로 잇고 UNKNOWN 은 *** 가 된다", () => {
    expect(composePhysName(tokens)).toBe("RMTL_COIL_THK_***");
  });

  it("NO_ABBR 도 *** 가 된다", () => {
    expect(
      composePhysName([
        token(1, "편성", "NO_ABBR", "***"),
        token(2, "두께", "MATCHED", "THK"),
      ]),
    ).toBe("***_THK");
    expect(hasPlaceholder([token(1, "편성", "NO_ABBR", "***")])).toBe(true);
  });

  it("논리명은 해결된 토큰은 표준 표기, 미등록은 원 글자", () => {
    expect(composeLogicalName(tokens)).toBe("원재료 코일 두께 편차");
  });

  it("hasPlaceholder 는 미해결 토큰이 있는지 본다", () => {
    expect(hasPlaceholder(tokens)).toBe(true);
    expect(hasPlaceholder(tokens.slice(0, 3))).toBe(false);
  });

  it("replaceToken 으로 *** 자리를 용어로 바꾸면 물리명·논리명이 다시 계산된다", () => {
    const next = replaceToken(tokens, 4, {
      termId: 99,
      termName: "편차",
      senseNo: 1,
      engAbbr: "DEV",
    });

    expect(next[3].status).toBe("MATCHED");
    expect(next[3].abbr).toBe("DEV");
    expect(next[3].termId).toBe(99);
    expect(composePhysName(next)).toBe("RMTL_COIL_THK_DEV");
    expect(composeLogicalName(next)).toBe("원재료 코일 두께 편차");
    expect(hasPlaceholder(next)).toBe(false);
    expect(tokens[3].status).toBe("UNKNOWN");
  });

  it("약어 없는 용어로 바꾸면 NO_ABBR 로 남는다", () => {
    const next = replaceToken(tokens, 4, {
      termId: 7,
      termName: "편성",
      senseNo: 1,
      engAbbr: null,
    });

    expect(next[3].status).toBe("NO_ABBR");
    expect(composePhysName(next)).toBe("RMTL_COIL_THK_***");
  });
});
