import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatInt,
  lobLengthText,
  truncationNotice,
} from "../../src/anl/db-viewer/lob-format";
import type { DbLobResult } from "../../src/anl/db-viewer/types";

describe("잘린 값 표시", () => {
  it("서버 요약 …(전체 12,345자) 와 같은 쉼표 형식으로 글자 수를 적는다", () => {
    expect(formatInt(12345)).toBe("12,345");
    expect(formatInt(999)).toBe("999");
    expect(formatInt(1000000)).toBe("1,000,000");
    expect(lobLengthText("CLOB", 12345)).toBe("12,345자");
  });

  it("바이트 크기는 1024 단위로 줄이고 끝의 .0 은 뺀다", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(48 * 1024)).toBe("48KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5MB");
    expect(lobLengthText("BLOB", 2048)).toBe("2KB");
  });

  it("전체 길이를 모르면 이상 을 붙인다", () => {
    expect(lobLengthText("LONG RAW", 4096, false)).toBe("4KB 이상");
  });

  it("앞부분만 받았으면 안내문을, 전부 받았으면 null 을 돌려준다", () => {
    const base: DbLobResult = {
      dataType: "CLOB",
      kind: "text",
      length: 5000,
      lengthKnown: true,
      truncated: true,
    } as DbLobResult;
    expect(truncationNotice(base)).toBe("앞부분만 보입니다(전체 5,000자)");
    expect(truncationNotice({ ...base, truncated: false })).toBeNull();
  });
});
